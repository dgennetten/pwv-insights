import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { MemberGate } from '../components/MemberGate'
import { DistanceTracker } from '../components/data-logger/DistanceTracker'
import {
  getOrCreateSession,
  addEntry,
  getSessionEntries,
  markSessionEmailed,
  clearSessionEntries,
  clearSessionTrackers,
  resetSession,
} from '../services/dataLoggerService'
import { getStoredAuthToken } from '../services/authService'
import type { LogEntry, LogSession, HikerSubtype, TreeSubtype, TreeSize, Tracker } from '../types/dataLogger'

const TREE_SIZES: { key: TreeSize; label: string; range: string }[] = [
  { key: 'small',  label: 'Small',  range: '< 8"'   },
  { key: 'medium', label: 'Medium', range: '8–15"'  },
  { key: 'large',  label: 'Large',  range: '16–23"' },
  { key: 'xl',     label: 'XL',     range: '24–36"' },
]

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
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
  const navigate  = useNavigate()
  const isAuthenticated = !!user?.personId

  const [isOnline,      setIsOnline]      = useState(navigator.onLine)
  const [session,       setSession]       = useState<LogSession | null>(null)
  const [entries,       setEntries]       = useState<LogEntry[]>([])
  const [treeMode,      setTreeMode]      = useState<TreeSubtype>('cleared')
  const [noteText,      setNoteText]      = useState('')
  const [sending,          setSending]          = useState(false)
  const [sentOk,           setSentOk]           = useState(false)
  const [sendError,        setSendError]        = useState<string | null>(null)
  const [includeLocations, setIncludeLocations] = useState(true)
  const [trackers,         setTrackers]         = useState<Tracker[]>([])
  const [gpsStatus,     setGpsStatus]     = useState<'ok' | 'denied' | 'unavailable'>('ok')
  const [loading,       setLoading]       = useState(true)
  const [confirmClear,  setConfirmClear]  = useState(false)
  const [trackerResetKey, setTrackerResetKey] = useState(0)

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
    })()
  }, [isAuthenticated])

  const refreshEntries = useCallback(async (sessionId: string) => {
    setEntries(await getSessionEntries(sessionId))
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
    await addEntry({ ...base, hikerSubtype: subtype })
    if (subtype === 'contacted') {
      await addEntry({ ...base, hikerSubtype: 'seen' })
    }
    await refreshEntries(session.id)
  }, [session, capturePosition, refreshEntries])

  const logTree = useCallback(async (size: TreeSize) => {
    if (!session) return
    const pos = await capturePosition()
    await addEntry({
      sessionId:   session.id,
      timestamp:   Date.now(),
      lat:         pos?.lat ?? null,
      lng:         pos?.lng ?? null,
      type:        'tree',
      treeSubtype: treeMode,
      treeSize:    size,
    })
    await refreshEntries(session.id)
  }, [session, treeMode, capturePosition, refreshEntries])

  const logNote = useCallback(async () => {
    if (!session || !noteText.trim()) return
    const pos = await capturePosition()
    await addEntry({
      sessionId: session.id,
      timestamp: Date.now(),
      lat:       pos?.lat ?? null,
      lng:       pos?.lng ?? null,
      type:      'note',
      noteText:  noteText.trim(),
    })
    setNoteText('')
    await refreshEntries(session.id)
  }, [session, noteText, capturePosition, refreshEntries])

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
          entries,
          includeLocations,
          trackers:         trackers.map(t => ({
            name:            t.name || 'Unnamed',
            state:           t.state,
            totalDistanceM:  t.totalDistanceM,
            activeDurationMs: t.activeDurationMs,
            startedAt:       t.startedAt,
            segments:        t.segments.map(s => ({
              startAt:    s.startAt,
              endAt:      s.endAt,
              distanceM:  s.distanceM,
              startPoint: s.startPoint ?? null,
              endPoint:   s.endPoint ?? null,
              waypoints:  s.waypoints ?? [],
            })),
          })),
        }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`)
      await markSessionEmailed(session.id)
      setSession(prev => (prev ? { ...prev, emailedAt: Date.now() } : prev))
      setSentOk(true)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send report')
    } finally {
      setSending(false)
    }
  }, [session, user, entries, trackers, includeLocations])

  const handleNewSession = useCallback(async () => {
    const newKey = new Date().toISOString().slice(0, 16)
    const s = await getOrCreateSession(newKey)
    setSession(s)
    setEntries([])
    setTrackers([])
    setSentOk(false)
    setSendError(null)
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

  // Auth gate
  if (!isAuthenticated) {
    return (
      <MemberGate onBack={() => navigate(-1)}>
        <div className="min-h-[60vh] bg-stone-50 dark:bg-stone-950" />
      </MemberGate>
    )
  }

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
  const hasData = hikerTotal > 0 || treeTotal > 0 || noteEntries.length > 0 || trackers.length > 0

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-stone-900 dark:text-stone-100">Data Logger</h1>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full transition-colors ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

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

        <div className="grid grid-cols-2 gap-2">
          {(['seen', 'contacted'] as HikerSubtype[]).map(subtype => (
            <button
              key={subtype}
              onClick={() => void logHiker(subtype)}
              className="flex flex-col items-center py-5 bg-stone-50 dark:bg-stone-800/50 border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 active:scale-[0.98] transition-all select-none"
            >
              <span className="text-5xl font-bold tabular-nums text-stone-800 dark:text-stone-100">
                {hikerCounts[subtype]}
              </span>
              <div className="mt-1 text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">Tap to log</div>
              <div className="text-sm font-medium capitalize text-stone-600 dark:text-stone-400">{subtype}</div>
            </button>
          ))}
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

      {/* ── DISTANCE TRACKER ────────────────────────────── */}
      <DistanceTracker
        key={trackerResetKey}
        sessionId={session?.id ?? null}
        onTrackersChange={setTrackers}
      />

      {/* ── NOTES ───────────────────────────────────────── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Notes
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void logNote() }}
            placeholder="Observation…"
            className="flex-1 px-3 py-2 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-700 dark:text-stone-300 placeholder:text-stone-400 outline-none focus:border-emerald-400 transition-colors"
          />
          <button
            onClick={() => void logNote()}
            disabled={!noteText.trim()}
            className="px-3 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-stone-700 dark:hover:bg-stone-200 transition-colors"
          >
            Add
          </button>
        </div>

        {noteEntries.length > 0 && (
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {noteEntries.map(e => (
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
          </div>
        )}
      </div>

      {/* ── EMAIL REPORT ────────────────────────────────── */}
      <div className="space-y-2 pb-2">
        {sendError && (
          <p className="text-xs text-red-500 text-center">{sendError}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleSendReport()}
            disabled={!isOnline || sending || !hasData || sentOk}
            className="flex-1 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? 'Sending…' : sentOk ? 'Report Sent ✓' : 'Email Report'}
          </button>
          <label className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeLocations}
              onChange={e => setIncludeLocations(e.target.checked)}
              className="w-4 h-4 rounded accent-emerald-600"
            />
            <span className="text-xs text-stone-600 dark:text-stone-400 whitespace-nowrap">Include GPS data</span>
          </label>
        </div>
        {!isOnline && (
          <p className="text-xs text-stone-400 dark:text-stone-500 text-center">Connect to network to send report</p>
        )}
        {isOnline && !hasData && !sentOk && (
          <p className="text-xs text-stone-400 dark:text-stone-500 text-center">Log some data first</p>
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
          <button
            onClick={() => setConfirmClear(true)}
            className="text-xs text-stone-400 dark:text-stone-500 hover:text-red-500 dark:hover:text-red-400 underline underline-offset-2 transition-colors"
          >
            Clear all data
          </button>
        )}
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
              ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
              : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
