/** Extract PersonID from trailLog.{personId}{Ymd}{Hi} (0 when unknown). */
export function personIdFromTrailLogId(logId: string): number {
  const m = /^trailLog\.(\d+)$/.exec(logId.trim())
  if (!m) return 0
  const inner = m[1]
  if (inner.length < 13) return 0
  const dateTime = inner.slice(-12)
  if (!/^\d{12}$/.test(dateTime)) return 0
  const pid = inner.slice(0, -12)
  const id = Number(pid)
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : 0
}

/** Best available PersonID for an admin trail-log row. */
export function trailLogPersonId(row: { logId: string; memberId: string | number }): number {
  const fromField = Number(row.memberId)
  if (Number.isFinite(fromField) && fromField > 0) return Math.trunc(fromField)
  return personIdFromTrailLogId(row.logId)
}
