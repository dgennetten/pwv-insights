import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { ActivityDashboard } from '../components/activity-dashboard/ActivityDashboard'
import { roundTreesClearedForScope } from '../components/activity-dashboard/formatTreesCleared'
import { getStoredAuthToken } from '../services/authService'
import { fetchUserPreferences } from '../services/settingsService'
import { DEFAULT_PREFERENCES, type UserPreferences } from '../types/settings'
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
  hikersSeen: 0, hikersSeenDelta: 0,
  volunteerHours: 0, totalActiveMembers: 0,
  periodLabel: '—',
}

/** Safe PersonID for API query — never "undefined" / 0 from bad state */
function memberContextQueryParam(ctx: MemberContext): string {
  if (ctx === 'all') return 'all'
  const n = typeof ctx === 'number' ? ctx : Number(ctx)
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return 'all'
  return String(n)
}

function initialMemberContext(personId: number | undefined): MemberContext {
  if (personId == null) return 'all'
  const n = Math.trunc(Number(personId))
  if (!Number.isFinite(n) || n < 1) return 'all'
  return n
}

function normalizeTreesClearedPayload(tc: TreesCleared, memberScoped: boolean): TreesCleared {
  return {
    aggregate: tc.aggregate.map(a => ({
      ...a,
      count: roundTreesClearedForScope(Number(a.count), memberScoped),
    })),
    byTrail: tc.byTrail.map(tr => ({
      ...tr,
      total: roundTreesClearedForScope(Number(tr.total), memberScoped),
      trees: tr.trees.map(t => ({
        ...t,
        count: roundTreesClearedForScope(Number(t.count), memberScoped),
      })),
    })),
  }
}

/** Ensures summary.hikersSeen is a number; if API omits it, sum Trail Coverage "Seen" column. */
function normalizeDashData(raw: Record<string, unknown>, memberContext: MemberContext): DashData {
  const memberScoped = memberContext !== 'all'
  const trailCoverage = (Array.isArray(raw.trailCoverage) ? raw.trailCoverage : []) as TrailCoverageRow[]
  const sumSeenFromTrails = trailCoverage.reduce((acc, row) => acc + (Number(row.hikersSeen) || 0), 0)
  const rawSummary = raw.summary as Partial<ActivitySummary> | undefined

  const numOrNull = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
    return null
  }

  const hikersSeenFromApi = numOrNull(rawSummary?.hikersSeen)
  const hikersSeen = hikersSeenFromApi !== null ? hikersSeenFromApi : sumSeenFromTrails

  const hikersSeenDeltaRaw = numOrNull(rawSummary?.hikersSeenDelta)
  const hikersSeenDelta = hikersSeenDeltaRaw !== null ? hikersSeenDeltaRaw : 0

  const sumContactedFromTrails = trailCoverage.reduce((acc, row) => acc + (Number(row.hikersContacted) || 0), 0)
  const hikersContactedFromApi = numOrNull(rawSummary?.hikersContacted)
  const hikersContacted = hikersContactedFromApi !== null ? hikersContactedFromApi : sumContactedFromTrails
  const hikersContactedDelta = numOrNull(rawSummary?.hikersContactedDelta) ?? 0

  const summaryBase: ActivitySummary = {
    ...EMPTY_SUMMARY,
    ...rawSummary,
    hikersSeen,
    hikersSeenDelta,
    hikersContacted,
    hikersContactedDelta,
  }

  const treesClearedRounded = roundTreesClearedForScope(Number(summaryBase.treesCleared), memberScoped)
  const treesClearedDeltaRounded = roundTreesClearedForScope(Number(summaryBase.treesClearedDelta), memberScoped)
  const summary: ActivitySummary = {
    ...summaryBase,
    treesCleared: treesClearedRounded,
    treesClearedDelta: treesClearedDeltaRounded,
  }

  const treesPayload = (raw.treesCleared && typeof raw.treesCleared === 'object'
    ? raw.treesCleared
    : EMPTY_TREES) as TreesCleared

  return {
    summary,
    patrolActivity: (Array.isArray(raw.patrolActivity) ? raw.patrolActivity : []) as PatrolActivityDay[],
    trailCoverage,
    patrolsByTrailId: (raw.patrolsByTrailId && typeof raw.patrolsByTrailId === 'object'
      ? raw.patrolsByTrailId
      : {}) as Record<number, CoveragePatrolRow[]>,
    violationsByCategory: (Array.isArray(raw.violationsByCategory) ? raw.violationsByCategory : []) as ViolationCategory[],
    treesCleared: normalizeTreesClearedPayload(treesPayload, memberScoped),
    membersByAge: (Array.isArray(raw.membersByAge) ? raw.membersByAge : []) as MemberAgeGroup[],
    members: (Array.isArray(raw.members) ? raw.members : []) as MemberOption[],
  }
}

export function ActivityDashboardPage() {
  const { user } = useAuth()

  const [scope, setScope] = useState<DashboardScope>(() => ({
    timeRange: '3m',
    memberContext: initialMemberContext(user?.personId),
  }))
  const [data, setData]       = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [userPrefs, setUserPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES)

  const fetchData = useCallback(async (s: DashboardScope) => {
    setLoading(true)
    setError(null)
    try {
      const mc = memberContextQueryParam(s.memberContext)
      const res = await fetch(
        `/api/dashboard/data.php?timeRange=${s.timeRange}&memberContext=${encodeURIComponent(mc)}`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as Record<string, unknown>
      if (json && json.ok === false && json.error) {
        const detail = typeof json.detail === 'string' ? json.detail : String(json.error)
        throw new Error(`Dashboard API: ${detail}`)
      }
      if (!json.summary || typeof json.summary !== 'object') {
        const hint =
          typeof json.hint === 'string'
            ? ` ${json.hint}`
            : ' For local dev, set PHP_API_UPSTREAM in .env.local (see server/dev-api.mjs) and restart npm run dev:api.'
        throw new Error(`Dashboard API returned no summary (check network tab and PHP).${hint}`)
      }
      setData(normalizeDashData(json, s.memberContext))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(scope) }, [scope, fetchData])

  useEffect(() => {
    if (!user?.personId) {
      setUserPrefs(DEFAULT_PREFERENCES)
      return
    }
    const token = getStoredAuthToken()
    if (!token) return
    void fetchUserPreferences(token).then(prefs => setUserPrefs(prefs))
  }, [user?.personId])

  // When signed out, org-wide scope only (was: memberContext stayed on last user's PersonID).
  // When signed in, repair invalid memberContext (e.g. bad number → default to self).
  useEffect(() => {
    const pid = user?.personId
    if (pid == null) {
      setScope(prev => (prev.memberContext === 'all' ? prev : { ...prev, memberContext: 'all' }))
      return
    }
    const me = initialMemberContext(pid)
    if (me === 'all') return
    setScope(prev => {
      if (prev.memberContext === 'all') return prev
      const mc = prev.memberContext
      if (mc === undefined || mc === null) {
        return { ...prev, memberContext: me }
      }
      const cur = typeof mc === 'number' ? mc : Number(mc)
      if (!Number.isFinite(cur) || cur < 1 || !Number.isInteger(cur)) {
        return { ...prev, memberContext: me }
      }
      return prev
    })
  }, [user?.personId])

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
        userPrefs={userPrefs}
        onTimeRangeChange={handleTimeRangeChange}
        onMemberChange={handleMemberChange}
      />
    </div>
  )
}
