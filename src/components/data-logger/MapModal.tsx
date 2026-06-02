import { useMemo, useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import { DivIcon } from 'leaflet'
import { trailPaths } from '../../data/trailPaths'
import 'leaflet/dist/leaflet.css'
import type { LogEntry, Tracker } from '../../types/dataLogger'
import { isValidLatLng } from '../../lib/geo'

// ── Haversine (local) ─────────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function fmtMiles(m: number): string { return (m / 1609.344).toFixed(2) + ' mi' }

// ── Trailhead icon ─────────────────────────────────────────────────
const TH_ICON = new DivIcon({
  html: '<div style="background:#059669;color:#fff;font-size:10px;font-weight:700;border-radius:4px;padding:2px 5px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.35)">TH</div>',
  className: '',
  iconAnchor: [18, 12],
})

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

// ── Unified timeline item ─────────────────────────────────────────

type TimelineItem =
  | { kind: 'entry';    entry: LogEntry; ts: number }
  | { kind: 'waypoint'; lat: number; lng: number; ts: number; name: string; trackerName: string }

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

    return () => {
      map.off('resize', fly)
    }
  }, [map, center])
  return null
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
  const [focusCenter, setFocusCenter] = useState<[number, number] | null>(null)
  const [selectedTs,  setSelectedTs]  = useState<number | null>(null)
  const [livePos, setLivePos] = useState<{ lat: number; lng: number } | null>(null)
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

  // Merged timeline: entries (deduped) + named manual waypoints, sorted by ts
  const timelineItems = useMemo((): TimelineItem[] => {
    const contactedTs = new Set(
      entries
        .filter(e => e.type === 'hiker' && e.hikerSubtype === 'contacted')
        .map(e => e.timestamp)
    )
    const entryItems: TimelineItem[] = entries
      .filter(e => !(e.type === 'hiker' && e.hikerSubtype === 'seen' && contactedTs.has(e.timestamp)))
      .map(e => ({ kind: 'entry' as const, entry: e, ts: e.timestamp }))

    const waypointItems: TimelineItem[] = []
    for (const tracker of trackers) {
      for (const seg of tracker.segments) {
        for (const wp of seg.waypoints ?? []) {
          if (wp.name && wp.lat !== null && wp.lng !== null) {
            waypointItems.push({
              kind:        'waypoint' as const,
              lat:         wp.lat,
              lng:         wp.lng,
              ts:          wp.ts,
              name:        wp.name,
              trackerName: tracker.name || 'Tracker',
            })
          }
        }
      }
    }
    return [...entryItems, ...waypointItems].sort((a, b) => a.ts - b.ts)
  }, [entries, trackers])

  // All GPS points for initial bounds (entries + all waypoints incl. auto)
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
    for (const tracker of trackers) {
      for (const seg of tracker.segments) {
        for (const wp of seg.waypoints ?? []) {
          if (!wp.name && wp.lat !== null && wp.lng !== null)
            pts.push([wp.lat, wp.lng])
        }
      }
    }
    return pts
  }, [timelineItems, trackers])

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

      {/* Map + Timeline */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">

        {/* Map — fixed 45vh on mobile, flex-1 on desktop */}
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

            {/* Trail path polyline */}
            {wksiteId != null && (trailPaths[wksiteId] ?? []).map((coords, i) => (
              <Polyline
                key={`trail-path-${i}`}
                positions={coords.map(([lng, lat]) => [lat, lng])}
                pathOptions={{ color: '#059669', weight: 3, opacity: 0.6 }}
              />
            ))}

            {/* Trailhead marker */}
            {trailheadCoords && isValidLatLng(trailheadCoords.lat, trailheadCoords.lng) && (
              <Marker position={[trailheadCoords.lat, trailheadCoords.lng]} icon={TH_ICON}>
                <Popup>
                  <div className="text-xs font-semibold">Trailhead</div>
                </Popup>
              </Marker>
            )}

            {/* Live user position */}
            {livePos && isValidLatLng(livePos.lat, livePos.lng) && (
              <CircleMarker
                center={[livePos.lat, livePos.lng]}
                radius={8}
                pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 2 }}
              >
                <Popup><div className="text-xs font-semibold">Your location</div></Popup>
              </CircleMarker>
            )}

            {/* All waypoints (auto + manual) as violet dots */}
            {trackers.flatMap((tracker, ti) =>
              tracker.segments.flatMap((seg, si) =>
                (seg.waypoints ?? []).map((wp, wi) => {
                  if (wp.lat === null || wp.lng === null) return null
                  return (
                    <CircleMarker
                      key={`wp-${ti}-${si}-${wi}`}
                      center={[wp.lat, wp.lng]}
                      radius={wp.name ? 5 : 3}
                      pathOptions={{ color: '#7c3aed', fillColor: '#8b5cf6', fillOpacity: 0.75, weight: 1 }}
                    >
                      <Popup>
                        <div className="text-xs space-y-0.5">
                          <div className="font-semibold">{wp.name ?? 'GPS Waypoint'}</div>
                          <div className="text-stone-500">{tracker.name || 'Tracker'} · {fmtTime(wp.ts)}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  )
                })
              )
            )}

            {/* Entry markers */}
            {timelineItems.map((item, idx) => {
              if (item.kind === 'waypoint') return null
              const e = item.entry
              if (e.lat === null || e.lng === null) return null
              const isTree      = e.type === 'tree'
              const isHiker     = e.type === 'hiker'
              const isViolation = e.type === 'violation'
              const color       = isTree ? '#f59e0b' : isHiker ? '#0ea5e9' : isViolation ? '#ef4444' : '#78716c'
              const selected    = e.timestamp === selectedTs
              return (
                <CircleMarker
                  key={`e-${idx}`}
                  center={[e.lat, e.lng]}
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
                          ? `Tree — ${e.treeSubtype}, ${SIZE_LABELS[e.treeSize ?? ''] ?? e.treeSize}`
                          : isHiker
                          ? `Hiker — ${e.hikerSubtype}`
                          : isViolation
                          ? `Violation — ${e.violationType}`
                          : e.noteText}
                      </div>
                      <div className="text-stone-500">{fmtTime(e.timestamp)}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </div>

        {/* Timeline */}
        <div className="flex-1 lg:flex-none lg:w-72 flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-stone-200 dark:border-stone-800">
          <div className="px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 shrink-0">
            <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
              All Observations ({timelineItems.length})
            </p>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
              Tap a GPS entry to zoom on map
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
            {timelineItems.length === 0 ? (
              <div className="flex items-center justify-center h-20">
                <p className="text-xs text-stone-400 dark:text-stone-500">No entries yet</p>
              </div>
            ) : (
              timelineItems.map((item, idx) => (
                <MapTimelineRow
                  key={idx}
                  item={item}
                  selected={item.ts === selectedTs}
                  onClick={() => {
                    setSelectedTs(item.ts)
                    let lat: number | null = null
                    let lng: number | null = null
                    if (item.kind === 'entry') { lat = item.entry.lat; lng = item.entry.lng }
                    else { lat = item.lat; lng = item.lng }
                    if (lat !== null && lng !== null) setFocusCenter([lat, lng])
                  }}
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

function MapTimelineRow({
  item,
  selected,
  onClick,
}: {
  item:     TimelineItem
  selected: boolean
  onClick:  () => void
}) {
  const hasGps =
    item.kind === 'waypoint' ||
    (item.kind === 'entry' && item.entry.lat !== null && item.entry.lng !== null)

  let badge: string
  let badgeClass: string
  let label: string

  if (item.kind === 'waypoint') {
    badge      = 'WPT'
    badgeClass = 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
    label      = item.name
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
    label = isTree
      ? `Tree — ${e.treeSubtype ? e.treeSubtype[0].toUpperCase() + e.treeSubtype.slice(1) : ''}, ${SIZE_LABELS[e.treeSize ?? ''] ?? e.treeSize}`
      : isHiker
      ? `Hiker — ${e.hikerSubtype ? e.hikerSubtype[0].toUpperCase() + e.hikerSubtype.slice(1) : ''}`
      : isViolation
      ? (e.violationType ?? 'Violation')
      : (e.noteText ?? '')
  }

  return (
    <div
      onClick={hasGps ? onClick : undefined}
      className={`flex items-start gap-2 px-3 py-2 transition-colors ${
        hasGps ? 'cursor-pointer' : ''
      } ${
        selected
          ? 'bg-emerald-50 dark:bg-emerald-900/20'
          : hasGps
          ? 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
          : ''
      }`}
    >
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${badgeClass}`}>
        {badge}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-stone-800 dark:text-stone-200 leading-snug truncate">
          {label}
        </div>
        <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
          {fmtTime(item.ts)}
          {hasGps && <span className="ml-1.5 text-emerald-500 dark:text-emerald-400">●</span>}
        </div>
      </div>
    </div>
  )
}
