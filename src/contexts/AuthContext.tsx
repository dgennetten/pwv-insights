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

const SESSION_KEY = 'pwv_auth'

function loadSession(): AuthUser | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY)
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
    const storage = remember ? localStorage : sessionStorage
    storage.setItem(SESSION_KEY, JSON.stringify(authUser))
    storage.setItem(`${SESSION_KEY}_token`, token)
    setUser(authUser)
    setLoginModalOpen(false)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(`${SESSION_KEY}_token`)
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(`${SESSION_KEY}_token`)
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
