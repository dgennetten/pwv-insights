import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LeaderboardsTrends } from '../components/leaderboards-trends/LeaderboardsTrends'
import type {
  TimeRange,
  Member,
  Trends,
} from '../types/leaderboards-trends'

interface LeaderboardsData {
  members: Member[]
  trends: Trends
}

const EMPTY_TRENDS: Trends = {
  patrolActivityByWeek:  [],
  violationsByMonth:     [],
  treesBySizeByMonth:    [],
  seasonalPatrolsByMonth:[],
  yearOverYear:          [],
}

export function LeaderboardsPage() {
  const { user, openLogin } = useAuth()
  const navigate = useNavigate()

  const [timeRange, setTimeRange] = useState<TimeRange>('year')
  const [data, setData]       = useState<LeaderboardsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetchData = useCallback(async (range: TimeRange) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leaderboards/data.php?timeRange=${range}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as Record<string, unknown>
      if (json.ok === false) {
        throw new Error(typeof json.detail === 'string' ? json.detail : String(json.error ?? 'API error'))
      }
      setData({
        members: Array.isArray(json.members) ? (json.members as Member[]) : [],
        trends:  (json.trends && typeof json.trends === 'object' ? json.trends : EMPTY_TRENDS) as Trends,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leaderboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData(timeRange) }, [timeRange, fetchData])

  const handleTimeRangeChange = (range: TimeRange) => setTimeRange(range)
  const handleGoBack = useCallback(() => {
    navigate(-1)
  }, [navigate])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-stone-400 dark:text-stone-500 animate-pulse">Loading…</div>
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
      <LeaderboardsTrends
        members={d.members}
        trends={d.trends}
        currentUserId={user?.personId != null ? String(user.personId) : undefined}
        defaultTimeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        onSignInPrompt={openLogin}
        onBack={handleGoBack}
      />
    </div>
  )
}
