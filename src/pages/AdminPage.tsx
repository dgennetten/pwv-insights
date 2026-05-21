import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MemberGate } from '../components/MemberGate'
import { useAuth } from '../contexts/AuthContext'
import { canAccessAdminPage } from '../lib/adminAccess'
import {
  fetchAdminMemberSearch,
  fetchAdminRecentLogins,
  getStoredAuthToken,
  type AdminLoginRow,
  type MemberSearchResult,
} from '../services/authService'

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

function filterLogins(rows: AdminLoginRow[]): AdminLoginRow[] {
  const seenAccess = new Set<number>()
  return rows.filter(row => {
    if (row.loginType !== 'ACCESS') return true
    if (seenAccess.has(row.memberId)) return false
    seenAccess.add(row.memberId)
    return true
  })
}

export function AdminPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [logins, setLogins] = useState<AdminLoginRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [authQuery, setAuthQuery] = useState('')
  const [authResults, setAuthResults] = useState<MemberSearchResult[]>([])
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  useEffect(() => {
    if (selectedMember !== null || authQuery.trim().length < 2) {
      setAuthResults([])
      return
    }
    const timer = setTimeout(() => {
      const token = getStoredAuthToken()
      if (!token) return
      void fetchAdminMemberSearch(token, authQuery.trim())
        .then(setAuthResults)
        .catch(() => setAuthResults([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [authQuery, selectedMember])

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
          <>
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
              Create Auth Link
            </h3>
            <div className="flex items-start gap-2">
              <div className="relative flex-1 max-w-sm">
                <input
                  type="text"
                  value={authQuery}
                  onChange={e => {
                    setAuthQuery(e.target.value)
                    setSelectedMember(null)
                    setGeneratedLink(null)
                    setCopied(false)
                  }}
                  placeholder="Member name or email…"
                  className="w-full text-sm border border-stone-300 dark:border-stone-700 rounded-lg px-3 py-1.5 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                {authResults.length > 0 && selectedMember === null && (
                  <ul className="absolute z-10 mt-1 w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg overflow-hidden">
                    {authResults.map(m => (
                      <li key={m.memberId}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMember(m)
                            setAuthQuery(`${m.lastName}, ${m.firstName}`)
                            setAuthResults([])
                            setGeneratedLink(null)
                            setCopied(false)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700/60"
                        >
                          {m.lastName}, {m.firstName}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                disabled={selectedMember === null}
                onClick={() => {
                  if (!selectedMember) return
                  setGeneratedLink(
                    `http://pwv-insights.gennetten.org?id=${selectedMember.dob}${selectedMember.memberId}`
                  )
                  setCopied(false)
                }}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Create
              </button>
            </div>
            {generatedLink && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 px-2 py-1.5 rounded select-all break-all">
                  {generatedLink}
                </span>
                <button
                  type="button"
                  title={copied ? 'Copied!' : 'Copy link'}
                  onClick={() => {
                    void navigator.clipboard.writeText(generatedLink)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="flex-shrink-0 p-1.5 rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                >
                  {copied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                      <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                    </svg>
                  )}
                </button>
              </div>
            )}
          </div>

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
                <table className="w-full min-w-[34rem] text-sm">
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
                      <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {filterLogins(logins).map((row, i) => (
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
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {row.loginType === 'ACCESS' ? (
                            <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                              Access
                            </span>
                          ) : (
                            <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                              OTC
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </>
        ) : null}
      </div>
    </MemberGate>
  )
}
