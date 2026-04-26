import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Reports } from '../components/reports/Reports'
import type { ReportsData } from '../types/reports'

type MemberContext = 'all' | number
type Season = 'current' | 'last'

function memberContextParam(ctx: MemberContext): string {
  if (ctx === 'all') return 'all'
  const n = Math.trunc(Number(ctx))
  return Number.isFinite(n) && n >= 1 ? String(n) : 'all'
}

export function ReportsPage() {
  const { user } = useAuth()

  const [memberContext, setMemberContext] = useState<MemberContext>('all')
  const [season, setSeason]               = useState<Season>('current')
  const [data, setData]                   = useState<ReportsData | null>(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)

  const fetchData = useCallback(async (ctx: MemberContext, s: Season) => {
    setLoading(true)
    setError(null)
    try {
      const mc  = memberContextParam(ctx)
      const url = `/api/reports/list.php?memberContext=${encodeURIComponent(mc)}&season=${s}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ReportsData & { error?: string }
      if (json.error) throw new Error(json.error)
      setData({ reports: json.reports ?? [], totalCount: json.totalCount ?? 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData(memberContext, season) }, [memberContext, season, fetchData])

  // When user logs out, reset to 'all'
  useEffect(() => {
    if (!user?.personId) setMemberContext('all')
  }, [user?.personId])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-stone-400 dark:text-stone-500 animate-pulse">Loading reports…</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-red-500">Failed to load reports: {error}</p>
          <button
            onClick={() => void fetchData(memberContext, season)}
            className="text-xs text-stone-500 underline hover:text-stone-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const d = data!
  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500 animate-pulse z-20" />
      )}
      <Reports
        reports={d.reports}
        totalCount={d.totalCount}
        memberContext={memberContext}
        currentUserId={user?.personId}
        season={season}
        refreshing={loading}
        onMemberContextChange={setMemberContext}
        onSeasonChange={setSeason}
      />
    </div>
  )
}
