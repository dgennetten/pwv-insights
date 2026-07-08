export type HikerSubtype = 'seen' | 'contacted'
export type TreeSubtype  = 'cleared' | 'noted'
export type TreeSize     = 'small' | 'medium' | 'large' | 'xl'
export type EntryType    = 'hiker' | 'tree' | 'note' | 'violation' | 'trail' | 'photo'

export interface LogEntry {
  id?: number
  sessionId: string
  timestamp: number
  lat: number | null
  lng: number | null
  type: EntryType
  hikerSubtype?: HikerSubtype
  treeSubtype?: TreeSubtype
  treeSize?: TreeSize
  noteText?: string
  violationType?: string
  violationNote?: string
  /** type 'trail': trail selection changed mid-session (null = off PWV trail) */
  wksiteId?: number | null
  trailName?: string
  /** along-trail distance from the trailhead, computed at send time */
  distFromTrailheadM?: number
  /** type 'photo': stable id used to name the uploaded file */
  photoId?: string
  /** type 'photo': compressed JPEG data URL held offline until the report is sent */
  photoData?: string
  /** type 'photo': public URL once the photo is uploaded at send time */
  photoUrl?: string
}

export interface LogSession {
  id: string        // "YYYY-MM-DD" — one session per calendar day
  startedAt: number
  emailedAt?: number
  wksiteId?: number // selected worksite/trail for this session
}

// ── Offline email send queue ───────────────────────────────────────

export interface QueuedReportPayload {
  profile: 'patrol' | 'other'
  wksiteId: number | null
  trailName: string | null
  entries: LogEntry[]     // frozen snapshot; photo entries still carry photoData
  trackers: unknown[]     // already-serialized tracker payloads
}

export interface QueuedSendSummary {
  hikers: number
  trees: number
  photos: number
  notes: number
  violations: number
}

export interface QueuedSend {
  id?: number
  queuedAt: number
  sessionId: string
  reportDate: string
  appVersion: string
  includeLocations: boolean
  memberName?: string     // member send
  token?: string          // member send
  guestEmail?: string     // guest send
  payload: QueuedReportPayload
  summary: QueuedSendSummary
  status: 'queued' | 'sending' | 'sent' | 'failed'
  error?: string
  logId?: string
}

// ── Distance Tracker ───────────────────────────────────────────────

export interface GpsPoint {
  lat: number
  lng: number
  ts: number
  accuracy?: number
}

export interface Waypoint {
  lat: number | null
  lng: number | null
  ts: number
  segmentDistanceM: number  // cumulative distance within this segment at the waypoint
  name?: string             // only present for manually added waypoints
  paceMinPerMi?: number     // avg pace since prior waypoint (or segment start); auto-waypoints only
  distFromTrailheadM?: number // along-trail distance from trailhead; manual waypoints, set at send time
}

export interface TrackerSegment {
  startAt: number
  endAt?: number
  distanceM: number
  startPoint?: GpsPoint
  endPoint?: GpsPoint
  waypoints?: Waypoint[]
}

export type TrackerState = 'tracking' | 'paused' | 'ended' | 'saved'

export interface Tracker {
  id: string
  sessionId: string
  name: string
  state: TrackerState
  startedAt: number
  segments: TrackerSegment[]
  totalDistanceM: number
  activeDurationMs: number  // sum of completed segment durations
}
