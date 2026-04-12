import { DEFAULT_PREFERENCES, mergeWithDefaults, type UserPreferences } from '../types/settings'

export async function fetchUserPreferences(token: string): Promise<UserPreferences> {
  try {
    const res = await fetch('/api/user/get-preferences.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) return DEFAULT_PREFERENCES
    const data = (await res.json()) as { success?: boolean; prefs?: Partial<UserPreferences> }
    if (!data.success) return DEFAULT_PREFERENCES
    return mergeWithDefaults(data.prefs ?? {})
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export async function saveUserPreferences(token: string, prefs: UserPreferences): Promise<void> {
  const res = await fetch('/api/user/save-preferences.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, prefs }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { success?: boolean; error?: string }
  if (!data.success) throw new Error(data.error ?? 'Failed to save preferences')
}
