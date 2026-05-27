import { useEffect, useMemo, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { getSessionEntries, getSessionTrackers } from '../services/dataLoggerService'
import { useAuth } from '../contexts/AuthContext'
import { getStoredTheme, applyTheme } from '../lib/theme'

// ── Types ─────────────────────────────────────────────────────────

interface LogEntry {
  id?: number
  sessionId?: string
  timestamp: number
  lat: number | null
  lng: number | null
  type: 'hiker' | 'tree' | 'note'
  hikerSubtype?: 'seen' | 'contacted'
  treeSubtype?: 'cleared' | 'noted'
  treeSize?: 'small' | 'medium' | 'large' | 'xl'
  noteText?: string
}

interface TrackerSegment {
  startAt: number
  endAt?: number
  distanceM: number
  startPoint?: { lat: number; lng: number; ts: number }
  endPoint?: { lat: number; lng: number; ts: number }
  waypoints?: Array<{
    lat: number | null
    lng: number | null
    ts: number
    segmentDistanceM: number
    name?: string
  }>
}

interface SavedTracker {
  name: string
  state: string
  totalDistanceM: number
  activeDurationMs: number
  startedAt: number
  segments: TrackerSegment[]
}

interface TrailLog {
  logId?: string
  member: string
  reportDate: string
  savedAt?: string
  summary: {
    hikers: { seen: number; contacted: number; total: number }
    trees: {
      cleared: { small: number; medium: number; large: number; xl: number }
      noted:   { small: number; medium: number; large: number; xl: number }
    }
  }
  trackers: SavedTracker[]
  entries: LogEntry[]
}

// ── Helpers ───────────────────────────────────────────────────────

const SIZE_LABELS: Record<string, string> = {
  small:  'Small (<8")',
  medium: 'Medium (8–15")',
  large:  'Large (16–23")',
  xl:     'XL (24–36")',
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtPace(distM: number, durationMs: number): string {
  if (distM <= 0) return '—'
  const minPerMile = (durationMs / 1000 / 60) / (distM / 1609.344)
  const m = Math.floor(minPerMile)
  const s = Math.round((minPerMile - m) * 60)
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')} min/mi`
}

function buildSummaryFromEntries(entries: LogEntry[]) {
  let hikerSeen = 0, hikerContacted = 0
  const trees = {
    cleared: { small: 0, medium: 0, large: 0, xl: 0 },
    noted:   { small: 0, medium: 0, large: 0, xl: 0 },
  }
  for (const e of entries) {
    if (e.type === 'hiker') {
      if (e.hikerSubtype === 'seen') hikerSeen++
      else if (e.hikerSubtype === 'contacted') hikerContacted++
    } else if (e.type === 'tree' && e.treeSubtype && e.treeSize) {
      trees[e.treeSubtype][e.treeSize]++
    }
  }
  return {
    hikers: { seen: hikerSeen, contacted: hikerContacted, total: hikerSeen },
    trees,
  }
}

// ── Map helpers ───────────────────────────────────────────────────

function MapFocusController({ center }: { center: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.flyTo(center, 16, { animate: true, duration: 0.6 })
  }, [map, center])
  return null
}

function MapBoundsController({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 15)
    } else {
      map.fitBounds(points, { padding: [40, 40] })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// ── Timeline entry ────────────────────────────────────────────────

function TimelineEntry({
  entry,
  selected,
  onClick,
}: {
  entry: LogEntry
  selected: boolean
  onClick: () => void
}) {
  const isTree  = entry.type === 'tree'
  const isHiker = entry.type === 'hiker'
  const hasGps  = entry.lat !== null && entry.lng !== null

  const badge = isTree ? 'TREE' : isHiker ? 'HIKER' : 'NOTE'
  const badgeClass = isTree
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    : isHiker
    ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
    : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'

  const label = isTree
    ? `Tree — ${entry.treeSubtype ? entry.treeSubtype.charAt(0).toUpperCase() + entry.treeSubtype.slice(1) : ''}, ${SIZE_LABELS[entry.treeSize ?? ''] ?? entry.treeSize}`
    : isHiker
    ? `Hiker — ${entry.hikerSubtype ? entry.hikerSubtype.charAt(0).toUpperCase() + entry.hikerSubtype.slice(1) : ''}`
    : (entry.noteText ?? '')

  return (
    <div
      onClick={hasGps ? onClick : undefined}
      className={`flex items-start gap-2.5 px-4 py-2.5 transition-colors ${
        hasGps ? 'cursor-pointer' : ''
      } ${
        selected
          ? 'bg-emerald-50 dark:bg-emerald-900/20'
          : hasGps
          ? 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
          : ''
      }`}
    >
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${badgeClass}`}>
        {badge}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-stone-800 dark:text-stone-200 leading-snug">
          {label}
        </div>
        <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
          {fmtTime(entry.timestamp)}
          {hasGps && <span className="ml-1.5 text-emerald-500 dark:text-emerald-400">●</span>}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export function TrailLogMapPage() {
  const { logId } = useParams<{ logId: string }>()
  const location  = useLocation()
  const navigate  = useNavigate()
  const { user }  = useAuth()

  const handleClose = () => {
    if (window.history.length > 1) navigate(-1)
    else window.close()
  }

  const [log,     setLog]     = useState<TrailLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [focusCenter, setFocusCenter] = useState<[number, number] | null>(null)
  const [selectedTs,  setSelectedTs]  = useState<number | null>(null)

  useEffect(() => { applyTheme(getStoredTheme()) }, [])

  useEffect(() => {
    async function load() {
      try {
        if (logId) {
          const res  = await fetch(`/api/data-logger/get-log.php?id=${encodeURIComponent(logId)}`)
          const data = (await res.json()) as { success: boolean; log?: TrailLog; error?: string }
          if (!data.success || !data.log) throw new Error(data.error ?? 'Log not found')
          setLog(data.log)
        } else {
          const state     = location.state as { sessionId?: string } | null
          const sessionId = state?.sessionId
          if (!sessionId) { setError('No session data. Open from the Data Logger page.'); return }

          const entries  = await getSessionEntries(sessionId)
          const trackers = await getSessionTrackers(sessionId)

          setLog({
            member:     user?.name ?? 'Patrol Member',
            reportDate: sessionId.slice(0, 10),
            summary:    buildSummaryFromEntries(entries),
            trackers:   trackers.map(t => ({
              name:             t.name,
              state:            t.state,
              totalDistanceM:   t.totalDistanceM,
              activeDurationMs: t.activeDurationMs,
              startedAt:        t.startedAt,
              segments:         t.segments,
            })),
            entries: entries.map(e => ({
              id:           e.id,
              sessionId:    e.sessionId,
              timestamp:    e.timestamp,
              lat:          e.lat,
              lng:          e.lng,
              type:         e.type,
              hikerSubtype: e.hikerSubtype,
              treeSubtype:  e.treeSubtype,
              treeSize:     e.treeSize,
              noteText:     e.noteText,
            })),
          })
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load log')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [logId, location.state, user?.name])

  // ── Derived data ─────────────────────────────────────────────────

  const timelineEntries = useMemo(() => {
    if (!log) return []
    const contactedTs = new Set(
      log.entries
        .filter(e => e.type === 'hiker' && e.hikerSubtype === 'contacted')
        .map(e => e.timestamp)
    )
    return log.entries
      .filter(e => !(e.type === 'hiker' && e.hikerSubtype === 'seen' && contactedTs.has(e.timestamp)))
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
  }, [log])

  const gpsEntries = useMemo(
    () => timelineEntries.filter(e => e.lat !== null && e.lng !== null),
    [timelineEntries]
  )

  const mapPoints = useMemo(
    () => gpsEntries.map(e => [e.lat!, e.lng!] as [number, number]),
    [gpsEntries]
  )

  const defaultCenter: [number, number] = [40.3772, -105.5217]

  const { summary, trackers } = log ?? { summary: null, trackers: [] }

  const totalDistanceM = trackers.reduce((s, t) => s + t.totalDistanceM, 0)
  const totalDurationMs = trackers.reduce((s, t) => s + t.activeDurationMs, 0)

  const treeTotal = summary
    ? Object.values(summary.trees.cleared).reduce((s, v) => s + v, 0) +
      Object.values(summary.trees.noted).reduce((s, v) => s + v, 0)
    : 0

  const treeBySizeTotal = summary
    ? {
        small:  summary.trees.cleared.small  + summary.trees.noted.small,
        medium: summary.trees.cleared.medium + summary.trees.noted.medium,
        large:  summary.trees.cleared.large  + summary.trees.noted.large,
        xl:     summary.trees.cleared.xl     + summary.trees.noted.xl,
      }
    : { small: 0, medium: 0, large: 0, xl: 0 }

  const timestamps  = log?.entries.map(e => e.timestamp) ?? []
  const sessionStart = timestamps.length > 0 ? Math.min(...timestamps) : null
  const sessionEnd   = timestamps.length > 0 ? Math.max(...timestamps) : null

  const fieldNotes = timelineEntries.filter(e => e.type === 'note')

  // ── Loading / error states ────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center">
        <p className="text-sm text-stone-400 animate-pulse">Loading report…</p>
      </div>
    )
  }

  if (error || !log) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-500">{error ?? 'Report not found'}</p>
        <a href="/data-logger" className="text-xs text-emerald-600 underline underline-offset-2">
          ← Back to Data Logger
        </a>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 flex flex-col">

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="bg-emerald-800 dark:bg-emerald-900 text-white relative">
        <button
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-emerald-300 hover:text-white hover:bg-emerald-700/60 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="max-w-7xl mx-auto px-5 py-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-300 mb-1">
              PWV Trail Patrol
            </div>
            <h1 className="text-2xl font-bold leading-tight">Data Logger Report</h1>
            <p className="text-sm text-emerald-200 mt-1">Patrol Member: {log.member}</p>
          </div>
          <div className="text-sm text-emerald-100 space-y-1 sm:text-right shrink-0">
            <div>
              <span className="text-emerald-400 text-xs uppercase tracking-wide">Log Date</span>
              <div className="font-medium">{fmtDate(log.reportDate)}</div>
            </div>
            {sessionStart && (
              <div>
                <span className="text-emerald-400 text-xs uppercase tracking-wide">Session Window</span>
                <div>{fmtTime(sessionStart)} — {sessionEnd ? fmtTime(sessionEnd) : '(active)'}</div>
              </div>
            )}
            {fieldNotes.length > 0 && (
              <div className="max-w-xs sm:max-w-[280px]">
                <span className="text-emerald-400 text-xs uppercase tracking-wide">Field Notes</span>
                <div className="italic text-emerald-100 text-sm leading-snug">
                  "{fieldNotes[0].noteText}"
                  {fieldNotes.length > 1 && (
                    <span className="text-emerald-300 not-italic"> +{fieldNotes.length - 1} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Stats row ───────────────────────────────────────────── */}
      <div className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 px-5 py-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-3">

          {/* Hikers */}
          <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
              Hikers Encountered
            </div>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-bold leading-none text-stone-900 dark:text-stone-100">
                {summary?.hikers.total ?? 0}
              </span>
              <svg className="w-8 h-8 text-stone-300 dark:text-stone-600 mb-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
            <div className="mt-2 text-xs text-stone-500 dark:text-stone-400">
              Seen: <strong className="text-stone-700 dark:text-stone-300">{summary?.hikers.seen ?? 0}</strong>
              <span className="mx-2">·</span>
              Contacted: <strong className="text-stone-700 dark:text-stone-300">{summary?.hikers.contacted ?? 0}</strong>
            </div>
          </div>

          {/* Trees */}
          <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Trees Documented
              </div>
              <span className="text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
                {treeTotal} Total
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center">
              {(['small', 'medium', 'large', 'xl'] as const).map(size => (
                <div key={size} className="bg-white dark:bg-stone-700/50 rounded-lg py-1.5">
                  <div className="text-lg font-bold text-stone-900 dark:text-stone-100 leading-none">
                    {treeBySizeTotal[size]}
                  </div>
                  <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 capitalize">
                    {size === 'xl' ? 'XL' : size[0].toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1.5 text-xs text-stone-400 dark:text-stone-500 text-center">
              S &lt;8" · M 8–15" · L 16–23" · XL 24–36"
            </div>
          </div>

          {/* Tracking */}
          <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
              Total Survey Tracking
            </div>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold leading-none text-stone-900 dark:text-stone-100">
                {(totalDistanceM / 1609.344).toFixed(2)}
              </span>
              <span className="text-lg font-semibold text-stone-500 dark:text-stone-400 mb-0.5">mi</span>
              <svg className="w-6 h-6 text-stone-300 dark:text-stone-600 mb-1 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
                <path d="M12 6v6l4 2" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            {totalDurationMs > 0 && (
              <div className="mt-2 text-xs text-stone-500 dark:text-stone-400 space-y-0.5">
                <div>Duration: <strong className="text-stone-700 dark:text-stone-300">{fmtDuration(totalDurationMs)}</strong></div>
                <div>Avg Pace: <strong className="text-stone-700 dark:text-stone-300">{fmtPace(totalDistanceM, totalDurationMs)}</strong></div>
              </div>
            )}
            {totalDurationMs === 0 && (
              <div className="mt-2 text-xs text-stone-400 dark:text-stone-500">No tracking data</div>
            )}
          </div>

        </div>
      </div>

      {/* ── Two-panel content ────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 h-full">

          {/* Map panel */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col min-h-[420px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
              <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                Geographic Spatial Mapping
              </h2>
              <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-400 dark:bg-amber-500 inline-block" />
                  Trees
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-sky-500 inline-block" />
                  Hikers
                </span>
              </div>
            </div>
            <div className="flex-1 relative" style={{ minHeight: '360px' }}>
              <MapContainer
                center={defaultCenter}
                zoom={13}
                style={{ height: '100%', width: '100%', minHeight: '360px' }}
                scrollWheelZoom
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {mapPoints.length > 0 && <MapBoundsController points={mapPoints} />}
                <MapFocusController center={focusCenter} />

                {gpsEntries.map(entry => {
                  const isTree  = entry.type === 'tree'
                  const isHiker = entry.type === 'hiker'
                  const color   = isTree ? '#f59e0b' : isHiker ? '#0ea5e9' : '#78716c'
                  const selected = entry.timestamp === selectedTs
                  return (
                    <CircleMarker
                      key={`${entry.type}-${entry.timestamp}-${entry.lat}-${entry.lng}`}
                      center={[entry.lat!, entry.lng!]}
                      radius={selected ? 9 : 6}
                      pathOptions={{
                        color:       selected ? '#059669' : color,
                        fillColor:   color,
                        fillOpacity: 0.85,
                        weight:      selected ? 2.5 : 1.5,
                      }}
                    >
                      <Popup>
                        <div className="text-xs space-y-0.5">
                          <div className="font-semibold">
                            {isTree
                              ? `Tree — ${entry.treeSubtype}, ${SIZE_LABELS[entry.treeSize ?? ''] ?? entry.treeSize}`
                              : isHiker
                              ? `Hiker — ${entry.hikerSubtype}`
                              : entry.noteText}
                          </div>
                          <div className="text-stone-500">{fmtTime(entry.timestamp)}</div>
                          <div className="text-stone-400 font-mono text-[10px]">
                            {entry.lat!.toFixed(5)}°, {entry.lng!.toFixed(5)}°
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  )
                })}
              </MapContainer>
            </div>
          </div>

          {/* Timeline panel */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 flex flex-col min-h-[420px]">
            <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
              <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                Live Survey Timeline
              </h2>
              <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                Click a GPS entry to zoom to it on the map.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
              {timelineEntries.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-xs text-stone-400 dark:text-stone-500">No entries recorded</p>
                </div>
              ) : (
                timelineEntries.map(entry => (
                  <TimelineEntry
                    key={`${entry.type}-${entry.timestamp}`}
                    entry={entry}
                    selected={entry.timestamp === selectedTs}
                    onClick={() => {
                      setSelectedTs(entry.timestamp)
                      if (entry.lat !== null && entry.lng !== null) {
                        setFocusCenter([entry.lat, entry.lng])
                      }
                    }}
                  />
                ))
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="text-center py-4 px-4">
        <a
          href="/data-logger"
          className="text-xs text-stone-400 dark:text-stone-600 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors underline underline-offset-2"
        >
          ← Open Data Logger
        </a>
        {log.savedAt && (
          <span className="text-xs text-stone-300 dark:text-stone-700 ml-4">
            Saved {log.savedAt}
          </span>
        )}
      </footer>

    </div>
  )
}
