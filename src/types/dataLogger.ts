export type HikerSubtype = 'seen' | 'contacted'
export type TreeSubtype  = 'cleared' | 'noted'
export type TreeSize     = 'small' | 'medium' | 'large' | 'xl'
export type EntryType    = 'hiker' | 'tree' | 'note'

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
}

export interface LogSession {
  id: string        // "YYYY-MM-DD" — one session per calendar day
  startedAt: number
  emailedAt?: number
}
