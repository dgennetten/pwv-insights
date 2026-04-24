import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { TrailHealth } from '../components/trails/TrailHealth'
import type { Trail } from '../types/trails'

type Season = 'current' | 'last'

interface TrailsApiResponse {
  trails: Trail[]
  season?: string
  error?: string
}

export function TrailsPage() {
  const { user, openLogin } = useAuth()
  const isAuthenticated = !!user

  const [trails,     setTrails]     = useState<Trail[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [season,     setSeason]     = useState<Season>('current')

  useEffect(() => {
    let cancelled = false
    // Full-page spinner only on the initial empty load; subsequent season
    // switches keep TrailHealth mounted and show a lighter refreshing indicator.
    setLoading(prev => prev)   // no-op — keeps existing loading state
    setRefreshing(true)
    setError(null)

    const url = season === 'last' ? '/api/trails/list.php?season=last' : '/api/trails/list.php'
    fetch(url, { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<TrailsApiResponse>
      })
      .then(data => {
        if (cancelled) return
        if (data.error) throw new Error(data.error)
        setTrails(data.trails ?? [])
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load trails')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      })

    return () => { cancelled = true }
  }, [season])

  // Full-page spinner only while the initial fetch is pending (no data yet).
  if (loading && trails.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-stone-400 dark:text-stone-500 animate-pulse">Loading trails…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-red-500">Failed to load trails: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-stone-500 underline hover:text-stone-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <TrailHealth
      trails={trails}
      isAuthenticated={isAuthenticated}
      onSignInPrompt={openLogin}
      season={season}
      onSeasonChange={setSeason}
      refreshing={refreshing}
    />
  )
}
