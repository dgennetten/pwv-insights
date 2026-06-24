import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchMemberLookup,
  fetchMemberSearch,
  getStoredAuthToken,
  type MemberLookupResult,
  type MemberSearchResult,
} from '../../services/authService'

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
            <p className="text-xs text-stone-500 dark:text-stone-400 truncate">{result.email}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">Phone</p>
          <p className="text-sm text-stone-700 dark:text-stone-200">{result.phone ?? '—'}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5 mt-3">Type</p>
          <p className="text-sm text-stone-700 dark:text-stone-200">{result.memberType ?? '—'}</p>
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
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">Season Patrol Days</p>
          <p className="text-sm text-stone-700 dark:text-stone-200">{result.merit.memberDays}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">Last Patrol</p>
          <p className="text-sm text-stone-700 dark:text-stone-200">{result.lastPatrolDate ?? '—'}</p>
        </div>
      </div>
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
