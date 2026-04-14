import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, TreePine } from 'lucide-react'
import type { TrailCoverageRow, TrailCoverageSortKey } from '../../types/activity-dashboard'
import type { TrailDetailPrefs } from '../../types/settings'
import { formatInteger } from '../../lib/formatNumber'

const DEFAULT_PAGE_SIZE = 50

interface TrailCoverageListProps {
  data: TrailCoverageRow[]
  pageSize?: number
  trailDetailPrefs?: TrailDetailPrefs
  onTrailSelect?: (trailId: number) => void
  onSortChange?: (key: TrailCoverageSortKey, direction: 'asc' | 'desc') => void
}

type SortDir = 'asc' | 'desc'

interface SortState {
  key: TrailCoverageSortKey
  dir: SortDir
}

function SortIcon({ col, sort }: { col: TrailCoverageSortKey; sort: SortState }) {
  if (sort.key !== col) return <ChevronsUpDown className="w-3 h-3 text-stone-300 dark:text-stone-600" strokeWidth={2} />
  return sort.dir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
    : <ChevronDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
}

export function TrailCoverageList({
  data,
  pageSize: pageSizeProp = DEFAULT_PAGE_SIZE,
  trailDetailPrefs,
  onTrailSelect,
  onSortChange,
}: TrailCoverageListProps) {
  const showEfficiency = trailDetailPrefs?.patrolEfficiency ?? false
  const pageSize = Math.max(1, pageSizeProp)
  const [sort, setSort] = useState<SortState>({ key: 'patrols', dir: 'desc' })
  const [loadedCount, setLoadedCount] = useState(() => Math.min(pageSize, data.length))
  const [scrollEndReached, setScrollEndReached] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      let aVal: string | number
      let bVal: string | number
      switch (sort.key) {
        case 'trailName':        aVal = a.trailName; bVal = b.trailName; break
        case 'patrols':          aVal = a.patrols; bVal = b.patrols; break
        case 'hikersSeen':       aVal = a.hikersSeen; bVal = b.hikersSeen; break
        case 'patrolEfficiency': aVal = a.patrols > 0 ? a.hikersSeen / a.patrols : -1; bVal = b.patrols > 0 ? b.hikersSeen / b.patrols : -1; break
      }
      const cmp = typeof aVal === 'string'
        ? aVal.localeCompare(bVal as string)
        : (aVal as number) - (bVal as number)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [data, sort])

  const total = sorted.length
  const visible = sorted.slice(0, loadedCount)
  const hasMore = loadedCount < total

  useEffect(() => {
    setLoadedCount(Math.min(pageSize, sorted.length))
    setScrollEndReached(false)
  }, [data, pageSize, sort.key, sort.dir, sorted.length])

  const handleSort = (key: TrailCoverageSortKey) => {
    const newDir: SortDir = sort.key === key && sort.dir === 'desc' ? 'asc' : 'desc'
    setSort({ key, dir: newDir })
    onSortChange?.(key, newDir)
  }

  const handleLoadMore = useCallback(() => {
    setLoadedCount(c => Math.min(c + pageSize, total))
    setScrollEndReached(false)
  }, [pageSize, total])

  useEffect(() => {
    if (!hasMore) {
      setScrollEndReached(prev => (prev ? false : prev))
      return
    }
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => { setScrollEndReached(entry.isIntersecting) },
      { root, rootMargin: '0px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadedCount, visible.length])

  const showLoadMore = scrollEndReached && hasMore

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
        {total === 0
          ? 'No trails in this scope'
          : `Showing ${formatInteger(Math.min(loadedCount, total))} of ${formatInteger(total)} trail${total === 1 ? '' : 's'}`}
      </p>

      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-auto -mx-1 max-h-[min(50vh,22rem)] rounded-lg border border-stone-100 dark:border-stone-800"
      >
        <table className="w-full text-xs min-w-[400px]">
          <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900">
            <tr className="border-b border-stone-200 dark:border-stone-700">
              <th className="text-left pb-2 pt-2 px-1">
                <button type="button" onClick={() => handleSort('trailName')} className="flex items-center gap-1 text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 uppercase tracking-wider font-semibold">
                  Trail <SortIcon col="trailName" sort={sort} />
                </button>
              </th>
              <th className="text-right pb-2 pt-2 px-1">
                <button type="button" onClick={() => handleSort('patrols')} className="flex items-center gap-1 ml-auto text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 uppercase tracking-wider font-semibold">
                  Patrols <SortIcon col="patrols" sort={sort} />
                </button>
              </th>
              <th className="text-right pb-2 pt-2 px-1 hidden md:table-cell">
                <button type="button" onClick={() => handleSort('hikersSeen')} className="flex items-center gap-1 ml-auto text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 uppercase tracking-wider font-semibold">
                  Seen <SortIcon col="hikersSeen" sort={sort} />
                </button>
              </th>
              {showEfficiency && (
                <th className="text-right pb-2 pt-2 px-1 hidden md:table-cell">
                  <button type="button" onClick={() => handleSort('patrolEfficiency')} className="flex items-center gap-1 ml-auto text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 uppercase tracking-wider font-semibold">
                    Contact Efficiency <SortIcon col="patrolEfficiency" sort={sort} />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {visible.map(trail => {
              const efficiency = trail.patrols > 0 ? trail.hikersSeen / trail.patrols : null
              return (
                <tr
                  key={trail.trailId}
                  onClick={() => onTrailSelect?.(trail.trailId)}
                  className={`cursor-pointer transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50 ${trail.patrols === 0 ? 'opacity-60' : ''}`}
                >
                  <td className="py-2 px-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {trail.patrols === 0 && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" strokeWidth={2} />}
                      <span className="font-medium text-stone-800 dark:text-stone-200 truncate">{trail.trailName}</span>
                      {trail.inWilderness && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          <TreePine className="w-2.5 h-2.5" strokeWidth={2} />
                          WLD
                        </span>
                      )}
                    </div>
                    <div className="text-stone-400 dark:text-stone-500 mt-0.5">#{trail.trailNumber} · {trail.lengthMiles} mi</div>
                  </td>
                  <td className="py-2 px-1 text-right">
                    <span className={`font-semibold tabular-nums ${trail.patrols > 0 ? 'text-stone-800 dark:text-stone-200' : 'text-stone-400 dark:text-stone-600'}`}>
                      {formatInteger(trail.patrols)}
                    </span>
                  </td>
                  <td className="py-2 px-1 text-right hidden md:table-cell">
                    <span className="tabular-nums text-stone-600 dark:text-stone-400">{formatInteger(trail.hikersSeen)}</span>
                  </td>
                  {showEfficiency && (
                    <td className="py-2 px-1 text-right hidden md:table-cell">
                      <span className="tabular-nums text-stone-600 dark:text-stone-400">
                        {efficiency != null ? efficiency.toFixed(1) : '—'}
                      </span>
                    </td>
                  )}
                </tr>
              )
            })}
            {hasMore && (
              <tr aria-hidden>
                <td colSpan={showEfficiency ? 4 : 3} className="p-0 border-0">
                  <div ref={sentinelRef} className="h-1 w-full" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showLoadMore && (
        <div className="flex flex-col items-center gap-1 pt-1">
          <button type="button" onClick={handleLoadMore} className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 underline-offset-2 hover:underline">
            Load more ({formatInteger(Math.min(pageSize, total - loadedCount))} more)
          </button>
          <span className="text-[10px] text-stone-400 dark:text-stone-500 tabular-nums">
            {formatInteger(total - loadedCount)} trail{(total - loadedCount) === 1 ? '' : 's'} not shown yet
          </span>
        </div>
      )}
    </div>
  )
}
