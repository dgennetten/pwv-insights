export interface LoggerSettings {
  // What the logger is configured for. 'patrol' shows the full trail
  // maintenance/patrol UI; 'other' hides Tree and Violation logging.
  profile: 'patrol' | 'other'
  waypointsEnabled: boolean
  waypointMode: 'distance' | 'time'
  waypointDistanceMi: number
  waypointTimeMin: number
  wakeLockEnabled: boolean
  waypointVibrate: boolean
  waypointPace: boolean
  waypointPaceFormat: 'min-per-mi' | 'mph'
}

const STORAGE_KEY = 'pwv_logger_settings'

const DEFAULTS: LoggerSettings = {
  profile: 'patrol',
  waypointsEnabled: true,
  waypointMode: 'distance',
  waypointDistanceMi: 0.1,
  waypointTimeMin: 10,
  wakeLockEnabled: true,
  waypointVibrate: false,
  waypointPace: false,
  waypointPaceFormat: 'min-per-mi',
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
