/**
 * Display-name corrections keyed by lu_worksite.WksiteID.
 *
 * Overrides the WksiteName the API returns from the patrol DB where that name is
 * wrong — e.g. WksiteID 339, which the DB calls just "Meadows" but is USFS
 * #977.2, the Meadow Snow winter route. Remove an entry once the DB is fixed.
 * Applied in attachGeo() and the Schedule page.
 */
export const trailNameOverride: Record<number, string> = {
  339: 'Meadows Snow Trail', // DB: "Meadows"
}
