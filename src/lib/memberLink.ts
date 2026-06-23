/** URL that opens the Members page pre-loaded for a specific member. */
export function memberLinkUrl(by: { memberId: number | string } | { name: string }): string {
  const params = new URLSearchParams()
  if ('memberId' in by) params.set('memberId', String(by.memberId))
  else params.set('q', by.name)
  return `/members?${params.toString()}`
}
