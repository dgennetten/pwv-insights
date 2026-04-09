import type { ViolationCategory } from '../types'

interface ViolationsChartProps {
  data: ViolationCategory[]
}

export function ViolationsChart({ data }: ViolationsChartProps) {
  const max = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="space-y-2.5">
      {data.map(v => (
        <div key={v.category} className="flex items-center gap-3 group">
          {/* Category label */}
          <span className="text-xs text-stone-600 dark:text-stone-400 flex-shrink-0 w-44 truncate" title={v.category}>
            {v.category}
          </span>

          {/* Bar track */}
          <div className="flex-1 h-4 bg-stone-100 dark:bg-stone-800 rounded-sm overflow-hidden">
            <div
              className="h-full bg-amber-400 dark:bg-amber-500 rounded-sm group-hover:bg-amber-500 dark:group-hover:bg-amber-400 transition-all duration-300"
              style={{ width: `${(v.count / max) * 100}%` }}
            />
          </div>

          {/* Count */}
          <span className="text-xs font-medium tabular-nums text-stone-700 dark:text-stone-300 w-4 text-right shrink-0">
            {v.count}
          </span>
        </div>
      ))}
    </div>
  )
}
