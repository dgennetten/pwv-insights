import { useState } from 'react'
import type { ViolationCategory } from '../../types/activity-dashboard'
import { formatInteger } from '../../lib/formatNumber'

const PAGE_SIZE = 7

interface ViolationsChartProps {
  data: ViolationCategory[]
}

/** Match lu_viol_type labels like "Littering along Trail or in Campsite" */
function isHiddenViolationCategory(category: string): boolean {
  return category.trim().toLowerCase().includes('littering along trail')
}

export function ViolationsChart({ data }: ViolationsChartProps) {
  const [showAll, setShowAll] = useState(false)
  const visible = data.filter(v => !isHiddenViolationCategory(v.category))
  const max = Math.max(...visible.map(d => d.count), 1)
  const displayed = showAll ? visible : visible.slice(0, PAGE_SIZE)
  const hasMore = visible.length > PAGE_SIZE

  return (
    <div>
      <div className="space-y-2.5">
        {displayed.map(v => (
          <div key={v.category} className="flex items-center gap-3 group">
            <span className="text-xs text-stone-600 dark:text-stone-400 flex-shrink-0 w-44 truncate" title={v.category}>
              {v.category}
            </span>
            <div className="flex-1 h-4 bg-stone-100 dark:bg-stone-800 rounded-sm overflow-hidden">
              <div
                className="h-full bg-amber-400 dark:bg-amber-500 rounded-sm group-hover:bg-amber-500 dark:group-hover:bg-amber-400 transition-all duration-300"
                style={{ width: `${(v.count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums text-stone-700 dark:text-stone-300 min-w-[2rem] text-right shrink-0">
              {formatInteger(v.count)}
            </span>
          </div>
        ))}
      </div>
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          Load more ({visible.length - PAGE_SIZE} more)
        </button>
      )}
    </div>
  )
}
