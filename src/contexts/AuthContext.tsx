import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface AuthUser {
  personId: number
  name: string
  email: string
  role: string
}

interface AuthContextValue {
  user: AuthUser | undefined
  login: (token: string, email: string, name: string, role: string, personId: number, remember: boolean) => void
  logout: () => void
  loginModalOpen: boolean
  openLogin: () => void
  closeLogin: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESSION_KEY  = 'pwv_auth'
const TOKEN_KEY    = 'pwv_auth_token'
const EXPIRES_KEY  = 'pwv_auth_expires'

function loadSession(): AuthUser | undefined {
  try {
    // Check expiry first — if present and in the past, clear everything
    const expires = localStorage.getItem(EXPIRES_KEY)
    if (expires && Date.now() > Number(expires)) {
      localStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(EXPIRES_KEY)
      return undefined
    }
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return undefined
    return JSON.parse(raw) as AuthUser
  } catch {
    return undefined
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<AuthUser | undefined>(loadSession)
  const [loginModalOpen, setLoginModalOpen] = useState(false)

  const login = useCallback((token: string, email: string, name: string, role: string, personId: number, remember: boolean) => {
    const authUser: AuthUser = { personId, name, email, role }
    const days = remember ? 365 : 1
    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000
    localStorage.setItem(SESSION_KEY, JSON.stringify(authUser))
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(EXPIRES_KEY, String(expiresAt))
    setUser(authUser)
    setLoginModalOpen(false)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRES_KEY)
    // clean up any legacy sessionStorage sessions
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    setUser(undefined)
  }, [])

  const openLogin  = useCallback(() => setLoginModalOpen(true), [])
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
