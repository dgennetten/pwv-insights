const AUTH_BASE = '/api/auth'

/** Must match `TOKEN_KEY` in AuthContext (session token in localStorage). */
export const AUTH_TOKEN_STORAGE_KEY = 'pwv_auth_token'

export function getStoredAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export interface AdminLoginRow {
  memberId: number
  lastName: string
  firstName: string
  loggedInAtMs: number
}

/** Recent sign-ins (admin only). */
export async function fetchAdminRecentLogins(token: string): Promise<AdminLoginRow[]> {
  const res = await fetch('/api/admin/recent-logins.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const data = (await res.json()) as {
    success?: boolean
    logins?: AdminLoginRow[]
    error?: string
    hint?: string
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? data.hint ?? `HTTP ${res.status}`)
  }
  return Array.isArray(data.logins) ? data.logins : []
}

export async function requestOtp(email: string): Promise<void> {
  const res = await fetch(`${AUTH_BASE}/request-otp.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error('Request failed')
}

export interface VerifyResult {
  token: string
  email: string
  name: string
  role: string
  personId: number
  /** Server session expiry, milliseconds since epoch */
  expiresAt?: number
}

export interface SessionResult {
  success: boolean
  token?: string
  email?: string
  name?: string
  role?: string
  personId?: number
  expiresAt?: number
  error?: string
}

/** Validate a stored session token (Remember this device) without OTP. */
export async function validateStoredSession(token: string): Promise<SessionResult | null> {
  try {
    const res = await fetch(`${AUTH_BASE}/session.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    return (await res.json()) as SessionResult
  } catch {
    return null
  }
}

/** Local dev only — see php/api/auth/dev-auto-login.php */
export async function devAutoLogin(): Promise<VerifyResult | null> {
  try {
    const res = await fetch(`${AUTH_BASE}/dev-auto-login.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = (await res.json()) as { success?: boolean } & Partial<VerifyResult>
    if (!data.success || data.token == null || data.personId == null) return null
    return data as VerifyResult
  } catch {
    return null
  }
}

export async function verifyOtp(email: string, code: string, remember: boolean): Promise<VerifyResult> {
  const res = await fetch(`${AUTH_BASE}/verify-otp.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, remember }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error ?? 'Verification failed')
  return data as VerifyResult
}
