const STORAGE_KEY = 'pwv_trails_map_open'

/** Tailwind `sm` — desktop split layout shows map alongside list. */
const DESKTOP_MQ = '(min-width: 640px)'

export function getStoredTrailsMapOpen(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch { /* ignore */ }
  if (typeof window === 'undefined') return false
  return window.matchMedia(DESKTOP_MQ).matches
}

export function setStoredTrailsMapOpen(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, open ? 'true' : 'false')
  } catch { /* ignore */ }
}
