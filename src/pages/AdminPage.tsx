import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MemberGate } from '../components/MemberGate'
import { useAuth } from '../contexts/AuthContext'
import { canAccessAdminPage } from '../lib/adminAccess'
import { fetchAdminRecentLogins, getStoredAuthToken, type AdminLoginRow } from '../services/authService'

function formatLoginDate(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatLoginTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function memberNameLastFirst(row: AdminLoginRow): string {
  const last = row.lastName?.trim() ?? ''
  const first = row.firstName?.trim() ?? ''
  if (last && first) return `${last}, ${first}`
  return last || first || '—'
}

export function AdminPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [logins, setLogins] = useState<AdminLoginRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allowed = canAccessAdminPage(user?.email)

  useEffect(() => {
    if (user && !canAccessAdminPage(user.email)) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  const loadLogins = useCallback(async () => {
    if (!canAccessAdminPage(user?.email)) return
    const token = getStoredAuthToken()
    if (!token) {
      setError('No session token found. Sign in again.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchAdminRecentLogins(token)
      setLogins(rows)
    } catch (e) {
      setLogins([])
      setError(e instanceof Error ? e.message : 'Failed to load logins')
    } finally {
      setLoading(false)
    }
  }, [user?.email])

  useEffect(() => {
    void loadLogins()
  }, [loadLogins])

  return (
    <MemberGate>
      <div className="min-h-full bg-stone-50 dark:bg-stone-950 p-4 md:p-6 lg:p-8">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Admin</h2>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
            Organization tools and audit views
          </p>
        </div>

        {allowed ? (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Recent logins
              </h3>
              <button
                type="button"
                onClick={() => void loadLogins()}
                disabled={loading}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>
            )}

            {loading && logins.length === 0 && !error ? (
              <p className="text-xs text-stone-400 dark:text-stone-500 py-6 text-center">Loading…</p>
            ) : logins.length === 0 ? (
              <p className="text-xs text-stone-400 dark:text-stone-500 py-6 text-center">
                No login events recorded yet. Successful sign-ins are logged after you run{' '}
                <code className="text-stone-600 dark:text-stone-400">sql/03-auth-login-log.sql</code>.
              </p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-950/50">
                      <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">
                        Date
                      </th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">
                        Time
                      </th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">
                        Member ID
                      </th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 min-w-[10rem]">
                        Member name
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {logins.map((row, i) => (
                      <tr
                        key={`${row.memberId}-${row.loggedInAtMs}-${i}`}
                        className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
                      >
                        <td className="px-3 py-2.5 text-xs text-stone-600 dark:text-stone-400 whitespace-nowrap tabular-nums">
                          {formatLoginDate(row.loggedInAtMs)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-stone-600 dark:text-stone-400 whitespace-nowrap tabular-nums">
                          {formatLoginTime(row.loggedInAtMs)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs tabular-nums text-stone-600 dark:text-stone-400 whitespace-nowrap">
                          {Number.isFinite(row.memberId) ? String(Math.trunc(row.memberId)) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-stone-800 dark:text-stone-200">
                          {memberNameLastFirst(row)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </MemberGate>
  )
}
