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
  loginType: 'OTC' | 'ACCESS' | 'AUTO' | 'TRIAL'
}

export interface AiProvider {
  id: string
  label: string
  model: string
}

export interface LlmSettings {
  providers: AiProvider[]
  /** id of the current global primary provider (others are automatic fallbacks) */
  primary: string | null
}

/** Read the configured AI providers + current primary (admin only). */
export async function fetchAdminLlmSettings(token: string): Promise<LlmSettings> {
  const res = await fetch('/api/admin/llm-settings.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ token }),
  })
  const data = (await res.json()) as { success?: boolean; providers?: AiProvider[]; primary?: string | null; error?: string }
  if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`)
  return { providers: Array.isArray(data.providers) ? data.providers : [], primary: data.primary ?? null }
}

/** Set the global primary AI provider (admin only). Returns the updated state. */
export async function setAdminLlmProvider(token: string, primary: string): Promise<LlmSettings> {
  const res = await fetch('/api/admin/llm-settings.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ token, primary }),
  })
  const data = (await res.json()) as { success?: boolean; providers?: AiProvider[]; primary?: string | null; error?: string }
  if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`)
  return { providers: Array.isArray(data.providers) ? data.providers : [], primary: data.primary ?? null }
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

export interface MemberSearchResult {
  memberId: number
  firstName: string
  lastName: string
  dob?: string // YYYYMMDD — only returned by admin endpoint
}

export interface MemberLookupMerit {
  memberDays: number
  avgDays: number
  ratio: number | null
  seasonStart: string
}

export interface MemberLookupResult {
  memberId: number
  fullName: string
  email: string
  dateOfBirth: string | null
  age: number | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  phone: string | null
  memberType: string | null
  photoUrl: string | null
  status: string
  lastPatrolDate: string | null
  merit: MemberLookupMerit
}

export async function fetchAdminMemberLookup(
  token: string,
  memberId: number
): Promise<MemberLookupResult> {
  const res = await fetch('/api/admin/member-lookup.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, memberId }),
  })
  const data = (await res.json()) as {
    success?: boolean
    member?: MemberLookupResult
    error?: string
  }
  if (!res.ok || !data.success || !data.member) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  return data.member
}

export interface TrailLogRow {
  logId: string
  memberId: number
  memberName: string
  date: string
  time: string
  sortKey: string
}

export async function fetchAdminTrailLogs(token: string): Promise<TrailLogRow[]> {
  const res = await fetch('/api/data-logger/list-logs.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const data = (await res.json()) as {
    success?: boolean
    logs?: TrailLogRow[]
    error?: string
  }
  if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`)
  return Array.isArray(data.logs) ? data.logs : []
}

export async function fetchAdminMemberSearch(token: string, query: string): Promise<MemberSearchResult[]> {
  const res = await fetch('/api/admin/member-search.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, query }),
  })
  const data = (await res.json()) as {
    success?: boolean
    members?: MemberSearchResult[]
    error?: string
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  return Array.isArray(data.members) ? data.members : []
}

export async function fetchMemberSearch(token: string, query: string): Promise<MemberSearchResult[]> {
  const res = await fetch('/api/user/member-search.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, query }),
  })
  const data = (await res.json()) as {
    success?: boolean
    members?: MemberSearchResult[]
    error?: string
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  return Array.isArray(data.members) ? data.members : []
}

export async function fetchMemberLookup(token: string, memberId: number): Promise<MemberLookupResult> {
  const res = await fetch('/api/user/member-lookup.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, memberId }),
  })
  const data = (await res.json()) as {
    success?: boolean
    member?: MemberLookupResult
    error?: string
  }
  if (!res.ok || !data.success || !data.member) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  return data.member
}

// ── Trial access ─────────────────────────────────────────────────────────────

export interface TrialLoginResult {
  token: string
  name: string
  email: string
  role: 'trial'
  personId: number
  expiresAt: number
  trialDays: number
}

/**
 * Validate an admin-generated trial link token. Starts the 7-day clock on first
 * open (idempotent afterward). Rejects revoked/expired links.
 */
export async function trialLogin(token: string): Promise<TrialLoginResult> {
  const res = await fetch(`${AUTH_BASE}/trial-login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ token }),
  })
  const data = (await res.json()) as { success?: boolean; error?: string } & Partial<TrialLoginResult>
  if (!res.ok || !data.success || data.token == null) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  return {
    token: data.token,
    name: data.name ?? 'Trial Guest',
    email: data.email ?? '',
    role: 'trial',
    personId: data.personId ?? 0,
    expiresAt: data.expiresAt ?? Date.now(),
    trialDays: data.trialDays ?? 7,
  }
}

export type TrialLinkStatus = 'pending' | 'active' | 'expired' | 'revoked'

export interface TrialLink {
  id: number
  token: string
  label: string
  createdAtMs: number
  expiresAtMs: number
  useCount: number
  status: TrialLinkStatus
}

export async function fetchAdminTrialLinks(token: string): Promise<TrialLink[]> {
  const res = await fetch('/api/admin/trial-links.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ token, action: 'list' }),
  })
  const data = (await res.json()) as { success?: boolean; links?: TrialLink[]; error?: string }
  if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`)
  return Array.isArray(data.links) ? data.links : []
}

export async function createAdminTrialLink(token: string, label: string): Promise<TrialLink> {
  const res = await fetch('/api/admin/trial-links.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ token, action: 'create', label }),
  })
  const data = (await res.json()) as { success?: boolean; link?: TrialLink; error?: string }
  if (!res.ok || !data.success || !data.link) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data.link
}

export async function revokeAdminTrialLink(token: string, id: number): Promise<void> {
  const res = await fetch('/api/admin/trial-links.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ token, action: 'revoke', id }),
  })
  const data = (await res.json()) as { success?: boolean; error?: string }
  if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`)
}

export async function deleteAdminTrialLink(token: string, id: number): Promise<void> {
  const res = await fetch('/api/admin/trial-links.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ token, action: 'delete', id }),
  })
  const data = (await res.json()) as { success?: boolean; error?: string }
  if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`)
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

/** Auto-login via PWV.ORG link token (YYYYMMDD + PersonID). Issues a 365-day remembered session. */
export async function autoLogin(id: string): Promise<VerifyResult> {
  const res = await fetch(`${AUTH_BASE}/auto-login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error ?? 'Auto-login failed')
  return data as VerifyResult
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
