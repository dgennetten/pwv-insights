// ─── Time range ───────────────────────────────────────────────────────────────

export type TimeRange = '7d' | '1m' | '3m' | '1y' | 'all'

export type MemberContext = 'all' | number // 'all' = org-wide; number = PersonID

// ─── Current filter scope ─────────────────────────────────────────────────────

export interface DashboardScope {
  timeRange: TimeRange
  memberContext: MemberContext
}

// ─── Headline KPI summary ─────────────────────────────────────────────────────

export interface ActivitySummary {
  patrols: number
  /** Change vs. prior equivalent period (positive = increase) */
  patrolsDelta: number
  trailsCovered: number
  trailsCoveredDelta: number
  treesCleared: number
  treesClearedDelta: number
  hikersSeen: number
  hikersSeenDelta: number
  volunteerHours: number
  totalActiveMembers: number
  /** Human-readable date range label, e.g. "Mar 23 – Mar 30, 2026" */
  periodLabel: string
  /** Optional — returned when backend supports it */
  daysPatrolling?: number
  daysPatrollingDelta?: number
  daysWeeding?: number
  daysWeedingDelta?: number
  hikersContacted?: number
  hikersContactedDelta?: number
}

// ─── Patrol activity chart ─────────────────────────────────────────────────────

export interface PatrolActivityDay {
  date: string       // ISO 8601 date string
  dayLabel: string   // Short label for display, e.g. "Mon", "Mar 24"
  patrols: number
}

// ─── Trail coverage ────────────────────────────────────────────────────────────

export interface TrailCoverageRow {
  trailId: number
  trailName: string
  trailNumber: string
  area: string
  lengthMiles: number
  inWilderness: boolean
  patrols: number
  members: number
  hikersSeen: number
  hikersContacted: number
  lastPatrolDate: string | null  // ISO 8601 date; null if no patrols in period
}

export type TrailCoverageSortKey = 'trailName' | 'patrols' | 'hikersSeen' | 'patrolEfficiency'

/** A single patrol row for the trail coverage drill-down (scoped to the dashboard time range and member). */
export interface CoveragePatrolRow {
  date: string // ISO 8601 date (YYYY-MM-DD)
  memberName: string
  hikersSeen: number
  hikersContacted: number
  /** Sum of tree-line quantities on this report (excludes brushing/limbing TrailClearingIDs, usually 6–8). */
  treesCleared: number
}

// ─── Violations ───────────────────────────────────────────────────────────────

export interface ViolationCategory {
  category: string
  count: number
  color: string
}

// ─── Trees cleared ────────────────────────────────────────────────────────────

export type TreeSizeClass = '< 8"' | '8" – 15"' | '16" – 23"' | '24" – 36"' | '> 36"'

export interface TreeSizeCount {
  sizeClass: TreeSizeClass
  label: string
  count: number
}

export interface TrailTreesCleared {
  trailName: string
  trailNumber: string
  trees: Array<{ sizeClass: TreeSizeClass; count: number }>
  total: number
}

export interface TreesCleared {
  aggregate: TreeSizeCount[]
  byTrail: TrailTreesCleared[]
}

// ─── Member age histogram ─────────────────────────────────────────────────────

export interface MemberAgeGroup {
  ageGroup: string   // e.g. "20–29", "70+"
  active: number     // active within the selected time range
  inactive: number   // not active within the selected time range
}

// ─── Member selector ──────────────────────────────────────────────────────────

export interface MemberOption {
  personId: number
  firstName: string
  lastName: string
  fullName: string
  /** Total patrol count (all-time) — used to sort the dropdown */
  patrols: number
}

// ─── Component props ──────────────────────────────────────────────────────────

export interface ActivityDashboardProps {
  /** Per-user display preferences; falls back to defaults when omitted. */
  userPrefs?: import('./settings').UserPreferences
  scope: DashboardScope
  summary: ActivitySummary
  patrolActivity: PatrolActivityDay[]
  trailCoverage: TrailCoverageRow[]
  violationsByCategory: ViolationCategory[]
  treesCleared: TreesCleared
  members: MemberOption[]
  /** Cohort histogram; UI shows this only when `scope.memberContext` is `'all'`. */
  membersByAge: MemberAgeGroup[]

  /**
   * Patrol rows keyed by trail ID for the trail coverage detail view.
   * Must match the current dashboard scope (time range + member); implementation supplies filtered data when scope changes.
   */
  patrolsByTrailId: Record<number, CoveragePatrolRow[]>

  /** PersonID of the logged-in user; enables the "Me" shortcut in the member selector. Omit for public/unauthenticated view. */
  currentUserId?: number

  /**
   * Trail coverage table: initial batch size and each "Load more" increment.
   * Omit to use component default (50). Real apps should pass the value from org admin settings.
   */
  trailCoveragePageSize?: number

  /** Called when the user selects a different time range preset */
  onTimeRangeChange?: (range: TimeRange) => void

  /** Called when the user selects a member from the dropdown (or 'all' for org-wide) */
  onMemberChange?: (context: MemberContext) => void

  /** Called when the user opens a trail from coverage (after internal navigation to the patrol list). */
  onTrailSelect?: (trailId: number) => void

  /** Called when the user leaves the trail coverage patrol list (back to the dashboard). */
  onTrailCoverageBack?: () => void

  /** Called when the trail coverage table sort column or direction changes */
  onTrailCoverageSortChange?: (key: TrailCoverageSortKey, direction: 'asc' | 'desc') => void
}

// ─── Trail coverage → patrol list (detail screen) ─────────────────────────────

export interface TrailCoveragePatrolDetailProps {
  trail: TrailCoverageRow
  /** Patrols for this trail within the active dashboard scope (same time range and member filter as the dashboard). */
  patrols: CoveragePatrolRow[]
  /** Time range label (matches KPI summary). */
  periodLabel: string
  /** Member scope label, e.g. "All members" or a person's name when Me / other member is selected. */
  memberScopeLabel: string
  onBack: () => void
  /** Per-user trail detail display preferences; falls back to defaults when omitted. */
  trailDetailPrefs?: import('./settings').TrailDetailPrefs
}
