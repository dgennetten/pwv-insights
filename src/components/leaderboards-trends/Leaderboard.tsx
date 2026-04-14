import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type {
  Member,
  LeaderboardMetric,
  LeaderboardCategory,
} from '../../types/leaderboards-trends'

// Show up to this many members in the ranked list (below the podium)
const LIST_VISIBLE_N = 7

function fmtVal(value: number): string {
  return value.toLocaleString()
}

// ── Metric + filter config types ─────────────────────────────────────────────

interface MetricConfig {
  value: LeaderboardMetric
  label: string
  unit: string
}

interface LeaderboardProps {
  members: Member[]           // pre-sorted descending by active metric
  currentUserId: string
  metric: LeaderboardMetric
  leaderboardCategory: LeaderboardCategory
  categoryOptions: { value: LeaderboardCategory; label: string }[]
  metrics: MetricConfig[]
  onLeaderboardCategoryChange?: (category: LeaderboardCategory) => void
  onMetricChange?: (metric: LeaderboardMetric) => void
}

// ── Podium ────────────────────────────────────────────────────────────────────

interface PodiumStageProps {
  top3: Member[]
  currentUserId: string
  metric: LeaderboardMetric
  unit: string
}

function PodiumStage({ top3, currentUserId, metric, unit }: PodiumStageProps) {
  if (top3.length < 3) return null

  // Visual display order: 2nd (left), 1st (center/elevated), 3rd (right)
  const slots = [
    { member: top3[1], rank: 2, platformH: 48, avatarSize: 'w-11 h-11', textSize: 'text-sm', valSize: 'text-base font-bold', badgeBg: 'bg-stone-300 dark:bg-stone-600 text-stone-700 dark:text-stone-200' },
    { member: top3[0], rank: 1, platformH: 72, avatarSize: 'w-14 h-14', textSize: 'text-sm font-bold', valSize: 'text-xl font-black', badgeBg: 'bg-amber-400 dark:bg-amber-500 text-white' },
    { member: top3[2], rank: 3, platformH: 28, avatarSize: 'w-10 h-10', textSize: 'text-xs font-medium', valSize: 'text-sm font-bold', badgeBg: 'bg-amber-700/50 dark:bg-amber-800/70 text-white' },
  ]

  const platformColors: Record<number, string> = {
    1: 'bg-amber-100 dark:bg-amber-900/25 border-t-2 border-x border-amber-300/70 dark:border-amber-700/50',
    2: 'bg-stone-100 dark:bg-stone-800 border-t border-x border-stone-200 dark:border-stone-700',
    3: 'bg-amber-50 dark:bg-amber-950/20 border-t border-x border-amber-200/50 dark:border-amber-800/30',
  }

  return (
    <div className="flex items-end justify-center gap-2 px-6 pt-6">
      {slots.map(({ member, rank, platformH, avatarSize, textSize, valSize, badgeBg }) => {
        const isCurrentUser = member.id === currentUserId
        const value = member[metric]

        return (
          <div key={member.id} className="flex-1 flex flex-col items-center gap-1.5 max-w-[150px]">
            {/* Avatar with rank badge */}
            <div className="relative mb-1">
              <div
                className={`${avatarSize} rounded-full flex items-center justify-center font-bold text-sm ${
                  isCurrentUser
                    ? 'bg-emerald-600 dark:bg-emerald-700 text-white ring-2 ring-emerald-400 dark:ring-emerald-500'
                    : rank === 1
                    ? 'bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 ring-2 ring-amber-300 dark:ring-amber-600'
                    : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 ring-1 ring-stone-200 dark:ring-stone-700'
                }`}
              >
                {member.initials}
              </div>
              <div
                className={`absolute -bottom-1.5 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${badgeBg}`}
              >
                {rank}
              </div>
            </div>

            {/* Name + value */}
            <p className={`${textSize} text-stone-800 dark:text-stone-100 truncate max-w-[130px] text-center leading-tight`}>
              {member.name.split(' ')[0]}
              {isCurrentUser && (
                <span className="block text-[10px] font-normal text-emerald-500 leading-none mt-0.5">You</span>
              )}
            </p>
            <p className={`${valSize} text-stone-700 dark:text-stone-200 tabular-nums leading-none`}>
              {fmtVal(value)}
              <span className="text-[10px] font-normal text-stone-400 dark:text-stone-500 ml-0.5">{unit}</span>
            </p>

            {/* Platform block */}
            <div
              className={`w-full rounded-t-sm ${platformColors[rank]}`}
              style={{ height: `${platformH}px` }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── Member row (rank 4+) ──────────────────────────────────────────────────────

function MemberRow({
  member, rank, metric, unit, isCurrentUser,
}: {
  member: Member
  rank: number
  metric: LeaderboardMetric
  unit: string
  isCurrentUser: boolean
}) {
  const value = member[metric]

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${
      isCurrentUser ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''
    }`}>
      <span className="text-sm font-bold w-6 text-center tabular-nums shrink-0 text-stone-300 dark:text-stone-600">
        {rank}
      </span>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        isCurrentUser
          ? 'bg-emerald-600 dark:bg-emerald-700 text-white'
          : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
      }`}>
        {member.initials}
      </div>
      <span className={`flex-1 text-sm font-medium truncate ${
        isCurrentUser ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-800 dark:text-stone-200'
      }`}>
        {member.name}
        {isCurrentUser && (
          <span className="ml-1.5 text-[11px] font-normal text-emerald-500 dark:text-emerald-500">You</span>
        )}
      </span>
      <span className={`text-sm font-bold tabular-nums shrink-0 ${
        isCurrentUser ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-700 dark:text-stone-300'
      }`}>
        {fmtVal(value)}
        <span className="ml-1 text-[11px] font-normal text-stone-400 dark:text-stone-500">{unit}</span>
      </span>
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export function Leaderboard({
  members,
  currentUserId,
  metric,
  leaderboardCategory,
  categoryOptions,
  metrics,
  onLeaderboardCategoryChange,
  onMetricChange,
}: LeaderboardProps) {
  const [expanded, setExpanded] = useState(false)

  const activeMetric = metrics.find(m => m.value === metric) ?? metrics[0]!
  const top3 = members.slice(0, 3)
  const listMembers = members.slice(3)
  const visibleList = expanded ? listMembers : listMembers.slice(0, LIST_VISIBLE_N)
  const hasMore = listMembers.length > LIST_VISIBLE_N

  const currentUserRank = members.findIndex(m => m.id === currentUserId) + 1
  const currentUser = members.find(m => m.id === currentUserId)
  const isUserInTop3 = currentUserRank >= 1 && currentUserRank <= 3
  const isUserInVisibleList = currentUserRank >= 4 && currentUserRank <= 3 + (expanded ? listMembers.length : LIST_VISIBLE_N)
  const showPinnedRow = !isUserInTop3 && !isUserInVisibleList && !!currentUser

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden mb-6">

      {/* Category dropdown + metric tabs */}
      <div className="flex items-stretch border-b border-stone-100 dark:border-stone-800 min-w-0">
        <div className="flex items-center px-3 py-2 border-r border-stone-100 dark:border-stone-800 shrink-0">
          <label className="sr-only">Leaderboard category</label>
          <select
            value={leaderboardCategory}
            onChange={e => onLeaderboardCategoryChange?.(e.target.value as LeaderboardCategory)}
            className="text-xs font-semibold bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 rounded-lg px-2.5 py-2 pr-8 outline-none focus:border-emerald-400 dark:focus:border-emerald-600 cursor-pointer max-w-[7.5rem] sm:max-w-none"
          >
            {categoryOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 min-w-0 overflow-x-auto">
          {metrics.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => onMetricChange?.(m.value)}
              className={`px-3 sm:px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                metric === m.value
                  ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Podium */}
      <PodiumStage
        top3={top3}
        currentUserId={currentUserId}
        metric={metric}
        unit={activeMetric.unit}
      />

      {/* Rank 4+ list */}
      {listMembers.length > 0 && (
        <div className="divide-y divide-stone-100 dark:divide-stone-800 border-t border-stone-200 dark:border-stone-800">
          {visibleList.map((member, idx) => (
            <MemberRow
              key={member.id}
              member={member}
              rank={idx + 4}
              metric={metric}
              unit={activeMetric.unit}
              isCurrentUser={member.id === currentUserId}
            />
          ))}
        </div>
      )}

      {/* Expand / collapse */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 border-t border-stone-100 dark:border-stone-800 transition-colors"
        >
          {expanded
            ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
            : <><ChevronDown className="w-3.5 h-3.5" /> Show all {members.length} members</>
          }
        </button>
      )}

      {/* Pinned "You" row — when current user is outside visible range */}
      {showPinnedRow && (
        <div className="border-t-2 border-dashed border-stone-200 dark:border-stone-700">
          <MemberRow
            member={currentUser!}
            rank={currentUserRank}
            metric={metric}
            unit={activeMetric.unit}
            isCurrentUser
          />
        </div>
      )}
    </div>
  )
}
