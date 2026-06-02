export type HikerSubtype = 'seen' | 'contacted'
export type TreeSubtype  = 'cleared' | 'noted'
export type TreeSize     = 'small' | 'medium' | 'large' | 'xl'
export type EntryType    = 'hiker' | 'tree' | 'note' | 'violation'

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
}

export interface LogSession {
  id: string        // "YYYY-MM-DD" — one session per calendar day
  startedAt: number
  emailedAt?: number
  wksiteId?: number // selected worksite/trail for this session
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
