import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { MemberGate } from '../components/MemberGate'
import { Schedule } from '../components/schedule/Schedule'
import type { ScheduleData } from '../types/schedule'
import { fetchUserPreferences, getLocalPreferences } from '../services/settingsService'
import { getStoredAuthToken } from '../services/authService'
import type { ScheduleColumnsPrefs } from '../types/settings'
import { DEFAULT_PREFERENCES } from '../types/settings'

export function SchedulePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAuthenticated = !!user?.personId

  const [memberContext, setMemberContext] = useState<number | null>(null)
  const [view, setView]                   = useState<'upcoming' | 'completed'>('upcoming')
  const [data, setData]                   = useState<ScheduleData | null>(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [columnPrefs, setColumnPrefs]     = useState<ScheduleColumnsPrefs>(
    getLocalPreferences().scheduleColumns ?? DEFAULT_PREFERENCES.scheduleColumns
  )

  // Initialize to current user's personId
  useEffect(() => {
    if (user?.personId && memberContext === null) {
      setMemberContext(Math.trunc(Number(user.personId)))
    }
  }, [user?.personId, memberContext])

  // Load column prefs from server when authenticated
  useEffect(() => {
    const token = getStoredAuthToken()
    if (!token || !user?.personId) return
    fetchUserPreferences(token).then(prefs => {
      setColumnPrefs({ ...DEFAULT_PREFERENCES.scheduleColumns, ...prefs.scheduleColumns })
    }).catch(() => { /* keep local prefs */ })
  }, [user?.personId])

  // Reset on logout
  useEffect(() => {
    if (!user?.personId) setMemberContext(null)
  }, [user?.personId])

  const fetchData = useCallback(async (ctx: number, v: 'upcoming' | 'completed') => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/schedule/list.php?memberContext=${ctx}&view=${v}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ScheduleData & { error?: string }
      if (json.error) throw new Error(json.error)
      setData({
        schedules:  json.schedules  ?? [],
        totalCount: json.totalCount ?? 0,
        members:    json.members    ?? [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load schedule')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated || memberContext === null) {
      setLoading(false)
      setData(null)
      setError(null)
      return
    }
    void fetchData(memberContext, view)
  }, [isAuthenticated, memberContext, view, fetchData])

  const handleMemberContextChange = useCallback((personId: number) => {
    setMemberContext(personId)
  }, [])

  const handleGoBack = useCallback(() => {
    navigate(-1)
  }, [navigate])

  if (!isAuthenticated) {
    return (
      <MemberGate onBack={handleGoBack}>
        <div className="min-h-[60vh] bg-stone-50 dark:bg-stone-950" />
      </MemberGate>
    )
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-stone-400 dark:text-stone-500 animate-pulse">Loading schedule…</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-red-500">Failed to load schedule: {error}</p>
          <button
            onClick={() => memberContext !== null && void fetchData(memberContext, view)}
            className="text-xs text-stone-500 underline hover:text-stone-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data || memberContext === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-stone-400 dark:text-stone-500 animate-pulse">Loading schedule…</div>
      </div>
    )
  }

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500 animate-pulse z-20" />
      )}
      <Schedule
        schedules={data.schedules}
        totalCount={data.totalCount}
        members={data.members}
        memberContext={memberContext}
        currentUserId={user?.personId}
        view={view}
        columnPrefs={columnPrefs}
        refreshing={loading}
        onMemberContextChange={handleMemberContextChange}
        onViewChange={setView}
      />
    </div>
  )
}
