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
}

export async function verifyOtp(email: string, code: string): Promise<VerifyResult> {
  const res = await fetch(`${AUTH_BASE}/verify-otp.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error ?? 'Verification failed')
  return data as VerifyResult
}
