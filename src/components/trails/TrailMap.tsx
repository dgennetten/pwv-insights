import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import { Icon, latLngBounds } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Trail } from '../../types/trails'

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

function FlyToTrail({ trail }: { trail: Trail | null }) {
  const map = useMap()
  useEffect(() => {
    if (trail?.latitude && trail?.longitude) {
      map.flyTo([trail.latitude, trail.longitude], 14, { duration: 1.2, easeLinearity: 0.3 })
    }
  }, [trail, map])
  return null
}

function FitBounds({ trails }: { trails: Trail[] }) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current || trails.length === 0) return
    const withGeo = trails.filter(t => t.latitude && t.longitude)
    if (withGeo.length === 0) return
    const bounds = latLngBounds(withGeo.map(t => [t.latitude!, t.longitude!]))
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13, duration: 0.5 })
    fitted.current = true
  }, [trails, map])

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
}

export function TrailMap({ trails, selectedTrailId, hoveredTrailId, onSelectTrail }: TrailMapProps) {
  const mappable = useMemo(
    () => trails.filter(t => t.latitude != null && t.longitude != null),
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

        {mappable.map(trail => (
          <Marker
            key={trail.id}
            position={[trail.latitude!, trail.longitude!]}
            icon={getIcon(trail)}
            eventHandlers={{ click: () => onSelectTrail?.(trail.id) }}
          >
            <Tooltip direction="top" sticky offset={[0, -30]}>
              <div className="text-sm leading-snug min-w-[160px]">
                <div className="font-semibold text-stone-900">{trail.name}</div>
                {trail.trailNumber > 0 && (
                  <div className="text-xs text-stone-500">Trail #{trail.trailNumber}</div>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${trail.latitude},${trail.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-600 hover:underline mt-1 block"
                  onClick={e => e.stopPropagation()}
                >
                  Driving directions →
                </a>
              </div>
            </Tooltip>
          </Marker>
        ))}

        <FlyToTrail trail={selectedTrail} />
        <FitBounds trails={mappable} />
      </MapContainer>
    </div>
  )
}
