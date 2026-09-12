import { Undo2, ArrowLeft, Camera, FileDown, MapPin } from 'lucide-react'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { version } from '../../package.json'
import { useTracking } from '../components/data-logger/useTracking'
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
  enqueueSend,
  getSendQueue,
  updateQueuedSend,
  deleteQueuedSend,
  updateSessionWksite,
} from '../services/dataLoggerService'
import { getStoredAuthToken } from '../services/authService'
import { trailGeoData, trailNames } from '../data/trailGeoData'
import type { LogEntry, LogSession, HikerSubtype, HikerActivity, DogSubtype, TreeSubtype, TreeSize, EntryType, Tracker, QueuedSend, QueuedSendSummary } from '../types/dataLogger'
import { trackerDistanceM } from '../lib/gpsDistance'
import { distFromTrailheadM } from '../lib/trailheadDistance'
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

// Activity categories for the People counter. Default is 'hike'; legacy hiker
// entries with no activity are treated as 'hike' when tallying.
const HIKER_ACTIVITIES: { key: HikerActivity; label: string }[] = [
  { key: 'hike',  label: 'Hike'  },
  { key: 'bpack', label: 'Bpack' },
  { key: 'bike',  label: 'Bike'  },
  { key: 'hunt',  label: 'Hunt'  },
  { key: 'fish',  label: 'Fish'  },
  { key: 'stock', label: 'Stock' },
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
    s.dogs       ? plural(s.dogs, 'dog') : null,
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

function fmtDuration(ms: number): string {
  const s   = Math.floor(ms / 1000)
  const h   = Math.floor(s / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtPace(minPerMi: number): string {
  const m = Math.floor(minPerMi)
  const s = Math.round((minPerMi - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}/mi`
}

// Pure tallies over a slice of entries — reused for both the current-trail
// section (totals reset per trail change) and the all-trails total.
function tallyHikers(entries: LogEntry[]): Record<HikerActivity, { seen: number; contacted: number }> {
  const init = () => ({ seen: 0, contacted: 0 })
  const counts: Record<HikerActivity, { seen: number; contacted: number }> = {
    hike: init(), bpack: init(), bike: init(), hunt: init(), fish: init(), stock: init(),
  }
  for (const e of entries) {
    if (e.type !== 'hiker') continue
    const act = e.hikerActivity ?? 'hike'
    if (e.hikerSubtype === 'seen') counts[act].seen++
    else if (e.hikerSubtype === 'contacted') counts[act].contacted++
  }
  return counts
}

function tallyDogs(entries: LogEntry[]): { onLeash: number; offLeash: number } {
  const counts = { onLeash: 0, offLeash: 0 }
  for (const e of entries) {
    if (e.type !== 'dog') continue
    if (e.dogSubtype === 'onLeash') counts.onLeash++
    else if (e.dogSubtype === 'offLeash') counts.offLeash++
  }
  return counts
}

function tallyTrees(entries: LogEntry[]): Record<TreeSubtype, Record<TreeSize, number>> {
  const init = (): Record<TreeSize, number> => ({ small: 0, medium: 0, large: 0, xl: 0 })
  const counts: Record<TreeSubtype, Record<TreeSize, number>> = { cleared: init(), noted: init() }
  for (const e of entries) {
    if (e.type !== 'tree') continue
    if (e.treeSubtype && e.treeSize) counts[e.treeSubtype][e.treeSize]++
  }
  return counts
}

const hikerSeenTotal = (c: Record<HikerActivity, { seen: number; contacted: number }>): number =>
  c.hike.seen + c.bpack.seen + c.bike.seen + c.hunt.seen + c.fish.seen + c.stock.seen
const treeGrandTotal = (c: Record<TreeSubtype, Record<TreeSize, number>>): number =>
  c.cleared.small + c.cleared.medium + c.cleared.large + c.cleared.xl +
  c.noted.small + c.noted.medium + c.noted.large + c.noted.xl

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
  const [hikerActivity,   setHikerActivity]   = useState<HikerActivity>('hike')
  const [treeMode,        setTreeMode]        = useState<TreeSubtype>('cleared')
  const [noteText,        setNoteText]        = useState('')
  const [violationType,   setViolationType]   = useState('')
  const [violationNote,   setViolationNote]   = useState('')
  // Undo buffer: each entry is one logged action's entry ids (a "contacted" tap
  // logs two). Holds up to the last three actions; Undo pops the most recent.
  const [undoStack,       setUndoStack]       = useState<number[][]>([])
  const [sendError,        setSendError]        = useState<string | null>(null)
  const [includeLocations, setIncludeLocations] = useState(true)
  const [showMap,       setShowMap]       = useState(false)
  const [showAllNotes,      setShowAllNotes]      = useState(false)
  const [showAllViolations, setShowAllViolations] = useState(false)
  const [capturingPhoto,    setCapturingPhoto]    = useState(false)
  const [viewPhoto,         setViewPhoto]         = useState<string | null>(null)
  const [sendQueue,         setSendQueue]         = useState<QueuedSend[]>([])
  const [gpsStatus,     setGpsStatus]     = useState<'ok' | 'denied' | 'unavailable'>('ok')
  const [loading,           setLoading]           = useState(true)
  const [recoveryCandidate,   setRecoveryCandidate]   = useState<RecoveryCandidate | null>(null)
  // Confirmation dialogs
  const [confirmRestart,  setConfirmRestart]  = useState(false)
  const [confirmStop,     setConfirmStop]     = useState(false)
  const [pendingWksite,   setPendingWksite]   = useState<number | null | undefined>(undefined)
  const [busy,            setBusy]            = useState(false)
  // Note shown at the bottom after a Stop & Send completes (sent or queued).
  const [savedNote,       setSavedNote]       = useState<{ at: number; queued: boolean } | null>(null)
  // Frozen copy of the just-sent session so its map can still be viewed after
  // the logger resets. The blue Map button in the sent-note opens this.
  const [sentSnapshot,    setSentSnapshot]    = useState<{ entries: LogEntry[]; trackers: Tracker[]; wksiteId?: number; reportDate: string } | null>(null)
  const [showSentMap,     setShowSentMap]     = useState(false)
  const processingQueueRef = useRef(false)
  // Most recent GPS fix, so logging a count can stamp coordinates instantly.
  const lastPosRef = useRef<{ lat: number; lng: number; ts: number } | null>(null)

  // ── Single always-on tracker ──────────────────────────────────────
  const { tracker, stats, start, stop, clear } = useTracking({
    sessionId: session?.id ?? null,
    wksiteId:  showMaintUI ? session?.wksiteId : undefined,
  })
  const tracking = stats.tracking
  const trackers = useMemo<Tracker[]>(() => (tracker ? [tracker] : []), [tracker])

  const trailName = session?.wksiteId != null ? (trailNames[session.wksiteId] ?? 'trail') : null
  const trailheadCoords = session?.wksiteId != null
    ? (trailGeoData[session.wksiteId] ?? null)
    : null

  // Blink the "Usage tips" hint arrow a few times on launch, then remove it
  useEffect(() => {
    const timer = setTimeout(() => setShowTipsHint(false), 3200)
    return () => clearTimeout(timer)
  }, [])

  // Reflect the geolocation permission state in the GPS indicator.
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

  // Keep a light GPS fix cached so taps stamp coordinates instantly even when a
  // trail path calc isn't running. (The tracker runs its own high-accuracy watch.)
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => { lastPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() } },
      () => { /* keep last reading */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const refreshEntries = useCallback(async (sessionId: string) => {
    setEntries(await getSessionEntries(sessionId))
  }, [])

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
    setSendError(null)
    setUndoStack([])
    setSavedNote(null)
    setRecoveryCandidate(null)
  }, [])

  const capturePosition = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    const cached = lastPosRef.current
    if (cached && Date.now() - cached.ts < 20000) {
      return { lat: cached.lat, lng: cached.lng }
    }
    const pos = await getPosition()
    if (!navigator.geolocation) { setGpsStatus('unavailable'); return null }
    if (!pos) setGpsStatus('denied')
    else lastPosRef.current = { ...pos, ts: Date.now() }
    return pos
  }, [])

  const logHiker = useCallback(async (subtype: HikerSubtype) => {
    if (!session || !tracking) return
    const pos = await capturePosition()
    const base = {
      sessionId:     session.id,
      timestamp:     Date.now(),
      lat:           pos?.lat ?? null,
      lng:           pos?.lng ?? null,
      type:          'hiker' as const,
      hikerActivity: hikerActivity,
    }
    const id1 = await addEntry({ ...base, hikerSubtype: subtype })
    const ids = [id1]
    if (subtype === 'contacted') {
      const id2 = await addEntry({ ...base, hikerSubtype: 'seen' })
      ids.push(id2)
    }
    setUndoStack(s => [...s, ids].slice(-3))
    await refreshEntries(session.id)
  }, [session, tracking, hikerActivity, capturePosition, refreshEntries])

  // Logs contacted only — for a hiker already counted as seen
  const logHikerContactOnly = useCallback(async () => {
    if (!session || !tracking) return
    const pos = await capturePosition()
    const id = await addEntry({
      sessionId:     session.id,
      timestamp:     Date.now(),
      lat:           pos?.lat ?? null,
      lng:           pos?.lng ?? null,
      type:          'hiker' as const,
      hikerSubtype:  'contacted',
      hikerActivity: hikerActivity,
    })
    setUndoStack(s => [...s, [id]].slice(-3))
    await refreshEntries(session.id)
  }, [session, tracking, hikerActivity, capturePosition, refreshEntries])

  const logDog = useCallback(async (subtype: DogSubtype) => {
    if (!session || !tracking) return
    const pos = await capturePosition()
    const id = await addEntry({
      sessionId:  session.id,
      timestamp:  Date.now(),
      lat:        pos?.lat ?? null,
      lng:        pos?.lng ?? null,
      type:       'dog',
      dogSubtype: subtype,
    })
    setUndoStack(s => [...s, [id]].slice(-3))
    await refreshEntries(session.id)
  }, [session, tracking, capturePosition, refreshEntries])

  const logTree = useCallback(async (size: TreeSize) => {
    if (!session || !tracking) return
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
    setUndoStack(s => [...s, [id]].slice(-3))
    await refreshEntries(session.id)
  }, [session, tracking, treeMode, capturePosition, refreshEntries])

  const logNote = useCallback(async () => {
    if (!session || !tracking || !noteText.trim()) return
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
    setUndoStack(s => [...s, [id]].slice(-3))
    await refreshEntries(session.id)
  }, [session, tracking, noteText, capturePosition, refreshEntries])

  const logPhoto = useCallback(async (file: File) => {
    if (!session || !tracking) return
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
        noteText:  caption || undefined,
        photoId:   crypto.randomUUID(),
        photoData,
      })
      setNoteText('')
      setUndoStack(s => [...s, [id]].slice(-3))
      await refreshEntries(session.id)
    } catch (e) {
      setSendError(e instanceof Error ? `Photo capture failed: ${e.message}` : 'Photo capture failed')
    } finally {
      setCapturingPhoto(false)
    }
  }, [session, tracking, noteText, capturePosition, refreshEntries])

  const logViolation = useCallback(async () => {
    if (!session || !tracking || !violationType) return
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
    setUndoStack(s => [...s, [id]].slice(-3))
    await refreshEntries(session.id)
  }, [session, tracking, violationType, violationNote, capturePosition, refreshEntries])

  const handleUndo = useCallback(async () => {
    if (!session || undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    for (const id of last) await deleteEntry(id)
    setUndoStack(s => s.slice(0, -1))
    await refreshEntries(session.id)
  }, [session, undoStack, refreshEntries])

  // Upload any not-yet-uploaded photos individually so the report POST stays
  // small (many base64 photos in one request overflow PHP's post_max_size).
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

  // Enriched report payload shared by send + queue paths. Takes the trackers
  // explicitly so it can use the just-ended tracker before React state settles.
  const buildReportPayload = useCallback((srcEntries: LogEntry[], srcTrackers: Tracker[]) => {
    // 'other' profile has no trail context — drop the trail so neither the
    // emailed report nor the saved map show trail data.
    const sessionWksiteId = loggerProfile === 'other' ? undefined : session?.wksiteId
    return {
      profile:   loggerProfile,
      wksiteId:  sessionWksiteId ?? null,
      trailName: sessionWksiteId != null ? (trailNames[sessionWksiteId] ?? null) : null,
      entries:   enrichEntriesWithTrailheadDist(srcEntries, sessionWksiteId),
      trackers:  srcTrackers.map(t => ({
        name:             t.name || 'Patrol',
        state:            t.state,
        totalDistanceM:   trackerDistanceM(t),
        activeDurationMs: t.activeDurationMs,
        startedAt:        t.startedAt,
        segments:         t.segments.map(s => ({
          startAt:    s.startAt,
          endAt:      s.endAt,
          distanceM:  s.distanceM,
          startPoint: s.startPoint ?? null,
          endPoint:   s.endPoint ?? null,
          // Red breadcrumb: the thinned GPS path, carried to the saved map.
          crumbs:     (s.crumbs ?? []).map(c => ({ lat: c.lat, lng: c.lng, ts: c.ts })),
        })),
      })),
    }
  }, [session, loggerProfile])

  // Close out the current log and open a fresh, empty one. Changing the session
  // id makes the tracker hook reset automatically.
  const startFreshSession = useCallback(async () => {
    const newKey = new Date().toISOString().slice(0, 19)
    const fresh  = await getOrCreateSession(newKey)
    setSession(fresh)
    setEntries([])
    setSendError(null)
    setUndoStack([])
    return fresh
  }, [])

  const sendReport = useCallback(async (srcTrackers: Tracker[]): Promise<boolean> => {
    if (!session || !user) return false
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
          ...buildReportPayload(freshEntries, srcTrackers),
        }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string; logId?: string; email?: string }
      if (!res.ok || !data.success) {
        const msg = data.error ?? `HTTP ${res.status}`
        throw new Error(data.logId ? `${msg} (map saved: /trail-log/${data.logId})` : msg)
      }
      await markSessionEmailed(session.id)
      return true
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send report')
      return false
    }
  }, [session, user, includeLocations, buildReportPayload, uploadPendingPhotos])

  // ── Offline email send queue ──────────────────────────────────────

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

  const queueReport = useCallback(async (srcTrackers: Tracker[]): Promise<boolean> => {
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
        ...(isAuthenticated && token ? { token, memberName: user?.name } : {}),
        payload:  buildReportPayload(fresh, srcTrackers),
        summary: {
          hikers:     fresh.filter(e => e.type === 'hiker').length,
          dogs:       fresh.filter(e => e.type === 'dog').length,
          trees:      fresh.filter(e => e.type === 'tree').length,
          photos:     fresh.filter(e => e.type === 'photo').length,
          notes:      fresh.filter(e => e.type === 'note').length,
          violations: fresh.filter(e => e.type === 'violation').length,
        },
        status: 'queued',
      }
      await enqueueSend(item)
      await markSessionEmailed(session.id)
      await refreshQueue()
      return true
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not queue report')
      return false
    }
  }, [session, includeLocations, isAuthenticated, user, buildReportPayload, refreshQueue])

  const processQueue = useCallback(async () => {
    if (processingQueueRef.current || !navigator.onLine) return
    processingQueueRef.current = true
    try {
      const items = await getSendQueue()
      let sentOne = false
      for (const item of items) {
        if (item.id == null || item.status === 'sent') continue
        if (sentOne) await new Promise(r => setTimeout(r, 1100))
        sentOne = true
        await updateQueuedSend({ ...item, status: 'sending', error: undefined })
        setSendQueue(await getSendQueue())
        try {
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
            await updateQueuedSend({ ...item, status: 'sending' })
          }
          const body = { token: item.token, memberName: item.memberName, sessionId: item.sessionId, reportDate: item.reportDate, emailFormat: 'text', appVersion: item.appVersion, includeLocations: item.includeLocations, ...item.payload }
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
      setSendQueue(await loadQueue())
    }
  }, [loadQueue])

  const handleRemoveQueued = useCallback(async (id: number) => {
    await deleteQueuedSend(id)
    await refreshQueue()
  }, [refreshQueue])

  // Load the queue on mount; flush it whenever we're (re)connected.
  useEffect(() => { void refreshQueue() }, [refreshQueue])
  useEffect(() => { if (isOnline) void processQueue() }, [isOnline, processQueue])

  // ── Start / Stop / Trail switch ───────────────────────────────────

  const handleStartClick = useCallback(() => {
    if (tracking) { setConfirmRestart(true); return }
    setSavedNote(null)
    void start()
  }, [tracking, start])

  const handleRestart = useCallback(async () => {
    if (!session) return
    setBusy(true)
    try {
      await clear()
      await clearSessionEntries(session.id)
      setEntries([])
      setUndoStack([])
      setSavedNote(null)
      await start()
    } finally {
      setBusy(false)
      setConfirmRestart(false)
    }
  }, [session, clear, start])

  const handleStopAndSend = useCallback(async () => {
    if (!session) return
    setBusy(true)
    try {
      const ended = await stop()
      const endedTrackers = ended ? [ended] : trackers
      const online = navigator.onLine
      const ok = online ? await sendReport(endedTrackers) : await queueReport(endedTrackers)
      if (!ok) return   // keep everything so the user can retry; error is shown
      // Freeze the sent session so its map stays viewable after the reset below.
      const snapEntries = await getSessionEntries(session.id)
      setSentSnapshot({
        entries:   snapEntries,
        trackers:  endedTrackers,
        wksiteId:  session.wksiteId,
        reportDate: session.id.slice(0, 10),
      })
      setSavedNote({ at: Date.now(), queued: !online })
      await clear()
      await startFreshSession()
      setConfirmStop(false)
    } finally {
      setBusy(false)
    }
  }, [session, stop, trackers, sendReport, queueReport, clear, startFreshSession])

  const handleTrailSelect = useCallback((nextWksiteId: number | null) => {
    const current = session?.wksiteId ?? null
    if (nextWksiteId === current || !session) return
    if (!tracking) {
      // Not tracking yet — just set the trail, no section boundary.
      void updateSessionWksite(session.id, nextWksiteId)
      setSession(prev => prev ? { ...prev, wksiteId: nextWksiteId ?? undefined } : prev)
      return
    }
    setPendingWksite(nextWksiteId)
  }, [session, tracking])

  const confirmTrailSwitch = useCallback(async () => {
    if (pendingWksite === undefined || !session) return
    const next = pendingWksite
    setBusy(true)
    try {
      await updateSessionWksite(session.id, next)
      setSession(prev => prev ? { ...prev, wksiteId: next ?? undefined } : prev)
      // Record a trail-change event so the single report delineates each trail
      // as its own section (totals reset, prior trail kept as a section).
      const pos = await getPosition()
      await addEntry({
        sessionId: session.id,
        timestamp: Date.now(),
        lat:       pos?.lat ?? null,
        lng:       pos?.lng ?? null,
        type:      'trail',
        wksiteId:  next,
        trailName: next != null ? trailNames[next] : undefined,
      })
      await refreshEntries(session.id)
      setPendingWksite(undefined)
    } finally {
      setBusy(false)
    }
  }, [pendingWksite, session, refreshEntries])

  // ── Per-trail section totals ──────────────────────────────────────
  // The counter cards show the current trail's section (resets on each trail
  // change); a small "All trails" line keeps the running total across sections.
  const trailEventCount = useMemo(
    () => entries.reduce((n, e) => n + (e.type === 'trail' ? 1 : 0), 0),
    [entries],
  )
  const lastTrailEventTs = useMemo(() => {
    let ts = -Infinity
    for (const e of entries) if (e.type === 'trail' && e.timestamp > ts) ts = e.timestamp
    return ts
  }, [entries])
  const multiTrail = trailEventCount >= 1
  const currentEntries = useMemo(
    () => (multiTrail ? entries.filter(e => e.timestamp >= lastTrailEventTs) : entries),
    [entries, multiTrail, lastTrailEventTs],
  )

  const hikerCounts = useMemo(() => tallyHikers(currentEntries), [currentEntries])
  const dogCounts   = useMemo(() => tallyDogs(currentEntries),   [currentEntries])
  const treeCounts  = useMemo(() => tallyTrees(currentEntries),  [currentEntries])

  const grandHikerCounts = useMemo(() => tallyHikers(entries), [entries])
  const grandDogCounts   = useMemo(() => tallyDogs(entries),   [entries])
  const grandTreeCounts  = useMemo(() => tallyTrees(entries),  [entries])

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

  const hikerTotal = HIKER_ACTIVITIES.reduce((sum, a) => sum + hikerCounts[a.key].seen, 0)
  const hikerBreakdown = (() => {
    const used = HIKER_ACTIVITIES.filter(a => hikerCounts[a.key].seen > 0 || hikerCounts[a.key].contacted > 0)
    if (used.length > 4) return HIKER_ACTIVITIES
    const padPriority: HikerActivity[] = ['hike', 'bpack', 'hunt', 'fish', 'bike', 'stock']
    const chosen = new Set(used.map(a => a.key))
    for (const k of padPriority) { if (chosen.size >= 4) break; chosen.add(k) }
    return HIKER_ACTIVITIES.filter(a => chosen.has(a.key))
  })()
  const treeTotal  = TREE_SIZES.reduce(
    (sum, s) => sum + treeCounts.cleared[s.key] + treeCounts.noted[s.key], 0
  )
  const dogTotal   = dogCounts.onLeash + dogCounts.offLeash
  const grandHikerTotal = hikerSeenTotal(grandHikerCounts)
  const grandDogTotal   = grandDogCounts.onLeash + grandDogCounts.offLeash
  const grandTreeTotalN = treeGrandTotal(grandTreeCounts)

  const reportEmail = user?.email?.trim() ?? ''
  const hasSession = !!session
  const gated = !tracking  // counters locked until tracking starts

  // Styling helpers for the gated counter sections
  const lockedCls = gated ? 'opacity-40 pointer-events-none select-none' : ''

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
          {undoStack.length > 0 && tracking && (
            <button
              type="button"
              onClick={() => void handleUndo()}
              title={`Undo last entry (${undoStack.length} available)`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
            >
              <Undo2 className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
              Undo
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" title={
            gpsStatus === 'ok' ? 'GPS available (high accuracy)'
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

      {/* ── START / STOP / MAP ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={handleStartClick}
          disabled={!hasSession || busy}
          className={`py-3 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40 ${
            tracking ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-emerald-600 hover:bg-emerald-500'
          }`}
        >
          {tracking ? '● Tracking' : 'Start Tracking'}
        </button>
        <button
          onClick={() => setConfirmStop(true)}
          disabled={!tracking || busy}
          className="py-3 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-40"
        >
          Stop & Send
        </button>
        <button
          onClick={() => setShowMap(true)}
          disabled={!hasSession}
          className="py-3 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40"
        >
          Show Map
        </button>
      </div>

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
            <option value="">— Non-PWV or Off Trail —</option>
            {(Object.entries(trailNames) as [string, string][])
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))
            }
          </select>
        </div>
      </div>
      </>
      )}

      {/* ── LIVE TRACKING STATS ─────────────────────────── */}
      {tracking && (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              Tracking
            </span>
            {showMaintUI && session?.wksiteId != null && (
              <div className="flex items-center gap-1.5" title={
                stats.light === 'green' ? 'On the selected trail'
                : stats.light === 'red' ? 'Off the selected trail'
                : 'On-trail status unknown — waiting for GPS'
              }>
                <div className={`w-2 h-2 rounded-full transition-colors ${stats.light === 'green' ? 'bg-emerald-500' : stats.light === 'red' ? 'bg-red-500' : 'bg-stone-400'}`} />
                <span className="text-xs text-stone-500 dark:text-stone-400">On Trail</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Stat label="Elapsed time" value={fmtDuration(stats.elapsedMs)} />
            <Stat
              label={showMaintUI ? 'Distance traveled on trail' : 'Distance traveled'}
              value={fmtMiles(stats.distanceM)}
            />
            {showMaintUI && session?.wksiteId != null && (
              <Stat
                label="From trail head"
                value={stats.trailheadDistM != null
                  ? fmtMiles(stats.trailheadDistM) + (stats.trailheadCrow ? ' *' : '')
                  : '—'}
              />
            )}
            <Stat label="Average pace" value={stats.paceMinPerMi != null ? fmtPace(stats.paceMinPerMi) : '—'} />
          </div>
          {stats.trailheadCrow && stats.trailheadDistM != null && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              * Off the trail — straight-line distance from the trailhead.
            </p>
          )}
        </div>
      )}

      {/* ── "Now accumulating" banner ───────────────────── */}
      {tracking ? (
        <div className="text-xs font-semibold text-center text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
          {showMaintUI
            ? `Now accumulating ${trailName ? `${trailName} totals` : 'totals'}`
            : 'Now tracking — recording your route, distance & pace'}
        </div>
      ) : (
        <div className="text-xs text-center text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-2">
          Tap <span className="font-semibold text-emerald-600 dark:text-emerald-400">Start Tracking</span> to begin{showMaintUI ? ' logging — pick a trail first' : ''}.
        </div>
      )}

      {/* ── NOTES ───────────────────────────────────────── */}
      <div className={`bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3 ${lockedCls}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Notes &amp; Photos
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <MapPin className="w-3 h-3 shrink-0" strokeWidth={2.5} aria-hidden />
            Geotagged
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void logNote() }}
            placeholder="Geotagged observation…"
            disabled={gated}
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
              disabled={capturingPhoto || gated}
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
            disabled={!noteText.trim() || gated}
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

      {showMaintUI && (
      <>
      {/* ── PEOPLE COUNTER ──────────────────────────────── */}
      <div className={`bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3 ${lockedCls}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            People
          </span>
          <div className="flex flex-col items-end shrink-0 leading-tight">
            <span className="text-xs text-stone-400 dark:text-stone-500">
              Total: <strong className="text-stone-700 dark:text-stone-300">{hikerTotal}</strong>
            </span>
            {multiTrail && (
              <span className="text-[10px] text-stone-400 dark:text-stone-500">
                All trails: <strong className="text-stone-600 dark:text-stone-400">{grandHikerTotal}</strong>
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-6 gap-1">
          {HIKER_ACTIVITIES.map(({ key, label }) => {
            const active = key === hikerActivity
            return (
              <button
                key={key}
                type="button"
                onClick={() => setHikerActivity(key)}
                className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="flex items-stretch gap-2">
          <button
            onClick={() => void logHiker('seen')}
            className="flex-1 flex flex-col items-center py-3 bg-stone-50 dark:bg-stone-800/50 border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 active:scale-[0.98] transition-all select-none"
          >
            <span className="text-5xl font-bold tabular-nums text-stone-800 dark:text-stone-100">
              {hikerCounts[hikerActivity].seen}
            </span>
            <div className="mt-1 text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">Tap to log</div>
            <div className="text-sm font-medium capitalize text-stone-600 dark:text-stone-400">Seen</div>
          </button>

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

          <button
            onClick={() => void logHiker('contacted')}
            className="flex-1 flex flex-col items-center py-3 bg-stone-50 dark:bg-stone-800/50 border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 active:scale-[0.98] transition-all select-none"
          >
            <span className="text-5xl font-bold tabular-nums text-stone-800 dark:text-stone-100">
              {hikerCounts[hikerActivity].contacted}
            </span>
            <div className="mt-1 text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">Tap to log</div>
            <div className="text-sm font-medium capitalize text-stone-600 dark:text-stone-400">Contacted</div>
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {hikerBreakdown.map(({ key, label }) => {
            const c = hikerCounts[key]
            const active = key === hikerActivity
            return (
              <div
                key={key}
                className={`rounded-lg px-2.5 py-2 ${
                  active
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-300 dark:ring-emerald-700'
                    : 'bg-stone-50 dark:bg-stone-800/50'
                }`}
              >
                <div className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-0.5">{label}</div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    S: <strong className="text-stone-700 dark:text-stone-300">{c.seen}</strong>
                  </span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    C: <strong className="text-stone-700 dark:text-stone-300">{c.contacted}</strong>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── DOG COUNTER ─────────────────────────────────── */}
      <div className={`bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 space-y-2 ${lockedCls}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Dogs
          </span>
          <div className="flex flex-col items-end shrink-0 leading-tight">
            <span className="text-xs text-stone-400 dark:text-stone-500">
              Total: <strong className="text-stone-700 dark:text-stone-300">{dogTotal}</strong>
            </span>
            {multiTrail && (
              <span className="text-[10px] text-stone-400 dark:text-stone-500">
                All trails: <strong className="text-stone-600 dark:text-stone-400">{grandDogTotal}</strong>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-stretch gap-2">
          {([
            { key: 'onLeash',  label: 'On Leash'  },
            { key: 'offLeash', label: 'Off Leash' },
          ] as { key: DogSubtype; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => void logDog(key)}
              className="flex-1 flex items-center justify-center gap-2.5 py-2.5 bg-stone-50 dark:bg-stone-800/50 border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 active:scale-[0.98] transition-all select-none"
            >
              <span className="text-3xl font-bold tabular-nums text-stone-800 dark:text-stone-100 leading-none">
                {dogCounts[key]}
              </span>
              <span className="text-sm font-medium text-stone-600 dark:text-stone-400">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── TREE COUNTER ────────────────────────────────── */}
      <div className={`bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3 ${lockedCls}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Trees
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <ModeToggle
              options={['cleared', 'noted']}
              value={treeMode}
              onChange={v => setTreeMode(v as TreeSubtype)}
            />
            <div className="flex flex-col items-end leading-tight">
              <span className="text-xs text-stone-400 dark:text-stone-500">
                Total: <strong className="text-stone-700 dark:text-stone-300">{treeTotal}</strong>
              </span>
              {multiTrail && (
                <span className="text-[10px] text-stone-400 dark:text-stone-500">
                  All trails: <strong className="text-stone-600 dark:text-stone-400">{grandTreeTotalN}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

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
      <div className={`bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3 ${lockedCls}`}>
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
            disabled={gated}
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
            disabled={gated}
            className="flex-1 min-w-0 px-3 py-2 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-700 dark:text-stone-300 placeholder:text-stone-400 outline-none focus:border-emerald-400 transition-colors"
          />
          <button
            onClick={() => void logViolation()}
            disabled={violationType === '' || gated}
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

      {/* ── SEND STATUS / FOOTER ─────────────────────────── */}
      <div className="space-y-2 pb-2">
        {sendError && (
          <p className="text-xs text-red-500 text-center">{sendError}</p>
        )}
        {!reportEmail && (
          <p className="text-xs text-center text-amber-600 dark:text-amber-400">
            No email address on file — contact an admin to update your member record.
          </p>
        )}
        {reportEmail && !savedNote && (
          <p className="text-xs text-center text-stone-500 dark:text-stone-400">
            Stop &amp; Send will email the report to{' '}
            <span className="font-medium text-stone-700 dark:text-stone-300">{reportEmail}</span>
          </p>
        )}
        <label className="flex items-center justify-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeLocations}
            onChange={e => setIncludeLocations(e.target.checked)}
            className="w-4 h-4 rounded accent-emerald-600"
          />
          <span className="text-xs text-stone-600 dark:text-stone-400">Include GPS data in emailed report</span>
        </label>
        {savedNote && (
          <div className="flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
            <p className="text-xs text-emerald-700 dark:text-emerald-400 text-center">
              {savedNote.queued
                ? `Session saved at ${fmtTime(savedNote.at)} — will send to ${reportEmail} when connected.`
                : `Session sent to ${reportEmail} at ${fmtTime(savedNote.at)}.`}
            </p>
            {sentSnapshot && (
              <button
                onClick={() => setShowSentMap(true)}
                title="View the map for this sent session"
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
              >
                <MapPin className="w-3 h-3 shrink-0" strokeWidth={2.5} aria-hidden />
                Map
              </button>
            )}
          </div>
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

      {/* ── SETTINGS LINK ───────────────────────────────── */}
      <div className="pb-6 flex items-center justify-center">
        <Link
          to="/settings"
          className="text-xs text-stone-400 dark:text-stone-500 hover:text-emerald-600 dark:hover:text-emerald-400 underline underline-offset-2 transition-colors"
        >
          Data Logger Settings
        </Link>
      </div>

    </div>

    {showMap && session && (
      <MapModal
        entries={entries}
        trackers={trackers}
        memberName={user?.name ?? ''}
        reportDate={session.id.slice(0, 10)}
        trailheadCoords={trailheadCoords ?? undefined}
        wksiteId={showMaintUI ? session.wksiteId : undefined}
        onClose={() => setShowMap(false)}
      />
    )}

    {showSentMap && sentSnapshot && (
      <MapModal
        entries={sentSnapshot.entries}
        trackers={sentSnapshot.trackers}
        memberName={user?.name ?? ''}
        reportDate={sentSnapshot.reportDate}
        trailheadCoords={sentSnapshot.wksiteId != null ? (trailGeoData[sentSnapshot.wksiteId] ?? undefined) : undefined}
        wksiteId={showMaintUI ? sentSnapshot.wksiteId : undefined}
        onClose={() => setShowSentMap(false)}
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

    {/* Restart confirmation */}
    {confirmRestart && (
      <ConfirmModal
        title="Already tracking"
        body="Clear the current session's data and restart tracking from zero? This can't be undone."
        confirmLabel={busy ? 'Working…' : 'Clear & Restart'}
        confirmTone="red"
        busy={busy}
        onConfirm={() => void handleRestart()}
        onCancel={() => setConfirmRestart(false)}
      />
    )}

    {/* Stop & Send confirmation */}
    {confirmStop && (
      <ConfirmModal
        title="Stop, save & send report?"
        body={
          <>
            Stop tracking, save the report, and reset the logger.{' '}
            {isOnline
              ? <>The report will be sent to <span className="font-semibold">{reportEmail || 'your email'}</span> now.</>
              : <>You're offline — the report will be saved and sent to <span className="font-semibold">{reportEmail || 'your email'}</span> when you reconnect.</>}
          </>
        }
        confirmLabel={busy ? 'Working…' : isOnline ? 'Stop & Send' : 'Stop & Save'}
        confirmTone="red"
        busy={busy}
        onConfirm={() => void handleStopAndSend()}
        onCancel={() => setConfirmStop(false)}
      />
    )}

    {/* Trail-switch confirmation (while tracking) */}
    {pendingWksite !== undefined && session?.wksiteId != null && (
      <ConfirmModal
        title={`Switch to ${pendingWksite != null ? trailNames[pendingWksite] : 'off trail'}?`}
        body={
          <>
            Saving your <span className="font-semibold">{trailNames[session.wksiteId]}</span> totals as a section of this report.
            The live counters reset for the new trail; everything stays in one continuous report.
          </>
        }
        confirmLabel={busy ? 'Working…' : 'Save & Switch'}
        confirmTone="emerald"
        busy={busy}
        onConfirm={() => void confirmTrailSwitch()}
        onCancel={() => setPendingWksite(undefined)}
      />
    )}
    </>
  )
}

// ── Small stat readout ─────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</div>
      <div className="text-lg font-bold tabular-nums text-stone-800 dark:text-stone-100">{value}</div>
    </div>
  )
}

// ── Generic confirmation dialog ────────────────────────────────
function ConfirmModal({
  title, body, confirmLabel, confirmTone, busy, onConfirm, onCancel,
}: {
  title:        string
  body:         React.ReactNode
  confirmLabel: string
  confirmTone:  'red' | 'emerald'
  busy:         boolean
  onConfirm:    () => void
  onCancel:     () => void
}) {
  const confirmCls = confirmTone === 'red'
    ? 'bg-red-600 hover:bg-red-500 border-red-600'
    : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-600'
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-2">{title}</h3>
          <p className="text-sm text-stone-600 dark:text-stone-400">{body}</p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg text-white border disabled:opacity-50 shadow-sm transition-colors ${confirmCls}`}
          >
            {confirmLabel}
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

          <TipSection title="How it works">
            <Tip>
              <strong>Pick your trail, then tap Start Tracking</strong> — the big green button starts the patrol: it records your start time, your GPS track (the red trail on the map), and your time, distance and average pace. Until you start, the counters stay locked.
            </Tip>
            <Tip>
              <strong>Tap counts as you go</strong> — People, Dogs, Trees, Violations and Notes/Photos all accumulate under the current trail. The red breadcrumb records your actual path automatically.
            </Tip>
            <Tip>
              <strong>Distance traveled on trail</strong> counts your movement along the trail in either direction — up the trail and back both add to it. <strong>From trail head</strong> shows how far along the trail you are (a <strong>*</strong> means you're off the trail and it's a straight-line distance).
            </Tip>
            <Tip>
              <strong>Change trails mid-patrol</strong> — pick a new trail from the dropdown and confirm. Your totals for the trail you're leaving are saved as a section; the counters reset for the new trail. It all stays in one continuous report.
            </Tip>
            <Tip>
              <strong>Tap Stop &amp; Send when you're done</strong> — it saves and emails the full report (with the map), then resets the logger for your next patrol. Offline, it's saved and sent automatically when you reconnect.
            </Tip>
          </TipSection>

          <TipSection title="Working offline">
            <Tip>
              <strong>Open the app once while online first</strong> — that lets it cache itself so it still opens with no signal. Confirm before a trip by switching to airplane mode and reopening it. The trail list works offline; only the background map tiles need a connection.
            </Tip>
            <Tip>
              <strong>GPS works with no cell service</strong> — location comes from satellites, so your track, coordinates and trailhead distances all record normally out of range. The report map just fills in later when you're back online.
            </Tip>
            <Tip>
              <strong>Watch the "reports saved on this phone" banner</strong> — while it's showing, unsent reports are held only on your device. <strong>Don't clear browser data or delete the app until it's gone</strong> and the emails have arrived. When you get back in range, open the app and keep it in front so the queue finishes sending.
            </Tip>
          </TipSection>

          <TipSection title="iPhone / iPad (iOS)">
            <Tip>
              <strong>Install to Home Screen</strong> — In Safari, tap the Share button then "Add to Home Screen." The installed app gets slightly better background behavior and a persistent icon.
            </Tip>
            <Tip>
              <strong>Allow location access</strong> — When prompted, choose "Allow While Using App." For the installed Home Screen version, go to <em>Settings → Privacy & Security → Location Services</em> and set it to "While Using."
            </Tip>
            <Tip>
              <strong>Keep the screen on</strong> — iOS aggressively suspends web apps when the screen locks, which pauses GPS. Enable "Keep screen awake while tracking" in Settings, and avoid switching away from the app during a patrol.
            </Tip>
          </TipSection>

          <TipSection title="Android">
            <Tip>
              <strong>Install the app</strong> — In Chrome, tap the menu (⋮) and choose "Add to Home screen" or "Install app." Installed PWAs are less likely to be suspended.
            </Tip>
            <Tip>
              <strong>Disable battery optimization for Chrome / the app</strong> — Go to <em>Settings → Apps → (Chrome or the app) → Battery</em> and set it to <strong>Unrestricted</strong>. This tells Android not to throttle the browser in the background.
            </Tip>
            <Tip>
              <strong>Keep the screen on</strong> — Enable "Keep screen awake while tracking" in Settings, and avoid Power Saving / Battery Saver modes during a patrol.
            </Tip>
          </TipSection>

          <TipSection title="GPS Indicator">
            <li className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span><strong>GPS</strong> — location is available at high accuracy; entries record your position.</span>
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
              The light appears while tracking once you've selected a trail, and updates live from your GPS. Set how far off-trail still counts as "on trail" under <em>Settings → Data Logger → On-trail distance</em> (default 200 ft).
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
