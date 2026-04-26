export interface Report {
  reportId: number
  activityDate: string
  writerName: string | null
  otherMembers: string[]
}

export interface ReportsData {
  reports: Report[]
  totalCount: number
}
