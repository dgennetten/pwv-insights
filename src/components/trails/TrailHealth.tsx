import { useState, useMemo, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Trail } from '../../types/trails'
import { TrailList } from './TrailList'
import { TrailDetail } from './TrailDetail'
import { trailGeoData } from '../../data/trailGeoData'

// Lazy-load the map (pulls in Leaflet — ~330KB) only when first toggled open
const TrailMap = lazy(() => import('./TrailMap').then(m => ({ default: m.TrailMap })))

interface TrailHealthProps {
  trails: Trail[]
  isAuthenticated?: boolean
  onSelectTrail?: (trailId: string) => void
  onBackToList?: () => void
  onSignInPrompt?: () => void
}

/** Enrich trails with lat/lng from static geo lookup keyed by wksiteId. */
function attachGeo(trails: Trail[]): Trail[] {
  return trails.map(t => {
    if (t.latitude != null || !t.wksiteId) return t
    const geo = trailGeoData[t.wksiteId]
    return geo ? { ...t, latitude: geo.lat, longitude: geo.lng } : t
  })
}

export function TrailHealth({
  trails,
  isAuthenticated = false,
  onSelectTrail,
  onBackToList,
  onSignInPrompt,
}: TrailHealthProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTrailId = searchParams.get('trail')

  const [hoveredTrailId, setHoveredTrailId] = useState<string | null>(null)
  const [mapOpen,        setMapOpen]        = useState(false)

  const enriched = useMemo(() => attachGeo(trails), [trails])
  const selectedTrail = enriched.find(t => t.id === selectedTrailId) ?? null

  const handleSelect = (id: string) => {
    setSearchParams({ trail: id })
    onSelectTrail?.(id)
    // When a trail is selected, clear hover highlight
    setHoveredTrailId(null)
  }

  const handleBack = () => {
    setSearchParams({})
    onBackToList?.()
  }

  // The map always shows the full trail set (filtered in TrailList for the list,
  // but the map shows all mappable trails regardless of list filters).
  // When in detail view, map highlights / zooms to the selected trail.
  const mapFocusId = selectedTrailId ?? hoveredTrailId

  // ── Split layout when map is open ────────────────────────────────────────
  if (mapOpen) {
    return (
      <div className="flex h-screen overflow-hidden">
        {/* Left panel: list or detail */}
        <div className="w-[480px] lg:w-[520px] xl:w-[580px] shrink-0 overflow-y-auto border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950">
          {selectedTrail ? (
            <TrailDetail
              trail={selectedTrail}
              isAuthenticated={isAuthenticated}
              onBack={handleBack}
              onSignInPrompt={onSignInPrompt}
            />
          ) : (
            <TrailList
              trails={enriched}
              mapOpen={mapOpen}
              onToggleMap={() => setMapOpen(false)}
              onSelectTrail={handleSelect}
              onHoverTrail={setHoveredTrailId}
            />
          )}
        </div>

        {/* Right panel: map — lazy loaded */}
        <div className="flex-1 min-w-0">
          <Suspense fallback={<div className="h-full flex items-center justify-center bg-stone-100 dark:bg-stone-900 text-sm text-stone-400">Loading map…</div>}>
            <TrailMap
              trails={enriched}
              selectedTrailId={mapFocusId}
              hoveredTrailId={hoveredTrailId}
              onSelectTrail={handleSelect}
            />
          </Suspense>
        </div>
      </div>
    )
  }

  // ── Normal single-panel layout ────────────────────────────────────────────
  return selectedTrail ? (
    <TrailDetail
      trail={selectedTrail}
      isAuthenticated={isAuthenticated}
      onBack={handleBack}
      onSignInPrompt={onSignInPrompt}
    />
  ) : (
    <TrailList
      trails={enriched}
      mapOpen={mapOpen}
      onToggleMap={() => setMapOpen(true)}
      onSelectTrail={handleSelect}
      onHoverTrail={setHoveredTrailId}
    />
  )
}
