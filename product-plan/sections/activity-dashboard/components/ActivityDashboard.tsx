import { useState, useRef, useEffect } from 'react'
import {
  ChevronDown,
  Users,
  Footprints,
  Map,
  TreePine,
  PersonStanding,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import type {
  ActivityDashboardProps,
  TimeRange,
  MemberContext,
} from '../types'
import { PatrolActivityChart } from './PatrolActivityChart'
import { TrailCoverageList } from './TrailCoverageList'
import { ViolationsChart } from './ViolationsChart'
import { TreesClearedChart } from './TreesClearedChart'
import { MembersByAgeChart } from './MembersByAgeChart'
import { TrailCoveragePatrolDetail } from './TrailCoveragePatrolDetail'

// ─── Time range config ──────────────────────────────────────────────────────

const ACTIVE_LABEL: Record<TimeRange, string> = {
  '7d':  'Active this week',
  '1m':  'Active this month',
  '3m':  'Active this season',
  '1y':  'Active this year',
  'all': 'Active (all time)',
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '7d',  label: 'Last 7 Days' },
  { value: '1m',  label: 'Last Month' },
  { value: '3m',  label: 'Season to Date' },
  { value: '1y',  label: 'Last Season' },
  { value: 'all', label: 'All Time' },
]

// ─── KPI Card ───────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: number | string
  delta: number
  icon: React.ReactNode
  accent?: boolean
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-400 dark:text-stone-500">
      <Minus className="w-2.5 h-2.5" strokeWidth={2} />
      No change
    </span>
  )
  const positive = delta > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
      {positive
        ? <TrendingUp className="w-2.5 h-2.5" strokeWidth={2} />
        : <TrendingDown className="w-2.5 h-2.5" strokeWidth={2} />
      }
      {positive ? '+' : ''}{delta} vs prior
    </span>
  )
}

function KpiCard({ label, value, delta, icon, accent = false }: KpiCardProps) {
  return (
    <div className={`
      rounded-xl border px-4 py-4 flex flex-col gap-3
      ${accent
        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900'
        : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800'
      }
    `}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-wider ${
          accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-500 dark:text-stone-400'
        }`}>
          {label}
        </span>
        <span className={`${accent ? 'text-emerald-500 dark:text-emerald-400' : 'text-stone-300 dark:text-stone-600'}`}>
          {icon}
        </span>
      </div>
      <div>
        <div className={`text-3xl font-bold tabular-nums tracking-tight ${
          accent ? 'text-emerald-900 dark:text-emerald-100' : 'text-stone-900 dark:text-stone-100'
        }`}>
          {value}
        </div>
        <div className="mt-1">
          <DeltaBadge delta={delta} />
        </div>
      </div>
    </div>
  )
}

// ─── Member Selector ────────────────────────────────────────────────────────
// Segmented control: [All Members][Me][Other member... ▼]
// "Me" only shown when currentUserId is provided (logged-in view).

interface MemberSelectorProps {
  members: ActivityDashboardProps['members']
  scope: ActivityDashboardProps['scope']
  currentUserId?: number
  onMemberChange?: (context: MemberContext) => void
}

function MemberSelector({ members, scope, currentUserId, onMemberChange }: MemberSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const isAll = scope.memberContext === 'all'
  const isMe = currentUserId !== undefined && scope.memberContext === currentUserId
  const isOther = !isAll && !isMe

  const currentMember = members.find(m => m.personId === scope.memberContext)
  const filtered = members
    .filter(m => m.personId !== currentUserId)
    .filter(m => search === '' || m.fullName.toLowerCase().includes(search.toLowerCase()))

  const handleSelect = (ctx: MemberContext) => {
    onMemberChange?.(ctx)
    setDropdownOpen(false)
    setSearch('')
  }

  const segmentBase = 'px-3 py-1.5 text-xs font-medium transition-colors rounded-md'
  const segmentActive = 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
  const segmentInactive = 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800'

  return (
    <div ref={ref} className="relative flex items-center">
      <div className="flex bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-0.5 gap-0.5">
        {/* All Members */}
        <button
          onClick={() => handleSelect('all')}
          className={`${segmentBase} ${isAll ? segmentActive : segmentInactive}`}
        >
          All Members
        </button>

        {/* Me — only when authenticated */}
        {currentUserId !== undefined && (
          <button
            onClick={() => handleSelect(currentUserId)}
            className={`${segmentBase} ${isMe ? segmentActive : segmentInactive}`}
          >
            Me
          </button>
        )}

        {/* Other member… — opens dropdown */}
        <button
          onClick={() => setDropdownOpen(prev => !prev)}
          className={`${segmentBase} flex items-center gap-1.5 ${isOther ? segmentActive : segmentInactive}`}
        >
          {isOther && currentMember ? (
            <><Users className="w-3 h-3" strokeWidth={1.5} />{currentMember.firstName}</>
          ) : (
            <>Other member…</>
          )}
          <ChevronDown className={`w-3 h-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
        </button>
      </div>

      {/* Dropdown */}
      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-stone-100 dark:border-stone-800">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full text-sm bg-stone-50 dark:bg-stone-800 rounded-lg px-2.5 py-1.5 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 outline-none border border-stone-200 dark:border-stone-700 focus:border-emerald-400 dark:focus:border-emerald-600 transition-colors"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.map(m => (
              <button
                key={m.personId}
                onClick={() => handleSelect(m.personId)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm transition-colors ${
                  scope.memberContext === m.personId
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : 'text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                <span className="truncate">{m.fullName}</span>
                <span className="text-[10px] tabular-nums text-stone-400 dark:text-stone-500 shrink-0">{m.patrols} patrols</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-stone-400 dark:text-stone-500">
                No members found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Chart card wrapper ──────────────────────────────────────────────────────

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 ${className}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-4">
        {title}
      </h3>
      {children}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ActivityDashboard({
  scope,
  summary,
  patrolActivity,
  trailCoverage,
  violationsByCategory,
  treesCleared,
  membersByAge,
  members,
  patrolsByTrailId,
  currentUserId,
  onTimeRangeChange,
  onMemberChange,
  onTrailSelect,
  onTrailCoverageBack,
  onTrailCoverageSortChange,
  trailCoveragePageSize,
}: ActivityDashboardProps) {
  const [selectedTrailId, setSelectedTrailId] = useState<number | null>(null)

  useEffect(() => {
    setSelectedTrailId(null)
  }, [scope.timeRange, scope.memberContext])

  useEffect(() => {
    if (selectedTrailId !== null && !trailCoverage.some(t => t.trailId === selectedTrailId)) {
      setSelectedTrailId(null)
    }
  }, [trailCoverage, selectedTrailId])

  const selectedTrail =
    selectedTrailId != null ? trailCoverage.find(t => t.trailId === selectedTrailId) ?? null : null

  const handleTrailRowSelect = (trailId: number) => {
    setSelectedTrailId(trailId)
    onTrailSelect?.(trailId)
  }

  const handleTrailCoverageBack = () => {
    setSelectedTrailId(null)
    onTrailCoverageBack?.()
  }

  if (selectedTrailId != null && selectedTrail) {
    const patrols = patrolsByTrailId[selectedTrailId] ?? []
    const memberScopeLabel =
      scope.memberContext === 'all'
        ? 'All members'
        : members.find(m => m.personId === scope.memberContext)?.fullName ?? 'Selected member'
    return (
      <TrailCoveragePatrolDetail
        trail={selectedTrail}
        patrols={patrols}
        periodLabel={summary.periodLabel}
        memberScopeLabel={memberScopeLabel}
        onBack={handleTrailCoverageBack}
      />
    )
  }

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 p-4 md:p-6 lg:p-8">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
            Activity Dashboard
          </h2>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
            {summary.periodLabel}
            {scope.memberContext !== 'all' && (
              <> · {members.find(m => m.personId === scope.memberContext)?.fullName}</>
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {/* Time range selector */}
          <div className="flex bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-0.5 gap-0.5">
            {TIME_RANGES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onTimeRangeChange?.(value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  scope.timeRange === value
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Member selector — only shown when authenticated (currentUserId provided) */}
          {currentUserId !== undefined && (
            <MemberSelector
              members={members}
              scope={scope}
              currentUserId={currentUserId}
              onMemberChange={onMemberChange}
            />
          )}
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Patrols"
          value={summary.patrols}
          delta={summary.patrolsDelta}
          icon={<Footprints className="w-4 h-4" strokeWidth={1.5} />}
          accent
        />
        <KpiCard
          label="Trails Covered"
          value={summary.trailsCovered}
          delta={summary.trailsCoveredDelta}
          icon={<Map className="w-4 h-4" strokeWidth={1.5} />}
        />
        <KpiCard
          label="Trees Cleared"
          value={summary.treesCleared}
          delta={summary.treesClearedDelta}
          icon={<TreePine className="w-4 h-4" strokeWidth={1.5} />}
        />
        <KpiCard
          label="Contacted"
          value={summary.hikersContacted}
          delta={summary.hikersContactedDelta}
          icon={<PersonStanding className="w-4 h-4" strokeWidth={1.5} />}
        />
      </div>

      {/* ── Patrol Activity (full width) ───────────────────────────── */}
      <ChartCard title="Patrol Activity" className="mb-4">
        <PatrolActivityChart data={patrolActivity} />
      </ChartCard>

      {/* ── Trees Cleared + Members by Age (age chart org-wide only) ───────── */}
      <div
        className={`grid grid-cols-1 gap-4 mb-4 ${
          scope.memberContext === 'all' ? 'lg:grid-cols-2' : ''
        }`}
      >
        <ChartCard title="Trees Cleared by Size Class">
          <TreesClearedChart data={treesCleared} />
        </ChartCard>
        {scope.memberContext === 'all' && (
          <ChartCard title="Members by Age">
            <MembersByAgeChart
              data={membersByAge}
              activeLabel={ACTIVE_LABEL[scope.timeRange]}
            />
          </ChartCard>
        )}
      </div>

      {/* ── Violations ─────────────────────────────────────────────── */}
      <ChartCard title="Violations by Category" className="mb-4">
        <ViolationsChart data={violationsByCategory} />
      </ChartCard>

      {/* ── Trail Coverage (list at bottom) ─────────────────────────── */}
      <ChartCard title="Trail Coverage">
        <TrailCoverageList
            data={trailCoverage}
            pageSize={trailCoveragePageSize}
            onTrailSelect={handleTrailRowSelect}
            onSortChange={onTrailCoverageSortChange}
          />
      </ChartCard>

    </div>
  )
}
