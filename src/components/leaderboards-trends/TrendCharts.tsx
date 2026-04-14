import { useState, useEffect, useMemo } from 'react'
import type {
  Trends,
  YearOverYearPoint,
  TimeRange,
  TrendYearComparison,
} from '../../types/leaderboards-trends'

const CHART_HEIGHT = 140

// ── Generic bar chart ─────────────────────────────────────────────────────────

interface BarChartProps {
  data: { label: string; value: number }[]
  barClass: string
  labelEvery?: number
}

function BarChart({ data, barClass, labelEvery = 1 }: BarChartProps) {
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div className="space-y-2">
      <div className="relative" style={{ height: `${CHART_HEIGHT}px` }}>
        {[0, 50, 100].map(pct => (
          <div
            key={pct}
            className="absolute left-0 right-0 border-t border-stone-100 dark:border-stone-800"
            style={{ bottom: `${pct}%` }}
          />
        ))}
        <div className="absolute inset-0 flex items-end gap-px px-0.5">
          {data.map((d, i) => {
            const h = d.value === 0 ? 0 : Math.max((d.value / max) * 100, 2)
            return (
              <div key={i} title={`${d.label}: ${d.value}`} className="flex-1 flex items-end h-full cursor-default">
                <div
                  className={`w-full rounded-t-sm transition-opacity hover:opacity-70 ${barClass}`}
                  style={{ height: `${h}%` }}
                />
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex gap-px px-0.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center overflow-hidden">
            {i % labelEvery === 0 && (
              <span className="text-[9px] leading-none text-stone-400 dark:text-stone-500 truncate block">
                {d.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Stacked bar chart (trees by size) ─────────────────────────────────────────

interface StackedSegment {
  value: number
  color: string
}

interface StackedBarChartProps {
  data: { label: string; segments: StackedSegment[] }[]
}

function StackedBarChart({ data }: StackedBarChartProps) {
  const maxTotal = Math.max(...data.map(d => d.segments.reduce((s, seg) => s + seg.value, 0)), 1)

  return (
    <div className="space-y-2">
      <div className="relative" style={{ height: `${CHART_HEIGHT}px` }}>
        {[0, 50, 100].map(pct => (
          <div
            key={pct}
            className="absolute left-0 right-0 border-t border-stone-100 dark:border-stone-800"
            style={{ bottom: `${pct}%` }}
          />
        ))}
        <div className="absolute inset-0 flex items-end gap-px px-0.5">
          {data.map((d, i) => {
            const total = d.segments.reduce((s, seg) => s + seg.value, 0)
            const totalH = total === 0 ? 0 : Math.max((total / maxTotal) * 100, 2)
            return (
              <div
                key={i}
                title={`${d.label}: ${total}`}
                className="flex-1 flex items-end h-full cursor-default"
              >
                <div
                  className="w-full flex flex-col-reverse rounded-t-sm overflow-hidden"
                  style={{ height: `${totalH}%` }}
                >
                  {d.segments.map((seg, si) => (
                    <div
                      key={si}
                      className={seg.color}
                      style={{
                        height: total === 0 ? '0%' : `${(seg.value / total) * 100}%`,
                        minHeight: seg.value > 0 ? '1px' : '0',
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex gap-px px-0.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center overflow-hidden">
            <span className="text-[9px] leading-none text-stone-400 dark:text-stone-500 truncate block">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Year-over-year grouped chart ──────────────────────────────────────────────

function YearOverYearChart({ data }: { data: YearOverYearPoint[] }) {
  const max = Math.max(...data.map(d => Math.max(d.previousYear, d.currentYear)), 1)

  return (
    <div className="space-y-2">
      <div className="relative" style={{ height: `${CHART_HEIGHT}px` }}>
        {[0, 50, 100].map(pct => (
          <div
            key={pct}
            className="absolute left-0 right-0 border-t border-stone-100 dark:border-stone-800"
            style={{ bottom: `${pct}%` }}
          />
        ))}
        <div className="absolute inset-0 flex items-end gap-1 px-0.5">
          {data.map((d, i) => (
            <div key={i} className="flex-1 flex items-end gap-px h-full">
              <div
                className="flex-1 bg-stone-200 dark:bg-stone-700 rounded-t-sm hover:opacity-70 transition-opacity"
                style={{ height: `${Math.max((d.previousYear / max) * 100, 1)}%` }}
                title={`Prior year (${d.month}): ${d.previousYear}`}
              />
              <div
                className="flex-1 bg-emerald-500 dark:bg-emerald-500 rounded-t-sm hover:opacity-70 transition-opacity"
                style={{ height: `${Math.max((d.currentYear / max) * 100, 1)}%` }}
                title={`Current year (${d.month}): ${d.currentYear}`}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-1 px-0.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center overflow-hidden">
            <span className="text-[9px] leading-none text-stone-400 dark:text-stone-500 truncate block">
              {d.month}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 pt-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 bg-stone-200 dark:bg-stone-700 rounded-sm" />
          <span className="text-[10px] text-stone-400 dark:text-stone-500">Prior year</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 bg-emerald-500 rounded-sm" />
          <span className="text-[10px] text-stone-400 dark:text-stone-500">Current year</span>
        </div>
      </div>
    </div>
  )
}

// ── Period label (matches page time range + YoY mode) ───────────────────────

function getTrendDisplayPeriod(timeRange: TimeRange, yearMode: TrendYearComparison): string {
  const y = new Date().getFullYear()
  if (timeRange === 'all') {
    return 'Full history — all periods in the dataset'
  }
  if (yearMode === 'yearOverYear') {
    return `Year-over-year: ${y - 1} vs ${y} (by month)`
  }
  switch (timeRange) {
    case 'week':
      return `Week to date (${y})`
    case 'month':
      return `Month to date (${y})`
    case 'quarter':
      return `Quarter to date (${y})`
    case 'year':
      return `Season to Date — Oct 1 through present (2025-2026)`
    default:
      return `Selected range (${y})`
  }
}

/** Preview-only paired series when API does not yet supply YoY per metric (violations, trees, seasonal). */
function synthesizeYoYFromMonthlySeries(points: { label: string; value: number }[]): YearOverYearPoint[] {
  return points.map(p => ({
    month: p.label,
    previousYear: Math.max(0, Math.round(p.value * 0.88)),
    currentYear: p.value,
  }))
}

// ── Chart selector + card wrapper ─────────────────────────────────────────────

type ChartType = 'patrolActivity' | 'violations' | 'treesBySize' | 'seasonal'

const CHART_OPTIONS: { value: ChartType; label: string }[] = [
  { value: 'patrolActivity', label: 'Patrol Activity' },
  { value: 'violations',     label: 'Violations' },
  { value: 'treesBySize',    label: 'Trees by Size' },
]

const CHART_META: Record<ChartType, { title: string; subtitle: string }> = {
  patrolActivity: { title: 'Patrol Activity',           subtitle: 'Patrol volume across the organization' },
  violations:     { title: 'Violations by Month',       subtitle: 'Total violations recorded org-wide' },
  treesBySize:    { title: 'Trees Cleared by Size',     subtitle: 'Monthly trees cleared by diameter class' },
  seasonal:       { title: 'Seasonal Trail Usage',      subtitle: 'Patrol volume by calendar month' },
}

const TREES_SIZE_LEGEND = [
  { color: 'bg-emerald-200 dark:bg-emerald-800', label: '< 8"' },
  { color: 'bg-emerald-400 dark:bg-emerald-600', label: '8–15"' },
  { color: 'bg-emerald-600 dark:bg-emerald-500', label: '16–23"' },
  { color: 'bg-emerald-800 dark:bg-emerald-400', label: '24–36"' },
  { color: 'bg-stone-700 dark:bg-stone-300',     label: '> 36"' },
]

const YEAR_MODE_OPTIONS: { value: TrendYearComparison; label: string }[] = [
  { value: 'thisYear',      label: 'This Year' },
  { value: 'yearOverYear',  label: 'Year over Year' },
]

// ── TrendCharts ───────────────────────────────────────────────────────────────

export interface TrendChartsProps {
  trends: Trends
  /** Page-level time range; **All Time** disables the year-comparison dropdown. */
  timeRange: TimeRange
}

export function TrendCharts({ trends, timeRange }: TrendChartsProps) {
  const [activeChart, setActiveChart] = useState<ChartType>('patrolActivity')
  const [yearMode, setYearMode] = useState<TrendYearComparison>('thisYear')

  const comparisonDisabled = timeRange === 'all'

  useEffect(() => {
    if (comparisonDisabled) setYearMode('thisYear')
  }, [comparisonDisabled])

  const patrolData = trends.patrolActivityByWeek.map(d => ({ label: d.label, value: d.count }))
  const violationData = trends.violationsByMonth.map(d => ({
    label: d.month,
    value: d.offLeashDog + d.campfire + d.nonDesignatedCamping + d.other,
  }))
  const seasonalData = trends.seasonalPatrolsByMonth.map(d => ({ label: d.month, value: d.patrols }))
  const treesSizeData = trends.treesBySizeByMonth.map(d => ({
    label: d.month,
    segments: [
      { value: d.under8in,         color: 'bg-emerald-200 dark:bg-emerald-800' },
      { value: d.eightTo15in,      color: 'bg-emerald-400 dark:bg-emerald-600' },
      { value: d.sixteenTo23in,    color: 'bg-emerald-600 dark:bg-emerald-500' },
      { value: d.twentyFourTo36in, color: 'bg-emerald-800 dark:bg-emerald-400' },
      { value: d.over36in,         color: 'bg-stone-700 dark:bg-stone-300' },
    ],
  }))

  const violationYoY = useMemo(
    () =>
      synthesizeYoYFromMonthlySeries(
        trends.violationsByMonth.map(d => ({
          label: d.month,
          value: d.offLeashDog + d.campfire + d.nonDesignatedCamping + d.other,
        }))
      ),
    [trends.violationsByMonth]
  )

  const seasonalYoY = useMemo(
    () =>
      synthesizeYoYFromMonthlySeries(
        trends.seasonalPatrolsByMonth.map(d => ({ label: d.month, value: d.patrols }))
      ),
    [trends.seasonalPatrolsByMonth]
  )

  const treesYoY = useMemo(
    () =>
      synthesizeYoYFromMonthlySeries(
        trends.treesBySizeByMonth.map(d => ({
          label: d.month,
          value:
            d.under8in +
            d.eightTo15in +
            d.sixteenTo23in +
            d.twentyFourTo36in +
            d.over36in,
        }))
      ),
    [trends.treesBySizeByMonth]
  )

  const weeklyLabelEvery = Math.ceil(patrolData.length / 12)
  const meta = CHART_META[activeChart]
  const displayPeriod = getTrendDisplayPeriod(timeRange, yearMode)
  const showYoY = yearMode === 'yearOverYear' && !comparisonDisabled

  return (
    <div className="space-y-4">

      {/* Year comparison + chart type pills */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="trend-year-mode" className="sr-only">
            Trend year comparison
          </label>
          <select
            id="trend-year-mode"
            value={yearMode}
            disabled={comparisonDisabled}
            onChange={e => setYearMode(e.target.value as TrendYearComparison)}
            className={`text-xs font-medium rounded-full border px-3 py-1.5 pr-8 outline-none transition-colors ${
              comparisonDisabled
                ? 'border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 cursor-not-allowed'
                : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 focus:border-emerald-400 dark:focus:border-emerald-600 cursor-pointer'
            }`}
          >
            {YEAR_MODE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {CHART_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setActiveChart(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                activeChart === opt.value
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-600 hover:text-stone-700 dark:hover:text-stone-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active chart card */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4">
        <div className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            {meta.title}
          </h3>
          <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">{meta.subtitle}</p>
          <p className="text-[11px] font-medium text-stone-600 dark:text-stone-300 mt-1.5 tabular-nums">
            {displayPeriod}
          </p>
        </div>

        {activeChart === 'patrolActivity' && !showYoY && (
          <BarChart data={patrolData} barClass="bg-emerald-500 dark:bg-emerald-500" labelEvery={weeklyLabelEvery} />
        )}
        {activeChart === 'patrolActivity' && showYoY && (
          <YearOverYearChart data={trends.yearOverYear} />
        )}

        {activeChart === 'violations' && !showYoY && (
          <BarChart data={violationData} barClass="bg-amber-400 dark:bg-amber-500" />
        )}
        {activeChart === 'violations' && showYoY && (
          <YearOverYearChart data={violationYoY} />
        )}

        {activeChart === 'treesBySize' && !showYoY && (
          <>
            <StackedBarChart data={treesSizeData} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
              {TREES_SIZE_LEGEND.map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                  <span className="text-[10px] text-stone-400 dark:text-stone-500">{label}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {activeChart === 'treesBySize' && showYoY && (
          <>
            <YearOverYearChart data={treesYoY} />
            <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-2">
              Year-over-year shows total trees cleared per month; size breakdown applies in “This Year” view.
            </p>
          </>
        )}

        {activeChart === 'seasonal' && !showYoY && (
          <BarChart data={seasonalData} barClass="bg-stone-400 dark:bg-stone-500" />
        )}
        {activeChart === 'seasonal' && showYoY && (
          <YearOverYearChart data={seasonalYoY} />
        )}
      </div>
    </div>
  )
}
