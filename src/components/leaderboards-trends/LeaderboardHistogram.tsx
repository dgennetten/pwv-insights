import { useMemo } from 'react'
import type { Member, LeaderboardMetric, LeaderboardCategory } from '../../types/leaderboards-trends'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MetricConfig {
  value: LeaderboardMetric
  label: string
  unit: string
}

export interface LeaderboardHistogramProps {
  members: Member[]
  currentUserId?: string
  leaderboardCategory: LeaderboardCategory
  categoryOptions: { value: LeaderboardCategory; label: string }[]
  metrics: MetricConfig[]
  onLeaderboardCategoryChange?: (c: LeaderboardCategory) => void
}

interface HistogramBin {
  min: number
  max: number
  count: number
  containsUser: boolean
}

interface HistogramResult {
  bins: HistogramBin[]
  zeroCount: number
  nonZeroCount: number
  userValue: number | null   // null when not logged in or user has 0
  median: number | null
  aheadOfPct: number | null  // 0–100, % of non-zero members strictly below user
}

// ── Histogram math ────────────────────────────────────────────────────────────

const NUM_BINS = 30
const BAR_HEIGHT = 120  // px

function fmtEdge(v: number): string {
  if (v >= 10000) return `${Math.round(v / 1000)}k`
  if (v >= 1000)  return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (v >= 100)   return Math.round(v).toString()
  if (Number.isInteger(v)) return v.toString()
  return v % 1 < 0.05 ? Math.round(v).toString() : v.toFixed(1)
}

function fmtVal(v: number, isFloat: boolean): string {
  if (!isFloat) return Math.round(v).toLocaleString()
  const rounded = Math.round(v * 10) / 10
  return rounded % 1 === 0 ? rounded.toLocaleString() : rounded.toFixed(1)
}

function computeHistogram(
  members: Member[],
  metric: LeaderboardMetric,
  currentUserId?: string,
): HistogramResult {
  const userMember = currentUserId ? members.find(m => m.id === currentUserId) : undefined
  const userRaw = userMember != null ? (userMember[metric] as number) : null

  const nonZeroValues = members
    .map(m => m[metric] as number)
    .filter(v => v > 0)
    .sort((a, b) => a - b)

  const zeroCount = members.length - nonZeroValues.length
  const nonZeroCount = nonZeroValues.length

  if (nonZeroCount === 0) {
    return { bins: [], zeroCount, nonZeroCount, userValue: null, median: null, aheadOfPct: null }
  }

  // Median of non-zero values
  const mid = Math.floor(nonZeroCount / 2)
  const median =
    nonZeroCount % 2 === 0
      ? (nonZeroValues[mid - 1]! + nonZeroValues[mid]!) / 2
      : nonZeroValues[mid]!

  // User value (null if user has 0 or not logged in)
  const userValue = userRaw !== null && userRaw > 0 ? userRaw : null

  // % of non-zero members strictly below the user
  let aheadOfPct: number | null = null
  if (userValue !== null) {
    const below = nonZeroValues.filter(v => v < userValue).length
    aheadOfPct = Math.round((below / nonZeroCount) * 100)
  }

  // Equal-width bins
  const minVal = nonZeroValues[0]!
  const maxVal = nonZeroValues[nonZeroCount - 1]!
  const allSame = minVal === maxVal
  const binCount = allSame ? 1 : Math.min(NUM_BINS, nonZeroCount)
  const binWidth = allSame ? 1 : (maxVal - minVal) / binCount

  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    min: minVal + i * binWidth,
    max: i === binCount - 1 ? maxVal : minVal + (i + 1) * binWidth,
    count: 0,
    containsUser: false,
  }))

  for (const v of nonZeroValues) {
    const idx = allSame ? 0 : Math.min(Math.floor((v - minVal) / binWidth), binCount - 1)
    bins[idx]!.count++
  }

  if (userValue !== null) {
    const idx = allSame ? 0 : Math.min(Math.floor((userValue - minVal) / binWidth), binCount - 1)
    bins[idx]!.containsUser = true
  }

  return { bins, zeroCount, nonZeroCount, userValue, median, aheadOfPct }
}

// ── Metrics whose values can be fractional ────────────────────────────────────

const FLOAT_METRICS = new Set<LeaderboardMetric>(['treesCleared', 'trash', 'milesCovered', 'totalHours', 'patrolHours', 'nonPatrolHours'])

// ── Single metric chart ───────────────────────────────────────────────────────

function SingleHistogramChart({
  members,
  currentUserId,
  metric,
  unit,
  label,
}: {
  members: Member[]
  currentUserId?: string
  metric: LeaderboardMetric
  unit: string
  label: string
}) {
  const isFloat = FLOAT_METRICS.has(metric)
  const isAuthenticated = currentUserId != null && String(currentUserId).trim() !== ''

  const { bins, zeroCount, nonZeroCount, userValue, median, aheadOfPct } = useMemo(
    () => computeHistogram(members, metric, currentUserId),
    [members, metric, currentUserId],
  )

  const maxCount = bins.length > 0 ? Math.max(...bins.map(b => b.count)) : 1
  const userHasData = userValue !== null

  const xTicks = useMemo<Set<number>>(() => {
    const ticks = new Set<number>()
    if (bins.length === 0) return ticks
    ticks.add(0)
    ticks.add(bins.length - 1)
    if (bins.length > 2) ticks.add(Math.floor(bins.length / 2))
    if (bins.length > 4) ticks.add(Math.floor(bins.length / 4))
    return ticks
  }, [bins])

  return (
    <div className="px-5 pt-4 pb-4">
      <p className="text-xs font-semibold text-stone-700 dark:text-stone-300 mb-3">{label}</p>

      {nonZeroCount === 0 ? (
        <p className="flex items-center justify-center h-16 text-sm text-stone-400 dark:text-stone-500">
          No data for this metric yet.
        </p>
      ) : (
        <>
          {/* Chart area */}
          <div className="relative" style={{ height: `${BAR_HEIGHT}px` }}>
            {[0, 0.5, 1].map(pct => (
              <div
                key={pct}
                className="absolute inset-x-0 border-t border-stone-100 dark:border-stone-800"
                style={{ bottom: `${pct * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-1">
              {bins.map((bin, i) => {
                const heightPct = maxCount > 0 ? (bin.count / maxCount) * 100 : 0
                const isUserBin = bin.containsUser
                return (
                  <div
                    key={i}
                    className="relative flex-1 flex flex-col items-center justify-end h-full group"
                  >
                    <div
                      className={`w-full rounded-t-sm transition-opacity ${
                        isUserBin
                          ? 'bg-emerald-500 dark:bg-emerald-500'
                          : 'bg-stone-300 dark:bg-stone-600 group-hover:bg-stone-400 dark:group-hover:bg-stone-500'
                      }`}
                      style={{ height: `${heightPct}%`, minHeight: bin.count > 0 ? '3px' : '0' }}
                    />
                    <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                      <div className="bg-stone-800 dark:bg-stone-700 text-white text-[10px] font-medium px-2 py-1 rounded whitespace-nowrap shadow-md">
                        {bin.count} member{bin.count !== 1 ? 's' : ''}
                        {isUserBin && <span className="ml-1 text-emerald-400">· You</span>}
                        <div className="text-stone-400 mt-0.5">
                          {fmtEdge(bin.min)}–{fmtEdge(bin.max)} {unit}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* X-axis labels */}
          <div className="flex items-start mt-1">
            {bins.map((bin, i) => (
              <div key={i} className="flex-1 flex justify-center">
                {xTicks.has(i) && (
                  <span className="text-[9px] text-stone-400 dark:text-stone-500 tabular-nums leading-none">
                    {i === bins.length - 1 ? fmtEdge(bin.max) : fmtEdge(bin.min)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">
            {unit}
          </p>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-stone-300 dark:bg-stone-600 shrink-0" />
              <span className="text-[11px] text-stone-500 dark:text-stone-400">Members</span>
            </div>
            {isAuthenticated && userHasData && (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500 shrink-0" />
                <span className="text-[11px] text-stone-500 dark:text-stone-400">Your range</span>
              </div>
            )}
          </div>

          {/* Summary stats */}
          <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 flex flex-wrap gap-x-5 gap-y-1.5">
            {median !== null && (
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Median:{' '}
                <span className="font-semibold text-stone-700 dark:text-stone-300">
                  {fmtVal(median, isFloat)} {unit}
                </span>
              </p>
            )}
            {isAuthenticated && userHasData && aheadOfPct !== null && (
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                You're ahead of{' '}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {aheadOfPct}%
                </span>{' '}
                of active members
              </p>
            )}
          </div>

          {zeroCount > 0 && (
            <p className="mt-2 text-[10px] text-stone-400 dark:text-stone-500 italic">
              {zeroCount} member{zeroCount !== 1 ? 's' : ''} with zero {unit} excluded.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LeaderboardHistogram({
  members,
  currentUserId,
  leaderboardCategory,
  categoryOptions,
  metrics,
  onLeaderboardCategoryChange,
}: LeaderboardHistogramProps) {
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden mb-6">

      {/* Category tabs */}
      <div className="flex border-b border-stone-100 dark:border-stone-800">
        {categoryOptions.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onLeaderboardCategoryChange?.(opt.value)}
            className={`flex-1 px-3 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
              leaderboardCategory === opt.value
                ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
                : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Stacked charts, one per metric */}
      {metrics.map((m, i) => (
        <div key={m.value} className={i > 0 ? 'border-t border-stone-100 dark:border-stone-800' : ''}>
          <SingleHistogramChart
            members={members}
            currentUserId={currentUserId}
            metric={m.value}
            unit={m.unit}
            label={m.label}
          />
        </div>
      ))}
    </div>
  )
}
