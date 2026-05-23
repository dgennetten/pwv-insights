export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'pwv_theme'

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* ignore */ }
  return 'system'
}

export function setStoredTheme(theme: Theme): void {
  try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
}

export function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', isDark)
}
