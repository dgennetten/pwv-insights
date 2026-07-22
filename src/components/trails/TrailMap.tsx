import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, Popup, useMap } from 'react-leaflet'
import { Icon, latLngBounds } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Trail } from '../../types/trails'
import { isValidLatLng } from '../../lib/geo'
import { trailMetadata } from '../../data/trailMetadata'
import { trailPaths } from '../../data/trailPaths'
import { trailheadAccess } from '../../data/trailheadAccess'

// ── Marker icons ─────────────────────────────────────────────────────────────

const mkIcon = (color: string, size: [number, number] = [25, 41]) =>
  new Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1]],
    popupAnchor: [1, -size[1] + 6],
    shadowSize: [41, 41],
  })

const ICONS = {
  easy:     mkIcon('green'),
  moderate: mkIcon('blue'),
  hard:     mkIcon('orange'),
  selected: mkIcon('red', [30, 49]),
  hovered:  mkIcon('violet', [28, 46]),
}

// ── Map controllers ───────────────────────────────────────────────────────────

function FlyToTrail({ trail, active }: { trail: Trail | null; active: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!active || !trail || !isValidLatLng(trail.latitude, trail.longitude)) return

    const fly = () => {
      const { x, y } = map.getSize()
      if (x === 0 || y === 0) return
      // If the trail has path geometry, fit the whole trail + trailhead into view.
      // Some trails (e.g. Shipman Park) sit miles from their access trailhead, so a
      // fixed zoom on the marker alone would leave the drawn path off-screen.
      const paths = trail.wksiteId != null ? (trailPaths[trail.wksiteId] ?? []) : []
      const pts   = paths.flat()
      if (pts.length > 0) {
        const latlngs: [number, number][] = pts.map(([lng, lat]) => [lat, lng])
        latlngs.push([trail.latitude!, trail.longitude!])
        map.flyToBounds(latLngBounds(latlngs), { padding: [40, 40], maxZoom: 14, duration: 1.2 })
      } else {
        map.flyTo([trail.latitude!, trail.longitude!], 14, { duration: 1.2, easeLinearity: 0.3 })
      }
    }

    map.on('resize', fly)
    map.invalidateSize()
    requestAnimationFrame(fly)

    return () => {
      map.off('resize', fly)
    }
  }, [trail, map, active])
  return null
}

function FitBounds({ trails, skip, active }: { trails: Trail[]; skip?: boolean; active: boolean }) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    // Skip initial fit when a trail is already selected — FlyToTrail handles zoom instead.
    // Without this, FitBounds (which runs after FlyToTrail on mount) overrides the flyTo.
    if (!active || skip || fitted.current || trails.length === 0) return

    const fit = () => {
      const { x, y } = map.getSize()
      if (x === 0 || y === 0) return
      const withGeo = trails.filter(t => isValidLatLng(t.latitude, t.longitude))
      if (withGeo.length === 0) return
      const bounds = latLngBounds(withGeo.map(t => [t.latitude!, t.longitude!]))
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13, duration: 0.5 })
      fitted.current = true
    }

    map.on('resize', fit)
    map.invalidateSize()
    requestAnimationFrame(fit)

    return () => {
      map.off('resize', fit)
    }
  }, [trails, map, skip, active])

  return null
}

// ── Main component ────────────────────────────────────────────────────────────

interface TrailMapProps {
  /** All trails with geo coords attached */
  trails: Trail[]
  /** Trail currently selected/focused (map zooms to it) */
  selectedTrailId?: string | null
  /** Trail hovered in the list (marker highlighted) */
  hoveredTrailId?: string | null
  /** Called when user clicks a map marker */
  onSelectTrail?: (trailId: string) => void
  /** Map panel is visible (hidden mobile list view skips Leaflet animations) */
  mapActive?: boolean
}

export function TrailMap({
  trails,
  selectedTrailId,
  hoveredTrailId,
  onSelectTrail,
  mapActive = true,
}: TrailMapProps) {
  const mappable = useMemo(
    () => trails.filter(t => isValidLatLng(t.latitude, t.longitude)),
    [trails]
  )

  const selectedTrail = useMemo(
    () => mappable.find(t => t.id === selectedTrailId) ?? null,
    [mappable, selectedTrailId]
  )

  const getIcon = (trail: Trail) => {
    if (trail.id === selectedTrailId) return ICONS.selected
    if (trail.id === hoveredTrailId)  return ICONS.hovered
    return ICONS[trail.difficulty] ?? ICONS.moderate
  }

  return (
    <div className="h-full w-full">
      <MapContainer
        center={[40.6, -105.6]}
        zoom={9}
        style={{ height: '100%', width: '100%' }}
        className="rounded-none"
      >
        <TileLayer
          attribution='&copy; <a href="https://opentopomap.org/">OpenTopoMap</a>'
          url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
        />

        {/* Trail path polylines (keyed by WksiteID) */}
        {mappable.map(trail => {
          const paths = trail.wksiteId != null ? (trailPaths[trail.wksiteId] ?? []) : []
          if (paths.length === 0) return null
          const isSelected = trail.id === selectedTrailId
          const isHovered  = trail.id === hoveredTrailId
          return paths.map((coords, pi) => (
            <Polyline
              key={`path-${trail.id}-${pi}`}
              positions={coords.map(([lng, lat]) => [lat, lng])}
              pathOptions={{
                color:   isSelected ? '#059669' : isHovered ? '#d97706' : '#6ee7b7',
                weight:  isSelected ? 4 : 2.5,
                opacity: isSelected ? 0.9 : 0.6,
              }}
            />
          ))
        })}

        {mappable.map(trail => {
          const meta = trail.wksiteId != null ? trailMetadata[trail.wksiteId] : undefined
          // Directions route to the drive-to trailhead when it differs from the
          // map pin (e.g. hike-in trails), else to the pin itself.
          const access = trail.wksiteId != null ? trailheadAccess[trail.wksiteId] : undefined
          const dirLat = access?.lat ?? trail.latitude
          const dirLng = access?.lng ?? trail.longitude
          return (
          <Marker
            key={trail.id}
            position={[trail.latitude!, trail.longitude!]}
            icon={getIcon(trail)}
            eventHandlers={{ popupopen: e => e.target.closeTooltip() }}
          >
            {/* Hover tooltip — desktop only (closes when popup opens on mobile) */}
            <Tooltip direction="top" offset={[0, -30]} opacity={0.9}>
              {trail.name}
            </Tooltip>

            {/* Tap/click popup — works on both desktop and mobile */}
            <Popup>
              <div className="text-base leading-snug min-w-[230px] space-y-1.5">
                <div className="font-semibold text-lg text-stone-900">{trail.name}</div>
                {trail.trailNumber > 0 && (
                  <div className="text-sm text-stone-500">Trail #{trail.trailNumber}</div>
                )}
                {meta && (
                  <div className="space-y-1 pt-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-sm px-1.5 py-0.5 rounded font-medium ${
                        meta.difficulty === 'easy'     ? 'bg-green-100 text-green-800' :
                        meta.difficulty === 'difficult' ? 'bg-orange-100 text-orange-800' :
                                                          'bg-blue-100 text-blue-800'
                      }`}>
                        {meta.difficulty.charAt(0).toUpperCase() + meta.difficulty.slice(1)}
                      </span>
                      <span className="text-sm text-stone-500">{meta.lengthMiles} mi one-way</span>
                    </div>
                    <div className="flex gap-2 text-sm text-stone-500">
                      <span title="Dogs">
                        🐕 {meta.dogs === 'leash' ? 'leash' : meta.dogs === 'allowed' ? 'ok' : '✗'}
                      </span>
                      <span title="Bikes">
                        🚲 {meta.bikes ? 'ok' : '✗'}
                      </span>
                      <span title="Stock">
                        🐴 {meta.stock === 'allowed' ? 'ok' : '✗'}
                      </span>
                    </div>
                    <a
                      href={meta.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-emerald-600 hover:underline block"
                    >
                      Trail description PDF →
                    </a>
                  </div>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${dirLat},${dirLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-600 hover:underline block"
                >
                  Driving directions →
                </a>
                <button
                  onClick={() => onSelectTrail?.(trail.id)}
                  className="text-sm font-semibold text-stone-600 hover:text-emerald-700 block pt-0.5"
                >
                  View trail details →
                </button>
              </div>
            </Popup>
          </Marker>
          )
        })}

        <FlyToTrail trail={selectedTrail} active={mapActive} />
        <FitBounds trails={mappable} skip={!!selectedTrail} active={mapActive} />
      </MapContainer>
    </div>
  )
}
