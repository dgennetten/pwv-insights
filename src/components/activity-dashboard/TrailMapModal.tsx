import { Suspense, lazy, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { trailGeoData, trailNames } from '../../data/trailGeoData'
import type { Trail } from '../../types/trails'

const TrailMap = lazy(() => import('../trails/TrailMap').then(m => ({ default: m.TrailMap })))

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

interface Props {
  trailName: string
  trailNumber: string
  onClose: () => void
}

export function TrailMapModal({ trailName, trailNumber, onClose }: Props) {
  const navigate = useNavigate()
  const trail = useMemo<Trail | null>(() => {
    const target = normalizeName(trailName)
    const entry = Object.entries(trailNames).find(([, name]) => normalizeName(name) === target)
    if (!entry) return null
    const wksiteId = Number(entry[0])
    const geo = trailGeoData[wksiteId]
    return {
      id: `w${wksiteId}`,
      wksiteId,
      name: trailName,
      trailNumber: parseInt(trailNumber) || 0,
      lengthMiles: 0,
      area: '',
      difficulty: 'moderate',
      wilderness: false,
      patrolCount: 0,
      patrolFrequency: 0,
      hikersSeen: 0,
      hikersContacted: 0,
      efficiencyScore: null,
      underPatrolled: false,
      patrolHistory: [],
      treesDown: { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 },
      treesCleared: { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 },
      violationsByCategory: [],
      maintenanceWork: [],
      latitude: geo?.lat,
      longitude: geo?.lng,
    }
  }, [trailName, trailNumber])

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-stone-900 rounded-2xl shadow-xl flex flex-col overflow-hidden"
           style={{ height: '70vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{trailName}</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {trail ? (
            <Suspense fallback={
              <div className="h-full flex items-center justify-center text-sm text-stone-400">Loading map…</div>
            }>
              <TrailMap
                trails={[trail]}
                selectedTrailId={trail.id}
                mapActive={true}
                onSelectTrail={(id) => { onClose(); navigate(`/trails?trail=${id}`) }}
              />
            </Suspense>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-stone-400">
              Trail location not available
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
