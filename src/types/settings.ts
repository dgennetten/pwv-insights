// ─── User preference types ────────────────────────────────────────────────────

export interface DashboardKpiPrefs {
  patrols: boolean
  trailsCovered: boolean
  treesCleared: boolean
  hikersSeen: boolean
  daysPatrolling: boolean
  daysWeeding: boolean
  hikersContacted: boolean
  /** Trail coverage table: contact efficiency column (hikersSeen / patrols). */
  patrolEfficiency: boolean
  /** Suggested: total volunteer hours in scope. */
  volunteerHours: boolean
}

export interface TrailDetailPrefs {
  treesCleared: boolean
  hikersSeen: boolean
  hikersContacted: boolean
  /** Per-patrol contact efficiency (contacted ÷ seen) shown as a column and summary box. */
  patrolEfficiency: boolean
}

export interface UserPreferences {
  dashboardKpi: DashboardKpiPrefs
  trailDetail: TrailDetailPrefs
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  dashboardKpi: {
    patrols: true,
    trailsCovered: true,
    treesCleared: true,
    hikersSeen: true,
    daysPatrolling: false,
    daysWeeding: false,
    hikersContacted: false,
    patrolEfficiency: false,
    volunteerHours: false,
  },
  trailDetail: {
    treesCleared: true,
    hikersSeen: true,
    hikersContacted: true,
    patrolEfficiency: false,
  },
}

/** Deep-merges a partial prefs payload with defaults so missing keys are always filled. */
export function mergeWithDefaults(partial: Partial<UserPreferences>): UserPreferences {
  return {
    dashboardKpi: { ...DEFAULT_PREFERENCES.dashboardKpi, ...partial.dashboardKpi },
    trailDetail: { ...DEFAULT_PREFERENCES.trailDetail, ...partial.trailDetail },
  }
}
