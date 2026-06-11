import { haversineMeters } from './gpsDistance'
import { trailGeoData } from '../data/trailGeoData'
import { trailPaths } from '../data/trailPaths'

/**
 * Along-path distance from trailhead to the point on the trail closest
 * to the user. pathSegs is [lng, lat][][] (Overpass convention);
 * TH/user coords are plain lat/lng.
 */
export function distAlongPath(
  pathSegs: [number, number][][],
  thLat: number, thLng: number,
  userLat: number, userLng: number,
): number {
  let bestPerpM = Infinity
  let bestAlongM = 0

  for (const seg of pathSegs) {
    if (seg.length < 2) continue
    const pts = seg.map(([lng, lat]): [number, number] => [lat, lng])
    // Orient so the end nearest to the trailhead comes first
    const d0 = haversineMeters(thLat, thLng, pts[0][0], pts[0][1])
    const dN = haversineMeters(thLat, thLng, pts[pts.length - 1][0], pts[pts.length - 1][1])
    if (dN < d0) pts.reverse()

    let cum = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const [aLat, aLng] = pts[i]
      const [bLat, bLng] = pts[i + 1]
      const segM = haversineMeters(aLat, aLng, bLat, bLng)
      // Flat-space projection onto segment (accurate enough for trail-length segments)
      const dx = bLat - aLat, dy = bLng - aLng
      const lenSq = dx * dx + dy * dy
      const t = lenSq > 0
        ? Math.max(0, Math.min(1, ((userLat - aLat) * dx + (userLng - aLng) * dy) / lenSq))
        : 0
      const perpM = haversineMeters(userLat, userLng, aLat + t * dx, aLng + t * dy)
      if (perpM < bestPerpM) {
        bestPerpM = perpM
        bestAlongM = cum + t * segM
      }
      cum += segM
    }
  }
  return bestAlongM
}

/**
 * Distance from a trail's trailhead to the given position: along the trail
 * centerline when path data exists, straight-line otherwise.
 * Returns null when the trail is unknown or has no trailhead coordinates.
 */
export function distFromTrailheadM(
  wksiteId: number | null | undefined,
  lat: number | null,
  lng: number | null,
): number | null {
  if (wksiteId == null || lat == null || lng == null) return null
  const th = trailGeoData[wksiteId]
  if (!th) return null
  const segs = trailPaths[wksiteId] ?? []
  return segs.length > 0
    ? distAlongPath(segs, th.lat, th.lng, lat, lng)
    : haversineMeters(th.lat, th.lng, lat, lng)
}
