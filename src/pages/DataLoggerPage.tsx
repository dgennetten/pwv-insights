import { Undo2, ArrowLeft, Camera, FileDown, Map as MapIcon } from 'lucide-react'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { version } from '../../package.json'
import { DistanceTracker } from '../components/data-logger/DistanceTracker'
import { MapModal } from '../components/data-logger/MapModal'
import {
  getOrCreateSession,
  getAllSessions,
  addEntry,
  deleteEntry,
  updateEntry,
  getSessionEntries,
  getSessionTrackers,
  markSessionEmailed,
  clearSessionEntries,
  clearSessionTrackers,
  resetSession,
  enqueueSend,
  getSendQueue,
  updateQueuedSend,
  deleteQueuedSend,
} from '../services/dataLoggerService'
import { getStoredAuthToken } from '../services/authService'
import { trailGeoData, trailNames } from '../data/trailGeoData'
import { trailPaths } from '../data/trailPaths'
import { updateSessionWksite } from '../services/dataLoggerService'
import type { LogEntry, LogSession, HikerSubtype, TreeSubtype, TreeSize, EntryType, Tracker, QueuedSend, QueuedSendSummary } from '../types/dataLogger'
import { trackerDistanceM, haversineMeters } from '../lib/gpsDistance'
import { distFromTrailheadM, nearestTrailInfo } from '../lib/trailheadDistance'
import { getLoggerSettings } from '../lib/loggerSettings'
import { fileToCompressedDataUrl } from '../lib/photo'
import { buildTextPdf, downloadBlob } from '../lib/textPdf'

// Matches lu_viol_type in the database, sorted alphabetically, "Other" last
const VIOLATION_TYPES: string[] = [
  'Burning Green Wood',
  'Campfire at Trailhead',
  'Camping with Stock in a Travel Zone',
  'Dog Harassing Wildlife, People, or Stock',
  'Dog Not under Voice Control (with Stock Rider)',
  'Dog Off Leash against Regulations',
  'Dog on Trail against Regulations',
  'Fireworks',
  'Forest Products Removal',
  'Illegal Campsite / Fire Ring',
  'Illegal Discharge of a Firearm',
  'Illegal Hunting or Fishing',
  'Improper Campsite / Fire Ring',
  'Littering along Trail or in Campsite',
  'Low Flying Aircraft over Wilderness',
  'Motorized Equipment',
  'Motorized Vehicle',
  'Non-Certified Weed-Free Forage',
  'Off-Road Use',
  'Overnight Camping at Trailhead',
  'Oversize Group (# of groups)',
  'Resource Damage',
  'Snowmobile in Wilderness',
  'Stock on Trail against Regulations',
  'Unattended Fire',
  'Unauthorized Fire (during ban)',
  'Unsanitary Condition',
  'Use of a Closed Trail',
  'Vandalism',
  'Wheeled Conveyance',
  'Other',
]

const TREE_SIZES: { key: TreeSize; label: string; range: string }[] = [
  { key: 'small',  label: 'Small',  range: '< 8"'   },
  { key: 'medium', label: 'Medium', range: '8–15"'  },
  { key: 'large',  label: 'Large',  range: '16–23"' },
  { key: 'xl',     label: 'XL',     range: '24–36"' },
]

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

interface RecoveryCandidate {
  session:       LogSession
  entryCount:    number
  trackerCount:  number
  totalDistanceM: number
}

function formatSessionDate(session: LogSession): string {
  const d   = new Date(session.startedAt)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 0) return `Today at ${timePart}`
  if (diffDays === 1) return `Yesterday at ${timePart}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${timePart}`
}

async function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 30000 },
    )
  })
}

/** Trail in effect at a given time, from trail-change events (else the session's selection). */
function activeWksiteAt(
  ts: number,
  trailEvents: LogEntry[],  // type 'trail', sorted ascending by timestamp
  sessionWksiteId: number | undefined,
): number | null {
  if (trailEvents.length === 0) return sessionWksiteId ?? null
  let active: number | null = null
  for (const ev of trailEvents) {
    if (ev.timestamp > ts) break
    active = ev.wksiteId ?? null
  }
  return active
}

/**
 * Stamp each entry (except trail events) with the trail it was logged under
 * and its along-trail distance from that trailhead.
 */
function enrichEntriesWithTrailheadDist(
  entries: LogEntry[],
  sessionWksiteId: number | undefined,
): LogEntry[] {
  const trailEvents = entries
    .filter(e => e.type === 'trail')
    .sort((a, b) => a.timestamp - b.timestamp)
  return entries.map(e => {
    if (e.type === 'trail') return e
    const wks = activeWksiteAt(e.timestamp, trailEvents, sessionWksiteId)
    const d   = distFromTrailheadM(wks, e.lat, e.lng)
    return {
      ...e,
      ...(wks != null ? { wksiteId: wks, trailName: trailNames[wks] } : {}),
      ...(d   != null ? { distFromTrailheadM: d } : {}),
    }
  })
}

function queueSummaryText(s: QueuedSendSummary): string {
  const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`
  const parts = [
    s.photos     ? plural(s.photos, 'photo') : null,
    s.hikers     ? plural(s.hikers, 'hiker') : null,
    s.trees      ? plural(s.trees, 'tree') : null,
    s.notes      ? plural(s.notes, 'note') : null,
    s.violations ? plural(s.violations, 'violation') : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No entries'
}

function fmtCoords(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return 'GPS unavailable'
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}°${ns} ${Math.abs(lng).toFixed(4)}°${ew}`
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtMiles(meters: number): string {
  return (meters / 1609.344).toFixed(2) + ' mi'
}

// ── On-trail extent persistence ─────────────────────────────────────────────
// "Distance on trail" is the span between the furthest-in and furthest-out
// along-trail positions seen this session. It otherwise lives only in component
// state, so a page refresh (e.g. an accidental pull-to-refresh) would reset it
// to zero. Persist the min/max per session+trail so it survives a remount.
interface ExtentStats { alongMin: number; alongMax: number }

const extentKey = (sessionId: string, wksiteId: number) =>
  `pwv:ontrail-extent:${sessionId}:${wksiteId}`

function loadExtentStats(sessionId: string, wksiteId: number): ExtentStats | null {
  try {
    const raw = localStorage.getItem(extentKey(sessionId, wksiteId))
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<ExtentStats>
    if (typeof p.alongMin === 'number' && typeof p.alongMax === 'number'
        && Number.isFinite(p.alongMin) && Number.isFinite(p.alongMax)) {
      return { alongMin: p.alongMin, alongMax: p.alongMax }
    }
  } catch { /* corrupt or unavailable — ignore */ }
  return null
}

function saveExtentStats(sessionId: string, wksiteId: number, s: ExtentStats): void {
  try {
    localStorage.setItem(extentKey(sessionId, wksiteId),
      JSON.stringify({ alongMin: s.alongMin, alongMax: s.alongMax }))
  } catch { /* storage full or unavailable — ignore */ }
}

function clearExtentStats(sessionId: string): void {
  try {
    const prefix = `pwv:ontrail-extent:${sessionId}:`
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) localStorage.removeItem(key)
    }
  } catch { /* ignore */ }
}

type OnTrailLight = 'green' | 'red' | 'gray'

export function DataLoggerPage() {
  const { user } = useAuth()
  const isAuthenticated = !!user?.personId

  const [isOnline,      setIsOnline]      = useState(navigator.onLine)
  const [showTips,      setShowTips]      = useState(false)
  const [showTipsHint,  setShowTipsHint]  = useState(true)
  // 'patrol' shows the full trail-maintenance UI; 'other' hides Tree & Violation.
  const [loggerProfile] = useState(() => getLoggerSettings().profile)
  const showMaintUI = loggerProfile === 'patrol'
  const [session,       setSession]       = useState<LogSession | null>(null)
  const [entries,       setEntries]       = useState<LogEntry[]>([])
  const [treeMode,        setTreeMode]        = useState<TreeSubtype>('cleared')
  const [noteText,        setNoteText]        = useState('')
  const [violationType,   setViolationType]   = useState('')
  const [violationNote,   setViolationNote]   = useState('')
  const [lastAction,      setLastAction]      = useState<number[] | null>(null)
  const [sending,          setSending]          = useState(false)
  const [sentOk,           setSentOk]           = useState(false)
  const [sendError,        setSendError]        = useState<string | null>(null)
  const [includeLocations, setIncludeLocations] = useState(true)
  const [trackers,         setTrackers]         = useState<Tracker[]>([])
  const [showMap,       setShowMap]       = useState(false)
  const [showAllNotes,      setShowAllNotes]      = useState(false)
  const [showAllViolations, setShowAllViolations] = useState(false)
  const [capturingPhoto,    setCapturingPhoto]    = useState(false)
  const [viewPhoto,         setViewPhoto]         = useState<string | null>(null)
  const [sendQueue,         setSendQueue]         = useState<QueuedSend[]>([])
  // Trail the user picked while results were still accumulating on another
  // trail; held here until they confirm the send/save. null = "no trail".
  const [pendingWksite,     setPendingWksite]     = useState<number | null | undefined>(undefined)
  const [switchingTrail,    setSwitchingTrail]    = useState(false)
  const processingQueueRef = useRef(false)
  const [gpsStatus,     setGpsStatus]     = useState<'ok' | 'denied' | 'unavailable'>('ok')
  const [loading,           setLoading]           = useState(true)
  const [confirmClear,      setConfirmClear]      = useState(false)
  const [trackerResetKey,     setTrackerResetKey]     = useState(0)
  const [recoveryCandidate,   setRecoveryCandidate]   = useState<RecoveryCandidate | null>(null)
  const [showGuestEmailForm,  setShowGuestEmailForm]  = useState(false)
  const [guestEmail,          setGuestEmail]          = useState('')

  // ── On Trail status (live GPS: tracker stream while tracking, else a page watch) ──
  const [onTrailLight,   setOnTrailLight]   = useState<OnTrailLight>('gray')
  const [trailheadDistM, setTrailheadDistM] = useState<number | null>(null)
  const [trailheadCrow,  setTrailheadCrow]  = useState(false)  // true = straight-line (off-trail) → show "*"
  const [onTrailExtentM, setOnTrailExtentM] = useState<number | null>(null)
  const trailStatsRef = useRef({ alongMin: Infinity, alongMax: -Infinity })

  // Blink the "Usage tips" hint arrow a few times on launch, then remove it
  useEffect(() => {
    const timer = setTimeout(() => setShowTipsHint(false), 3200)
    return () => clearTimeout(timer)
  }, [])

  // Reflect the geolocation permission state in the GPS indicator from load,
  // and keep it live if the user changes the permission mid-session.
  useEffect(() => {
    if (!('geolocation' in navigator)) { setGpsStatus('unavailable'); return }
    if (!navigator.permissions?.query) return
    let permission: PermissionStatus | null = null
    const apply = () =>
      setGpsStatus(permission?.state === 'denied' ? 'denied' : 'ok')
    navigator.permissions.query({ name: 'geolocation' })
      .then(p => { permission = p; apply(); p.onchange = apply })
      .catch(() => { /* permissions query unsupported — leave optimistic */ })
    return () => { if (permission) permission.onchange = null }
  }, [])

  const trailheadCoords = session?.wksiteId != null
    ? (trailGeoData[session.wksiteId] ?? null)
    : null

  // Reset on-trail stats whenever the session or selected trail changes.
  const resetTrailStats = useCallback(() => {
    trailStatsRef.current = { alongMin: Infinity, alongMax: -Infinity }
    setOnTrailLight('gray')
    setTrailheadDistM(null)
    setTrailheadCrow(false)
    setOnTrailExtentM(null)
  }, [])

  // Reset transient readouts (light, trailhead distance) on session/trail change —
  // they recover on the next GPS fix. But restore the accumulated on-trail extent
  // from storage so a pull-to-refresh (page remount) doesn't reset it to zero.
  useEffect(() => {
    resetTrailStats()
    const sid = session?.id
    const wks = session?.wksiteId
    if (sid == null || wks == null) return
    const saved = loadExtentStats(sid, wks)
    if (saved) {
      trailStatsRef.current = saved
      setOnTrailExtentM(saved.alongMax - saved.alongMin)
    }
  }, [session?.id, session?.wksiteId, resetTrailStats])

  // Each live GPS fix updates the On Trail light + readouts. On-trail → distance is
  // measured along the trail; off-trail → straight-line (crow-flies) from the trailhead,
  // flagged with "*". `null` means the tracker's GPS watch stopped → light goes gray.
  const handleLoggerPosition = useCallback((p: { lat: number; lng: number; ts: number; accuracy?: number } | null) => {
    if (p === null) { setOnTrailLight('gray'); return }
    const wks  = session?.wksiteId
    const th   = wks != null ? trailGeoData[wks] : null
    const segs = wks != null ? (trailPaths[wks] ?? []) : []
    if (wks == null || !th || segs.length === 0) { setOnTrailLight('gray'); return }

    const { alongM, offsetM } = nearestTrailInfo(segs, th.lat, th.lng, p.lat, p.lng)
    if (!Number.isFinite(offsetM)) { setOnTrailLight('gray'); return }
    const thresholdM = getLoggerSettings().onTrailThresholdFt * 0.3048
    const onTrail = offsetM <= thresholdM
    setOnTrailLight(onTrail ? 'green' : 'red')

    if (onTrail) {
      // On the trail: actual distance along the trail path, no asterisk.
      setTrailheadCrow(false)
      setTrailheadDistM(alongM)
      const s = trailStatsRef.current
      s.alongMin = Math.min(s.alongMin, alongM)
      s.alongMax = Math.max(s.alongMax, alongM)
      setOnTrailExtentM(s.alongMax - s.alongMin)
      if (session?.id != null) saveExtentStats(session.id, wks, s)
    } else {
      // Off the trail: straight-line (crow-flies) from the trailhead, flagged with "*".
      setTrailheadCrow(true)
      setTrailheadDistM(haversineMeters(th.lat, th.lng, p.lat, p.lng))
    }
  }, [session?.id, session?.wksiteId])

  // When a trail is selected but no tracker is tracking, run a page-level GPS watch so
  // the On Trail light + distance readouts stay live (matching the map). While tracking,
  // the DistanceTracker's stream feeds handleLoggerPosition instead, so only one watch runs.
  const isTracking = trackers.some(t => t.state === 'tracking')
  useEffect(() => {
    if (session?.wksiteId == null || isTracking || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => handleLoggerPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, ts: pos.timestamp, accuracy: pos.coords.accuracy ?? undefined }),
      () => { /* keep last reading */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [session?.wksiteId, isTracking, handleLoggerPosition])

  const refreshEntries = useCallback(async (sessionId: string) => {
    setEntries(await getSessionEntries(sessionId))
  }, [])

  const handleWksiteChange = useCallback(async (wksiteId: number | null) => {
    if (!session) return
    await updateSessionWksite(session.id, wksiteId)
    setSession(prev => prev
      ? { ...prev, wksiteId: wksiteId ?? undefined }
      : prev
    )
    // Embed a trail-change event so the report can delineate trail sections
    const pos = await getPosition()
    await addEntry({
      sessionId: session.id,
      timestamp: Date.now(),
      lat:       pos?.lat ?? null,
      lng:       pos?.lng ?? null,
      type:      'trail',
      wksiteId,
      trailName: wksiteId != null ? trailNames[wksiteId] : undefined,
    })
    await refreshEntries(session.id)
  }, [session, refreshEntries])

  // Online / offline tracking
  useEffect(() => {
    const up = () => setIsOnline(true)
    const dn = () => setIsOnline(false)
    window.addEventListener('online',  up)
    window.addEventListener('offline', dn)
    return () => {
      window.removeEventListener('online',  up)
      window.removeEventListener('offline', dn)
    }
  }, [])

  // Init IndexedDB session
  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return }
    void (async () => {
      const s = await getOrCreateSession(todayKey())
      const e = await getSessionEntries(s.id)
      setSession(s)
      setEntries(e)
      if (s.emailedAt) setSentOk(true)
      setLoading(false)

      // When the current session is empty, look for an unsent session with data
      // (trail-change events alone don't count as data)
      if (e.filter(en => en.type !== 'trail').length === 0 && !s.emailedAt) {
        const all = await getAllSessions()
        const candidates = await Promise.all(
          all
            .filter(sess => sess.id !== s.id && !sess.emailedAt)
            .map(async sess => {
              const es = await getSessionEntries(sess.id)
              const ts = await getSessionTrackers(sess.id)
              return {
                session:        sess,
                entryCount:     es.filter(en => en.type !== 'trail').length,
                trackerCount:   ts.length,
                totalDistanceM: ts.reduce((sum, t) => sum + t.totalDistanceM, 0),
              }
            })
        )
        const best = candidates
          .filter(c => c.entryCount > 0 || c.trackerCount > 0)
          .sort((a, b) => b.session.startedAt - a.session.startedAt)[0] ?? null
        setRecoveryCandidate(best)
      }
    })()
  }, [isAuthenticated])

  const handleResumeSession = useCallback(async (candidate: RecoveryCandidate) => {
    const e = await getSessionEntries(candidate.session.id)
    setSession(candidate.session)
    setEntries(e)
    setTrackers([])
    setTrackerResetKey(k => k + 1)
    setSentOk(!!candidate.session.emailedAt)
    setSendError(null)
    setLastAction(null)
    setRecoveryCandidate(null)
  }, [])

  const capturePosition = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    const pos = await getPosition()
    if (!navigator.geolocation) { setGpsStatus('unavailable'); return null }
    if (!pos) setGpsStatus('denied')
    return pos
  }, [])

  const logHiker = useCallback(async (subtype: HikerSubtype) => {
    if (!session) return
    const pos = await capturePosition()
    const base = {
      sessionId: session.id,
      timestamp: Date.now(),
      lat:       pos?.lat ?? null,
      lng:       pos?.lng ?? null,
      type:      'hiker' as const,
    }
    const id1 = await addEntry({ ...base, hikerSubtype: subtype })
    const ids = [id1]
    if (subtype === 'contacted') {
      const id2 = await addEntry({ ...base, hikerSubtype: 'seen' })
      ids.push(id2)
    }
    setLastAction(ids)
    await refreshEntries(session.id)
  }, [session, capturePosition, refreshEntries])

  // Logs contacted only — for a hiker already counted as seen
  const logHikerContactOnly = useCallback(async () => {
    if (!session) return
    const pos = await capturePosition()
    const id = await addEntry({
      sessionId:    session.id,
      timestamp:    Date.now(),
      lat:          pos?.lat ?? null,
      lng:          pos?.lng ?? null,
      type:         'hiker' as const,
      hikerSubtype: 'contacted',
    })
    setLastAction([id])
    await refreshEntries(session.id)
  }, [session, capturePosition, refreshEntries])

  const logTree = useCallback(async (size: TreeSize) => {
    if (!session) return
    const pos = await capturePosition()
    const id = await addEntry({
      sessionId:   session.id,
      timestamp:   Date.now(),
      lat:         pos?.lat ?? null,
      lng:         pos?.lng ?? null,
      type:        'tree',
      treeSubtype: treeMode,
      treeSize:    size,
    })
    setLastAction([id])
    await refreshEntries(session.id)
  }, [session, treeMode, capturePosition, refreshEntries])

  const logNote = useCallback(async () => {
    if (!session || !noteText.trim()) return
    const pos = await capturePosition()
    const id = await addEntry({
      sessionId: session.id,
      timestamp: Date.now(),
      lat:       pos?.lat ?? null,
      lng:       pos?.lng ?? null,
      type:      'note',
      noteText:  noteText.trim(),
    })
    setNoteText('')
    setLastAction([id])
    await refreshEntries(session.id)
  }, [session, noteText, capturePosition, refreshEntries])

  const logPhoto = useCallback(async (file: File) => {
    if (!session) return
    setCapturingPhoto(true)
    setSendError(null)
    try {
      const photoData = await fileToCompressedDataUrl(file)
      const pos = await capturePosition()
      const caption = noteText.trim()
      const id = await addEntry({
        sessionId: session.id,
        timestamp: Date.now(),
        lat:       pos?.lat ?? null,
        lng:       pos?.lng ?? null,
        type:      'photo',
        // The note text (if any) becomes the photo's caption
        noteText:  caption || undefined,
        photoId:   crypto.randomUUID(),
        photoData,
      })
      setNoteText('')
      setLastAction([id])
      await refreshEntries(session.id)
    } catch (e) {
      setSendError(e instanceof Error ? `Photo capture failed: ${e.message}` : 'Photo capture failed')
    } finally {
      setCapturingPhoto(false)
    }
  }, [session, noteText, capturePosition, refreshEntries])

  const logViolation = useCallback(async () => {
    if (!session || !violationType) return
    const pos = await capturePosition()
    const id = await addEntry({
      sessionId:     session.id,
      timestamp:     Date.now(),
      lat:           pos?.lat ?? null,
      lng:           pos?.lng ?? null,
      type:          'violation' as EntryType,
      violationType: violationType,
      violationNote: violationNote.trim() || undefined,
    })
    setViolationType('')
    setViolationNote('')
    setLastAction([id])
    await refreshEntries(session.id)
  }, [session, violationType, violationNote, capturePosition, refreshEntries])

  const handleUndo = useCallback(async () => {
    if (!session || !lastAction) return
    for (const id of lastAction) await deleteEntry(id)
    setLastAction(null)
    await refreshEntries(session.id)
  }, [session, lastAction, refreshEntries])

  // Upload any not-yet-uploaded photos individually so the report POST stays
  // small (14 base64 photos in one request overflow PHP's post_max_size).
  // Persists the returned URL and drops the base64 locally — salvages the log
  // even if the subsequent send fails. Returns the fresh entries.
  const uploadPendingPhotos = useCallback(async (): Promise<LogEntry[]> => {
    if (!session) return entries
    const current = await getSessionEntries(session.id)
    for (const e of current) {
      if (e.type !== 'photo' || !e.photoData || e.photoUrl || e.id == null) continue
      const res = await fetch('/api/data-logger/upload-photo.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ photoId: e.photoId, photoData: e.photoData }),
      })
      const data = (await res.json()) as { success?: boolean; url?: string; error?: string }
      if (!res.ok || !data.success || !data.url) {
        throw new Error(`Photo upload failed: ${data.error ?? `HTTP ${res.status}`}`)
      }
      const updated: LogEntry = { ...e, photoUrl: data.url }
      delete updated.photoData
      await updateEntry(updated)
    }
    const fresh = await getSessionEntries(session.id)
    setEntries(fresh)
    return fresh
  }, [session, entries])

  // Enriched report payload shared by member + guest send paths:
  // per-entry distance from trailhead and trail metadata.
  const buildReportPayload = useCallback((srcEntries: LogEntry[]) => {
    // 'other' profile has no trail context — drop the trail so neither the
    // emailed report nor the saved map show trail data.
    const sessionWksiteId = loggerProfile === 'other' ? undefined : session?.wksiteId
    const trailEvents = srcEntries
      .filter(e => e.type === 'trail')
      .sort((a, b) => a.timestamp - b.timestamp)
    return {
      profile:   loggerProfile,
      wksiteId:  sessionWksiteId ?? null,
      trailName: sessionWksiteId != null ? (trailNames[sessionWksiteId] ?? null) : null,
      entries:   enrichEntriesWithTrailheadDist(srcEntries, sessionWksiteId),
      trackers:  trackers.map(t => ({
        name:            t.name || 'Unnamed',
        state:           t.state,
        totalDistanceM:  trackerDistanceM(t),
        activeDurationMs: t.activeDurationMs,
        startedAt:       t.startedAt,
        segments:        t.segments.map(s => ({
          startAt:    s.startAt,
          endAt:      s.endAt,
          distanceM:  s.distanceM,
          startPoint: s.startPoint ?? null,
          endPoint:   s.endPoint ?? null,
          waypoints:  (s.waypoints ?? []).map(wp => {
            if (!wp.name) return wp  // auto-waypoints: no trailhead distance
            const d = distFromTrailheadM(
              activeWksiteAt(wp.ts, trailEvents, sessionWksiteId), wp.lat, wp.lng)
            return d != null ? { ...wp, distFromTrailheadM: d } : wp
          }),
        })),
      })),
    }
  }, [trackers, session, loggerProfile])

  /**
   * Close out the current log and open a new one. Pass a wksiteId to land the
   * new session on a specific trail (the trail-switch flow); omit it to start
   * untrailed, as Stop Logger does. Second precision keeps the key distinct
   * from the session we just finished.
   */
  const startFreshSession = useCallback(async (wksiteId?: number | null) => {
    const newKey = new Date().toISOString().slice(0, 19)
    const base   = await getOrCreateSession(newKey)
    let fresh    = base
    if (wksiteId !== undefined) {
      await updateSessionWksite(base.id, wksiteId)
      fresh = { ...base, wksiteId: wksiteId ?? undefined }
    }
    setSession(fresh)
    setEntries([])
    setTrackers([])
    setSentOk(false)
    setSendError(null)
    setLastAction(null)
    setTrackerResetKey(k => k + 1)
    // Open the new log with a trail event so its report has trail context
    // from the first entry, matching what handleWksiteChange records.
    if (wksiteId != null) {
      const pos = await getPosition()
      await addEntry({
        sessionId: fresh.id,
        timestamp: Date.now(),
        lat:       pos?.lat ?? null,
        lng:       pos?.lng ?? null,
        type:      'trail',
        wksiteId,
        trailName: trailNames[wksiteId],
      })
      await refreshEntries(fresh.id)
    }
    return fresh
  }, [refreshEntries])

  const handleSendReport = useCallback(async () => {
    if (!session || !user) return false
    setSending(true)
    setSendError(null)
    try {
      const token = getStoredAuthToken()
      if (!token) throw new Error('Not authenticated')
      const freshEntries = await uploadPendingPhotos()
      const res  = await fetch('/api/data-logger/send-report.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          token,
          sessionId:        session.id,
          memberName:       user.name,
          reportDate:       session.id,
          emailFormat:      'text',
          appVersion:       version,
          includeLocations,
          ...buildReportPayload(freshEntries),
        }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string; logId?: string; email?: string }
      if (!res.ok || !data.success) {
        const msg = data.error ?? `HTTP ${res.status}`
        throw new Error(data.logId ? `${msg} (map saved: /trail-log/${data.logId})` : msg)
      }
      await markSessionEmailed(session.id)
      setSession(prev => (prev ? { ...prev, emailedAt: Date.now() } : prev))
      setSentOk(true)
      return true
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send report')
      return false
    } finally {
      setSending(false)
    }
  }, [session, user, includeLocations, buildReportPayload, uploadPendingPhotos])

  const handleGuestSendReport = useCallback(async () => {
    if (!session || !guestEmail) return false
    setSending(true)
    setSendError(null)
    try {
      const freshEntries = await uploadPendingPhotos()
      const res  = await fetch('/api/data-logger/send-report.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          guestEmail,
          sessionId:        session.id,
          reportDate:       session.id,
          emailFormat:      'text',
          appVersion:       version,
          includeLocations,
          ...buildReportPayload(freshEntries),
        }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string; logId?: string }
      if (!res.ok || !data.success) {
        const msg = data.error ?? `HTTP ${res.status}`
        throw new Error(data.logId ? `${msg} (map saved: /trail-log/${data.logId})` : msg)
      }
      await markSessionEmailed(session.id)
      setSession(prev => (prev ? { ...prev, emailedAt: Date.now() } : prev))
      setSentOk(true)
      return true
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send report')
      return false
    } finally {
      setSending(false)
    }
  }, [session, guestEmail, includeLocations, buildReportPayload, uploadPendingPhotos])

  // ── Offline email send queue ──────────────────────────────────────

  // Load the queue, dropping terminal 'sent' items. A sent report is done —
  // keeping it only accumulated "Sent ✓" rows that piled up across sessions
  // (nothing ever deleted them). Queued/sending/failed items stay visible.
  const loadQueue = useCallback(async (): Promise<QueuedSend[]> => {
    const items = await getSendQueue()
    const done  = items.filter(i => i.status === 'sent' && i.id != null)
    if (done.length === 0) return items
    await Promise.all(done.map(i => deleteQueuedSend(i.id!)))
    return getSendQueue()
  }, [])

  const refreshQueue = useCallback(async () => {
    setSendQueue(await loadQueue())
  }, [loadQueue])

  const handleQueueSend = useCallback(async (nextWksiteId?: number | null) => {
    if (!session) return false
    setSendError(null)
    try {
      const token = getStoredAuthToken()
      const fresh = await getSessionEntries(session.id)
      const item: Omit<QueuedSend, 'id'> = {
        queuedAt:         Date.now(),
        sessionId:        session.id,
        reportDate:       session.id,
        appVersion:       version,
        includeLocations,
        ...(isAuthenticated && token
          ? { token, memberName: user?.name }
          : { guestEmail }),
        payload:  buildReportPayload(fresh),
        summary: {
          hikers:     fresh.filter(e => e.type === 'hiker').length,
          trees:      fresh.filter(e => e.type === 'tree').length,
          photos:     fresh.filter(e => e.type === 'photo').length,
          notes:      fresh.filter(e => e.type === 'note').length,
          violations: fresh.filter(e => e.type === 'violation').length,
        },
        status: 'queued',
      }
      await enqueueSend(item)
      // The report is frozen in the queue — stop this log and start a fresh
      // session so each successive offline send is unique data (mirrors the
      // online Stop Logger behavior).
      await markSessionEmailed(session.id)
      await startFreshSession(nextWksiteId)
      await refreshQueue()
      return true
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not queue report')
      return false
    }
  }, [session, includeLocations, isAuthenticated, user, guestEmail, buildReportPayload, refreshQueue, startFreshSession])

  const processQueue = useCallback(async () => {
    if (processingQueueRef.current || !navigator.onLine) return
    processingQueueRef.current = true
    try {
      const items = await getSendQueue()
      let sentOne = false
      for (const item of items) {
        if (item.id == null || item.status === 'sent') continue
        // Space successive sends past a second boundary. The server names each
        // saved log from its own clock, so a burst landing inside one tick used
        // to collapse onto a single file. The server now claims names
        // atomically, but staying a second apart keeps the ids readable and
        // in send order rather than seq-suffixed.
        if (sentOne) await new Promise(r => setTimeout(r, 1100))
        sentOne = true
        await updateQueuedSend({ ...item, status: 'sending', error: undefined })
        setSendQueue(await getSendQueue())
        try {
          // Upload any not-yet-uploaded photos in the frozen payload
          for (const e of item.payload.entries) {
            if (e.type !== 'photo' || !e.photoData || e.photoUrl) continue
            const r = await fetch('/api/data-logger/upload-photo.php', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ photoId: e.photoId, photoData: e.photoData }),
            })
            const d = (await r.json()) as { success?: boolean; url?: string; error?: string }
            if (!r.ok || !d.success || !d.url) throw new Error(`Photo upload failed: ${d.error ?? `HTTP ${r.status}`}`)
            e.photoUrl = d.url
            delete e.photoData
            await updateQueuedSend({ ...item, status: 'sending' }) // persist progress
          }
          const body = item.token
            ? { token: item.token, memberName: item.memberName, sessionId: item.sessionId, reportDate: item.reportDate, emailFormat: 'text', appVersion: item.appVersion, includeLocations: item.includeLocations, ...item.payload }
            : { guestEmail: item.guestEmail, sessionId: item.sessionId, reportDate: item.reportDate, emailFormat: 'text', appVersion: item.appVersion, includeLocations: item.includeLocations, ...item.payload }
          const res  = await fetch('/api/data-logger/send-report.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
          })
          const data = (await res.json()) as { success?: boolean; error?: string; logId?: string }
          if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`)
          await updateQueuedSend({ ...item, status: 'sent', logId: data.logId, error: undefined })
        } catch (err) {
          await updateQueuedSend({ ...item, status: 'failed', error: err instanceof Error ? err.message : 'Send failed' })
        }
        setSendQueue(await getSendQueue())
        if (!navigator.onLine) break
      }
    } finally {
      processingQueueRef.current = false
      // Items flashed "Sent ✓" during the loop above; clear them now so the
      // card doesn't keep growing. Failed items remain for retry.
      setSendQueue(await loadQueue())
    }
  }, [loadQueue])

  const handleRemoveQueued = useCallback(async (id: number) => {
    await deleteQueuedSend(id)
    await refreshQueue()
  }, [refreshQueue])

  // ── Trail switching ───────────────────────────────────────────────
  // Each trail gets its own report, so leaving a trail with results on it
  // closes out that report first. Only prompt when there is something to
  // lose: results logged, and an actual trail to attribute them to.
  const handleTrailSelect = useCallback((nextWksiteId: number | null) => {
    const current = session?.wksiteId ?? null
    if (nextWksiteId === current) return
    const hasResults = entries.some(e => e.type !== 'trail')
    if (!session || !hasResults || current == null) {
      void handleWksiteChange(nextWksiteId)
      return
    }
    setPendingWksite(nextWksiteId)
  }, [session, entries, handleWksiteChange])

  const confirmTrailSwitch = useCallback(async () => {
    if (pendingWksite === undefined) return
    const next = pendingWksite
    setSwitchingTrail(true)
    try {
      if (!navigator.onLine) {
        if (!(await handleQueueSend(next))) return   // stay put; error is shown
      } else {
        const sent = isAuthenticated ? await handleSendReport() : await handleGuestSendReport()
        if (!sent) return
        await startFreshSession(next)
      }
      setPendingWksite(undefined)
    } finally {
      setSwitchingTrail(false)
    }
  }, [pendingWksite, isAuthenticated, handleQueueSend, handleSendReport, handleGuestSendReport, startFreshSession])

  // Load the queue on mount; flush it whenever we're (re)connected.
  useEffect(() => { void refreshQueue() }, [refreshQueue])
  useEffect(() => { if (isOnline) void processQueue() }, [isOnline, processQueue])

  const handleNewSession = useCallback(async () => {
    await startFreshSession()
  }, [startFreshSession])

  const handleClearData = useCallback(async () => {
    if (!session) return
    await clearSessionEntries(session.id)
    await clearSessionTrackers(session.id)
    clearExtentStats(session.id)
    const fresh = await resetSession(session.id)
    setSession(fresh)
    setEntries([])
    setTrackers([])
    setSentOk(false)
    setSendError(null)
    setConfirmClear(false)
    setLastAction(null)
    setTrackerResetKey(k => k + 1)
  }, [session])

  // Computed aggregates
  const hikerCounts = useMemo(() => {
    const counts = { seen: 0, contacted: 0 }
    entries.filter(e => e.type === 'hiker').forEach(e => {
      if (e.hikerSubtype === 'seen') counts.seen++
      else if (e.hikerSubtype === 'contacted') counts.contacted++
    })
    return counts
  }, [entries])

  const treeCounts = useMemo(() => {
    const init = (): Record<TreeSize, number> => ({ small: 0, medium: 0, large: 0, xl: 0 })
    const counts: Record<TreeSubtype, Record<TreeSize, number>> = { cleared: init(), noted: init() }
    entries.filter(e => e.type === 'tree').forEach(e => {
      if (e.treeSubtype && e.treeSize) counts[e.treeSubtype][e.treeSize]++
    })
    return counts
  }, [entries])

  const noteEntries = useMemo(
    () => entries.filter(e => e.type === 'note').slice().reverse(),
    [entries],
  )

  const photoEntries = useMemo(
    () => entries.filter(e => e.type === 'photo').slice().reverse(),
    [entries],
  )

  // Combined, newest-first list of notes and photos for the card below
  const notePhotoEntries = useMemo(
    () => entries.filter(e => e.type === 'note' || e.type === 'photo').slice().reverse(),
    [entries],
  )

  const violationEntries = useMemo(
    () => entries.filter(e => e.type === 'violation').slice().reverse(),
    [entries],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-stone-400 dark:text-stone-500 animate-pulse">Initializing logger…</div>
      </div>
    )
  }

  const hikerTotal = hikerCounts.seen
  const treeTotal  = TREE_SIZES.reduce(
    (sum, s) => sum + treeCounts.cleared[s.key] + treeCounts.noted[s.key], 0
  )
  const hasData = hikerTotal > 0 || treeTotal > 0 || noteEntries.length > 0 || trackers.length > 0 || violationEntries.length > 0 || photoEntries.length > 0
  const reportEmail = user?.email?.trim() ?? ''
  const currentSessionQueued = sendQueue.some(q => q.sessionId === session?.id && q.status !== 'sent')

  return (
    <>
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-stone-900 dark:text-stone-100">Data Logger</h1>
          <button
            onClick={() => { setShowTips(true); setShowTipsHint(false) }}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 underline underline-offset-2 transition-colors"
          >
            Usage tips
          </button>
          {showTipsHint && (
            <ArrowLeft
              className="tip-arrow-hint w-5 h-5 text-red-500 shrink-0"
              strokeWidth={2.5}
              aria-hidden
            />
          )}
          {lastAction && !sentOk && (
            <button
              type="button"
              onClick={() => void handleUndo()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
            >
              <Undo2 className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
              Undo Last Entry
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {session?.wksiteId != null && (
            <div className="flex items-center gap-1.5" title={
              onTrailLight === 'green' ? 'On the selected trail'
              : onTrailLight === 'red' ? 'Off the selected trail'
              : 'On-trail status unknown — waiting for GPS'
            }>
              <div className={`w-2 h-2 rounded-full transition-colors ${onTrailLight === 'green' ? 'bg-emerald-500' : onTrailLight === 'red' ? 'bg-red-500' : 'bg-stone-400'}`} />
              <span className="text-xs text-stone-500 dark:text-stone-400">On Trail</span>
            </div>
          )}
          <div className="flex items-center gap-1.5" title={
            gpsStatus === 'ok' ? 'GPS available'
            : gpsStatus === 'denied' ? 'Location permission denied'
            : 'GPS unavailable on this device'
          }>
            <div className={`w-2 h-2 rounded-full transition-colors ${gpsStatus === 'ok' ? 'bg-emerald-500' : gpsStatus === 'denied' ? 'bg-red-500' : 'bg-stone-400'}`} />
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {gpsStatus === 'ok' ? 'GPS' : gpsStatus === 'denied' ? 'GPS off' : 'No GPS'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full transition-colors ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {showTips && <UsageTipsModal onClose={() => setShowTips(false)} />}

      <QueuedReportsBanner queue={sendQueue} isOnline={isOnline} onRetry={() => void processQueue()} />

      {/* Session recovery */}
      {recoveryCandidate && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Unsent session found
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {formatSessionDate(recoveryCandidate.session)}
            {' · '}{recoveryCandidate.entryCount} entr{recoveryCandidate.entryCount === 1 ? 'y' : 'ies'}
            {recoveryCandidate.trackerCount > 0 && (
              ` · ${recoveryCandidate.trackerCount} tracker${recoveryCandidate.trackerCount > 1 ? 's' : ''}`
            )}
            {recoveryCandidate.totalDistanceM > 0 && (
              ` (${(recoveryCandidate.totalDistanceM / 1609.344).toFixed(2)} mi tracked)`
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void handleResumeSession(recoveryCandidate)}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors"
            >
              Resume Session
            </button>
            <button
              onClick={() => setRecoveryCandidate(null)}
              className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
            >
              Start Fresh
            </button>
          </div>
        </div>
      )}

      {/* GPS warning */}
      {gpsStatus !== 'ok' && (
        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          {gpsStatus === 'denied'
            ? 'Location access denied — entries will log without GPS coordinates.'
            : 'GPS unavailable on this device.'}
        </div>
      )}

      {/* Sent confirmation + restart */}
      {sentOk && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Report emailed to {user?.email}
            {session?.emailedAt ? ` at ${fmtTime(session.emailedAt)}` : ''}.
          </p>
          <button
            onClick={() => void handleNewSession()}
            className="shrink-0 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
          >
            New Session
          </button>
        </div>
      )}

      {showMaintUI && (
      <>
      {/* ── TRAIL SELECTOR ──────────────────────────────── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400 shrink-0">
            Trail
          </span>
          <select
            value={session?.wksiteId ?? ''}
            onChange={e => handleTrailSelect(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-700 dark:text-stone-300 outline-none focus:border-emerald-400 transition-colors"
          >
            <option value="">— Select trail IF on a PWV trail —</option>
            {(Object.entries(trailNames) as [string, string][])
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))
            }
          </select>
          {session?.wksiteId != null && (
            <button
              type="button"
              onClick={() => setShowMap(true)}
              title="Show the trail path and your current location"
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              <MapIcon className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
              Map
            </button>
          )}
        </div>
      </div>

      {/* ── ON-TRAIL DISTANCES ──────────────────────────── */}
      {session?.wksiteId != null && (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Distance from trail head
              </div>
              <div className="text-lg font-bold tabular-nums text-stone-800 dark:text-stone-100">
                {trailheadDistM != null ? fmtMiles(trailheadDistM) : '—'}
                {trailheadDistM != null && trailheadCrow && <span className="text-amber-500">*</span>}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Distance on trail
              </div>
              <div className="text-lg font-bold tabular-nums text-stone-800 dark:text-stone-100">
                {onTrailExtentM != null ? fmtMiles(onTrailExtentM) : '—'}
              </div>
            </div>
          </div>
          {trailheadCrow && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              * Off the trail — straight-line (crow-flies) distance from the trailhead.
            </p>
          )}
          {trailheadDistM == null && (
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">
              Waiting for GPS…
            </p>
          )}
        </div>
      )}

      {/* ── HIKER COUNTER ───────────────────────────────── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Hikers
          </span>
          <span className="text-xs text-stone-400 dark:text-stone-500">
            Total: <strong className="text-stone-700 dark:text-stone-300">{hikerTotal}</strong>
          </span>
        </div>

        <div className="flex items-stretch gap-2">
          {/* Seen */}
          <button
            onClick={() => void logHiker('seen')}
            className="flex-1 flex flex-col items-center py-3 bg-stone-50 dark:bg-stone-800/50 border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 active:scale-[0.98] transition-all select-none"
          >
            <span className="text-5xl font-bold tabular-nums text-stone-800 dark:text-stone-100">
              {hikerCounts.seen}
            </span>
            <div className="mt-1 text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">Tap to log</div>
            <div className="text-sm font-medium capitalize text-stone-600 dark:text-stone-400">Seen</div>
          </button>

          {/* Contact-only arrow — seen already counted */}
          <button
            onClick={() => void logHikerContactOnly()}
            title="Contact (seen already logged)"
            className="w-8 flex flex-col items-center justify-center gap-0.5 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700 active:scale-[0.97] transition-all select-none"
          >
            <div className="flex flex-col items-center gap-0 leading-none text-stone-500 dark:text-stone-400">
              <span className="text-sm font-black">›</span>
              <span className="text-sm font-black">›</span>
              <span className="text-sm font-black">›</span>
            </div>
          </button>

          {/* Contacted */}
          <button
            onClick={() => void logHiker('contacted')}
            className="flex-1 flex flex-col items-center py-3 bg-stone-50 dark:bg-stone-800/50 border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 active:scale-[0.98] transition-all select-none"
          >
            <span className="text-5xl font-bold tabular-nums text-stone-800 dark:text-stone-100">
              {hikerCounts.contacted}
            </span>
            <div className="mt-1 text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">Tap to log</div>
            <div className="text-sm font-medium capitalize text-stone-600 dark:text-stone-400">Contacted</div>
          </button>
        </div>
      </div>

      {/* ── TREE COUNTER ────────────────────────────────── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Trees
          </span>
          <ModeToggle
            options={['cleared', 'noted']}
            value={treeMode}
            onChange={v => setTreeMode(v as TreeSubtype)}
          />
        </div>

        {/* Size tap buttons */}
        <div className="grid grid-cols-4 gap-2">
          {TREE_SIZES.map(({ key, label, range }) => (
            <button
              key={key}
              onClick={() => void logTree(key)}
              className="flex flex-col items-center py-3 px-1 bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 active:scale-[0.97] transition-all select-none"
            >
              <span className="text-2xl font-bold tabular-nums text-stone-800 dark:text-stone-100">
                {treeCounts[treeMode][key]}
              </span>
              <span className="text-xs font-medium text-stone-600 dark:text-stone-400 mt-0.5">{label}</span>
              <span className="text-xs text-stone-400 dark:text-stone-500">{range}</span>
            </button>
          ))}
        </div>

        {/* Cleared / Noted summary */}
        <div className="grid grid-cols-2 gap-2">
          {(['cleared', 'noted'] as TreeSubtype[]).map(subtype => (
            <div key={subtype} className="bg-stone-50 dark:bg-stone-800/50 rounded-lg px-3 py-2">
              <div className="text-xs font-medium capitalize text-stone-500 dark:text-stone-400 mb-1">{subtype}</div>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {TREE_SIZES.map(({ key, label }) => (
                  <span key={key} className="text-xs text-stone-500 dark:text-stone-400">
                    {label[0]}: <strong className="text-stone-700 dark:text-stone-300">{treeCounts[subtype][key]}</strong>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── VIOLATIONS ──────────────────────────────────── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Violations
          </span>
          {violationEntries.length > 0 && (
            <span className="text-xs text-stone-400 dark:text-stone-500">
              Total: <strong className="text-stone-700 dark:text-stone-300">{violationEntries.length}</strong>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={violationType}
            onChange={e => setViolationType(e.target.value)}
            className="flex-[2] min-w-0 px-3 py-2 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-700 dark:text-stone-300 outline-none focus:border-emerald-400 transition-colors"
          >
            <option value="" disabled>Observation…</option>
            {VIOLATION_TYPES.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <input
            type="text"
            value={violationNote}
            onChange={e => setViolationNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void logViolation() }}
            placeholder="Note"
            className="flex-1 min-w-0 px-3 py-2 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-700 dark:text-stone-300 placeholder:text-stone-400 outline-none focus:border-emerald-400 transition-colors"
          />
          <button
            onClick={() => void logViolation()}
            disabled={violationType === ''}
            className="shrink-0 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium rounded-lg hover:bg-stone-700 dark:hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>
        {violationEntries.length > 0 && (
          <div className="space-y-1.5">
            {(showAllViolations ? violationEntries : violationEntries.slice(0, 1)).map(e => (
              <div key={e.id} className="text-xs text-stone-700 dark:text-stone-300 bg-stone-50 dark:bg-stone-800/50 rounded-lg px-3 py-2">
                <div className="font-medium">{e.violationType}</div>
                {e.violationNote && <div className="text-stone-500 dark:text-stone-400">{e.violationNote}</div>}
                <div className="text-stone-400 dark:text-stone-500 mt-0.5">
                  {fmtTime(e.timestamp)} · {fmtCoords(e.lat, e.lng)}
                </div>
              </div>
            ))}
            {violationEntries.length > 1 && (
              <button
                onClick={() => setShowAllViolations(p => !p)}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 underline underline-offset-2 transition-colors"
              >
                {showAllViolations ? 'Show less' : `Show all ${violationEntries.length} violations`}
              </button>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {/* ── DISTANCE TRACKER ────────────────────────────── */}
      <DistanceTracker
        key={trackerResetKey}
        sessionId={session?.id ?? null}
        trailheadCoords={trailheadCoords ?? undefined}
        wksiteId={session?.wksiteId}
        onTrackersChange={setTrackers}
        onPosition={handleLoggerPosition}
      />

      {/* ── NOTES ───────────────────────────────────────── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Notes &amp; Photos
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void logNote() }}
            placeholder="Observation…"
            className="flex-1 min-w-0 px-3 py-2 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-700 dark:text-stone-300 placeholder:text-stone-400 outline-none focus:border-emerald-400 transition-colors"
          />
          <label
            title="Take a photo — the note text becomes its caption"
            className={`shrink-0 flex items-center justify-center px-3 py-2 rounded-lg border transition-colors ${
              capturingPhoto
                ? 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-400 cursor-wait'
                : 'bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 cursor-pointer'
            }`}
          >
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={capturingPhoto}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) void logPhoto(f)
                e.target.value = ''
              }}
            />
            <Camera className="w-4 h-4" strokeWidth={2} aria-hidden />
          </label>
          <button
            onClick={() => void logNote()}
            disabled={!noteText.trim()}
            className="shrink-0 px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-stone-700 dark:hover:bg-stone-200 transition-colors"
          >
            Add
          </button>
        </div>
        {notePhotoEntries.length > 0 && (
          <div className="space-y-1.5">
            {(showAllNotes ? notePhotoEntries : notePhotoEntries.slice(0, 2)).map(e => {
              const src = e.type === 'photo' ? (e.photoData ?? e.photoUrl) : null
              return (
                <div
                  key={e.id}
                  className="flex items-start gap-2 text-xs text-stone-700 dark:text-stone-300 bg-stone-50 dark:bg-stone-800/50 rounded-lg px-3 py-2"
                >
                  {src && (
                    <button
                      onClick={() => setViewPhoto(src)}
                      title={e.noteText || 'Photo'}
                      className="shrink-0 w-12 h-12 rounded-md overflow-hidden border border-stone-200 dark:border-stone-700 hover:border-emerald-400 transition-colors"
                    >
                      <img src={src} alt={e.noteText || 'Photo'} className="w-full h-full object-cover" />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="break-words">{e.noteText || (e.type === 'photo' ? 'Photo' : '')}</div>
                    <div className="text-stone-400 dark:text-stone-500 mt-0.5">
                      {fmtTime(e.timestamp)} · {fmtCoords(e.lat, e.lng)}
                    </div>
                  </div>
                </div>
              )
            })}
            {notePhotoEntries.length > 2 && (
              <button
                onClick={() => setShowAllNotes(p => !p)}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 underline underline-offset-2 transition-colors"
              >
                {showAllNotes ? 'Show less' : `Show ${notePhotoEntries.length - 2} more`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── EMAIL REPORT ────────────────────────────────── */}
      <div className="space-y-2 pb-2">
        {isAuthenticated ? (
          <>
            {sendError && (
              <p className="text-xs text-red-500 text-center">{sendError}</p>
            )}
            {reportEmail ? (
              <p className="text-xs text-center text-stone-500 dark:text-stone-400">
                {sentOk ? (
                  <>Report sent to{' '}
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">{reportEmail}</span>
                  </>
                ) : (
                  <>Will email to{' '}
                    <span className="font-medium text-stone-700 dark:text-stone-300">{reportEmail}</span>
                  </>
                )}
              </p>
            ) : (
              <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                No email address on file — contact an admin to update your member record.
              </p>
            )}
            <div className="flex gap-2">
              {!isOnline && !sentOk && hasData && reportEmail ? (
                currentSessionQueued ? (
                  <button
                    disabled
                    className="flex-[3] min-w-0 py-3 bg-amber-500/60 text-white text-sm font-semibold rounded-xl cursor-default"
                  >
                    Queued ✓ — sends when online
                  </button>
                ) : (
                  <button
                    onClick={() => void handleQueueSend()}
                    className="flex-[3] min-w-0 py-3 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-400 transition-colors"
                  >
                    STOP Logger &amp; Queue Send
                  </button>
                )
              ) : (
                <button
                  onClick={() => void handleSendReport()}
                  disabled={!isOnline || sending || !hasData || sentOk || !reportEmail}
                  className="flex-[3] min-w-0 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {sending
                    ? `Sending to ${reportEmail}…`
                    : sentOk
                      ? 'Report Sent ✓'
                      : 'STOP Logger & Email Report'}
                </button>
              )}
              <button
                onClick={() => setShowMap(true)}
                disabled={!hasData}
                className="flex-[2] min-w-0 py-3 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 text-sm font-semibold rounded-xl hover:bg-stone-700 dark:hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Show Map
              </button>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeLocations}
                onChange={e => setIncludeLocations(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-600"
              />
              <span className="text-xs text-stone-600 dark:text-stone-400">Include GPS data in emailed report</span>
            </label>
            {!isOnline && (
              <p className="text-xs text-stone-400 dark:text-stone-500 text-center">
                {currentSessionQueued
                  ? 'Report queued — will send automatically when back online.'
                  : hasData && reportEmail
                    ? 'Offline — queue the report to send when reconnected.'
                    : 'Connect to network to send report'}
              </p>
            )}
            {isOnline && !hasData && !sentOk && (
              <p className="text-xs text-stone-400 dark:text-stone-500 text-center">Log some data first</p>
            )}
          </>
        ) : (
          <>
            {sendError && (
              <p className="text-xs text-red-500 text-center">{sendError}</p>
            )}
            {sentOk ? (
              <>
                <p className="text-xs text-center text-emerald-600 dark:text-emerald-400 font-medium">
                  Report sent to <span className="font-semibold">{guestEmail}</span>
                </p>
                <button
                  onClick={() => setShowMap(true)}
                  disabled={!hasData}
                  className="w-full py-3 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 text-sm font-semibold rounded-xl hover:bg-stone-700 dark:hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Show Map
                </button>
              </>
            ) : showGuestEmailForm ? (
              <>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={guestEmail}
                  onChange={e => setGuestEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleGuestSendReport()}
                    disabled={!guestEmail.includes('@') || !isOnline || sending}
                    className="flex-[3] py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {sending ? 'Sending…' : 'Send Report'}
                  </button>
                  <button
                    onClick={() => { setShowGuestEmailForm(false); setSendError(null) }}
                    className="flex-[2] py-3 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 text-sm font-semibold rounded-xl hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeLocations}
                    onChange={e => setIncludeLocations(e.target.checked)}
                    className="w-4 h-4 rounded accent-emerald-600"
                  />
                  <span className="text-xs text-stone-600 dark:text-stone-400">Include GPS data in emailed report</span>
                </label>
                {!isOnline && (
                  <p className="text-xs text-stone-400 dark:text-stone-500 text-center">Connect to network to send report</p>
                )}
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowGuestEmailForm(true)}
                    disabled={!hasData}
                    className="flex-[3] py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Email Me the Report
                  </button>
                  <button
                    onClick={() => setShowMap(true)}
                    disabled={!hasData}
                    className="flex-[2] py-3 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 text-sm font-semibold rounded-xl hover:bg-stone-700 dark:hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Show Map
                  </button>
                </div>
                {isOnline && !hasData && (
                  <p className="text-xs text-stone-400 dark:text-stone-500 text-center">Log some data first</p>
                )}
                {!isOnline && (
                  <p className="text-xs text-stone-400 dark:text-stone-500 text-center">Connect to network to send report</p>
                )}
              </>
            )}
          </>
        )}
        {session && (
          <p className="text-xs text-stone-400 dark:text-stone-500 text-center">
            Session {session.id} · started {fmtTime(session.startedAt)}
          </p>
        )}
      </div>

      {/* ── QUEUED SENDS ────────────────────────────────── */}
      {sendQueue.length > 0 && (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              Queued Sends
            </span>
            {(() => {
              const pending = sendQueue.some(q => q.status === 'queued' || q.status === 'sending')
              const label = !isOnline ? 'Sends when reconnected' : pending ? 'Processing…' : null
              return label && (
                <span className="text-xs text-stone-400 dark:text-stone-500">{label}</span>
              )
            })()}
          </div>
          {sendQueue.map(q => (
            <div key={q.id} className="flex items-start justify-between gap-3 bg-stone-50 dark:bg-stone-800/50 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-stone-700 dark:text-stone-200">{q.reportDate}</div>
                <div className="text-[11px] text-stone-400 dark:text-stone-500 truncate">{queueSummaryText(q.summary)}</div>
                {q.status === 'failed' && q.error && (
                  <div className="text-[11px] text-red-500 mt-0.5">{q.error}</div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  q.status === 'sent'    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : q.status === 'sending' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                  : q.status === 'failed'  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                }`}>
                  {q.status === 'sent' ? 'Sent ✓' : q.status === 'sending' ? 'Sending…' : q.status === 'failed' ? 'Failed' : 'Queued'}
                </span>
                {q.status === 'failed' && isOnline && (
                  <button
                    onClick={() => void processQueue()}
                    className="text-xs text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
                  >
                    Retry
                  </button>
                )}
                {q.status !== 'sending' && q.id != null && (
                  <button
                    onClick={() => void handleRemoveQueued(q.id!)}
                    aria-label="Remove from queue"
                    className="text-stone-400 hover:text-red-500 text-sm leading-none px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CLEAR DATA ──────────────────────────────────── */}
      <div className="pb-6 flex flex-col items-center gap-2">
        {confirmClear ? (
          <div className="w-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 space-y-2">
            <p className="text-xs text-red-700 dark:text-red-400 text-center">
              Are you sure you want to delete all data from the current session?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleClearData()}
                className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              to="/settings"
              className="text-xs text-stone-400 dark:text-stone-500 hover:text-emerald-600 dark:hover:text-emerald-400 underline underline-offset-2 transition-colors"
            >
              Data Logger Settings
            </Link>
            <span className="text-stone-300 dark:text-stone-600">·</span>
            <button
              onClick={() => setConfirmClear(true)}
              className="text-xs text-stone-400 dark:text-stone-500 hover:text-red-500 dark:hover:text-red-400 underline underline-offset-2 transition-colors"
            >
              Clear all data
            </button>
          </div>
        )}
      </div>

    </div>

    {showMap && session && (
      <MapModal
        entries={entries}
        trackers={trackers}
        memberName={user?.name ?? ''}
        reportDate={session.id.slice(0, 10)}
        trailheadCoords={trailheadCoords ?? undefined}
        wksiteId={session.wksiteId}
        onClose={() => setShowMap(false)}
      />
    )}

    {viewPhoto && (
      <div
        className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
        onClick={() => setViewPhoto(null)}
      >
        <img src={viewPhoto} alt="Captured photo" className="max-w-full max-h-full rounded-lg" />
      </div>
    )}

    {pendingWksite !== undefined && session?.wksiteId != null && (
      <TrailSwitchModal
        fromTrail={trailNames[session.wksiteId]}
        toTrail={pendingWksite != null ? trailNames[pendingWksite] : null}
        isOnline={isOnline}
        busy={switchingTrail}
        error={sendError}
        onConfirm={() => void confirmTrailSwitch()}
        onCancel={() => { setPendingWksite(undefined); setSendError(null) }}
      />
    )}
    </>
  )
}

// ── Trail Switch Confirmation ──────────────────────────────────
// Leaving a trail that has results on it closes out its report, so say so
// plainly — and name the action the user will actually get: online the
// report goes out now, offline it waits in the queue for a connection.

function TrailSwitchModal({
  fromTrail, toTrail, isOnline, busy, error, onConfirm, onCancel,
}: {
  fromTrail: string
  toTrail:   string | null
  isOnline:  boolean
  busy:      boolean
  error:     string | null
  onConfirm: () => void
  onCancel:  () => void
}) {
  const destination = toTrail ? `to ${toTrail}` : 'away from this trail'
  const outcome     = isOnline
    ? 'will be sent'
    : 'will be saved and sent when you reconnect'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trail-switch-title"
      onClick={e => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <h3 id="trail-switch-title" className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-2">
            Finish logging {fromTrail}?
          </h3>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Before switching {destination}, your accumulated results from{' '}
            <span className="font-semibold text-stone-800 dark:text-stone-200">{fromTrail}</span>{' '}
            {outcome}.
          </p>
          {!isOnline && (
            <p className="text-xs text-amber-700 dark:text-amber-500 mt-2">
              You're offline — the report will be queued.
            </p>
          )}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-3">{error}</p>
          )}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            Stay on {fromTrail}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white border border-emerald-600 hover:bg-emerald-500 disabled:opacity-50 shadow-sm transition-colors"
          >
            {busy ? 'Working…' : isOnline ? 'Send & switch' : 'Save & switch'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Queued-reports guard banner ────────────────────────────────
// A sticky, always-in-view nag while reports are held on the device but not
// yet sent — so unsent data can't be wiped by clearing site data or deleting
// the app. Sent items are pruned from the queue, so anything here is unsent.

function QueuedReportsBanner({
  queue, isOnline, onRetry,
}: {
  queue: QueuedSend[]
  isOnline: boolean
  onRetry: () => void
}) {
  const total = queue.length
  if (total === 0) return null

  const pending = queue.filter(q => q.status === 'queued' || q.status === 'sending').length
  const failed  = queue.filter(q => q.status === 'failed').length
  const n = (k: number) => `${k} report${k === 1 ? '' : 's'}`

  let tone: 'amber' | 'sky' | 'red'
  let msg: React.ReactNode
  let showRetry = false

  if (!isOnline) {
    tone = 'amber'
    msg = <><strong>{n(total)} saved on this phone.</strong> Held here until you reconnect, then sent automatically. Don't clear browser data or delete the app until this banner clears.</>
  } else if (pending > 0) {
    tone = 'sky'
    msg = <><strong>Sending {n(pending)}…</strong> Keep the app open until the queue clears.</>
  } else {
    tone = 'red'
    msg = <><strong>{n(failed)} failed to send</strong> — still saved on this phone. Retry when you have a stronger connection.</>
    showRetry = true
  }

  const tones = {
    amber: 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200',
    sky:   'bg-sky-50 dark:bg-sky-900/30 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200',
    red:   'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200',
  }

  return (
    <div className={`sticky top-2 z-30 flex items-center gap-3 rounded-xl border px-3 py-2 shadow-lg ${tones[tone]}`}>
      <p className="text-xs leading-snug flex-1">{msg}</p>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}

// ── Usage Tips Modal ───────────────────────────────────────────

function TipSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
        {title}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
      <span className="text-emerald-500 shrink-0 mt-0.5">▸</span>
      <span>{children}</span>
    </li>
  )
}

export function UsageTipsModal({ onClose }: { onClose: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null)

  // Save the live tips content as a real downloadable PDF (no print dialog).
  const handleSaveTipsPdf = () => {
    const root = contentRef.current
    if (!root) return
    const sections = Array.from(root.querySelectorAll(':scope > div')).map(div => ({
      heading: div.querySelector('h3')?.textContent?.trim() ?? '',
      items: Array.from(div.querySelectorAll('li'))
        .map(li => (li.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    })).filter(s => s.heading || s.items.length)
    downloadBlob(buildTextPdf('PWV Data Logger — Usage Tips', sections), 'PWV-Data-Logger-Usage-Tips.pdf')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg max-h-[85dvh] bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl border border-stone-200 dark:border-stone-800 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Usage Tips</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveTipsPdf}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              title="Save these tips as a PDF"
            >
              <FileDown className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
              Save PDF
            </button>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors text-lg leading-none px-1"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={contentRef} className="overflow-y-auto px-4 py-4 space-y-5">

          <TipSection title="Working offline / multiple trails">
            <Tip>
              <strong>Open the app once while online first</strong> — that lets it cache itself so it still opens with no signal. Confirm before a trip by switching to airplane mode and reopening it. The trail list works offline; only the background map tiles need a connection.
            </Tip>
            <Tip>
              <strong>GPS works with no cell service</strong> — location comes from satellites, so waypoints, coordinates and trailhead distances all record normally out of range. The report map just fills in later when you're back online.
            </Tip>
            <Tip>
              <strong>Each trail becomes its own report</strong> — when you change the trail, the one you're leaving is finalized. Offline, it's saved to a queue and sends automatically once you reconnect. Switch trails five times and you'll get five reports.
            </Tip>
            <Tip>
              <strong>Save your last trail before you finish</strong> — switching trails only saves the trail you're <em>leaving</em>. The final trail you're on isn't captured until you tap <strong>STOP Logger</strong> (offline it reads "Save report to send later"). Do this before closing the app or you'll leave that trail's data unsent.
            </Tip>
            <Tip>
              <strong>Watch the "reports saved on this phone" banner</strong> — while it's showing, unsent reports are held only on your device. <strong>Don't clear browser data or delete the app until it's gone</strong> and the emails have arrived. When you get back in range, open the app and keep it in front so the queue finishes sending.
            </Tip>
          </TipSection>

          <TipSection title="iPhone / iPad (iOS)">
            <Tip>
              <strong>Install to Home Screen</strong> — In Safari, tap the Share button then "Add to Home Screen." The installed app gets slightly better background behavior and a persistent icon — use this instead of opening it from the browser tab every time.
            </Tip>
            <Tip>
              <strong>Allow location access</strong> — When prompted, choose "Allow While Using App." For the installed Home Screen version, go to <em>Settings → Privacy & Security → Location Services → Safari Websites</em> (or the app name) and set it to "While Using."
            </Tip>
            <Tip>
              <strong>Disable Low Power Mode during patrols</strong> — Low Power Mode throttles background processes and can delay GPS fixes. Turn it off at <em>Settings → Battery → Low Power Mode</em> before you head out.
            </Tip>
            <Tip>
              <strong>Keep the screen on</strong> — iOS aggressively suspends web apps when the screen locks. Enable "Keep screen awake while tracking" in Settings to prevent auto-lock, or manually lock your screen only when you don't need continuous waypoints.
            </Tip>
            <Tip>
              <strong>Don't switch away from the app</strong> — Switching to another app or returning to the home screen will suspend GPS tracking within seconds on iOS. If you need to check something, do it quickly and return.
            </Tip>
          </TipSection>

          <TipSection title="Android">
            <Tip>
              <strong>Install the app</strong> — In Chrome, tap the menu (⋮) and choose "Add to Home screen" or "Install app." Installed PWAs are treated more like native apps by Android and are less likely to be suspended.
            </Tip>
            <Tip>
              <strong>Disable battery optimization for Chrome</strong> — Go to <em>Settings → Apps → Chrome → Battery</em> and set it to <strong>Unrestricted</strong> (the label varies by manufacturer). This tells Android not to throttle or kill the browser in the background.
            </Tip>
            <Tip>
              <strong>Disable battery optimization for the installed app</strong> — If you've installed it to your home screen, find the PWA entry in <em>Settings → Apps</em> and set its battery to Unrestricted as well.
            </Tip>
            <Tip>
              <strong>Keep the screen on</strong> — Enable "Keep screen awake while tracking" in Settings. Android is generally more permissive than iOS when the screen is on, but will still throttle background JS when it locks.
            </Tip>
            <Tip>
              <strong>Avoid Power Saving / Battery Saver modes</strong> — These modes aggressively limit background activity. Turn them off before a patrol if you want reliable continuous tracking.
            </Tip>
          </TipSection>

          <TipSection title="General">
            <Tip>
              <strong>Time-mode waypoints are more reliable than distance-mode</strong> — If your screen might lock, switch waypoints to "time" mode in Settings. Each GPS fix that does come through — even if infrequent — is evaluated against the elapsed time threshold, so waypoints will still fire when you re-open the app.
            </Tip>
            <Tip>
              <strong>Manual waypoints always work</strong> — Tap "Add Waypoint" while tracking to drop a named point at your current location. These require the screen to be on but are not affected by auto-lock settings.
            </Tip>
            <Tip>
              <strong>Distance tracking resumes automatically</strong> — If GPS drops and comes back (e.g. after you unlock), the tracker picks up from where it left off. The distance gap during the lock period won't be counted, but the time will still accumulate.
            </Tip>
          </TipSection>

          <TipSection title="GPS Indicator">
            <li className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span><strong>GPS</strong> — location is available; entries record your position.</span>
            </li>
            <li className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span><strong>GPS off</strong> — location permission was denied. Entries are saved without coordinates. Re-enable location access to fix.</span>
            </li>
            <li className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
              <span className="w-2 h-2 rounded-full bg-stone-400 shrink-0" />
              <span><strong>No GPS</strong> — this device or browser can't provide location. Entries are saved without coordinates.</span>
            </li>
          </TipSection>

          <TipSection title="On Trail Indicator">
            <li className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span><strong>On Trail</strong> — you're within the on-trail distance of the selected trail's mapped centerline.</span>
            </li>
            <li className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span><strong>Off Trail</strong> — you're farther than that from the trail.</span>
            </li>
            <li className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
              <span className="w-2 h-2 rounded-full bg-stone-400 shrink-0" />
              <span><strong>Unknown</strong> — can't tell yet: no live GPS fix, location denied, or this trail has no mapped centerline.</span>
            </li>
            <Tip>
              The light appears once you've selected a trail and updates live from your GPS (green/red need a fix; it's gray while none is available). Set how far off-trail still counts as "on trail" under <em>Settings → Data Logger → On-trail distance</em> (default 200 ft).
            </Tip>
            <Tip>
              <strong>Distance from trail head</strong> and <strong>Distance on trail</strong> appear below the trail dropdown. "From trail head" is measured along the trail path when you're on it; when you're off the trail it shows the straight-line (crow-flies) distance with a <strong>*</strong>. "On trail" is how much of the trail you've covered end-to-end.
            </Tip>
          </TipSection>

        </div>
      </div>
    </div>
  )
}

// ── Small shared component ──────────────────────────────────────
function ModeToggle({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5 gap-0.5">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
            value === opt
              ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
              : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
