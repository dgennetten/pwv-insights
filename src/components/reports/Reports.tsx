import { useState } from 'react'
import { ArrowDown, ArrowUp, ClipboardList, Eye, MessageSquare, TreePine } from 'lucide-react'
import type { Report } from '../../types/reports'
import { formatInteger } from '../../lib/formatNumber'

export interface ReportsProps {
  reports: Report[]
  totalCount: number
  memberContext: 'all' | number
  currentUserId?: number
  season: 'current' | 'last'
  refreshing?: boolean
  onMemberContextChange: (ctx: 'all' | number) => void
  onSeasonChange: (s: 'current' | 'last') => void
}

function KpiCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border px-4 py-4 flex flex-col gap-3 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          {label}
        </span>
        <span className="text-emerald-500 dark:text-emerald-400">{icon}</span>
      </div>
      <div className="text-3xl font-bold tabular-nums tracking-tight text-emerald-900 dark:text-emerald-100">
        {formatInteger(value)}
      </div>
    </div>
  )
}

type SortCol = 'reportId' | 'writerName' | 'hikersSeen' | 'hikersContacted' | 'treesCleared'
type SortDir = 'asc' | 'desc'

const segmentBase = 'px-3 py-1.5 text-xs font-medium transition-colors rounded-md'
const segmentActive = 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
const segmentInactive = 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800'

export function Reports({ reports, totalCount, memberContext, currentUserId, season, refreshing = false, onMemberContextChange, onSeasonChange }: ReportsProps) {
  const [sortCol, setSortCol] = useState<SortCol>('reportId')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const isLoggedIn = currentUserId != null && currentUserId >= 1
  const isAll = memberContext === 'all'
  const isMe = isLoggedIn && !isAll

  const totalHikersSeen      = reports.reduce((s, r) => s + r.hikersSeen,      0)
  const totalHikersContacted = reports.reduce((s, r) => s + r.hikersContacted, 0)
  const totalTreesCleared    = reports.reduce((s, r) => s + r.treesCleared,    0)

  function handleSortClick(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortDir(col === 'reportId' ? 'desc' : 'asc')
    }
  }

  const sorted = [...reports].sort((a, b) => {
    let cmp = 0
    if (sortCol === 'reportId') {
      cmp = a.reportId - b.reportId
    } else if (sortCol === 'writerName') {
      cmp = (a.writerName ?? '').localeCompare(b.writerName ?? '')
    } else if (sortCol === 'hikersSeen') {
      cmp = a.hikersSeen - b.hikersSeen
    } else if (sortCol === 'hikersContacted') {
      cmp = a.hikersContacted - b.hikersContacted
    } else {
      cmp = a.treesCleared - b.treesCleared
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  function SortIndicator({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ArrowDown className="w-3 h-3 opacity-0" strokeWidth={2} />
    const Icon = sortDir === 'asc' ? ArrowUp : ArrowDown
    return <Icon className="w-3 h-3" strokeWidth={2} />
  }

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 p-4 md:p-6 lg:p-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100 shrink-0">Reports</h2>
          {/* Season toggle — matches TrailList styling exactly */}
          <div className="flex gap-1">
            {(['current', 'last'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => !refreshing && onSeasonChange(s)}
                disabled={refreshing}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors disabled:opacity-60 ${
                  season === s
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700'
                }`}
              >
                {s === 'current' ? 'Season to Date' : 'Last Season'}
              </button>
            ))}
          </div>
        </div>

        {/* Me / All Members toggle */}
        {isLoggedIn && (
          <div className="flex bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-0.5 gap-0.5 self-start">
            <button
              type="button"
              onClick={() => onMemberContextChange('all')}
              className={`${segmentBase} ${isAll ? segmentActive : segmentInactive}`}
            >
              All Members
            </button>
            <button
              type="button"
              onClick={() => onMemberContextChange(currentUserId!)}
              className={`${segmentBase} ${isMe ? segmentActive : segmentInactive}`}
            >
              Me
            </button>
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Reports Filed"
          value={totalCount}
          icon={<ClipboardList className="w-4 h-4" strokeWidth={1.5} />}
        />
        <KpiCard
          label="Hikers Seen"
          value={totalHikersSeen}
          icon={<Eye className="w-4 h-4" strokeWidth={1.5} />}
        />
        <KpiCard
          label="Hikers Contacted"
          value={totalHikersContacted}
          icon={<MessageSquare className="w-4 h-4" strokeWidth={1.5} />}
        />
        <KpiCard
          label="Trees Cleared"
          value={totalTreesCleared}
          icon={<TreePine className="w-4 h-4" strokeWidth={1.5} />}
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800">
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-stone-800 dark:hover:text-stone-200 transition-colors text-stone-500 dark:text-stone-400"
                  onClick={() => handleSortClick('reportId')}
                >
                  <span className="inline-flex items-center gap-1">
                    Report ID
                    <SortIndicator col="reportId" />
                  </span>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 whitespace-nowrap">
                  Report Date
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-stone-800 dark:hover:text-stone-200 transition-colors text-stone-500 dark:text-stone-400"
                  onClick={() => handleSortClick('writerName')}
                >
                  <span className="inline-flex items-center gap-1">
                    Report Writer
                    <SortIndicator col="writerName" />
                  </span>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Other Members
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-stone-800 dark:hover:text-stone-200 transition-colors text-stone-500 dark:text-stone-400"
                  onClick={() => handleSortClick('hikersSeen')}
                >
                  <span className="inline-flex items-center gap-1 justify-end">
                    Seen
                    <SortIndicator col="hikersSeen" />
                  </span>
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-stone-800 dark:hover:text-stone-200 transition-colors text-stone-500 dark:text-stone-400"
                  onClick={() => handleSortClick('hikersContacted')}
                >
                  <span className="inline-flex items-center gap-1 justify-end">
                    Contacted
                    <SortIndicator col="hikersContacted" />
                  </span>
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-stone-800 dark:hover:text-stone-200 transition-colors text-stone-500 dark:text-stone-400"
                  onClick={() => handleSortClick('treesCleared')}
                >
                  <span className="inline-flex items-center gap-1 justify-end">
                    Trees
                    <SortIndicator col="treesCleared" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500 text-sm">
                    No reports found.
                  </td>
                </tr>
              ) : (
                sorted.map(r => (
                  <tr key={r.reportId} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                    <td className="px-4 py-3 tabular-nums text-stone-700 dark:text-stone-300 font-medium">
                      {r.reportId}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-stone-600 dark:text-stone-400 whitespace-nowrap">
                      {r.activityDate}
                    </td>
                    <td className="px-4 py-3 text-stone-800 dark:text-stone-200">
                      {r.writerName ?? <span className="text-stone-400 dark:text-stone-600 italic">Unknown</span>}
                    </td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                      {r.otherMembers.length > 0
                        ? r.otherMembers.join(', ')
                        : <span className="text-stone-300 dark:text-stone-600">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 tabular-nums text-right text-stone-600 dark:text-stone-400">
                      {r.hikersSeen > 0 ? formatInteger(r.hikersSeen) : <span className="text-stone-300 dark:text-stone-600">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-right text-stone-600 dark:text-stone-400">
                      {r.hikersContacted > 0 ? formatInteger(r.hikersContacted) : <span className="text-stone-300 dark:text-stone-600">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-right text-stone-600 dark:text-stone-400">
                      {r.treesCleared > 0 ? formatInteger(r.treesCleared) : <span className="text-stone-300 dark:text-stone-600">—</span>}
                    </td>
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
