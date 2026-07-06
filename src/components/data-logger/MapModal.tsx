import { useMemo, useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet'
import { popup as createLPopup, divIcon } from 'leaflet'
import { trailPaths } from '../../data/trailPaths'
import { trailGeoData, trailNames } from '../../data/trailGeoData'
import { TRAILHEAD_PIN } from '../../lib/trailheadPin'
import 'leaflet/dist/leaflet.css'
import type { LogEntry, Tracker } from '../../types/dataLogger'
import { isValidLatLng } from '../../lib/geo'
import { getLoggerSettings } from '../../lib/loggerSettings'
import { PaceChart } from './PaceChart'

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

const SIZE_LABELS: Record<string, string> = {
  small:  'Small (<8")',
  medium: 'Medium (8–15")',
  large:  'Large (16–23")',
  xl:     'XL (24–36")',
}

const CAMERA_ICON = divIcon({
  html: '<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;background:#fff;border:2px solid #db2777;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4);font-size:14px;line-height:1">📷</div>',
  className: 'pwv-photo-marker',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

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
    else if (e.type === 'trail') heading = `Trail: ${e.trailName ?? 'none (off PWV trail)'}`
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

// ── Pace chart dot colors ─────────────────────────────────────────

function paceDotColor(item: TimelineItem): string {
  if (item.kind === 'waypoint') return item.name ? '#7c3aed' : '#a78bfa'
  const e = item.entry
  return e.type === 'hiker' ? '#0ea5e9' : e.type === 'tree' ? '#f59e0b' : e.type === 'violation' ? '#ef4444' : '#78716c'
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

  // Every trail involved in this session: current selection + trail-change events
  const loggedTrailIds = useMemo((): number[] => {
    const ids = new Set<number>()
    if (wksiteId != null) ids.add(wksiteId)
    for (const e of entries) {
      if (e.type === 'trail' && e.wksiteId != null) ids.add(e.wksiteId)
    }
    return [...ids]
  }, [wksiteId, entries])

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
      {hasPaceData && (
        <PaceChart
          trackers={trackers}
          dots={timelineItems.map(item => ({ ts: item.ts, color: paceDotColor(item) }))}
          paceFormat={loggerSettings.waypointPaceFormat}
        />
      )}

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

            {loggedTrailIds.map(id =>
              (trailPaths[id] ?? []).map((coords, i) => (
                <Polyline
                  key={`trail-path-${id}-${i}`}
                  positions={coords.map(([lng, lat]) => [lat, lng])}
                  pathOptions={{ color: '#059669', weight: 3, opacity: 0.6 }}
                />
              ))
            )}

            {loggedTrailIds.map(id => {
              const th = trailGeoData[id]
              if (!th || !isValidLatLng(th.lat, th.lng)) return null
              return (
                <Marker key={`th-${id}`} position={[th.lat, th.lng]} icon={TRAILHEAD_PIN}>
                  <Tooltip direction="top">
                    {trailNames[id] ?? `Trail ${id}`} Trailhead
                  </Tooltip>
                </Marker>
              )
            })}

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
                if (e.type === 'trail' || e.type === 'photo') return null
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

            {/* Photo markers — click to view the captured image */}
            {timelineItems
              .filter((item): item is Extract<TimelineItem, { kind: 'entry' }> => item.kind === 'entry')
              .map((item, i) => {
                const e = item.entry
                if (e.type !== 'photo' || e.lat === null || e.lng === null) return null
                const src = e.photoData ?? e.photoUrl
                if (!src) return null
                const caption = e.noteText?.trim()
                return (
                  <Marker key={`photo-${i}`} position={[e.lat, e.lng]} icon={CAMERA_ICON}>
                    <Popup>
                      <div className="text-xs space-y-1" style={{ width: 200 }}>
                        <img src={src} alt={caption || 'Photo'} style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                        {caption && <div className="font-medium">{caption}</div>}
                        <div className="text-stone-500">{fmtTime(e.timestamp)}</div>
                      </div>
                    </Popup>
                  </Marker>
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
    const isTrail     = e.type === 'trail'
    const isPhoto     = e.type === 'photo'
    badge      = isTree ? 'TREE' : isHiker ? 'HIKER' : isViolation ? 'VIOL' : isTrail ? 'TRAIL' : isPhoto ? 'PHOTO' : 'NOTE'
    badgeClass = isTree
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      : isHiker
      ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
      : isViolation
      ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
      : isTrail
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
      : isPhoto
      ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300'
      : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
    const subCap = (s?: string) => s ? s[0].toUpperCase() + s.slice(1) : ''
    label = isTree
      ? `Tree — ${subCap(e.treeSubtype)}, ${SIZE_LABELS[e.treeSize ?? ''] ?? e.treeSize}`
      : isHiker
      ? `Hiker — ${subCap(e.hikerSubtype)}`
      : isViolation
      ? (e.violationType ?? 'Violation')
      : isTrail
      ? `Trail: ${e.trailName ?? 'none (off PWV trail)'}`
      : isPhoto
      ? (e.noteText?.trim() || 'Photo')
      : (e.noteText ?? '')
    if (isViolation && e.violationNote) sublabel = e.violationNote
    if (isPhoto) sublabel = '📷 Tap marker on map to view'
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
