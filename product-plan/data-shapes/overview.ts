// =============================================================================
// UI Data Shapes — Combined reference (data contracts only, not component Props)
// =============================================================================

// -----------------------------------------------------------------------------
// From: sections/activity-dashboard
// -----------------------------------------------------------------------------

export type ActivityTimeRange = '7d' | '1m' | '3m' | '1y' | 'all'

export type MemberContext = 'all' | number

export interface DashboardScope {
  timeRange: ActivityTimeRange
  memberContext: MemberContext
}

export interface ActivitySummary {
  patrols: number
  patrolsDelta: number
  trailsCovered: number
  trailsCoveredDelta: number
  treesCleared: number
  treesClearedDelta: number
  hikersContacted: number
  hikersContactedDelta: number
  volunteerHours: number
  totalActiveMembers: number
  periodLabel: string
}

export interface PatrolActivityDay {
  date: string
  dayLabel: string
  patrols: number
}

export interface TrailCoverageRow {
  trailId: number
  trailName: string
  trailNumber: string
  area: string
  lengthMiles: number
  inWilderness: boolean
  patrols: number
  members: number
  hikersContacted: number
  lastPatrolDate: string | null
}

export type TrailCoverageSortKey = 'trailName' | 'patrols' | 'hikersContacted' | 'area'

/** Patrol line item for the trail coverage drill-down (scoped to dashboard filters). */
export interface CoveragePatrolRow {
  date: string
  memberName: string
  hikers: number
  durationHours: number
}

/** Violation row for Activity Dashboard charts (includes display color). */
export interface DashboardViolationCategory {
  category: string
  count: number
  color: string
}

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

export interface MemberAgeGroup {
  ageGroup: string
  active: number
  inactive: number
}

export interface MemberOption {
  personId: number
  firstName: string
  lastName: string
  fullName: string
  patrols: number
}

// -----------------------------------------------------------------------------
// From: sections/trails
// -----------------------------------------------------------------------------

export type Difficulty = 'easy' | 'moderate' | 'hard'

export type WorkType =
  | 'Brushing'
  | 'Limbing'
  | 'Drainage'
  | 'Sign work'
  | 'Tread repair'
  | 'Weed management'

export interface TreeSizeBreakdown {
  small: number
  medium: number
  large: number
  xl: number
  xxl: number
}

export interface PatrolEntry {
  date: string
  memberName: string
  hikers: number
  durationHours: number
}

/** Violation row on trail detail (no chart color). */
export interface TrailViolationCategory {
  category: string
  count: number
}

export interface MaintenanceWorkEntry {
  date: string
  workType: WorkType
  quantity: number
  unit: string
  notes: string
}

export interface Trail {
  id: string
  name: string
  trailNumber: number
  lengthMiles: number
  area: string
  difficulty: Difficulty
  wilderness: boolean
  patrolCount: number
  patrolFrequency: number
  hikersContacted: number
  efficiencyScore: number
  underPatrolled: boolean
  patrolHistory: PatrolEntry[]
  treesDown: TreeSizeBreakdown
  treesCleared: TreeSizeBreakdown
  violationsByCategory: TrailViolationCategory[]
  maintenanceWork: MaintenanceWorkEntry[]
}

// -----------------------------------------------------------------------------
// From: sections/leaderboards-trends
// -----------------------------------------------------------------------------

export type LeaderboardsTimeRange = 'week' | 'month' | 'quarter' | 'year' | 'all'

export type LeaderboardCategory = 'days' | 'work' | 'trails' | 'hours'

export type LeaderboardMetric =
  | 'patrolDays'
  | 'hikeDays'
  | 'stockDays'
  | 'trailworkDays'
  | 'wildernessDays'
  | 'contacts'
  | 'treesCleared'
  | 'brushing'
  | 'fireRings'
  | 'trash'
  | 'milesCovered'
  | 'trailCount'
  | 'trailTypes'
  | 'totalHours'
  | 'patrolHours'
  | 'nonPatrolHours'

export interface LeaderboardMember {
  id: string
  name: string
  initials: string
  patrolDays: number
  hikeDays: number
  stockDays: number
  trailworkDays: number
  wildernessDays: number
  contacts: number
  treesCleared: number
  brushing: number
  fireRings: number
  trash: number
  milesCovered: number
  trailCount: number
  trailTypes: number
  totalHours: number
  patrolHours: number
  nonPatrolHours: number
}

export interface PatrolActivityPoint {
  label: string
  count: number
}

export interface ViolationRatePoint {
  month: string
  offLeashDog: number
  campfire: number
  nonDesignatedCamping: number
  other: number
}

export interface TreesBySizePoint {
  month: string
  under8in: number
  eightTo15in: number
  sixteenTo23in: number
  twentyFourTo36in: number
  over36in: number
}

export interface SeasonalUsagePoint {
  month: string
  patrols: number
}

export interface YearOverYearPoint {
  month: string
  previousYear: number
  currentYear: number
}

export interface Trends {
  patrolActivityByWeek: PatrolActivityPoint[]
  violationsByMonth: ViolationRatePoint[]
  treesBySizeByMonth: TreesBySizePoint[]
  seasonalPatrolsByMonth: SeasonalUsagePoint[]
  yearOverYear: YearOverYearPoint[]
}
