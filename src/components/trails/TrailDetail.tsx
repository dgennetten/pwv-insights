import type { ReactNode } from 'react'
import { ArrowLeft, Leaf, AlertTriangle, Footprints, PersonStanding, Lock } from 'lucide-react'
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
  const maxDown = Math.max(...SIZE_KEYS.map(k => treesDown[k]), 1)
  return (
    <SectionCard title="Trees Down & Cleared by Size Class">
      <div className="space-y-3">
        {SIZE_KEYS.map(key => {
          const down = treesDown[key], cleared = treesCleared[key], remaining = down - cleared
          const pct = Math.round((down / maxDown) * 100)
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs font-mono text-stone-400 w-12 shrink-0 text-right">{SIZE_LABELS[key]}</span>
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <div className="flex-1 bg-stone-100 dark:bg-stone-800 rounded-full h-5 overflow-hidden relative">
                  {down > 0 && (
                    <div className="absolute inset-y-0 left-0 bg-stone-300 dark:bg-stone-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  )}
                  {cleared > 0 && (
                    <div className="absolute inset-y-0 left-0 bg-emerald-500 dark:bg-emerald-600 rounded-full transition-all" style={{ width: `${Math.round((cleared / maxDown) * 100)}%` }} />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs tabular-nums shrink-0 w-24">
                  <span className={`font-semibold ${down === 0 ? 'text-stone-300 dark:text-stone-600' : 'text-stone-700 dark:text-stone-300'}`}>
                    {down} down
                  </span>
                  {remaining > 0 && <span className="text-amber-600 dark:text-amber-400 font-medium">{remaining} left</span>}
                  {down > 0 && remaining === 0 && <span className="text-emerald-600 dark:text-emerald-400 font-medium">cleared</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-stone-100 dark:border-stone-800">
        <span className="flex items-center gap-1.5 text-xs text-stone-400">
          <span className="w-3 h-3 rounded-full bg-stone-300 dark:bg-stone-600 inline-block" /> Down
        </span>
        <span className="flex items-center gap-1.5 text-xs text-stone-400">
          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Cleared
        </span>
      </div>
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
    <SectionCard title="Patrol History">
      {history.length === 0 ? (
        <p className="text-sm text-stone-400 dark:text-stone-500">No patrols recorded.</p>
      ) : (
        <div className="divide-y divide-stone-100 dark:divide-stone-800 -mx-4">
          {history.map((entry, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{entry.memberName}</span>
                    <span className="text-xs text-stone-400">{formatDate(entry.date)}</span>
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5">{entry.durationHours}h patrol</div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3 text-sm tabular-nums">
                <span className="text-stone-500">{entry.hikersSeen} seen</span>
                <span className="font-semibold text-stone-700 dark:text-stone-300">{entry.hikersContacted} contacted</span>
              </div>
            </div>
          ))}
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
}

export function TrailDetail({ trail, isAuthenticated = false, onBack, onSignInPrompt }: TrailDetailProps) {
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
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition-colors mb-5 group"
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
        Trails
      </button>

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
        <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 space-y-1.5">
          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-400">Patrol efficiency score</span>
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
            Patrols completed this season relative to the expected pace for this trail's length and months elapsed. 100 = fully on pace; below 50 = needs more coverage.
          </p>
        </div>
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
