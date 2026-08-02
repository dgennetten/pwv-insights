export interface Report {
  reportId: number
  activityDate: string
  writerName: string | null
  otherMembers: string[]
  hikersSeen: number
  hikersContacted: number
  treesCleared: number
}

export interface ReportsData {
  reports: Report[]
  totalCount: number
}

// ─── AI Trip Summary ──────────────────────────────────────────────────────────

export interface TripTotals {
  totalTrees: number
  treesBySize: { sizeClass: string; count: number }[]
  totalBrushingFt: number
  byTrail: { trailName: string; trees: number }[]
  reportCount: number
  dayCount: number
}

export interface TripSummaryResponse {
  totals: TripTotals
  /** AI-written day-by-day narrative; null when the AI is unavailable/unconfigured. */
  narrative: string | null
  generatedAt?: string
  cached?: boolean
  /** Present when narrative is null: 'ai_not_configured' etc. */
  reason?: string
  error?: string
}
