import { useState, useRef, useEffect } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Users } from 'lucide-react'
import type { ScheduleEntry, ScheduleMemberOption } from '../../types/schedule'
import type { ScheduleColumnsPrefs } from '../../types/settings'
import { DEFAULT_PREFERENCES } from '../../types/settings'
import { formatInteger } from '../../lib/formatNumber'

export interface ScheduleProps {
  schedules: ScheduleEntry[]
  totalCount: number
  members: ScheduleMemberOption[]
  memberContext: number
  currentUserId?: number
  view: 'upcoming' | 'completed'
  columnPrefs?: ScheduleColumnsPrefs
  refreshing?: boolean
  onMemberContextChange: (personId: number) => void
  onViewChange: (v: 'upcoming' | 'completed') => void
}

type SortCol = 'scheduleId' | 'activityDate' | 'wksiteName' | 'activityType' | 'activityMethod' | 'schedulerName'
type SortDir = 'asc' | 'desc'

const segmentBase = 'px-3 py-1.5 text-xs font-medium transition-colors rounded-md'
const segmentActive = 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
const segmentInactive = 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800'

// ─── Member selector ─────────────────────────────────────────────────────────

interface MemberSelectorProps {
  members: ScheduleMemberOption[]
  memberContext: number
  currentUserId?: number
  onMemberContextChange: (personId: number) => void
}

function MemberSelector({ members, memberContext, currentUserId, onMemberContextChange }: MemberSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const uid = currentUserId != null ? Math.trunc(Number(currentUserId)) : undefined
  const isMe = uid !== undefined && uid >= 1 && memberContext === uid
  const isOther = !isMe

  const currentMember = members.find(m => m.personId === memberContext)
  const filtered = members
    .filter(m => uid === undefined || m.personId !== uid)
    .filter(m => search === '' || m.fullName.toLowerCase().includes(search.toLowerCase()))

  const handleSelect = (personId: number) => {
    onMemberContextChange(personId)
    setDropdownOpen(false)
    setSearch('')
  }

  return (
    <div ref={ref} className="relative flex items-center">
      <div className="flex bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-0.5 gap-0.5">
        {uid !== undefined && uid >= 1 && (
          <button
            type="button"
            onClick={() => handleSelect(uid)}
            className={`${segmentBase} ${isMe ? segmentActive : segmentInactive}`}
          >
            Me
          </button>
        )}
        <button
          type="button"
          onClick={() => setDropdownOpen(prev => !prev)}
          className={`${segmentBase} flex items-center gap-1.5 ${isOther ? segmentActive : segmentInactive}`}
        >
          {isOther && currentMember ? (
            <><Users className="w-3 h-3" strokeWidth={1.5} />{currentMember.firstName}</>
          ) : (
            <>Other member…</>
          )}
          <ChevronDown className={`w-3 h-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
        </button>
      </div>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-stone-100 dark:border-stone-800">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full text-sm bg-stone-50 dark:bg-stone-800 rounded-lg px-2.5 py-1.5 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 outline-none border border-stone-200 dark:border-stone-700 focus:border-emerald-400 dark:focus:border-emerald-600 transition-colors"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.map(m => (
              <button
                key={m.personId}
                type="button"
                onClick={() => handleSelect(m.personId)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm transition-colors ${
                  memberContext === m.personId
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : 'text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                <span className="truncate">{m.fullName}</span>
                <span className="text-[10px] tabular-nums text-stone-400 dark:text-stone-500 shrink-0">
                  {formatInteger(m.scheduleCount)}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-stone-400 dark:text-stone-500">No members found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Schedule({
  schedules,
  totalCount,
  members,
  memberContext,
  currentUserId,
  view,
  columnPrefs,
  refreshing = false,
  onMemberContextChange,
  onViewChange,
}: ScheduleProps) {
  const cols = { ...DEFAULT_PREFERENCES.scheduleColumns, ...columnPrefs }

  const defaultDir: SortDir = view === 'upcoming' ? 'asc' : 'desc'
  const [sortCol, setSortCol] = useState<SortCol>('activityDate')
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  useEffect(() => {
    setSortCol('activityDate')
    setSortDir(view === 'upcoming' ? 'asc' : 'desc')
  }, [view])

  function handleSortClick(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortDir(col === 'scheduleId' ? 'desc' : (view === 'upcoming' ? 'asc' : 'desc'))
    }
  }

  const sorted = [...schedules].sort((a, b) => {
    let cmp = 0
    if (sortCol === 'scheduleId') {
      cmp = a.scheduleId - b.scheduleId
    } else if (sortCol === 'activityDate') {
      cmp = a.activityDate.localeCompare(b.activityDate)
    } else if (sortCol === 'wksiteName') {
      cmp = (a.wksiteName ?? '').localeCompare(b.wksiteName ?? '')
    } else if (sortCol === 'activityType') {
      cmp = (a.activityType ?? '').localeCompare(b.activityType ?? '')
    } else if (sortCol === 'activityMethod') {
      cmp = (a.activityMethod ?? '').localeCompare(b.activityMethod ?? '')
    } else {
      cmp = (a.schedulerName ?? '').localeCompare(b.schedulerName ?? '')
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  function SortIndicator({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ArrowDown className="w-3 h-3 opacity-0" strokeWidth={2} />
    const Icon = sortDir === 'asc' ? ArrowUp : ArrowDown
    return <Icon className="w-3 h-3" strokeWidth={2} />
  }

  function SortableTh({ col, label, align = 'left' }: { col: SortCol; label: string; align?: 'left' | 'right' }) {
    return (
      <th
        className={`text-${align} px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-stone-800 dark:hover:text-stone-200 transition-colors text-stone-500 dark:text-stone-400`}
        onClick={() => handleSortClick(col)}
      >
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          {label}
          <SortIndicator col={col} />
        </span>
      </th>
    )
  }

  // Count visible columns for the empty-state colspan
  const colCount = 1 /* date always */ + (cols.scheduleId ? 1 : 0) + (cols.trail ? 1 : 0) +
    (cols.activityType ? 1 : 0) + (cols.activityMethod ? 1 : 0) +
    (cols.members ? 1 : 0) + (cols.author ? 1 : 0)

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 p-4 md:p-6 lg:p-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100 shrink-0">
          My Schedule
          <span className="ml-2 text-sm font-normal text-stone-500 dark:text-stone-400 tabular-nums">
            ({formatInteger(totalCount)})
          </span>
        </h2>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Upcoming / Completed toggle */}
          <div className="flex bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-0.5 gap-0.5">
            {(['upcoming', 'completed'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => !refreshing && onViewChange(v)}
                disabled={refreshing}
                className={`${segmentBase} disabled:opacity-60 ${view === v ? segmentActive : segmentInactive}`}
              >
                {v === 'upcoming' ? 'Upcoming' : 'Completed'}
              </button>
            ))}
          </div>

          {/* Me / Other member selector */}
          <MemberSelector
            members={members}
            memberContext={memberContext}
            currentUserId={currentUserId}
            onMemberContextChange={onMemberContextChange}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800">
                {/* Activity Date — always shown */}
                <SortableTh col="activityDate" label="Activity Date" />
                {cols.scheduleId    && <SortableTh col="scheduleId"     label="Schedule #" />}
                {cols.trail         && <SortableTh col="wksiteName"     label="Trail" />}
                {cols.activityType  && <SortableTh col="activityType"   label="Type" />}
                {cols.activityMethod && <SortableTh col="activityMethod" label="Method" />}
                {cols.members && (
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Members
                  </th>
                )}
                {cols.author && <SortableTh col="schedulerName" label="Author" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500 text-sm">
                    No {view} activities found.
                  </td>
                </tr>
              ) : (
                sorted.map(s => (
                  <tr key={s.scheduleId} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                    <td className="px-4 py-3 tabular-nums text-stone-600 dark:text-stone-400 whitespace-nowrap">
                      {s.activityDate}
                    </td>
                    {cols.scheduleId && (
                      <td className="px-4 py-3 tabular-nums text-stone-700 dark:text-stone-300 font-medium">
                        {s.scheduleId}
                      </td>
                    )}
                    {cols.trail && (
                      <td className="px-4 py-3 text-stone-800 dark:text-stone-200">
                        {s.wksiteName ?? <span className="text-stone-400 dark:text-stone-600 italic">Unknown</span>}
                      </td>
                    )}
                    {cols.activityType && (
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                        {s.activityType ?? <span className="text-stone-300 dark:text-stone-600">—</span>}
                      </td>
                    )}
                    {cols.activityMethod && (
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                        {s.activityMethod ?? <span className="text-stone-300 dark:text-stone-600">—</span>}
                      </td>
                    )}
                    {cols.members && (
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                        {s.members.length > 0
                          ? s.members.join(', ')
                          : <span className="text-stone-300 dark:text-stone-600">—</span>
                        }
                      </td>
                    )}
                    {cols.author && (
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                        {s.schedulerName ?? <span className="text-stone-300 dark:text-stone-600">—</span>}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
