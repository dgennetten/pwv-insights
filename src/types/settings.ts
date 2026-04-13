// ─── User preference types ────────────────────────────────────────────────────

export interface DashboardKpiPrefs {
  patrols: boolean
  trailsCovered: boolean
  treesCleared: boolean
  hikersSeen: boolean
  daysPatrolling: boolean
  daysWeeding: boolean
  hikersContacted: boolean
}

export interface TrailDetailPrefs {
  treesCleared: boolean
  hikersSeen: boolean
  hikersContacted: boolean
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
  },
  trailDetail: {
    treesCleared: true,
    hikersSeen: true,
    hikersContacted: true,
  },
}

/** Deep-merges a partial prefs payload with defaults so missing keys are always filled. */
export function mergeWithDefaults(partial: Partial<UserPreferences>): UserPreferences {
  return {
    dashboardKpi: { ...DEFAULT_PREFERENCES.dashboardKpi, ...partial.dashboardKpi },
    trailDetail: { ...DEFAULT_PREFERENCES.trailDetail, ...partial.trailDetail },
  }
}
