import { useState, useMemo, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Map, List } from 'lucide-react'
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
  season?: 'current' | 'last'
  onSeasonChange?: (s: 'current' | 'last') => void
  refreshing?: boolean
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
  season = 'current',
  onSeasonChange,
  refreshing = false,
}: TrailHealthProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTrailId = searchParams.get('trail')

  const [hoveredTrailId, setHoveredTrailId] = useState<string | null>(null)
  const [mapOpen,        setMapOpen]        = useState(false)
  const [mobileView,     setMobileView]     = useState<'list' | 'map'>('list')

  const enriched = useMemo(() => attachGeo(trails), [trails])
  const selectedTrail = enriched.find(t => t.id === selectedTrailId) ?? null

  const handleSelect = (id: string) => {
    setSearchParams({ trail: id })
    onSelectTrail?.(id)
    setHoveredTrailId(null)
    // On mobile: switch to list view so the detail panel becomes visible
    setMobileView('list')
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

        {/* Left panel — full-width on mobile when mobileView='list', hidden otherwise; fixed-width on sm+ */}
        <div className={[
          'shrink-0 overflow-y-auto border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950',
          mobileView === 'list' ? 'flex-1' : 'hidden',
          'sm:flex sm:flex-initial sm:w-[480px] lg:w-[580px] xl:w-[680px]',
        ].join(' ')}>
          {selectedTrail ? (
            <TrailDetail
              trail={selectedTrail}
              isAuthenticated={isAuthenticated}
              onBack={handleBack}
              onSignInPrompt={onSignInPrompt}
              mapOpen={mapOpen}
              onToggleMap={() => setMapOpen(false)}
              season={season}
              onSeasonChange={onSeasonChange}
              refreshing={refreshing}
            />
          ) : (
            <TrailList
              trails={enriched}
              mapOpen={mapOpen}
              onToggleMap={() => setMapOpen(false)}
              onSelectTrail={handleSelect}
              onHoverTrail={setHoveredTrailId}
              season={season}
              onSeasonChange={onSeasonChange}
              refreshing={refreshing}
            />
          )}
        </div>

        {/* Right panel — full-width on mobile when mobileView='map', hidden otherwise; flex-1 on sm+ */}
        <div className={[
          'min-w-0',
          mobileView === 'map' ? 'flex-1 h-full' : 'hidden',
          'sm:flex sm:flex-1',
        ].join(' ')}>
          <Suspense fallback={<div className="h-full flex items-center justify-center bg-stone-100 dark:bg-stone-900 text-sm text-stone-400">Loading map…</div>}>
            <TrailMap
              trails={enriched}
              selectedTrailId={mapFocusId}
              hoveredTrailId={hoveredTrailId}
              onSelectTrail={handleSelect}
            />
          </Suspense>
        </div>

        {/* Floating toggle pill — mobile only (sm:hidden) */}
        <button
          onClick={() => setMobileView(v => v === 'list' ? 'map' : 'list')}
          className="sm:hidden fixed bottom-4 right-4 z-[1000] flex items-center gap-2 px-4 py-2.5 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-semibold shadow-lg shadow-stone-900/30 active:scale-95 transition-transform"
          aria-label={mobileView === 'list' ? 'Show map' : 'Show list'}
        >
          {mobileView === 'list'
            ? <><Map className="w-4 h-4" />Show Map</>
            : <><List className="w-4 h-4" />Show List</>}
        </button>
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
      mapOpen={mapOpen}
      onToggleMap={() => { setMapOpen(true); setMobileView('map') }}
      season={season}
      onSeasonChange={onSeasonChange}
      refreshing={refreshing}
    />
  ) : (
    <TrailList
      trails={enriched}
      mapOpen={mapOpen}
      onToggleMap={() => { setMapOpen(true); setMobileView('map') }}
      onSelectTrail={handleSelect}
      onHoverTrail={setHoveredTrailId}
      season={season}
      onSeasonChange={onSeasonChange}
      refreshing={refreshing}
    />
  )
}
