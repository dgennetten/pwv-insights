export interface ScheduleEntry {
  scheduleId: number
  activityDate: string
  wksiteId: number | null
  wksiteName: string | null
  activityType: string | null
  activityMethod: string | null
  schedulerName: string | null
  reportId: number | null
  members: string[]
}

export interface ScheduleMemberOption {
  personId: number
  firstName: string
  lastName: string
  fullName: string
  scheduleCount: number
}

export interface ScheduleData {
  schedules: ScheduleEntry[]
  totalCount: number
  members: ScheduleMemberOption[]
}
