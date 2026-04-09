import { useState } from 'react'
import type { TreesCleared, TreeSizeClass } from '../types'

interface TreesClearedChartProps {
  data: TreesCleared
}

type TreeView = 'aggregate' | 'byTrail'

const SIZE_CLASS_COLORS: Record<TreeSizeClass, { bar: string; label: string; dot: string }> = {
  '< 8"':     { bar: 'bg-stone-300 dark:bg-stone-600',    label: 'text-stone-500 dark:text-stone-400',   dot: 'bg-stone-300' },
  '8" – 15"': { bar: 'bg-emerald-300 dark:bg-emerald-700', label: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-300' },
  '16" – 23"':{ bar: 'bg-emerald-500 dark:bg-emerald-500', label: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  '24" – 36"':{ bar: 'bg-emerald-600 dark:bg-emerald-400', label: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-600' },
  '> 36"':    { bar: 'bg-emerald-800 dark:bg-emerald-300', label: 'text-emerald-800 dark:text-emerald-200', dot: 'bg-emerald-800' },
}

const CHART_HEIGHT = 120

export function TreesClearedChart({ data }: TreesClearedChartProps) {
  const [view, setView] = useState<TreeView>('aggregate')

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
            {data.aggregate.map(item => {
              const colors = SIZE_CLASS_COLORS[item.sizeClass as TreeSizeClass]
              const maxCount = Math.max(...data.aggregate.map(a => a.count), 1)
              const heightPct = item.count === 0 ? 0 : Math.max((item.count / maxCount) * 100, 4)
              return (
                <div key={item.sizeClass} className="flex-1 flex flex-col items-center justify-end gap-1.5 group h-full">
                  <span className={`text-xs font-medium tabular-nums ${item.count > 0 ? colors.label : 'opacity-0'}`}>
                    {item.count}
                  </span>
                  <div
                    className={`w-full rounded-t-sm ${colors.bar} transition-opacity group-hover:opacity-80`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              )
            })}
          </div>

          {/* Size class labels */}
          <div className="flex gap-4">
            {data.aggregate.map(item => {
              const colors = SIZE_CLASS_COLORS[item.sizeClass as TreeSizeClass]
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
          {data.byTrail.map(trail => {
            const totalMax = Math.max(...data.byTrail.map(t => t.total), 1)
            return (
              <div key={trail.trailName} className="flex items-center gap-3 group">
                <div className="w-32 shrink-0">
                  <div className="text-xs font-medium text-stone-700 dark:text-stone-300 truncate">{trail.trailName}</div>
                  <div className="text-[10px] text-stone-400 dark:text-stone-500">#{trail.trailNumber}</div>
                </div>

                {/* Segmented bar */}
                <div className="flex-1 h-5 flex rounded-sm overflow-hidden bg-stone-100 dark:bg-stone-800">
                  {trail.trees.filter(t => t.count > 0).map(t => {
                    const colors = SIZE_CLASS_COLORS[t.sizeClass as TreeSizeClass]
                    const widthPct = (t.count / totalMax) * 100
                    return (
                      <div
                        key={t.sizeClass}
                        className={`${colors.bar} transition-opacity group-hover:opacity-90`}
                        style={{ width: `${widthPct}%` }}
                        title={`${t.sizeClass}: ${t.count}`}
                      />
                    )
                  })}
                </div>

                <span className="text-xs font-medium tabular-nums text-stone-600 dark:text-stone-400 w-8 text-right shrink-0">
                  {trail.total}
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
        </div>
      )}
    </div>
  )
}
