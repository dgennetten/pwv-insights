import type { ReactNode } from 'react'
import { ArrowLeft, Leaf, AlertTriangle, Footprints, PersonStanding, Lock, Map, Loader2 } from 'lucide-react'
import type { Trail, Difficulty, TreeSizeBreakdown } from '../../types/trails'

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const SIZE_LABELS: Record<keyof TreeSizeBreakdown, string> = {
  small: '< 8"', medium: '8–15"', large: '16–23"', xl: '24–36"', xxl: '> 36"',
}
const SIZE_KEYS = ['small', 'medium', 'large', 'xl', 'xxl'] as const

// Matches the color scheme used by TreesClearedChart in the Activity Dashboard
const SIZE_COLORS: Record<keyof TreeSizeBreakdown, { bar: string; label: string }> = {
  small:  { bar: 'bg-stone-300 dark:bg-stone-600',     label: 'text-stone-500 dark:text-stone-400' },
  medium: { bar: 'bg-emerald-300 dark:bg-emerald-700', label: 'text-emerald-600 dark:text-emerald-400' },
  large:  { bar: 'bg-emerald-500',                     label: 'text-emerald-600 dark:text-emerald-400' },
  xl:     { bar: 'bg-emerald-600 dark:bg-emerald-400', label: 'text-emerald-700 dark:text-emerald-300' },
  xxl:    { bar: 'bg-emerald-800 dark:bg-emerald-300', label: 'text-emerald-800 dark:text-emerald-200' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent = false }: {
  label: string; value: number | string; icon: React.ReactNode; accent?: boolean
}) {
  return (
    <div className={`rounded-xl border px-4 py-4 flex flex-col gap-3 ${
      accent
        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900'
        : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800'
    }`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-wider ${
          accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-500 dark:text-stone-400'
        }`}>{label}</span>
        <span className={accent ? 'text-emerald-500' : 'text-stone-300 dark:text-stone-600'}>{icon}</span>
      </div>
      <div className={`text-3xl font-bold tabular-nums tracking-tight ${
        accent ? 'text-emerald-900 dark:text-emerald-100' : 'text-stone-900 dark:text-stone-100'
      }`}>{value}</div>
    </div>
  )
}

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const cls: Record<Difficulty, string> = {
    easy:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    moderate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    hard:     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold capitalize ${cls[difficulty]}`}>
      {difficulty}
    </span>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-4">{title}</h3>
      {children}
    </div>
  )
}

function TreesSection({ treesDown, treesCleared }: { treesDown: TreeSizeBreakdown; treesCleared: TreeSizeBreakdown }) {
  const EPS = 1e-9
  const maxCleared = Math.max(...SIZE_KEYS.map(k => treesCleared[k]), 1)
  const hasAnyDown    = SIZE_KEYS.some(k => treesDown[k] > 0)
  const hasAnyCleared = SIZE_KEYS.some(k => treesCleared[k] > 0)

  if (!hasAnyDown && !hasAnyCleared) {
    return (
      <SectionCard title="Trees Cleared by Size Class">
        <p className="text-sm text-stone-400 dark:text-stone-500">No trees recorded this season.</p>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="Trees Cleared by Size Class">
      {/* Vertical bar chart — same style as Activity Dashboard TreesClearedChart */}
      <div className="flex items-end gap-4" style={{ height: '100px' }}>
        {SIZE_KEYS.map(key => {
          const c = treesCleared[key]
          const { bar, label } = SIZE_COLORS[key]
          const heightPct = c <= EPS ? 0 : Math.max((c / maxCleared) * 100, 4)
          return (
            <div key={key} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full min-w-0">
              <span className={`text-xs font-medium tabular-nums ${c > 0 ? label : 'opacity-0'}`}>{c}</span>
              <div className={`w-full rounded-t-sm ${bar}`} style={{ height: `${heightPct}%` }} />
            </div>
          )
        })}
      </div>

      {/* Size labels + trees-down context per column */}
      <div className="flex gap-4 mt-2">
        {SIZE_KEYS.map(key => {
          const d = treesDown[key]
          const remaining = d - treesCleared[key]
          return (
            <div key={key} className="flex-1 text-center space-y-0.5">
              <div className="text-[10px] text-stone-400">{SIZE_LABELS[key]}</div>
              {d > 0 && (
                <div className={`text-[10px] tabular-nums font-medium ${remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400'}`}>
                  {remaining > 0 ? `${remaining} left` : `${d} ✓`}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {hasAnyDown && (
        <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 text-xs text-stone-400">
          Bars = cleared · "N left" = still on trail · "N ✓" = all cleared
        </div>
      )}
    </SectionCard>
  )
}

function ViolationsSection({ violations }: { violations: Trail['violationsByCategory'] }) {
  if (violations.length === 0) {
    return <SectionCard title="Violations by Category"><p className="text-sm text-stone-400 dark:text-stone-500">No violations recorded.</p></SectionCard>
  }
  const maxCount = Math.max(...violations.map(v => v.count), 1)
  const sorted = [...violations].sort((a, b) => b.count - a.count)
  return (
    <SectionCard title="Violations by Category">
      <div className="space-y-2.5">
        {sorted.map(v => (
          <div key={v.category} className="flex items-center gap-3">
            <span className="text-xs text-stone-600 dark:text-stone-400 w-44 shrink-0 truncate">{v.category}</span>
            <div className="flex-1 bg-stone-100 dark:bg-stone-800 rounded-full h-4 overflow-hidden">
              <div className="h-full bg-amber-400 dark:bg-amber-600 rounded-full transition-all"
                   style={{ width: `${Math.round((v.count / maxCount) * 100)}%` }} />
            </div>
            <span className="text-xs font-semibold tabular-nums text-stone-700 dark:text-stone-300 w-5 text-right shrink-0">{v.count}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function PatrolHistorySection({ history }: { history: Trail['patrolHistory'] }) {
  return (
    <SectionCard title="Patrols">
      {history.length === 0 ? (
        <p className="text-sm text-stone-400 dark:text-stone-500">No patrols recorded.</p>
      ) : (
        <div className="overflow-x-auto -mx-4">
          <table className="w-full min-w-[20rem] text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-950/50">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">
                  Date / ID
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 min-w-[6rem]">
                  Member
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">
                  Seen
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">
                  Contacted
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {history.map((entry) => (
                <tr key={entry.reportId} className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap align-top">
                    <div>{formatDate(entry.date)}</div>
                    <div className="text-[10px] text-stone-400 dark:text-stone-600 tabular-nums mt-0.5">#{entry.reportId}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs sm:text-sm font-medium text-stone-800 dark:text-stone-200 break-words max-w-[11rem] sm:max-w-none align-top">
                    {entry.memberName}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs sm:text-sm tabular-nums text-stone-600 dark:text-stone-400 whitespace-nowrap align-top">
                    {entry.hikersSeen}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs sm:text-sm tabular-nums text-stone-600 dark:text-stone-400 whitespace-nowrap align-top">
                    {entry.hikersContacted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}

function MaintenanceSection({ work }: { work: Trail['maintenanceWork'] }) {
  return (
    <SectionCard title="Maintenance Work Logged">
      {work.length === 0 ? (
        <p className="text-sm text-stone-400 dark:text-stone-500">No maintenance work recorded.</p>
      ) : (
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                {['Date', 'Work Type', 'Qty', 'Notes'].map(h => (
                  <th key={h} className={`px-4 pb-2 text-left text-xs font-semibold uppercase tracking-wider text-stone-400 ${h === 'Notes' ? 'hidden md:table-cell' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {work.map((entry, i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5 text-xs text-stone-500 whitespace-nowrap">{formatDate(entry.date)}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-stone-700 dark:text-stone-300">{entry.workType}</td>
                  <td className="px-4 py-2.5 text-xs text-stone-500 whitespace-nowrap">{entry.quantity} {entry.unit}</td>
                  <td className="px-4 py-2.5 text-xs text-stone-400 hidden md:table-cell">{entry.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}

function SignInBlurGate({ children, onSignIn, title, description }: {
  children: ReactNode; onSignIn?: () => void; title: string; description: string
}) {
  return (
    <div className="relative rounded-xl overflow-hidden">
      <div className="select-none pointer-events-none blur-sm opacity-[0.42]">{children}</div>
      <div className="absolute inset-0 z-10 flex items-center justify-center p-6 min-h-[220px] rounded-xl bg-white/75 dark:bg-stone-950/80 backdrop-blur-sm" aria-live="polite">
        <div className="max-w-md text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
            <Lock className="w-5 h-5 text-stone-500" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 leading-snug px-2">{title}</p>
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed px-2">{description}</p>
          {onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main TrailDetail ──────────────────────────────────────────────────────────

interface TrailDetailProps {
  trail: Trail
  isAuthenticated?: boolean
  onBack?: () => void
  onSignInPrompt?: () => void
  mapOpen?: boolean
  onToggleMap?: () => void
  season?: 'current' | 'last'
  onSeasonChange?: (s: 'current' | 'last') => void
  refreshing?: boolean
}

export function TrailDetail({ trail, isAuthenticated = false, onBack, onSignInPrompt, mapOpen, onToggleMap, season = 'current', onSeasonChange, refreshing = false }: TrailDetailProps) {
  const totalDown    = SIZE_KEYS.reduce((s, k) => s + trail.treesDown[k], 0)
  const totalCleared = SIZE_KEYS.reduce((s, k) => s + trail.treesCleared[k], 0)

  const patrolHistoryBlock = isAuthenticated ? (
    <PatrolHistorySection history={trail.patrolHistory} />
  ) : (
    <SignInBlurGate
      onSignIn={onSignInPrompt}
      title="To view patrol history you must be logged in."
      description="Sign in to see dated patrol entries and notes for this trail."
    >
      <PatrolHistorySection history={trail.patrolHistory} />
    </SignInBlurGate>
  )

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-5 gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition-colors group shrink-0"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Trails
          </button>

          <div className="flex items-center gap-1.5">
            <div className="flex gap-1">
              {(['current', 'last'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => !refreshing && onSeasonChange?.(s)}
                  disabled={refreshing}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors disabled:opacity-60 ${
                    season === s
                      ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
                      : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700'
                  }`}
                >
                  {s === 'current' ? 'Season to Date' : 'Last Season'}
                </button>
              ))}
            </div>
            {refreshing && <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin shrink-0" />}
          </div>
        </div>

        {onToggleMap && (
          <button
            type="button"
            onClick={onToggleMap}
            title={mapOpen ? 'Close map' : 'Show map'}
            aria-label={mapOpen ? 'Close trail map' : 'Show trail map'}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              mapOpen
                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500 shadow-sm'
                : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            Map
          </button>
        )}
      </div>

      {/* Trail header */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">{trail.name}</h2>
              {trail.wilderness && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <Leaf className="w-3 h-3" /> Wilderness
                </span>
              )}
              {trail.underPatrolled && (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="w-3 h-3" /> Under-patrolled
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-stone-500 flex-wrap">
              {trail.trailNumber > 0 && <><span>#{trail.trailNumber}</span><span>·</span></>}
              <span>{trail.lengthMiles} mi</span>
              <span>·</span>
              <span>{trail.area}</span>
            </div>
          </div>
          <DifficultyBadge difficulty={trail.difficulty} />
        </div>

        {/* Efficiency score bar */}
        {trail.efficiencyScore !== null && (
          <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-stone-400">Contact efficiency</span>
              <div className="flex-1 bg-stone-100 dark:bg-stone-800 rounded-full h-2 max-w-48">
                <div
                  className={`h-2 rounded-full transition-all ${
                    trail.efficiencyScore >= 75 ? 'bg-emerald-500'
                    : trail.efficiencyScore >= 50 ? 'bg-amber-400'
                    : 'bg-red-400'
                  }`}
                  style={{ width: `${trail.efficiencyScore}%` }}
                />
              </div>
              <span className={`text-sm font-bold tabular-nums ${
                trail.efficiencyScore >= 75 ? 'text-emerald-600 dark:text-emerald-400'
                : trail.efficiencyScore >= 50 ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-500 dark:text-red-400'
              }`}>{trail.efficiencyScore} / 100</span>
            </div>
            <p className="text-xs text-stone-400 dark:text-stone-500 leading-snug">
              Hikers contacted per 100 vehicles recorded at the trailhead this season. Trails with no parking data are unscored.
            </p>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Total Patrols" value={trail.patrolCount} icon={<Footprints className="w-4 h-4" strokeWidth={1.5} />} accent />
        <StatCard label="Seen"      value={trail.hikersSeen}      icon={<PersonStanding className="w-4 h-4" strokeWidth={1.5} />} />
        <StatCard label="Contacted" value={trail.hikersContacted} icon={<PersonStanding className="w-4 h-4" strokeWidth={1.5} />} />
      </div>

      {/* Trees inline summary */}
      {totalDown > 0 && (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 mb-4 flex items-center gap-4 text-sm flex-wrap">
          <span className="text-stone-500 text-xs uppercase tracking-wider font-semibold">Trees</span>
          <span className="text-stone-800 dark:text-stone-200 font-semibold tabular-nums">{totalDown} recorded down</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">{totalCleared} cleared</span>
          {totalDown - totalCleared > 0 && (
            <span className="text-amber-600 dark:text-amber-400 font-semibold tabular-nums">{totalDown - totalCleared} remain</span>
          )}
        </div>
      )}

      {/* Violations — gated when logged out */}
      <div className="mb-4">
        {isAuthenticated ? (
          <ViolationsSection violations={trail.violationsByCategory} />
        ) : (
          <SignInBlurGate
            onSignIn={onSignInPrompt}
            title="Sign in to view violations."
            description="Violation records are available to authenticated members only."
          >
            <ViolationsSection violations={trail.violationsByCategory} />
          </SignInBlurGate>
        )}
      </div>

      <div className="mb-4"><TreesSection treesDown={trail.treesDown} treesCleared={trail.treesCleared} /></div>
      <div className="mb-4"><MaintenanceSection work={trail.maintenanceWork} /></div>

      {/* Patrol history — gated when logged out */}
      {patrolHistoryBlock}
    </div>
  )
}
