import { Undo2, ArrowLeft, Camera } from 'lucide-react'
import { useState, useEffect, useMemo, useCallback } from 'react'
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
  getSessionEntries,
  getSessionTrackers,
  markSessionEmailed,
  clearSessionEntries,
  clearSessionTrackers,
  resetSession,
} from '../services/dataLoggerService'
import { getStoredAuthToken } from '../services/authService'
import { trailGeoData, trailNames } from '../data/trailGeoData'
import { updateSessionWksite } from '../services/dataLoggerService'
import type { LogEntry, LogSession, HikerSubtype, TreeSubtype, TreeSize, EntryType, Tracker } from '../types/dataLogger'
import { trackerDistanceM } from '../lib/gpsDistance'
import { distFromTrailheadM } from '../lib/trailheadDistance'
import { getLoggerSettings } from '../lib/loggerSettings'
import { fileToCompressedDataUrl } from '../lib/photo'

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

function fmtCoords(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return 'GPS unavailable'
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}°${ns} ${Math.abs(lng).toFixed(4)}°${ew}`
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

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
  const [gpsStatus,     setGpsStatus]     = useState<'ok' | 'denied' | 'unavailable'>('ok')
  const [loading,           setLoading]           = useState(true)
  const [confirmClear,      setConfirmClear]      = useState(false)
  const [trackerResetKey,     setTrackerResetKey]     = useState(0)
  const [recoveryCandidate,   setRecoveryCandidate]   = useState<RecoveryCandidate | null>(null)
  const [showGuestEmailForm,  setShowGuestEmailForm]  = useState(false)
  const [guestEmail,          setGuestEmail]          = useState('')

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

  // Enriched report payload shared by member + guest send paths:
  // per-entry distance from trailhead and trail metadata.
  const buildReportPayload = useCallback(() => {
    // 'other' profile has no trail context — drop the trail so neither the
    // emailed report nor the saved map show trail data.
    const sessionWksiteId = loggerProfile === 'other' ? undefined : session?.wksiteId
    const trailEvents = entries
      .filter(e => e.type === 'trail')
      .sort((a, b) => a.timestamp - b.timestamp)
    return {
      profile:   loggerProfile,
      wksiteId:  sessionWksiteId ?? null,
      trailName: sessionWksiteId != null ? (trailNames[sessionWksiteId] ?? null) : null,
      entries:   enrichEntriesWithTrailheadDist(entries, sessionWksiteId),
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
  }, [entries, trackers, session, loggerProfile])

  const handleSendReport = useCallback(async () => {
    if (!session || !user) return
    setSending(true)
    setSendError(null)
    try {
      const token = getStoredAuthToken()
      if (!token) throw new Error('Not authenticated')
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
          ...buildReportPayload(),
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
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send report')
    } finally {
      setSending(false)
    }
  }, [session, user, includeLocations, buildReportPayload])

  const handleGuestSendReport = useCallback(async () => {
    if (!session || !guestEmail) return
    setSending(true)
    setSendError(null)
    try {
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
          ...buildReportPayload(),
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
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send report')
    } finally {
      setSending(false)
    }
  }, [session, guestEmail, includeLocations, buildReportPayload])

  const handleNewSession = useCallback(async () => {
    const newKey = new Date().toISOString().slice(0, 16)
    const s = await getOrCreateSession(newKey)
    setSession(s)
    setEntries([])
    setTrackers([])
    setSentOk(false)
    setSendError(null)
    setLastAction(null)
    setTrackerResetKey(k => k + 1)
  }, [])

  const handleClearData = useCallback(async () => {
    if (!session) return
    await clearSessionEntries(session.id)
    await clearSessionTrackers(session.id)
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
            onChange={e => void handleWksiteChange(e.target.value ? parseInt(e.target.value, 10) : null)}
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
        </div>
      </div>

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
        {photoEntries.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photoEntries.map(e => {
              const src = e.photoData ?? e.photoUrl
              if (!src) return null
              return (
                <button
                  key={e.id}
                  onClick={() => setViewPhoto(src)}
                  title={e.noteText || 'Photo'}
                  className="w-16 h-16 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-700 hover:border-emerald-400 transition-colors"
                >
                  <img src={src} alt={e.noteText || 'Photo'} className="w-full h-full object-cover" />
                </button>
              )
            })}
          </div>
        )}
        {noteEntries.length > 0 && (
          <div className="space-y-1.5">
            {(showAllNotes ? noteEntries : noteEntries.slice(0, 1)).map(e => (
              <div
                key={e.id}
                className="text-xs text-stone-700 dark:text-stone-300 bg-stone-50 dark:bg-stone-800/50 rounded-lg px-3 py-2"
              >
                <div>{e.noteText}</div>
                <div className="text-stone-400 dark:text-stone-500 mt-0.5">
                  {fmtTime(e.timestamp)} · {fmtCoords(e.lat, e.lng)}
                </div>
              </div>
            ))}
            {noteEntries.length > 1 && (
              <button
                onClick={() => setShowAllNotes(p => !p)}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 underline underline-offset-2 transition-colors"
              >
                {showAllNotes ? 'Show less' : `Show all ${noteEntries.length} notes`}
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
              <p className="text-xs text-stone-400 dark:text-stone-500 text-center">Connect to network to send report</p>
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
    </>
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg max-h-[85dvh] bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl border border-stone-200 dark:border-stone-800 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Usage Tips</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors text-lg leading-none px-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-4 py-4 space-y-5">

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
