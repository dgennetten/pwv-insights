import { useMemo, useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, useMap } from 'react-leaflet'
import { DivIcon, popup as createLPopup } from 'leaflet'
import { trailPaths } from '../../data/trailPaths'
import 'leaflet/dist/leaflet.css'
import type { LogEntry, Tracker } from '../../types/dataLogger'
import { isValidLatLng } from '../../lib/geo'
import { getLoggerSettings } from '../../lib/loggerSettings'

// ── Helpers ───────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function fmtMiles(m: number) { return (m / 1609.344).toFixed(2) + ' mi' }
function fmtPace(minPerMi: number) {
  const m = Math.floor(minPerMi)
  const s = Math.round((minPerMi - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
function fmtPaceDisplay(minPerMi: number, fmt: 'min-per-mi' | 'mph') {
  if (fmt === 'mph') return `${(60 / minPerMi).toFixed(1)} mph`
  return `${fmtPace(minPerMi)}/mi`
}
function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Constants ─────────────────────────────────────────────────────

const TH_ICON = new DivIcon({
  html: '<div style="background:#059669;color:#fff;font-size:10px;font-weight:700;border-radius:4px;padding:2px 5px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.35)">TH</div>',
  className: '',
  iconAnchor: [18, 12],
})

const SIZE_LABELS: Record<string, string> = {
  small:  'Small (<8")',
  medium: 'Medium (8–15")',
  large:  'Large (16–23")',
  xl:     'XL (24–36")',
}

// ── Types ─────────────────────────────────────────────────────────

type TimelineItem =
  | { kind: 'entry';    entry: LogEntry; ts: number }
  | { kind: 'waypoint'; lat: number; lng: number; ts: number; name?: string; trackerName: string; paceMinPerMi?: number; segmentDistanceM: number }

// ── Popup HTML builder ────────────────────────────────────────────

function buildPopupHtml(item: TimelineItem, paceFormat: 'min-per-mi' | 'mph' = 'min-per-mi'): string {
  const rows: string[] = []

  if (item.kind === 'waypoint') {
    rows.push(`<div style="font-weight:600;margin-bottom:3px">${item.name ? esc(item.name) : 'Auto-Waypoint'}</div>`)
    rows.push(`<div>Tracker: ${esc(item.trackerName)}</div>`)
    rows.push(`<div>At: ${fmtMiles(item.segmentDistanceM)} into segment</div>`)
    if (item.paceMinPerMi != null) rows.push(`<div>Pace: <b>${fmtPaceDisplay(item.paceMinPerMi, paceFormat)}</b></div>`)
    rows.push(`<div>${fmtTime(item.ts)}</div>`)
    rows.push(`<div style="color:#a8a29e;margin-top:2px">${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}</div>`)
  } else {
    const e = item.entry
    const sub = (e.hikerSubtype ?? e.treeSubtype ?? '')
    const subCap = sub ? sub[0].toUpperCase() + sub.slice(1) : ''
    let heading = ''
    if (e.type === 'hiker')     heading = `Hiker — ${subCap}`
    else if (e.type === 'tree') heading = `Tree — ${subCap}${e.treeSize ? ', ' + (SIZE_LABELS[e.treeSize] ?? e.treeSize) : ''}`
    else if (e.type === 'violation') heading = 'Violation'
    else heading = 'Note'
    rows.push(`<div style="font-weight:600;margin-bottom:3px">${heading}</div>`)
    if (e.violationType) rows.push(`<div>${esc(e.violationType)}</div>`)
    if (e.violationNote)  rows.push(`<div style="color:#78716c">${esc(e.violationNote)}</div>`)
    if (e.noteText)       rows.push(`<div>${esc(e.noteText)}</div>`)
    rows.push(`<div>${fmtTime(item.ts)}</div>`)
    if (e.lat != null && e.lng != null)
      rows.push(`<div style="color:#a8a29e;margin-top:2px">${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}</div>`)
  }

  return `<div style="font-size:12px;line-height:1.7;min-width:155px">${rows.join('')}</div>`
}

// ── Leaflet controllers ───────────────────────────────────────────

function MapBoundsController({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) map.setView(points[0], 15)
    else map.fitBounds(points, { padding: [40, 40] })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function MapFocusController({ center }: { center: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (!center || !isValidLatLng(center[0], center[1])) return
    const fly = () => {
      const { x, y } = map.getSize()
      if (x === 0 || y === 0) return
      map.flyTo(center, 16, { animate: true, duration: 0.6 })
    }
    map.on('resize', fly)
    requestAnimationFrame(fly)
    return () => { map.off('resize', fly) }
  }, [map, center])
  return null
}

function MapPopupController({ item }: { item: TimelineItem | null }) {
  const map = useMap()
  const paceFormat = useMemo(() => getLoggerSettings().waypointPaceFormat, [])
  useEffect(() => {
    if (!item) { map.closePopup(); return }
    const lat = item.kind === 'entry' ? item.entry.lat : item.lat
    const lng = item.kind === 'entry' ? item.entry.lng : item.lng
    if (lat == null || lng == null) return
    const p = createLPopup({ maxWidth: 280, closeButton: true })
      .setLatLng([lat, lng])
      .setContent(buildPopupHtml(item, paceFormat))
    map.openPopup(p)
    return () => { try { map.closePopup(p) } catch { /* ignore */ } }
  }, [map, item, paceFormat])
  return null
}

// ── Pace chart ────────────────────────────────────────────────────

function PaceChart({ trackers, timelineItems, paceFormat }: {
  trackers: Tracker[]
  timelineItems: TimelineItem[]
  paceFormat: 'min-per-mi' | 'mph'
}) {
  const rawPoints: { ts: number; pace: number }[] = []
  for (const t of trackers)
    for (const seg of t.segments)
      for (const wp of seg.waypoints ?? [])
        if (!wp.name && wp.paceMinPerMi != null)
          rawPoints.push({ ts: wp.ts, pace: wp.paceMinPerMi })
  rawPoints.sort((a, b) => a.ts - b.ts)
  if (rawPoints.length < 2) return null

  const W = 800; const H = 100
  const PL = 42; const PR = 10; const PT = 8; const PB = 24
  const plotW = W - PL - PR
  const plotH = H - PT - PB

  const allTs  = [...timelineItems.map(i => i.ts), ...rawPoints.map(p => p.ts)]
  const tMin   = Math.min(...allTs); const tMax = Math.max(...allTs)
  const tRange = tMax - tMin || 1
  const xS = (ts: number) => PL + ((ts - tMin) / tRange) * plotW

  const isMph = paceFormat === 'mph'
  // For min/mi: slower (higher value) = top. For mph: faster (higher value) = top.
  // Both modes: higher y-value = top of chart.
  const plotValues = isMph ? rawPoints.map(p => 60 / p.pace) : rawPoints.map(p => p.pace)
  const vMin = Math.min(...plotValues); const vMax = Math.max(...plotValues)
  const pad  = (vMax - vMin) * 0.3 || 1
  const yMin = Math.max(0, vMin - pad); const yMax = vMax + pad
  const yRange = yMax - yMin
  // Higher plotValue = top for both modes (min/mi: high=slow=top; mph: high=fast=top)
  const yS = (v: number) => PT + plotH * (1 - (v - yMin) / yRange)

  const axisY    = PT + plotH
  const linePath = rawPoints.map((d, i) => {
    const v = isMph ? 60 / d.pace : d.pace
    return `${i === 0 ? 'M' : 'L'}${xS(d.ts).toFixed(1)},${yS(v).toFixed(1)}`
  }).join(' ')
  const yTicks = [yMin, (yMin + yMax) / 2, yMax]
  const fmtTick = (v: number) => isMph ? v.toFixed(1) : fmtPace(v)

  const dotColor = (item: TimelineItem) => {
    if (item.kind === 'waypoint') return item.name ? '#7c3aed' : '#a78bfa'
    const e = item.entry
    return e.type === 'hiker' ? '#0ea5e9' : e.type === 'tree' ? '#f59e0b' : e.type === 'violation' ? '#ef4444' : '#78716c'
  }

  return (
    <div className="shrink-0 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 px-2 pt-1.5 pb-0">
      <div className="flex items-center gap-3 px-2 mb-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
          {isMph
            ? <>Speed · mph <span className="font-normal normal-case">(faster ↑)</span></>
            : <>Pace · min/mi <span className="font-normal normal-case">(slower ↑)</span></>
          }
        </p>
        <div className="flex gap-2.5 ml-auto text-[10px] text-stone-400 dark:text-stone-500">
          <span><span style={{ color: '#0ea5e9' }}>●</span> Hiker</span>
          <span><span style={{ color: '#f59e0b' }}>●</span> Tree</span>
          <span><span style={{ color: '#ef4444' }}>●</span> Viol</span>
          <span><span style={{ color: '#a78bfa' }}>●</span> WP</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px`, display: 'block' }}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={yS(v)} x2={W - PR} y2={yS(v)} stroke="#e7e5e4" strokeWidth={0.5} />
            <text x={PL - 4} y={yS(v) + 3.5} textAnchor="end" fontSize={8} fill="#a8a29e">{fmtTick(v)}</text>
          </g>
        ))}
        <line x1={PL} y1={axisY} x2={W - PR} y2={axisY} stroke="#d6d3d1" strokeWidth={0.75} />
        <path d={linePath} fill="none" stroke="#7c3aed" strokeWidth={1.5} strokeLinejoin="round" />
        {rawPoints.map((d, i) => {
          const v = isMph ? 60 / d.pace : d.pace
          return <circle key={i} cx={xS(d.ts)} cy={yS(v)} r={2.5} fill="#7c3aed" />
        })}
        {timelineItems.map((item, i) => (
          <circle key={i} cx={xS(item.ts)} cy={axisY + 11} r={2.5} fill={dotColor(item)} opacity={0.85} />
        ))}
      </svg>
    </div>
  )
}

// ── MapModal ──────────────────────────────────────────────────────

interface MapModalProps {
  entries:          LogEntry[]
  trackers:         Tracker[]
  memberName:       string
  reportDate:       string
  trailheadCoords?: { lat: number; lng: number }
  wksiteId?:        number
  onClose:          () => void
}

export function MapModal({ entries, trackers, memberName, reportDate, trailheadCoords, wksiteId, onClose }: MapModalProps) {
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null)
  const [livePos,      setLivePos]      = useState<{ lat: number; lng: number } | null>(null)
  const livePosWatchRef = useRef<number | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    livePosWatchRef.current = navigator.geolocation.watchPosition(
      pos => setLivePos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* silent */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    )
    return () => {
      if (livePosWatchRef.current !== null)
        navigator.geolocation.clearWatch(livePosWatchRef.current)
    }
  }, [])

  const thDistLabel = trailheadCoords && livePos
    ? fmtMiles(haversineMeters(trailheadCoords.lat, trailheadCoords.lng, livePos.lat, livePos.lng))
    : null

  const timelineItems = useMemo((): TimelineItem[] => {
    const contactedTs = new Set(
      entries.filter(e => e.type === 'hiker' && e.hikerSubtype === 'contacted').map(e => e.timestamp)
    )
    const entryItems: TimelineItem[] = entries
      .filter(e => !(e.type === 'hiker' && e.hikerSubtype === 'seen' && contactedTs.has(e.timestamp)))
      .map(e => ({ kind: 'entry' as const, entry: e, ts: e.timestamp }))

    const waypointItems: TimelineItem[] = []
    for (const tracker of trackers)
      for (const seg of tracker.segments)
        for (const wp of seg.waypoints ?? [])
          if (wp.lat !== null && wp.lng !== null)
            waypointItems.push({
              kind:             'waypoint' as const,
              lat:              wp.lat,
              lng:              wp.lng,
              ts:               wp.ts,
              name:             wp.name,
              trackerName:      tracker.name || 'Tracker',
              paceMinPerMi:     wp.paceMinPerMi,
              segmentDistanceM: wp.segmentDistanceM,
            })

    return [...entryItems, ...waypointItems].sort((a, b) => a.ts - b.ts)
  }, [entries, trackers])

  const mapPoints = useMemo((): [number, number][] => {
    const pts: [number, number][] = []
    for (const item of timelineItems) {
      if (item.kind === 'entry') {
        if (item.entry.lat !== null && item.entry.lng !== null)
          pts.push([item.entry.lat, item.entry.lng])
      } else {
        pts.push([item.lat, item.lng])
      }
    }
    return pts
  }, [timelineItems])

  const [focusCenter, setFocusCenter] = useState<[number, number] | null>(null)
  const timelineScrollRef = useRef<HTMLDivElement>(null)

  // Scroll the selected row into view (useful when selecting via map pin)
  useEffect(() => {
    if (!selectedItem || !timelineScrollRef.current) return
    const el = timelineScrollRef.current.querySelector<HTMLElement>(`[data-ts="${selectedItem.ts}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedItem])

  const hasAutoWaypoints = useMemo(
    () => trackers.some(t => t.segments.some(s => (s.waypoints ?? []).some(w => !w.name))),
    [trackers]
  )
  const hasPaceData = useMemo(
    () => trackers.some(t => t.segments.some(s => (s.waypoints ?? []).some(w => !w.name && w.paceMinPerMi != null))),
    [trackers]
  )
  const loggerSettings = useMemo(() => getLoggerSettings(), [])

  // List row click: fly to location + open popup + highlight
  const handleListRowClick = (item: TimelineItem) => {
    const isDeselecting = selectedItem?.ts === item.ts
    setSelectedItem(isDeselecting ? null : item)
    if (!isDeselecting) {
      const lat = item.kind === 'entry' ? item.entry.lat : item.lat
      const lng = item.kind === 'entry' ? item.entry.lng : item.lng
      if (lat != null && lng != null) setFocusCenter([lat, lng])
    }
  }

  // Map pin click: open popup + highlight + scroll row into view (no fly)
  const handleMapPinClick = (item: TimelineItem) => {
    setSelectedItem(prev => prev?.ts === item.ts ? null : item)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-stone-900">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Map Report</h2>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{reportDate} · {memberName}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close map"
          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Page-wide pace chart */}
      {hasPaceData && <PaceChart trackers={trackers} timelineItems={timelineItems} paceFormat={loggerSettings.waypointPaceFormat} />}

      {/* Map + Timeline */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">

        {/* Map */}
        <div className="relative shrink-0 h-[45vh] lg:h-auto lg:flex-1 lg:shrink">
          {thDistLabel && (
            <div className="absolute top-2 left-2 z-[500] bg-emerald-700/90 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow pointer-events-none">
              {thDistLabel} from trailhead
            </div>
          )}
          <MapContainer
            center={[40.3772, -105.5217]}
            zoom={13}
            style={{ height: '100%', width: '100%', minHeight: '200px' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {mapPoints.length > 0 && <MapBoundsController points={mapPoints} />}
            <MapFocusController center={focusCenter} />
            <MapPopupController item={selectedItem} />

            {wksiteId != null && (trailPaths[wksiteId] ?? []).map((coords, i) => (
              <Polyline
                key={`trail-path-${i}`}
                positions={coords.map(([lng, lat]) => [lat, lng])}
                pathOptions={{ color: '#059669', weight: 3, opacity: 0.6 }}
              />
            ))}

            {trailheadCoords && isValidLatLng(trailheadCoords.lat, trailheadCoords.lng) && (
              <Marker position={[trailheadCoords.lat, trailheadCoords.lng]} icon={TH_ICON} />
            )}

            {livePos && isValidLatLng(livePos.lat, livePos.lng) && (
              <CircleMarker
                center={[livePos.lat, livePos.lng]}
                radius={8}
                pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 2 }}
              />
            )}

            {/* Waypoint dots — click to select */}
            {timelineItems
              .filter((item): item is Extract<TimelineItem, { kind: 'waypoint' }> => item.kind === 'waypoint')
              .map((item, i) => {
                const sel = selectedItem?.ts === item.ts
                return (
                  <CircleMarker
                    key={`wp-${i}`}
                    center={[item.lat, item.lng]}
                    radius={item.name ? 5 : 2.5}
                    pathOptions={{
                      color:       sel ? '#059669' : '#7c3aed',
                      fillColor:   '#8b5cf6',
                      fillOpacity: 0.8,
                      weight:      sel ? 2.5 : 1,
                    }}
                    eventHandlers={{ click: () => handleMapPinClick(item) }}
                  />
                )
              })
            }

            {/* Entry dots — click to select */}
            {timelineItems
              .filter((item): item is Extract<TimelineItem, { kind: 'entry' }> => item.kind === 'entry')
              .map((item, i) => {
                const e = item.entry
                if (e.lat === null || e.lng === null) return null
                const isTree      = e.type === 'tree'
                const isHiker     = e.type === 'hiker'
                const isViolation = e.type === 'violation'
                const color       = isTree ? '#f59e0b' : isHiker ? '#0ea5e9' : isViolation ? '#ef4444' : '#78716c'
                const sel         = selectedItem?.ts === item.ts
                return (
                  <CircleMarker
                    key={`e-${i}`}
                    center={[e.lat, e.lng]}
                    radius={sel ? 9 : 6}
                    pathOptions={{
                      color:       sel ? '#059669' : color,
                      fillColor:   color,
                      fillOpacity: 0.85,
                      weight:      sel ? 2.5 : 1.5,
                    }}
                    eventHandlers={{ click: () => handleMapPinClick(item) }}
                  />
                )
              })
            }
          </MapContainer>
        </div>

        {/* Timeline panel */}
        <div className="flex-1 lg:flex-none lg:w-72 flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-stone-200 dark:border-stone-800">

          <div className="px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 shrink-0">
            <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
              All Observations ({timelineItems.length})
            </p>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
              Tap any row or map dot for details
            </p>
          </div>

          {/* Auto-waypoint settings banner */}
          {hasAutoWaypoints && (
            <div className="px-3 py-2 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-100 dark:border-violet-900/40 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400 mb-0.5">
                Auto-Waypoint Settings
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-violet-700 dark:text-violet-300">
                <span>
                  {loggerSettings.waypointMode === 'distance'
                    ? `Every ${loggerSettings.waypointDistanceMi} mi`
                    : `Every ${loggerSettings.waypointTimeMin} min`}
                </span>
                <span className="text-violet-400 dark:text-violet-500">
                  {loggerSettings.waypointMode === 'distance' ? 'distance' : 'time'} mode
                </span>
                {loggerSettings.waypointPace    && <span>● Pace recorded</span>}
                {loggerSettings.waypointVibrate && <span>● Vibrate on</span>}
              </div>
            </div>
          )}

          <div ref={timelineScrollRef} className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
            {timelineItems.length === 0 ? (
              <div className="flex items-center justify-center h-20">
                <p className="text-xs text-stone-400 dark:text-stone-500">No entries yet</p>
              </div>
            ) : (
              timelineItems.map((item, idx) => (
                <MapTimelineRow
                  key={idx}
                  item={item}
                  selected={selectedItem?.ts === item.ts}
                  onClick={() => handleListRowClick(item)}
                  paceFormat={loggerSettings.waypointPaceFormat}
                />
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Timeline row ──────────────────────────────────────────────────

function MapTimelineRow({ item, selected, onClick, paceFormat }: {
  item:       TimelineItem
  selected:   boolean
  onClick:    () => void
  paceFormat: 'min-per-mi' | 'mph'
}) {
  const hasGps =
    item.kind === 'waypoint' ||
    (item.kind === 'entry' && item.entry.lat !== null && item.entry.lng !== null)

  let badge: string
  let badgeClass: string
  let label: string
  let sublabel: string | null = null

  if (item.kind === 'waypoint') {
    const isAuto = !item.name
    badge      = isAuto ? 'AUTO' : 'WPT'
    badgeClass = 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
    label      = item.name ?? (item.paceMinPerMi != null ? fmtPaceDisplay(item.paceMinPerMi, paceFormat) : 'Auto-Waypoint')
    sublabel   = `${item.trackerName} · ${fmtMiles(item.segmentDistanceM)}`
  } else {
    const e           = item.entry
    const isTree      = e.type === 'tree'
    const isHiker     = e.type === 'hiker'
    const isViolation = e.type === 'violation'
    badge      = isTree ? 'TREE' : isHiker ? 'HIKER' : isViolation ? 'VIOL' : 'NOTE'
    badgeClass = isTree
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      : isHiker
      ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
      : isViolation
      ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
      : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
    const subCap = (s?: string) => s ? s[0].toUpperCase() + s.slice(1) : ''
    label = isTree
      ? `Tree — ${subCap(e.treeSubtype)}, ${SIZE_LABELS[e.treeSize ?? ''] ?? e.treeSize}`
      : isHiker
      ? `Hiker — ${subCap(e.hikerSubtype)}`
      : isViolation
      ? (e.violationType ?? 'Violation')
      : (e.noteText ?? '')
    if (isViolation && e.violationNote) sublabel = e.violationNote
  }

  return (
    <div
      data-ts={item.ts}
      onClick={onClick}
      className={`flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${
        selected
          ? 'bg-emerald-50 dark:bg-emerald-900/20'
          : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
      }`}
    >
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${badgeClass}`}>
        {badge}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-stone-800 dark:text-stone-200 leading-snug truncate">
          {label}
        </div>
        {sublabel && (
          <div className="text-xs text-stone-400 dark:text-stone-500 leading-snug truncate">{sublabel}</div>
        )}
        <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
          {fmtTime(item.ts)}
          {hasGps && <span className="ml-1.5 text-emerald-500 dark:text-emerald-400">●</span>}
        </div>
      </div>
    </div>
  )
}
