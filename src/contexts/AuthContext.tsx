import { createContext, useContext, useState, useCallback, useLayoutEffect, type ReactNode } from 'react'
import { AUTH_TOKEN_STORAGE_KEY, devAutoLogin, validateStoredSession } from '../services/authService'

function isLocalhostHostname(): boolean {
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1'
}

interface AuthUser {
  personId: number
  name: string
  email: string
  role: string
}

interface AuthContextValue {
  user: AuthUser | undefined
  login: (
    token: string,
    email: string,
    name: string,
    role: string,
    personId: number,
    remember: boolean,
    expiresAtMs?: number,
  ) => void
  logout: () => void
  loginModalOpen: boolean
  openLogin: () => void
  closeLogin: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESSION_KEY  = 'pwv_auth'
const TOKEN_KEY    = AUTH_TOKEN_STORAGE_KEY
const EXPIRES_KEY  = 'pwv_auth_expires'
const REMEMBER_KEY = 'pwv_auth_remember'

function loadSession(): AuthUser | undefined {
  try {
    const expires = localStorage.getItem(EXPIRES_KEY)
    if (expires && Date.now() > Number(expires)) {
      localStorage.removeItem(SESSION_KEY)
      // Keep token when "remember"; useLayoutEffect revalidates via session.php
      if (localStorage.getItem(REMEMBER_KEY) !== '1') {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(EXPIRES_KEY)
        localStorage.removeItem(REMEMBER_KEY)
      }
      return undefined
    }
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return undefined
    const u = JSON.parse(raw) as Record<string, unknown>
    const pid = Math.trunc(Number(u.personId))
    if (!Number.isFinite(pid) || pid < 1) return undefined
    return {
      personId: pid,
      name: String(u.name ?? ''),
      email: String(u.email ?? ''),
      role: String(u.role ?? 'member'),
    }
  } catch {
    return undefined
  }
}

function clearRememberedCredentials() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRES_KEY)
  localStorage.removeItem(REMEMBER_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<AuthUser | undefined>(loadSession)
  const [loginModalOpen, setLoginModalOpen] = useState(false)

  const login = useCallback(
    (
      token: string,
      email: string,
      name: string,
      role: string,
      personId: number,
      remember: boolean,
      expiresAtMs?: number,
    ) => {
      const pid = Math.trunc(Number(personId))
      if (!Number.isFinite(pid) || pid < 1) return
      const authUser: AuthUser = { personId: pid, name, email, role }
      const days = remember ? 365 : 1
      const expiresAt =
        expiresAtMs != null && Number.isFinite(expiresAtMs)
          ? expiresAtMs
          : Date.now() + days * 24 * 60 * 60 * 1000
      localStorage.setItem(SESSION_KEY, JSON.stringify(authUser))
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(EXPIRES_KEY, String(expiresAt))
      localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0')
      setUser(authUser)
      setLoginModalOpen(false)
    },
    [],
  )

  const logout = useCallback(() => {
    const remember = localStorage.getItem(REMEMBER_KEY) === '1'
    localStorage.removeItem(SESSION_KEY)
    if (!remember) {
      clearRememberedCredentials()
    }
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    setUser(undefined)
  }, [])

  useLayoutEffect(() => {
    let cancelled = false

    void (async () => {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        try {
          const u = JSON.parse(raw) as Record<string, unknown>
          const pid = Math.trunc(Number(u.personId))
          if (Number.isFinite(pid) && pid >= 1) return
        } catch {
          /* try token restore */
        }
      }

      const token = localStorage.getItem(TOKEN_KEY)
      if (token && localStorage.getItem(REMEMBER_KEY) === '1') {
        const r = await validateStoredSession(token)
        if (cancelled) return
        if (r?.success && r.personId != null && r.token != null) {
          login(r.token, r.email ?? '', r.name ?? '', r.role ?? 'member', r.personId, true, r.expiresAt)
          return
        }
        clearRememberedCredentials()
      }

      if (import.meta.env.DEV && isLocalhostHostname()) {
        const d = await devAutoLogin()
        if (cancelled || !d) return
        login(d.token, d.email ?? '', d.name ?? '', d.role ?? 'member', d.personId, true, d.expiresAt)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [login])

  const openLogin = useCallback(() => {
    void (async () => {
      const token = localStorage.getItem(TOKEN_KEY)
      const remember = localStorage.getItem(REMEMBER_KEY) === '1'
      if (token && remember) {
        const r = await validateStoredSession(token)
        if (r?.success && r.personId != null && r.token != null) {
          login(r.token, r.email ?? '', r.name ?? '', r.role ?? 'member', r.personId, true, r.expiresAt)
          return
        }
        clearRememberedCredentials()
      }
      setLoginModalOpen(true)
    })()
  }, [login])
  const closeLogin = useCallback(() => setLoginModalOpen(false), [])

  return (
    <AuthContext.Provider value={{ user, login, logout, loginModalOpen, openLogin, closeLogin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
