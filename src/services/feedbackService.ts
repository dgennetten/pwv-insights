export interface SendFeedbackPayload {
  message: string
  name?: string
  email?: string
  token?: string | null
  /** Honeypot — must stay empty */
  website?: string
}

export async function sendFeedback(payload: SendFeedbackPayload): Promise<void> {
  const res = await fetch('/api/feedback/send.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as { success?: boolean; error?: string }
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
}
