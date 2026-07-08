import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchMemberLookup,
  fetchMemberSearch,
  getStoredAuthToken,
  type MemberLookupResult,
  type MemberSearchResult,
} from '../../services/authService'
import type { Report } from '../../types/reports'

function reportUrl(reportId: number): string {
  return `https://clrdvol.org/groups/index.php?option=com_fs&view=report&Itemid=136&id=${reportId}`
}

function MemberSeasonActivity({ memberId }: { memberId: number }) {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReports(null)
    setFailed(false)
    fetch(`/api/reports/list.php?memberContext=${memberId}&season=current`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled) setReports(j.reports ?? []) })
      .catch(() => { if (!cancelled) { setReports([]); setFailed(true) } })
    return () => { cancelled = true }
  }, [memberId])

  const stats = useMemo(() => {
    if (!reports) return null
    return {
      patrols:         reports.length,
      treesCleared:    reports.reduce((s, r) => s + r.treesCleared, 0),
      hikersContacted: reports.reduce((s, r) => s + r.hikersContacted, 0),
      hikersSeen:      reports.reduce((s, r) => s + r.hikersSeen, 0),
    }
  }, [reports])

  if (failed) return null
  if (reports === null) {
    return (
      <div className="border-t border-stone-100 dark:border-stone-800 pt-4">
        <p className="text-xs text-stone-400 dark:text-stone-500 animate-pulse">Loading activity…</p>
      </div>
    )
  }
  if (reports.length === 0) {
    return (
      <div className="border-t border-stone-100 dark:border-stone-800 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1">This Season</p>
        <p className="text-sm text-stone-500 dark:text-stone-400">No patrols recorded this season.</p>
      </div>
    )
  }

  return (
    <>
      <div className="border-t border-stone-100 dark:border-stone-800 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">This Season</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Patrols',   value: stats!.patrols },
            { label: 'Trees',     value: stats!.treesCleared },
            { label: 'Contacted', value: stats!.hikersContacted },
            { label: 'Seen',      value: stats!.hikersSeen },
          ].map(s => (
            <div key={s.label} className="rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-100 dark:border-stone-800 px-2 py-2 text-center">
              <div className="text-lg font-bold tabular-nums text-stone-800 dark:text-stone-100 leading-none">{s.value}</div>
              <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-stone-100 dark:border-stone-800 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">Recent Patrols</p>
        <ul className="space-y-1.5">
          {reports.slice(0, 5).map(r => {
            const bits = [
              r.treesCleared > 0 ? `${r.treesCleared} trees` : null,
              r.hikersContacted > 0 ? `${r.hikersContacted} contacted` : null,
            ].filter(Boolean)
            return (
              <li key={r.reportId} className="flex items-center justify-between gap-3 text-sm">
                <a
                  href={reportUrl(r.reportId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-2 shrink-0"
                >
                  {r.activityDate}
                </a>
                <span className="text-xs text-stone-400 dark:text-stone-500 truncate text-right">
                  {bits.length > 0 ? bits.join(' · ') : `Report #${r.reportId}`}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

function MemberCard({ result }: { result: MemberLookupResult }) {
  const addrLine1 = result.address ?? null
  const addrLine2 =
    [result.city, result.state].filter(Boolean).join(', ') +
    (result.zip ? ` ${result.zip}` : '')

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
            <a
              href={`mailto:${result.email}`}
              className="block text-xs text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-2 truncate"
            >
              {result.email}
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">Phone</p>
          {result.phone ? (
            <a
              href={`tel:${result.phone.replace(/[^\d+]/g, '')}`}
              className="text-sm text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-2"
            >
              {result.phone}
            </a>
          ) : (
            <p className="text-sm text-stone-700 dark:text-stone-200">—</p>
          )}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5 mt-3">Type</p>
          <p className="text-sm text-stone-700 dark:text-stone-200">{result.memberType ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">Address</p>
          {addrLine1 || addrLine2 ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([addrLine1, addrLine2].filter(Boolean).join(', '))}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Google Maps"
              className="block text-sm text-emerald-700 dark:text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300 hover:underline underline-offset-2"
            >
              {addrLine1 && <span className="block">{addrLine1}</span>}
              {addrLine2 && <span className="block">{addrLine2}</span>}
            </a>
          ) : (
            <p className="text-sm text-stone-700 dark:text-stone-200">—</p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">Season Patrol Days</p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-stone-700 dark:text-stone-200">{result.merit.memberDays}</p>
            {result.merit.ratio != null && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  result.merit.ratio >= 1
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                }`}
              >
                {result.merit.ratio.toFixed(1)}× club avg
              </span>
            )}
          </div>
          {result.merit.avgDays > 0 && (
            <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
              Club average: {result.merit.avgDays} days this season
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">Last Patrol</p>
          <p className="text-sm text-stone-700 dark:text-stone-200">{result.lastPatrolDate ?? '—'}</p>
        </div>
      </div>

      <MemberSeasonActivity memberId={result.memberId} />
    </div>
  )
}

export function MemberLookupPanel({
  initialMemberId,
  initialName,
}: {
  initialMemberId?: number
  initialName?: string
} = {}) {
  const [query, setQuery] = useState(initialName ?? '')
  const [results, setResults] = useState<MemberSearchResult[]>([])
  const [selected, setSelected] = useState<MemberSearchResult | null>(null)
  const [lookupResult, setLookupResult] = useState<MemberLookupResult | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const didInit = useRef(false)
  // true while we should auto-select the first search result and run lookup
  const autoSelect = useRef(initialName != null && initialMemberId == null)

  const runLookup = useCallback((memberId: number) => {
    const token = getStoredAuthToken()
    if (!token) {
      setLookupError('No session token found. Sign in again.')
      return
    }
    setLookupLoading(true)
    setLookupError(null)
    setLookupResult(null)
    void fetchMemberLookup(token, memberId)
      .then(r => { setLookupResult(r) })
      .catch(e => { setLookupError(e instanceof Error ? e.message : 'Lookup failed') })
      .finally(() => { setLookupLoading(false) })
  }, [])

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (initialMemberId != null) runLookup(initialMemberId)
    // initialName case: setting query state above causes the search useEffect to fire naturally
  }, [initialMemberId, runLookup])

  useEffect(() => {
    if (selected !== null || query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      const token = getStoredAuthToken()
      if (!token) return
      void fetchMemberSearch(token, query.trim())
        .then(found => {
          if (autoSelect.current && found.length > 0) {
            autoSelect.current = false
            const m = found[0]!
            setSelected(m)
            setQuery(`${m.lastName}, ${m.firstName}`)
            setResults([])
            runLookup(m.memberId)
          } else {
            autoSelect.current = false
            setResults(found)
          }
        })
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [query, selected, runLookup])

  return (
    <div
      ref={panelRef}
      className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
        Member Lookup
      </h3>
      <div className="flex items-start gap-2">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setSelected(null)
              setLookupResult(null)
              setLookupError(null)
            }}
            placeholder="Member name or email…"
            className="w-full text-sm border border-stone-300 dark:border-stone-700 rounded-lg px-3 py-1.5 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              if (selected) {
                runLookup(selected.memberId)
              } else if (results.length > 0) {
                const m = results[0]!
                setSelected(m)
                setQuery(`${m.lastName}, ${m.firstName}`)
                setResults([])
                runLookup(m.memberId)
              }
            }}
          />
          {results.length > 0 && selected === null && (
            <ul className="absolute z-10 mt-1 w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg overflow-hidden">
              {results.map(m => (
                <li key={m.memberId}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(m)
                      setQuery(`${m.lastName}, ${m.firstName}`)
                      setResults([])
                      setLookupResult(null)
                      setLookupError(null)
                      runLookup(m.memberId)
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
          disabled={selected === null || lookupLoading}
          onClick={() => { if (selected) runLookup(selected.memberId) }}
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
  )
}
