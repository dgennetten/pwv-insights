export interface LoggerSettings {
  waypointsEnabled: boolean
  waypointMode: 'distance' | 'time'
  waypointDistanceMi: number
  waypointTimeMin: number
  wakeLockEnabled: boolean
  emailFormat: 'text' | 'json'
}

const STORAGE_KEY = 'pwv_logger_settings'

const DEFAULTS: LoggerSettings = {
  waypointsEnabled: true,
  waypointMode: 'distance',
  waypointDistanceMi: 0.1,
  waypointTimeMin: 10,
  wakeLockEnabled: true,
  emailFormat: 'text',
}

export function getLoggerSettings(): LoggerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<LoggerSettings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveLoggerSettings(s: LoggerSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}
