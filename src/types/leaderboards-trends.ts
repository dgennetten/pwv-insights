export type TimeRange = 'week' | 'month' | 'quarter' | 'year' | 'all';

/** Trends tab: current-period view vs year-over-year (dropdown disabled when page time range is All Time). */
export type TrendYearComparison = 'thisYear' | 'yearOverYear';

/** Top-level leaderboard grouping; each maps to its own row of metric tabs. */
export type LeaderboardCategory = 'days' | 'work' | 'trails' | 'hours';

export type LeaderboardMetric =
  // Days
  | 'patrolDays'
  | 'hikeDays'
  | 'stockDays'
  | 'trailworkDays'
  | 'wildernessDays'
  // Work
  | 'contacts'
  | 'treesCleared'
  | 'brushing'
  | 'fireRings'
  | 'trash'
  // Trails
  | 'milesCovered'
  | 'trailCount'
  | 'trailTypes'
  // Hours
  | 'totalHours'
  | 'patrolHours'
  | 'nonPatrolHours';

export interface Member {
  id: string;
  name: string;
  initials: string;
  patrolDays: number;
  hikeDays: number;
  stockDays: number;
  trailworkDays: number;
  wildernessDays: number;
  contacts: number;
  treesCleared: number;
  brushing: number;
  fireRings: number;
  trash: number;
  milesCovered: number;
  trailCount: number;
  trailTypes: number;
  /** Present when metric is trail-types; may be missing from API stubs. */
  patrolTypeNames?: string[];
  totalHours: number;
  patrolHours: number;
  nonPatrolHours: number;
}

/** A weekly data point for the patrol activity trend chart. */
export interface PatrolActivityPoint {
  label: string;   // e.g. "Mar W2"
  count: number;
}

/** A monthly data point for the violation rate trend chart, broken down by category. */
export interface ViolationRatePoint {
  month: string;   // e.g. "Mar"
  offLeashDog: number;
  campfire: number;
  nonDesignatedCamping: number;
  other: number;
}

/** A monthly data point for trees cleared broken down by diameter size class. */
export interface TreesBySizePoint {
  month: string;   // e.g. "Mar"
  under8in: number;
  eightTo15in: number;
  sixteenTo23in: number;
  twentyFourTo36in: number;
  over36in: number;
}

/** A calendar-month data point for the seasonal usage pattern chart. */
export interface SeasonalUsagePoint {
  month: string;   // e.g. "Mar"
  patrols: number;
}

/** A monthly data point comparing patrol counts across two consecutive years. */
export interface YearOverYearPoint {
  month: string;   // e.g. "Mar"
  previousYear: number;
  currentYear: number;
}

export interface Trends {
  patrolActivityByWeek: PatrolActivityPoint[];
  violationsByMonth: ViolationRatePoint[];
  treesBySizeByMonth: TreesBySizePoint[];
  seasonalPatrolsByMonth: SeasonalUsagePoint[];
  yearOverYear: YearOverYearPoint[];
}

export interface LeaderboardsTrendsProps {
  members: Member[];
  trends: Trends;
  /**
   * Logged-in member id for highlight/pin on the leaderboard. **Omit when the user is not authenticated**
   * — Leaderboards are unavailable (tab disabled); Trends remain fully usable.
   */
  currentUserId?: string;
  defaultTimeRange?: TimeRange;
  /**
   * Initial leaderboard category when the user has no saved preference (e.g. first visit).
   * Component default is **Work**; persisted choice in `localStorage` wins when present.
   */
  defaultLeaderboardCategory?: LeaderboardCategory;
  /** Initial metric tab when no saved preference; default pairs with Work → Contacts. */
  defaultMetric?: LeaderboardMetric;
  /** Called when the user changes the active time range. */
  onTimeRangeChange?: (range: TimeRange) => void;
  /** Called when the user switches the leaderboard category (Days / Work / …). */
  onLeaderboardCategoryChange?: (category: LeaderboardCategory) => void;
  /** Called when the user switches the active metric tab within the category. */
  onMetricChange?: (metric: LeaderboardMetric) => void;
  /** When the user is not logged in, optional handler for the **Sign in** control on the leaderboard gate. */
  onSignInPrompt?: () => void;
}
