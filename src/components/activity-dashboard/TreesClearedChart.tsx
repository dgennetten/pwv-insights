import { useState } from 'react'
import type { TreesCleared, TreeSizeClass } from '../../types/activity-dashboard'
import {
  formatTreesCleared,
  formatTreesClearedWhole,
  roundTreesCleared,
  roundWholeTreesCleared,
} from './formatTreesCleared'

interface TreesClearedChartProps {
  data: TreesCleared
  /** When true (member scope), counts may be fractional — format labels and tooltips accordingly. */
  memberScoped?: boolean
}

type TreeView = 'aggregate' | 'byTrail'

const SIZE_CLASS_COLORS: Record<TreeSizeClass, { bar: string; label: string; dot: string }> = {
  '< 8"':     { bar: 'bg-emerald-300 dark:bg-emerald-700', label: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-300' },
  '8" – 15"': { bar: 'bg-emerald-400 dark:bg-emerald-600', label: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-400' },
  '16" – 23"':{ bar: 'bg-emerald-500 dark:bg-emerald-500', label: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  '24" – 36"':{ bar: 'bg-emerald-600 dark:bg-emerald-400', label: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-600' },
  '> 36"':    { bar: 'bg-emerald-800 dark:bg-emerald-300', label: 'text-emerald-800 dark:text-emerald-200', dot: 'bg-emerald-800' },
}

/** lu_trail_clearing tree lines (TrailClearingID 1–5) mapped to diameter-class labels; counts are NumCleared trees. */
const SIZE_CLASS_RANGE: Record<TreeSizeClass, string> = {
  '< 8"':     'Category: small (under 8″ class)',
  '8" – 15"': 'Category: medium (8–15″ class)',
  '16" – 23"': 'Category: large (16–23″ class)',
  '24" – 36"': 'Category: XL (24–36″ class)',
  '> 36"':    'Category: XXL (over 36″ class)',
}

function formatTreeCount(count: number, memberScoped: boolean): string {
  return memberScoped ? formatTreesCleared(Number(count)) : formatTreesClearedWhole(Number(count))
}

function sizeClassTooltip(sizeClass: TreeSizeClass, count: number, memberScoped: boolean): string {
  const label = formatTreeCount(count, memberScoped)
  const rounded = memberScoped ? roundTreesCleared(Number(count)) : roundWholeTreesCleared(Number(count))
  const unit = Math.abs(rounded - 1) < 1e-6 ? 'tree' : 'trees'
  const share = memberScoped ? ' (your share)' : ''
  return `${SIZE_CLASS_RANGE[sizeClass]} · ${label} ${unit}${share}`
}

const EPS = 1e-9

function colorForSizeClass(sizeClass: string): (typeof SIZE_CLASS_COLORS)[TreeSizeClass] {
  return SIZE_CLASS_COLORS[sizeClass as TreeSizeClass] ?? SIZE_CLASS_COLORS['< 8"']
}

const CHART_HEIGHT = 120

export function TreesClearedChart({ data, memberScoped = false }: TreesClearedChartProps) {
  const [view, setView] = useState<TreeView>('aggregate')

  const aggNumeric = data.aggregate.map(a =>
    memberScoped ? roundTreesCleared(Number(a.count)) : roundWholeTreesCleared(Number(a.count))
  )
  const maxAgg = Math.max(...aggNumeric, 1)

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex items-center gap-2">
        <div className="flex bg-stone-100 dark:bg-stone-800 rounded-md p-0.5 text-xs">
          <button
            onClick={() => setView('aggregate')}
            className={`px-3 py-1 rounded transition-colors ${
              view === 'aggregate'
                ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm font-medium'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            All Trails
          </button>
          <button
            onClick={() => setView('byTrail')}
            className={`px-3 py-1 rounded transition-colors ${
              view === 'byTrail'
                ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm font-medium'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            By Trail
          </button>
        </div>
      </div>

      {view === 'aggregate' ? (
        <>
          {/* Aggregate bar chart */}
          <div className="flex items-end gap-4" style={{ height: CHART_HEIGHT + 'px' }}>
            {data.aggregate.map((item, i) => {
              const c = aggNumeric[i] ?? 0
              const colors = colorForSizeClass(item.sizeClass)
              const heightPct = c <= EPS ? 0 : Math.max((c / maxAgg) * 100, 4)
              const label = formatTreeCount(c, memberScoped)
              return (
                <div
                  key={item.sizeClass}
                  className="flex-1 flex flex-col items-center justify-end gap-1.5 group h-full min-w-0"
                  title={sizeClassTooltip(item.sizeClass as TreeSizeClass, c, memberScoped)}
                >
                  <span className={`text-xs font-medium tabular-nums ${c > EPS ? colors.label : 'opacity-0'}`}>
                    {label}
                  </span>
                  <div
                    className={`w-full rounded-t-sm ${colors.bar} transition-opacity group-hover:opacity-80 cursor-default`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              )
            })}
          </div>

          {/* Size class labels */}
          <div className="flex gap-4">
            {data.aggregate.map(item => {
              const colors = colorForSizeClass(item.sizeClass)
              const shortLabel = item.label.split('\n')[0]
              return (
                <div key={item.sizeClass} className="flex-1 text-center">
                  <span className={`text-[10px] ${colors.label}`}>{shortLabel}</span>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        /* By-trail view */
        <div className="space-y-3">
          {data.byTrail.length === 0 ? (
            <p className="text-xs text-stone-400 dark:text-stone-500 text-center py-4">No trees cleared in this scope</p>
          ) : (
            <>
              {data.byTrail.map((trail, idx) => {
                const rowTotalApi = memberScoped
                  ? roundTreesCleared(Number(trail.total))
                  : roundWholeTreesCleared(Number(trail.total))

                const segments = trail.trees.map(t => ({
                  sizeClass: t.sizeClass,
                  n: memberScoped
                    ? roundTreesCleared(Number(t.count))
                    : roundWholeTreesCleared(Number(t.count)),
                }))
                const visible = segments.filter(t => Number.isFinite(t.n) && t.n > EPS)
                const sumVisible = visible.reduce((a, t) => a + t.n, 0)

                /** Bar uses sum of displayed buckets so widths total 100%; label matches the bar. */
                const barBasis = sumVisible > EPS ? sumVisible : rowTotalApi
                const denom = barBasis > EPS ? barBasis : EPS
                const totalLabel = sumVisible > EPS ? sumVisible : rowTotalApi

                const rowKey = `${trail.trailName}\0${trail.trailNumber}\0${idx}`
                return (
                  <div key={rowKey} className="flex items-center gap-3 group min-w-0">
                    <div className="w-32 shrink-0 min-w-0">
                      <div className="text-xs font-medium text-stone-700 dark:text-stone-300 truncate">{trail.trailName}</div>
                      <div className="text-[10px] text-stone-400 dark:text-stone-500">#{trail.trailNumber}</div>
                    </div>

                    {/* Segmented bar — mix among buckets with positive display counts (denom = their sum). */}
                    <div className="flex-1 min-w-0 h-5 flex rounded-sm overflow-hidden bg-stone-100 dark:bg-stone-800">
                      {visible.length > 0 ? (
                        visible.map((t, segIdx) => {
                          const colors = colorForSizeClass(t.sizeClass)
                          const widthPct = (t.n / denom) * 100
                          return (
                            <div
                              key={`${idx}-${segIdx}-${t.sizeClass}`}
                              className={`${colors.bar} transition-opacity group-hover:opacity-90 cursor-default min-w-0`}
                              style={{ width: `${widthPct}%` }}
                              title={sizeClassTooltip(t.sizeClass as TreeSizeClass, t.n, memberScoped)}
                            />
                          )
                        })
                      ) : rowTotalApi > EPS ? (
                        <div
                          className="w-full h-full bg-stone-300 dark:bg-stone-600 cursor-default"
                          title={
                            memberScoped
                              ? `Total ${formatTreeCount(rowTotalApi, memberScoped)} trees (share); per–size-class values round to zero at this precision.`
                              : `Total ${formatTreeCount(rowTotalApi, memberScoped)} trees; each size class rounds to zero for whole-tree display.`
                          }
                        />
                      ) : null}
                    </div>

                    <span className="text-xs font-medium tabular-nums text-stone-600 dark:text-stone-400 min-w-[2.25rem] text-right shrink-0">
                      {formatTreeCount(totalLabel, memberScoped)}
                    </span>
                  </div>
                )
              })}

              {/* Legend */}
              <div className="flex flex-wrap gap-3 pt-1">
                {(Object.entries(SIZE_CLASS_COLORS) as [TreeSizeClass, typeof SIZE_CLASS_COLORS[TreeSizeClass]][]).map(([cls, colors]) => (
                  <div key={cls} className="flex items-center gap-1">
                    <div className={`w-2.5 h-2.5 rounded-sm ${colors.dot}`} />
                    <span className="text-[10px] text-stone-500 dark:text-stone-400">{cls}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
