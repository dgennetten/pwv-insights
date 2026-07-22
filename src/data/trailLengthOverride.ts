/**
 * Official one-way trail length (miles), keyed by lu_worksite.WksiteID.
 *
 * Overrides the length the API aggregates from the patrol DB (lu_trail.Length)
 * where that figure is stale — e.g. Shipman Park, which USFS officially shortened
 * to 4.25 mi while the database still carries the old 6.9 mi full length. Applied
 * in attachGeo(); worksites without an entry keep the API-provided length.
 */
export const trailLengthOverride: Record<number, number> = {
  273: 4.25, // Shipman Park — USFS-shortened official length (DB still says 6.9)
}
