import { useState, useMemo } from 'react'
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  AlertTriangle, Leaf, SlidersHorizontal, Search,
  TreePine, Clock, Map, Loader2,
} from 'lucide-react'
import type { Trail, Difficulty } from '../../types/trails'

type SortKey = 'name' | 'efficiencyScore' | 'patrolCount' | 'lastPatrolled'
type SortDir = 'asc' | 'desc'

const AREAS = [
  'Lower Poudre Canyon',
  'Upper Poudre Canyon',
  'Big Thompson/Estes Park',
  'Pingree Park',
  'Red Feather Lakes',
  'Rawah Wilderness',
  'Pawnee Buttes',
]
const DIFFICULTIES: Difficulty[] = ['easy', 'moderate', 'hard']

function getLastPatrolDate(trail: Trail): string | null {
  return trail.patrolHistory[0]?.date ?? null
}

function getDaysSincePatrol(trail: Trail): number | null {
  const last = getLastPatrolDate(trail)
  if (!last) return null
  return Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000)
}

function getTreesOutstanding(trail: Trail): number {
  const keys = ['small', 'medium', 'large', 'xl', 'xxl'] as const
  return keys.reduce((s, k) => s + Math.max(0, trail.treesDown[k] - trail.treesCleared[k]), 0)
}

function formatLastPatrol(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EfficiencyBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold text-stone-300 dark:text-stone-600">—</span>
  }
  const cls =
    score >= 75 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    : score >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${cls}`}>{score}</span>
}


function SortButton({ sortKey, currentKey, currentDir, onSort, children }: {
  sortKey: SortKey; currentKey: SortKey; currentDir: SortDir
  onSort: (k: SortKey) => void; children: React.ReactNode
}) {
  const active = sortKey === currentKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
        active ? 'text-stone-800 dark:text-stone-200'
               : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'
      }`}
    >
      {children}
      {active
        ? currentDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
        : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
    </button>
  )
}

function ToggleFilter({ active, onClick, icon, label, activeClass }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; activeClass: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg font-medium border transition-colors ${
        active ? activeClass
               : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700'
      }`}
    >
      {icon}{label}
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface TrailListProps {
  trails: Trail[]
  mapOpen: boolean
  onToggleMap: () => void
  onSelectTrail?: (id: string) => void
  onHoverTrail?: (id: string | null) => void
  season?: 'current' | 'last'
  onSeasonChange?: (s: 'current' | 'last') => void
  refreshing?: boolean
}

export function TrailList({ trails, mapOpen, onToggleMap, onSelectTrail, onHoverTrail, season = 'current', onSeasonChange, refreshing = false }: TrailListProps) {
  const [search,              setSearch]              = useState('')
  const [filterArea,          setFilterArea]          = useState<string>('all')
  const [filterDifficulty,    setFilterDifficulty]    = useState<string>('all')
  const [filterWilderness,    setFilterWilderness]    = useState(false)
  const [filterUnderPatrolled,setFilterUnderPatrolled]= useState(false)
  const [sortKey,             setSortKey]             = useState<SortKey>('name')
  const [sortDir,             setSortDir]             = useState<SortDir>('asc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(p => p === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'lastPatrolled' ? 'asc' : 'desc')
    }
  }

  const filtered = useMemo(() => {
    let r = [...trails]
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(t => t.name.toLowerCase().includes(q) || String(t.trailNumber).includes(q))
    }
    if (filterArea !== 'all')     r = r.filter(t => t.area === filterArea)
    if (filterDifficulty !== 'all') r = r.filter(t => t.difficulty === filterDifficulty)
    if (filterWilderness)         r = r.filter(t => t.wilderness)
    if (filterUnderPatrolled)     r = r.filter(t => t.underPatrolled)
    r.sort((a, b) => {
      if (sortKey === 'name') {
        const d = a.name.localeCompare(b.name)
        return sortDir === 'asc' ? d : -d
      }
      if (sortKey === 'lastPatrolled') {
        const ad = getLastPatrolDate(a) ?? '0000-00-00'
        const bd = getLastPatrolDate(b) ?? '0000-00-00'
        const d = ad < bd ? -1 : ad > bd ? 1 : 0
        return sortDir === 'desc' ? -d : d
      }
      const av = a[sortKey] ?? -1
      const bv = b[sortKey] ?? -1
      const d = av - bv
      return sortDir === 'desc' ? -d : d
    })
    return r
  }, [trails, search, filterArea, filterDifficulty, filterWilderness, filterUnderPatrolled, sortKey, sortDir])

  const underPatrolledCount = trails.filter(t => t.underPatrolled).length

  return (
    <div className="flex flex-col h-full bg-stone-50 dark:bg-stone-950">

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="shrink-0 sticky top-0 z-10 bg-stone-50 dark:bg-stone-950 px-4 md:px-6 lg:px-8 pt-4 md:pt-6 pb-3 shadow-[0_1px_0_0] shadow-stone-200 dark:shadow-stone-800">

        <div className="mb-3">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100 shrink-0">Trails</h2>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-1">
                  {(['current', 'last'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => !refreshing && onSeasonChange?.(s)}
                      disabled={refreshing}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors disabled:opacity-60 ${
                        season === s
                          ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
                          : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700'
                      }`}
                    >
                      {s === 'current' ? 'Season to Date' : 'Last Season'}
                    </button>
                  ))}
                </div>
                {refreshing && <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin shrink-0" />}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {underPatrolledCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  {underPatrolledCount} under-patrolled
                </span>
              )}

              {/* ── Map toggle button ────────────────────────────── */}
              <button
                onClick={onToggleMap}
                title={mapOpen ? 'Close map' : 'Show map'}
                aria-label={mapOpen ? 'Close trail map' : 'Show trail map'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  mapOpen
                    ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500 shadow-sm'
                    : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                }`}
              >
                <Map className="w-3.5 h-3.5" />
                Map
              </button>
            </div>
          </div>

          <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">
            {filtered.length === trails.length
              ? `${trails.length} trails`
              : `${filtered.length} of ${trails.length} trails`}
          </p>
        </div>

        {/* Search + filters */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl px-3 py-2.5 space-y-2">
          <div className="flex flex-row gap-2 items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name or trail #…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-700 dark:text-stone-300 placeholder:text-stone-400 outline-none focus:border-emerald-400 transition-colors"
              />
            </div>
            <select
              value={filterArea}
              onChange={e => setFilterArea(e.target.value)}
              aria-label="Filter by area"
              className="shrink-0 w-[min(100%,11rem)] sm:w-44 text-xs bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-700 dark:text-stone-300 outline-none focus:border-emerald-400 transition-colors"
            >
              <option value="all">All Areas</option>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <div className="flex gap-1">
              {(['all', ...DIFFICULTIES] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setFilterDifficulty(d)}
                  className={`px-2.5 py-1 text-xs rounded-lg capitalize font-medium transition-colors ${
                    filterDifficulty === d
                      ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
                      : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700'
                  }`}
                >
                  {d === 'all' ? 'All' : d}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-0.5 hidden sm:block" />
            <ToggleFilter
              active={filterWilderness}
              onClick={() => setFilterWilderness(p => !p)}
              icon={<Leaf className="w-3 h-3" />}
              label="Wilderness"
              activeClass="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700"
            />
            <ToggleFilter
              active={filterUnderPatrolled}
              onClick={() => setFilterUnderPatrolled(p => !p)}
              icon={<AlertTriangle className="w-3 h-3" />}
              label="Under-patrolled"
              activeClass="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
            />
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col px-4 md:px-6 lg:px-8 pt-4 pb-6 gap-3">
        <div className="flex-1 min-h-0 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
          <div className="h-full overflow-x-auto overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900">
                <tr className="border-b border-stone-100 dark:border-stone-800">
                  <th className="px-4 py-3 text-left">
                    <div className="flex items-center gap-2">
                      <SortButton sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>Trail</SortButton>
                      <span className="text-xs font-normal text-stone-400 normal-case tracking-normal hidden sm:inline">— Click Row for Details</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">Area</span>
                  </th>

                  <th className="px-4 py-3 text-right">
                    <SortButton sortKey="patrolCount" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>Patrols</SortButton>
                  </th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">
                    <SortButton sortKey="lastPatrolled" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>Last Patrol</SortButton>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <SortButton sortKey="efficiencyScore" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>Score</SortButton>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {filtered.map(trail => {
                  const treesOut = getTreesOutstanding(trail)
                  const days     = getDaysSincePatrol(trail)
                  const lastDate = getLastPatrolDate(trail)
                  const isStale  = days !== null && days > 30

                  return (
                    <tr
                      key={trail.id}
                      onClick={() => onSelectTrail?.(trail.id)}
                      onMouseEnter={() => onHoverTrail?.(trail.id)}
                      onMouseLeave={() => onHoverTrail?.(null)}
                      className={`cursor-pointer transition-colors group ${
                        trail.underPatrolled
                          ? 'hover:bg-amber-50/60 dark:hover:bg-amber-900/10'
                          : 'hover:bg-stone-50 dark:hover:bg-stone-800/60'
                      }`}
                    >
                      {/* Trail name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-stone-900 dark:text-stone-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                            {trail.name}
                          </span>
                          {trail.wilderness && (
                            <span title="Wilderness"><Leaf className="w-3 h-3 text-emerald-500 shrink-0" /></span>
                          )}
                          {trail.underPatrolled && (
                            <span title="Under-patrolled"><AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" /></span>
                          )}
                          {treesOut > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 px-1.5 py-0.5 rounded shrink-0"
                              title={`${treesOut} uncleared tree${treesOut > 1 ? 's' : ''}`}
                            >
                              <TreePine className="w-2.5 h-2.5" />{treesOut}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                          {trail.trailNumber > 0 ? `#${trail.trailNumber} · ` : ''}{trail.lengthMiles} mi
                        </div>
                      </td>

                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-stone-500 dark:text-stone-400">{trail.area}</span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold tabular-nums text-stone-800 dark:text-stone-200">
                          {trail.patrolCount}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {lastDate ? (
                          <div>
                            <span className={`text-xs tabular-nums ${isStale ? 'text-red-500 font-medium' : 'text-stone-500'}`}>
                              {formatLastPatrol(lastDate)}
                            </span>
                            {isStale && days != null && (
                              <div className="flex items-center justify-end gap-0.5 mt-0.5 text-red-400">
                                <Clock className="w-2.5 h-2.5" />
                                <span className="text-xs tabular-nums">{days}d ago</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-stone-400">Never</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <EfficiencyBadge score={trail.efficiencyScore} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-sm text-stone-400 dark:text-stone-500">No trails match the current filters.</p>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="shrink-0 flex flex-wrap items-center gap-4 text-xs text-stone-400 dark:text-stone-500">
          <span className="flex items-center gap-1"><Leaf className="w-3 h-3 text-emerald-500" /> Wilderness</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> Needs more coverage</span>
          <span className="flex items-center gap-1"><TreePine className="w-3 h-3 text-orange-500" /> Uncleared trees</span>
          <span className="flex items-center gap-1">
            Contact score: <span className="font-semibold text-emerald-600">75+</span> good ·
            <span className="font-semibold text-amber-600">50–74</span> fair ·
            <span className="font-semibold text-red-500">&lt;50</span> low ·
            <span className="font-semibold text-stone-400">—</span> no parking data
          </span>
        </div>
      </div>
    </div>
  )
}
