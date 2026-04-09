import type { MemberAgeGroup } from '../../types/activity-dashboard'

interface MembersByAgeChartProps {
  data: MemberAgeGroup[]
  activeLabel: string
}

const CHART_HEIGHT = 120

export function MembersByAgeChart({ data, activeLabel }: MembersByAgeChartProps) {
  const maxTotal = Math.max(...data.map(b => b.active + b.inactive), 1)

  return (
    <div className="space-y-2">
      {/* Grid + bars */}
      <div className="relative" style={{ height: CHART_HEIGHT + 'px' }}>
        {/* Horizontal grid lines */}
        {[0, 25, 50, 75, 100].map(pct => (
          <div
            key={pct}
            className="absolute left-0 right-0 border-t border-stone-100 dark:border-stone-800"
            style={{ bottom: `${pct}%` }}
          />
        ))}

        {/* Bars */}
        <div className="absolute inset-0 flex items-end gap-2 px-0.5">
          {data.map(bin => {
            const total = bin.active + bin.inactive
            const totalPct = (total / maxTotal) * 100
            const activePct = total > 0 ? (bin.active / total) * 100 : 0
            const inactivePct = 100 - activePct

            return (
              <div key={bin.ageGroup} className="flex-1 flex flex-col items-center justify-end h-full group">
                <span className="text-[10px] font-medium tabular-nums text-stone-500 dark:text-stone-400 mb-0.5">
                  {total}
                </span>
                <div
                  className="w-full rounded-t-sm overflow-hidden flex flex-col"
                  style={{ height: `${totalPct}%` }}
                >
                  {/* Inactive — top segment */}
                  <div
                    className="w-full bg-stone-200 dark:bg-stone-700 group-hover:bg-stone-300 dark:group-hover:bg-stone-600 transition-colors shrink-0"
                    style={{ height: `${inactivePct}%` }}
                  />
                  {/* Active — bottom segment */}
                  <div
                    className="w-full bg-emerald-500 dark:bg-emerald-500 group-hover:bg-emerald-600 dark:group-hover:bg-emerald-400 transition-colors flex-1"
                    style={{ height: `${activePct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Age group labels */}
      <div className="flex gap-2 px-0.5">
        {data.map(bin => (
          <div key={bin.ageGroup} className="flex-1 text-center">
            <span className="text-[10px] text-stone-400 dark:text-stone-500">{bin.ageGroup}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 pt-1">
        <span className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-stone-300">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
          {activeLabel}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-stone-200 dark:bg-stone-700 shrink-0" />
          Inactive
        </span>
      </div>
    </div>
  )
}
