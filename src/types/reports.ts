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
