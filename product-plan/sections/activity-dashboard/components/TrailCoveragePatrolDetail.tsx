import { ArrowLeft, Footprints, Leaf, TreePine } from 'lucide-react'
import type { TrailCoveragePatrolDetailProps } from '../types'

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function TrailCoveragePatrolDetail({
  trail,
  patrols,
  periodLabel,
  memberScopeLabel,
  onBack,
}: TrailCoveragePatrolDetailProps) {
  const sorted = [...patrols].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
          Back to Activity Dashboard
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100 flex flex-wrap items-center gap-2">
              <span>{trail.trailName}</span>
              {trail.inWilderness && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <Leaf className="w-3 h-3" strokeWidth={2} />
                  Wilderness
                </span>
              )}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              #{trail.trailNumber} · {trail.lengthMiles} mi · {trail.area}
            </p>
            <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-2">
              Patrols in scope — time range:{' '}
              <span className="font-medium text-stone-600 dark:text-stone-400">{periodLabel}</span>
              {' · members: '}
              <span className="font-medium text-stone-600 dark:text-stone-400">{memberScopeLabel}</span>
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-center min-w-[5rem]">
              <div className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500">In period</div>
              <div className="text-lg font-bold tabular-nums text-stone-900 dark:text-stone-100">{patrols.length}</div>
            </div>
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-center min-w-[5rem]">
              <div className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500">Seen</div>
              <div className="text-lg font-bold tabular-nums text-stone-900 dark:text-stone-100">{trail.hikersSeen}</div>
            </div>
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-center min-w-[5rem]">
              <div className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500">Contacted</div>
              <div className="text-lg font-bold tabular-nums text-stone-900 dark:text-stone-100">{trail.hikersContacted}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Patrol list */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center gap-2">
          <Footprints className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Patrols
          </h3>
        </div>

        {sorted.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <TreePine className="w-8 h-8 text-stone-300 dark:text-stone-600 mx-auto mb-2" strokeWidth={1.25} />
            <p className="text-sm text-stone-500 dark:text-stone-400">No patrols match this time range and member scope for this trail.</p>
          </div>
        ) : (
          <>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-950/50">
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                      Date
                    </th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                      Member
                    </th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                      Duration
                    </th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                      Seen
                    </th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                      Contacted
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {sorted.map((row, i) => (
                    <tr key={`${row.date}-${i}`} className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                      <td className="px-4 py-3 text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-800 dark:text-stone-200">
                        {row.memberName}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-stone-600 dark:text-stone-400">
                        {row.durationHours}h
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-stone-600 dark:text-stone-400">
                        {row.hikersSeen}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-stone-700 dark:text-stone-300">
                        {row.hikersContacted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden divide-y divide-stone-100 dark:divide-stone-800">
              {sorted.map((row, i) => (
                <div key={`${row.date}-${i}`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-stone-800 dark:text-stone-200">{row.memberName}</div>
                      <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{formatDate(row.date)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums text-stone-800 dark:text-stone-200">{row.hikersSeen} seen · {row.hikersContacted} contacted</div>
                      <div className="text-xs text-stone-400 dark:text-stone-500">{row.durationHours}h</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
