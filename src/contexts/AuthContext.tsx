import { createContext, useContext, useState, useCallback, useLayoutEffect, type ReactNode } from 'react'
import { AUTH_TOKEN_STORAGE_KEY, autoLogin, devAutoLogin, validateStoredSession } from '../services/authService'

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

    // Strip ?id= and ?sso_token= from the URL immediately so they never linger in history,
    // but save the values for use below if there is no valid stored session.
    const params = new URLSearchParams(window.location.search)
    const autoId   = params.get('id')        ?? null
    const ssoToken = params.get('sso_token') ?? null
    if (autoId !== null || ssoToken !== null) {
      params.delete('id')
      params.delete('sso_token')
      const newSearch = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (newSearch ? '?' + newSearch : ''))
    }

    void (async () => {
      const token = localStorage.getItem(TOKEN_KEY)
      const remember = localStorage.getItem(REMEMBER_KEY) === '1'

      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        try {
          const u = JSON.parse(raw) as Record<string, unknown>
          const pid = Math.trunc(Number(u.personId))
          if (Number.isFinite(pid) && pid >= 1) {
            // Valid local session — ping session.php to log the ACCESS event, ignore result
            if (token && remember) void validateStoredSession(token)
            return
          }
        } catch {
          /* try token restore */
        }
      }

      if (token && remember) {
        const r = await validateStoredSession(token)
        if (cancelled) return
        if (r?.success && r.personId != null && r.token != null) {
          login(r.token, r.email ?? '', r.name ?? '', r.role ?? 'member', r.personId, true, r.expiresAt)
          return
        }
        clearRememberedCredentials()
      }

      // No valid stored session — try SSO token from PWV.ORG redirect
      if (ssoToken !== null && /^[0-9a-f]{64}$/.test(ssoToken)) {
        try {
          const r = await validateStoredSession(ssoToken)
          if (cancelled) return
          if (r?.success && r.personId != null && r.token != null) {
            login(r.token, r.email ?? '', r.name ?? '', r.role ?? 'member', r.personId, true, r.expiresAt)
            return
          }
        } catch {
          /* bad/expired SSO token — fall through to OTP */
        }
      }

      // No valid stored session — try auto-login from PWV.ORG link token
      if (autoId !== null && /^\d{9,}$/.test(autoId)) {
        try {
          const a = await autoLogin(autoId)
          if (cancelled) return
          login(a.token, a.email ?? '', a.name ?? '', a.role ?? 'member', a.personId, true, a.expiresAt)
          return
        } catch {
          /* bad token — fall through to OTP */
        }
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
