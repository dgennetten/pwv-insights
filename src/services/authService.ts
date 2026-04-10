const AUTH_BASE = '/api/auth'

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
