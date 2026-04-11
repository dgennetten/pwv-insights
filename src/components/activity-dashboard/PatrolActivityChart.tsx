import type { PatrolActivityDay } from '../../types/activity-dashboard'
import { formatInteger } from '../../lib/formatNumber'

interface PatrolActivityChartProps {
  data: PatrolActivityDay[]
}

const CHART_HEIGHT = 140

export function PatrolActivityChart({ data }: PatrolActivityChartProps) {
  const max = Math.max(...data.map(d => d.patrols), 1)

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
        <div className="absolute inset-0 flex items-end gap-1.5 px-0.5">
          {data.map(day => {
            const barHeightPct = day.patrols === 0 ? 0 : Math.max((day.patrols / max) * 100, 3)
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center justify-end gap-1 group h-full">
                {/* Count label above bar */}
                <span className={`text-[10px] font-medium tabular-nums transition-opacity text-stone-500 dark:text-stone-400 ${day.patrols > 0 ? 'opacity-100' : 'opacity-0'}`}>
                  {day.patrols > 0 ? formatInteger(day.patrols) : ''}
                </span>
                {/* Bar */}
                <div
                  className="w-full rounded-t-sm bg-emerald-500 dark:bg-emerald-500 group-hover:bg-emerald-600 dark:group-hover:bg-emerald-400 transition-colors"
                  style={{ height: `${barHeightPct}%` }}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Date labels */}
      <div className="flex gap-1.5 px-0.5">
        {data.map(day => (
          <div key={day.date} className="flex-1 text-center">
            <span className="text-[10px] text-stone-400 dark:text-stone-500">{day.dayLabel}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
