export interface TrailAISummaryResult {
  summary: string | null
  reason?: string
  generatedAt?: string
  latestReportDate?: string
  reportIds?: number[]
  cached?: boolean
  error?: string
}

export async function fetchTrailAISummary(wksiteId: number): Promise<TrailAISummaryResult> {
  const res = await fetch(`/api/trails/ai-summary.php?wksiteId=${wksiteId}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<TrailAISummaryResult>
}
