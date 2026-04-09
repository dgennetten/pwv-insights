import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { ActivityDashboard } from '../components/activity-dashboard/ActivityDashboard'
import type {
  DashboardScope,
  TimeRange,
  MemberContext,
  ActivitySummary,
  PatrolActivityDay,
  TrailCoverageRow,
  CoveragePatrolRow,
  ViolationCategory,
  TreesCleared,
  MemberAgeGroup,
  MemberOption,
} from '../types/activity-dashboard'

interface DashData {
  summary: ActivitySummary
  patrolActivity: PatrolActivityDay[]
  trailCoverage: TrailCoverageRow[]
  patrolsByTrailId: Record<number, CoveragePatrolRow[]>
  violationsByCategory: ViolationCategory[]
  treesCleared: TreesCleared
  membersByAge: MemberAgeGroup[]
  members: MemberOption[]
}

const EMPTY_TREES: TreesCleared = {
  aggregate: [
    { sizeClass: '< 8"',     label: "Small\n(< 8\")",    count: 0 },
    { sizeClass: '8" – 15"', label: "Medium\n(8–15\")",  count: 0 },
    { sizeClass: '16" – 23"',label: "Large\n(16–23\")",  count: 0 },
    { sizeClass: '24" – 36"',label: "XL\n(24–36\")",     count: 0 },
    { sizeClass: '> 36"',    label: "XXL\n(> 36\")",     count: 0 },
  ],
  byTrail: [],
}

const EMPTY_SUMMARY: ActivitySummary = {
  patrols: 0, patrolsDelta: 0,
  trailsCovered: 0, trailsCoveredDelta: 0,
  treesCleared: 0, treesClearedDelta: 0,
  hikersContacted: 0, hikersContactedDelta: 0,
  volunteerHours: 0, totalActiveMembers: 0,
  periodLabel: '—',
}

export function ActivityDashboardPage() {
  const { user } = useAuth()

  const [scope, setScope] = useState<DashboardScope>(() => ({
    timeRange: '7d',
    memberContext: user?.personId ?? 'all',
  }))
  const [data, setData]       = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetchData = useCallback(async (s: DashboardScope) => {
    setLoading(true)
    setError(null)
    try {
      const mc = s.memberContext === 'all' ? 'all' : String(s.memberContext)
      const res = await fetch(
        `/api/dashboard/data.php?timeRange=${s.timeRange}&memberContext=${mc}`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json as DashData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(scope) }, [scope, fetchData])

  const handleTimeRangeChange = (range: TimeRange) =>
    setScope(prev => ({ ...prev, timeRange: range }))

  const handleMemberChange = (ctx: MemberContext) =>
    setScope(prev => ({ ...prev, memberContext: ctx }))

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-stone-400 dark:text-stone-500 animate-pulse">Loading dashboard…</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-red-500">Failed to load: {error}</div>
      </div>
    )
  }

  const d = data!

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500 animate-pulse z-20" />
      )}
      <ActivityDashboard
        scope={scope}
        summary={d?.summary ?? EMPTY_SUMMARY}
        patrolActivity={d?.patrolActivity ?? []}
        trailCoverage={d?.trailCoverage ?? []}
        patrolsByTrailId={d?.patrolsByTrailId ?? {}}
        violationsByCategory={d?.violationsByCategory ?? []}
        treesCleared={d?.treesCleared ?? EMPTY_TREES}
        membersByAge={d?.membersByAge ?? []}
        members={d?.members ?? []}
        currentUserId={user?.personId}
        onTimeRangeChange={handleTimeRangeChange}
        onMemberChange={handleMemberChange}
      />
    </div>
  )
}
