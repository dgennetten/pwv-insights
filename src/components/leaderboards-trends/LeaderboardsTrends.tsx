import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import type {
  LeaderboardsTrendsProps,
  TimeRange,
  LeaderboardMetric,
  LeaderboardCategory,
} from '../../types/leaderboards-trends'
import { Leaderboard } from './Leaderboard'
import { LeaderboardHistogram } from './LeaderboardHistogram'

// ── Config ───────────────────────────────────────────────────────────────────

type LeaderboardView = 'stats' | 'names'

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: 'month', label: 'Month to Date' },
  { value: 'year',        label: 'Season to Date' },
  { value: 'last_season', label: 'Last Season' },
  { value: 'all',         label: 'All Time' },
]

const CATEGORY_OPTIONS: { value: LeaderboardCategory; label: string }[] = [
  { value: 'days',   label: 'Days' },
  { value: 'work',   label: 'Work' },
  { value: 'trails', label: 'Trails' },
  { value: 'hours',  label: 'Hours' },
]

const METRICS_BY_CATEGORY: Record<
  LeaderboardCategory,
  { value: LeaderboardMetric; label: string; unit: string }[]
> = {
  days: [
    { value: 'patrolDays',     label: 'Patrol',     unit: 'days' },
    { value: 'hikeDays',       label: 'Hike',       unit: 'days' },
    { value: 'stockDays',      label: 'Stock',      unit: 'days' },
    { value: 'trailworkDays',  label: 'Trailwork',  unit: 'days' },
    { value: 'wildernessDays', label: 'Wilderness', unit: 'days' },
  ],
  work: [
    { value: 'contacts',     label: 'Contacts',   unit: 'contacts' },
    { value: 'treesCleared', label: 'Trees',      unit: 'trees' },
    { value: 'brushing',     label: 'Brushing',   unit: 'ft' },
    { value: 'fireRings',    label: 'Fire rings', unit: 'rings' },
    { value: 'trash',        label: 'Trash',      unit: 'lbs' },
  ],
  trails: [
    { value: 'milesCovered', label: 'Miles',   unit: 'mi' },
    { value: 'trailCount',   label: '#Trails', unit: 'trails' },
    { value: 'trailTypes',   label: 'Types',   unit: 'types' },
  ],
  hours: [
    { value: 'totalHours',    label: 'Total',      unit: 'hrs' },
    { value: 'patrolHours',   label: 'Patrol',     unit: 'hrs' },
    { value: 'nonPatrolHours', label: 'Non-patrol', unit: 'hrs' },
  ],
}

const DEFAULT_CATEGORY: LeaderboardCategory = 'work'
const DEFAULT_METRIC: LeaderboardMetric = 'contacts'
const DEFAULT_VIEW: LeaderboardView = 'stats'

const LEADERBOARD_UI_STORAGE_KEY = 'pwv-leaderboards-category-metric-v1'
const LEADERBOARD_VIEW_STORAGE_KEY = 'pwv-leaderboards-view-v1'

function metricBelongsToCategory(metric: LeaderboardMetric, category: LeaderboardCategory): boolean {
  return METRICS_BY_CATEGORY[category].some(m => m.value === metric)
}

function firstMetricForCategory(category: LeaderboardCategory): LeaderboardMetric {
  return METRICS_BY_CATEGORY[category][0]!.value
}

function readPersistedLeaderboardUI(): { category: LeaderboardCategory; metric: LeaderboardMetric } | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(LEADERBOARD_UI_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as { category?: unknown; metric?: unknown }
    if (typeof o.category !== 'string' || !CATEGORY_OPTIONS.some(c => c.value === o.category)) return null
    const category = o.category as LeaderboardCategory
    if (typeof o.metric !== 'string' || !metricBelongsToCategory(o.metric as LeaderboardMetric, category)) {
      return { category, metric: firstMetricForCategory(category) }
    }
    return { category, metric: o.metric as LeaderboardMetric }
  } catch {
    return null
  }
}

function writePersistedLeaderboardUI(category: LeaderboardCategory, metric: LeaderboardMetric) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LEADERBOARD_UI_STORAGE_KEY, JSON.stringify({ category, metric }))
  } catch { /* quota / private mode */ }
}

function readPersistedView(): LeaderboardView {
  if (typeof localStorage === 'undefined') return DEFAULT_VIEW
  try {
    const v = localStorage.getItem(LEADERBOARD_VIEW_STORAGE_KEY)
    if (v === 'stats' || v === 'names') return v
  } catch { /* ignore */ }
  return DEFAULT_VIEW
}

function writePersistedView(view: LeaderboardView) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LEADERBOARD_VIEW_STORAGE_KEY, view)
  } catch { /* quota / private mode */ }
}

function initialCategoryAndMetric(
  defaultLeaderboardCategory: LeaderboardCategory | undefined,
  defaultMetric: LeaderboardMetric | undefined
): { category: LeaderboardCategory; metric: LeaderboardMetric } {
  const cat = defaultLeaderboardCategory ?? DEFAULT_CATEGORY
  const met = defaultMetric ?? DEFAULT_METRIC
  if (metricBelongsToCategory(met, cat)) return { category: cat, metric: met }
  for (const { value } of CATEGORY_OPTIONS) {
    if (metricBelongsToCategory(met, value)) return { category: value, metric: met }
  }
  return { category: DEFAULT_CATEGORY, metric: DEFAULT_METRIC }
}

function resolveInitialLeaderboardUI(
  defaultLeaderboardCategory: LeaderboardCategory | undefined,
  defaultMetric: LeaderboardMetric | undefined
): { category: LeaderboardCategory; metric: LeaderboardMetric } {
  const persisted = readPersistedLeaderboardUI()
  if (persisted) return persisted
  return initialCategoryAndMetric(defaultLeaderboardCategory, defaultMetric)
}

function LeaderboardSignInGate({
  children,
  onSignIn,
  onBack,
}: {
  children: ReactNode
  onSignIn?: () => void
  onBack?: () => void
}) {
  return (
    <div className="relative rounded-xl overflow-hidden">
      <div className="select-none pointer-events-none blur-sm opacity-[0.42] dark:opacity-35">
        {children}
      </div>
      <div
        className="absolute inset-0 z-10 flex items-center justify-center p-6 sm:p-8 rounded-xl bg-white/75 dark:bg-stone-950/80 backdrop-blur-sm"
        aria-live="polite"
      >
        <div className="max-w-md text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
            <Lock className="w-5 h-5 text-stone-500 dark:text-stone-400" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 leading-snug px-2">
            To view the leaderboard you must be logged in.
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed px-2">
            Sign in to see rankings, names, and your place on the podium.
          </p>
          {onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-sm transition-colors"
            >
              Sign in
            </button>
          )}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
            >
              ← Go back
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function LeaderboardsTrends({
  members,
  currentUserId,
  defaultTimeRange = 'year',
  defaultLeaderboardCategory = DEFAULT_CATEGORY,
  defaultMetric = DEFAULT_METRIC,
  onTimeRangeChange,
  onLeaderboardCategoryChange,
  onMetricChange,
  onSignInPrompt,
  onBack,
}: LeaderboardsTrendsProps) {
  const isAuthenticated =
    currentUserId !== undefined && currentUserId !== null && String(currentUserId).trim() !== ''

  const [timeRange, setTimeRange] = useState<TimeRange>(defaultTimeRange)
  const [view, setView] = useState<LeaderboardView>(() => readPersistedView())
  const [leaderboardCategory, setLeaderboardCategory] = useState<LeaderboardCategory>(() =>
    resolveInitialLeaderboardUI(defaultLeaderboardCategory, defaultMetric).category
  )
  const [metric, setMetric] = useState<LeaderboardMetric>(() =>
    resolveInitialLeaderboardUI(defaultLeaderboardCategory, defaultMetric).metric
  )

  useEffect(() => {
    writePersistedLeaderboardUI(leaderboardCategory, metric)
  }, [leaderboardCategory, metric])

  const handleTimeRange = (range: TimeRange) => {
    setTimeRange(range)
    onTimeRangeChange?.(range)
  }

  const handleView = (v: LeaderboardView) => {
    setView(v)
    writePersistedView(v)
  }

  const handleCategory = useCallback(
    (category: LeaderboardCategory) => {
      setLeaderboardCategory(category)
      const next = firstMetricForCategory(category)
      setMetric(next)
      onLeaderboardCategoryChange?.(category)
      onMetricChange?.(next)
    },
    [onLeaderboardCategoryChange, onMetricChange]
  )

  const handleMetric = (m: LeaderboardMetric) => {
    setMetric(m)
    onMetricChange?.(m)
  }

  const categoryMetrics = METRICS_BY_CATEGORY[leaderboardCategory]

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => b[metric] - a[metric]),
    [members, metric]
  )

  // Shared props for the leaderboard (names view)
  const leaderboardProps = {
    metric,
    leaderboardCategory,
    categoryOptions: CATEGORY_OPTIONS,
    metrics: categoryMetrics,
    onLeaderboardCategoryChange: handleCategory,
    onMetricChange: handleMetric,
  }

  // Props for the histogram (stats view) — no metric/unit, renders all metrics stacked
  const histogramProps = {
    leaderboardCategory,
    categoryOptions: CATEGORY_OPTIONS,
    metrics: categoryMetrics,
    onLeaderboardCategoryChange: handleCategory,
  }

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 p-4 md:p-6 lg:p-8">

      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">

        {/* Left: title + Stats/Names toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
            Leaderboards
          </h2>
          <div className="flex bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-0.5 gap-0.5">
            {(['stats', 'names'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => handleView(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  view === v
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Right: time range pill group */}
        <div className="flex flex-wrap bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-0.5 gap-0.5 self-start">
          {TIME_RANGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTimeRange(value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                timeRange === value
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats view — all metrics stacked, no auth gate */}
      {view === 'stats' && (
        <LeaderboardHistogram
          members={members}
          currentUserId={isAuthenticated ? currentUserId! : undefined}
          {...histogramProps}
        />
      )}

      {/* Names view — podium + list, auth-gated */}
      {view === 'names' && isAuthenticated && (
        <Leaderboard
          members={sortedMembers}
          currentUserId={currentUserId!}
          {...leaderboardProps}
        />
      )}
      {view === 'names' && !isAuthenticated && (
        <LeaderboardSignInGate onSignIn={onSignInPrompt} onBack={onBack}>
          <Leaderboard
            members={sortedMembers}
            currentUserId={sortedMembers[0]?.id ?? ''}
            {...leaderboardProps}
          />
        </LeaderboardSignInGate>
      )}
    </div>
  )
}
