import { DEFAULT_PREFERENCES, mergeWithDefaults, type UserPreferences } from '../types/settings'

const PREFS_KEY = 'pwv_user_prefs'

function readLocalPrefs(): UserPreferences | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return null
    return mergeWithDefaults(JSON.parse(raw) as Partial<UserPreferences>)
  } catch {
    return null
  }
}

function writeLocalPrefs(prefs: UserPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // private browsing or quota exceeded — silently skip
  }
}

/** Synchronous read from localStorage — safe to call during component initialisation. */
export function getLocalPreferences(): UserPreferences {
  return readLocalPrefs() ?? DEFAULT_PREFERENCES
}

export async function fetchUserPreferences(token: string): Promise<UserPreferences> {
  try {
    const res = await fetch('/api/user/get-preferences.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) return readLocalPrefs() ?? DEFAULT_PREFERENCES
    const data = (await res.json()) as { success?: boolean; prefs?: Partial<UserPreferences> }
    if (!data.success) return readLocalPrefs() ?? DEFAULT_PREFERENCES
    const prefs = mergeWithDefaults(data.prefs ?? {})
    writeLocalPrefs(prefs)
    return prefs
  } catch {
    return readLocalPrefs() ?? DEFAULT_PREFERENCES
  }
}

export async function saveUserPreferences(token: string, prefs: UserPreferences): Promise<void> {
  writeLocalPrefs(prefs)  // instant local update before API round-trip
  const res = await fetch('/api/user/save-preferences.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, prefs }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { success?: boolean; error?: string }
  if (!data.success) throw new Error(data.error ?? 'Failed to save preferences')
}
