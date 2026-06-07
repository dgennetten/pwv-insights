import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MemberGate } from '../components/MemberGate'
import { useAuth } from '../contexts/AuthContext'
import { canAccessAdminPage } from '../lib/adminAccess'
import { version } from '../../package.json'
import {
  fetchAdminMemberLookup,
  fetchAdminMemberSearch,
  fetchAdminRecentLogins,
  fetchAdminTrailLogs,
  getStoredAuthToken,
  type AdminLoginRow,
  type MemberLookupResult,
  type MemberSearchResult,
  type TrailLogRow,
} from '../services/authService'
import { trailLogPersonId } from '../lib/trailLogId'

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

function loginRowToMember(row: AdminLoginRow): MemberSearchResult | null {
  if (!Number.isFinite(row.memberId) || row.memberId <= 0) return null
  return {
    memberId: Math.trunc(row.memberId),
    firstName: row.firstName?.trim() ?? '',
    lastName: row.lastName?.trim() ?? '',
    dob: '',
  }
}

function trailLogToMember(row: TrailLogRow): MemberSearchResult | null {
  const id = trailLogPersonId(row)
  if (id <= 0) return null
  return { memberId: id, firstName: '', lastName: '', dob: '' }
}

function MemberLookupNameButton({
  name,
  onClick,
}: {
  name: string
  onClick: () => void
}) {
  if (name === '—') return <>{name}</>
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
    >
      {name}
    </button>
  )
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

function meritLabel(ratio: number | null): { text: string; className: string } {
  if (ratio === null) return { text: 'No data', className: 'text-stone-400 dark:text-stone-500' }
  if (ratio >= 1.5) return { text: `${ratio}× avg — well above average`, className: 'text-emerald-600 dark:text-emerald-400' }
  if (ratio >= 0.9) return { text: `${ratio}× avg — near average`, className: 'text-stone-600 dark:text-stone-300' }
  return { text: `${ratio}× avg — below average`, className: 'text-amber-600 dark:text-amber-400' }
}

function MemberCard({ result }: { result: import('../services/authService').MemberLookupResult }) {
  const addrLine1 = result.address ?? null
  const addrLine2 = [result.city, result.state].filter(Boolean).join(', ')
    + (result.zip ? ` ${result.zip}` : '')

  const merit = meritLabel(result.merit.ratio)
  const isActive = result.status.toLowerCase().startsWith('active')
  const statusClass = isActive
    ? 'text-emerald-700 dark:text-emerald-400'
    : result.status.toLowerCase() === 'inactive'
      ? 'text-stone-500 dark:text-stone-400'
      : 'text-amber-700 dark:text-amber-400'

  return (
    <div className="mt-4 border-t border-stone-100 dark:border-stone-800 pt-4 space-y-4">
      <div className="flex gap-4 items-start">
        {result.photoUrl ? (
          <img
            src={result.photoUrl}
            alt=""
            className="w-40 h-40 shrink-0 rounded-xl object-cover bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"
          />
        ) : (
          <div
            className="w-40 h-40 shrink-0 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-400 dark:text-stone-500 text-xs text-center px-1"
            aria-hidden
          >
            No photo
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">{result.fullName || '—'}</p>
          <p className={`text-sm font-medium ${statusClass}`}>{result.status}</p>
          {result.email && (
            <p className="text-xs text-stone-500 dark:text-stone-400 truncate">{result.email}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">Phone</p>
        <p className="text-sm text-stone-700 dark:text-stone-200">{result.phone ?? '—'}</p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">Address</p>
        {addrLine1 || addrLine2 ? (
          <>
            {addrLine1 && <p className="text-sm text-stone-700 dark:text-stone-200">{addrLine1}</p>}
            {addrLine2 && <p className="text-sm text-stone-700 dark:text-stone-200">{addrLine2}</p>}
          </>
        ) : (
          <p className="text-sm text-stone-700 dark:text-stone-200">—</p>
        )}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">Date of Birth</p>
        <p className="text-sm text-stone-700 dark:text-stone-200">
          {result.dateOfBirth ?? '—'}
          {result.age !== null && (
            <span className="ml-1.5 text-stone-400 dark:text-stone-500">({result.age} yrs)</span>
          )}
        </p>
      </div>
      <div className="sm:col-span-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">
          Figure of Merit — Season to Date
        </p>
        <p className={`text-sm font-medium ${merit.className}`}>{merit.text}</p>
        <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
          {result.merit.memberDays} patrol {result.merit.memberDays === 1 ? 'day' : 'days'} · group avg {result.merit.avgDays} days · since {result.merit.seasonStart}
        </p>
      </div>
      </div>
    </div>
  )
}

export function AdminPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'logins' | 'logs'>('logins')

  const [logins, setLogins] = useState<AdminLoginRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [trailLogs, setTrailLogs] = useState<TrailLogRow[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logsLoaded, setLogsLoaded] = useState(false)

  const [authQuery, setAuthQuery] = useState('')
  const [authResults, setAuthResults] = useState<MemberSearchResult[]>([])
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null)
  const [lookupResult, setLookupResult] = useState<MemberLookupResult | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const lookupSectionRef = useRef<HTMLDivElement>(null)

  const runMemberLookup = useCallback((memberId: number) => {
    const token = getStoredAuthToken()
    if (!token) {
      setLookupError('No session token found. Sign in again.')
      return
    }
    setLookupLoading(true)
    setLookupError(null)
    setLookupResult(null)
    void fetchAdminMemberLookup(token, memberId)
      .then(r => { setLookupResult(r) })
      .catch(e => { setLookupError(e instanceof Error ? e.message : 'Lookup failed') })
      .finally(() => { setLookupLoading(false) })
  }, [])

  const selectAndLookupMember = useCallback((member: MemberSearchResult, displayName: string) => {
    setSelectedMember(member)
    setAuthQuery(displayName)
    setAuthResults([])
    lookupSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    runMemberLookup(member.memberId)
  }, [runMemberLookup])

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

  const loadTrailLogs = useCallback(async () => {
    if (!canAccessAdminPage(user?.email)) return
    const token = getStoredAuthToken()
    if (!token) return
    setLogsLoading(true)
    setLogsError(null)
    try {
      const rows = await fetchAdminTrailLogs(token)
      setTrailLogs(rows)
      setLogsLoaded(true)
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : 'Failed to load trail logs')
    } finally {
      setLogsLoading(false)
    }
  }, [user?.email])

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
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Admin</h2>
            <span className="text-xs text-stone-400 dark:text-stone-500">v{version}</span>
          </div>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
            Organization tools and audit views · updated {__BUILD_DATE__}
          </p>
        </div>

        {allowed ? (
          <>
          <div
            ref={lookupSectionRef}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 mb-4"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
              Member Lookup
            </h3>
            <div className="flex items-start gap-2">
              <div className="relative flex-1 max-w-sm">
                <input
                  type="text"
                  value={authQuery}
                  onChange={e => {
                    setAuthQuery(e.target.value)
                    setSelectedMember(null)
                    setLookupResult(null)
                    setLookupError(null)
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
                            setLookupResult(null)
                            setLookupError(null)
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
                disabled={selectedMember === null || lookupLoading}
                onClick={() => {
                  if (!selectedMember) return
                  runMemberLookup(selectedMember.memberId)
                }}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {lookupLoading ? 'Loading…' : 'Lookup'}
              </button>
            </div>

            {lookupError && (
              <p className="mt-3 text-xs text-red-600 dark:text-red-400">{lookupError}</p>
            )}

            {lookupResult && (
              <MemberCard result={lookupResult} />
            )}
          </div>

          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">

            {/* Sub-tab bar */}
            <div className="flex border-b border-stone-200 dark:border-stone-800">
              {(['logins', 'logs'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab)
                    if (tab === 'logs' && !logsLoaded) void loadTrailLogs()
                  }}
                  className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 dark:border-emerald-500'
                      : 'border-transparent text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'
                  }`}
                >
                  {tab === 'logins' ? 'Recent Logins' : 'Recent Trail Logs'}
                </button>
              ))}
            </div>

            <div className="p-4">

              {/* ── Recent Logins tab ── */}
              {activeTab === 'logins' && (
                <>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      Recent Logins
                    </span>
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
                            <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">Date</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">Time</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">Member ID</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 min-w-[10rem]">Member Name</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">Type</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                          {filterLogins(logins).map((row, i) => (
                            <tr key={`${row.memberId}-${row.loggedInAtMs}-${i}`} className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                              <td className="px-3 py-2.5 text-xs text-stone-600 dark:text-stone-400 whitespace-nowrap tabular-nums">{formatLoginDate(row.loggedInAtMs)}</td>
                              <td className="px-3 py-2.5 text-xs text-stone-600 dark:text-stone-400 whitespace-nowrap tabular-nums">{formatLoginTime(row.loggedInAtMs)}</td>
                              <td className="px-3 py-2.5 text-right text-xs tabular-nums text-stone-600 dark:text-stone-400 whitespace-nowrap">
                                {Number.isFinite(row.memberId) ? String(Math.trunc(row.memberId)) : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-stone-800 dark:text-stone-200">
                                {(() => {
                                  const name = memberNameLastFirst(row)
                                  const member = loginRowToMember(row)
                                  if (!member) return name
                                  return (
                                    <MemberLookupNameButton
                                      name={name}
                                      onClick={() => selectAndLookupMember(member, name)}
                                    />
                                  )
                                })()}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {row.loginType === 'ACCESS' ? (
                                  <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">Access</span>
                                ) : (
                                  <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">OTC</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* ── Recent Trail Logs tab ── */}
              {activeTab === 'logs' && (
                <>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      Recent Trail Logs
                    </span>
                    <button
                      type="button"
                      onClick={() => void loadTrailLogs()}
                      disabled={logsLoading}
                      className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 disabled:opacity-50"
                    >
                      Refresh
                    </button>
                  </div>

                  {logsError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mb-3">{logsError}</p>
                  )}

                  {logsLoading && trailLogs.length === 0 ? (
                    <p className="text-xs text-stone-400 dark:text-stone-500 py-6 text-center">Loading…</p>
                  ) : trailLogs.length === 0 ? (
                    <p className="text-xs text-stone-400 dark:text-stone-500 py-6 text-center">
                      No saved trail logs yet. Logs are created when a report is emailed from the Data Logger.
                    </p>
                  ) : (
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full min-w-[36rem] text-sm">
                        <thead>
                          <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-950/50">
                            <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">Map</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">Date</th>
                            <th className="text-left pl-1 pr-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">Time</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 whitespace-nowrap">Member ID</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 min-w-[10rem]">Member Name</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                          {trailLogs.map(row => {
                            const personId = trailLogPersonId(row)
                            const member = trailLogToMember(row)
                            const displayName = row.memberName?.trim()
                              || (personId > 0 ? `Member ${personId}` : '—')
                            return (
                            <tr key={row.logId} className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <a
                                  href={`/trail-log/${row.logId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60 transition-colors"
                                >
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                  </svg>
                                </a>
                              </td>
                              <td className="px-3 py-2.5 text-xs text-stone-600 dark:text-stone-400 whitespace-nowrap tabular-nums">{row.date}</td>
                              <td className="pl-1 pr-3 py-2.5 text-xs text-stone-600 dark:text-stone-400 whitespace-nowrap tabular-nums">{row.time}</td>
                              <td className="px-3 py-2.5 text-right text-xs tabular-nums text-stone-600 dark:text-stone-400 whitespace-nowrap">
                                {personId > 0 ? personId : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-stone-800 dark:text-stone-200">
                                {member ? (
                                  <MemberLookupNameButton
                                    name={displayName}
                                    onClick={() => selectAndLookupMember(member, displayName)}
                                  />
                                ) : displayName}
                              </td>
                            </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
          </>
        ) : null}
      </div>
    </MemberGate>
  )
}
