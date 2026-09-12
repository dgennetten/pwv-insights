/** True when both values are finite numbers usable as WGS84 coordinates. */
export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  )
}

/**
 * Spread map markers that land on (nearly) the same spot so none is hidden
 * underneath another. Items sharing a coordinate — rounded to ~1 m — are nudged
 * a few metres apart around a small ring; unique points are returned unchanged.
 * Deterministic, so markers don't jump between renders.
 *
 * @returns the same items in order, each with a `displayLat` / `displayLng` to
 *          render the marker at (keep the real lat/lng for popups/details).
 */
export function fanOutColocated<T>(
  items: T[],
  getLat: (item: T) => number,
  getLng: (item: T) => number,
): Array<{ item: T; displayLat: number; displayLng: number }> {
  const RING_M = 5            // ring radius in metres for stacked markers
  const M_PER_DEG_LAT = 111_320
  const groups = new Map<string, number[]>()
  items.forEach((it, i) => {
    const key = `${getLat(it).toFixed(5)},${getLng(it).toFixed(5)}`
    const arr = groups.get(key)
    if (arr) arr.push(i)
    else groups.set(key, [i])
  })
  const out = items.map(it => ({ item: it, displayLat: getLat(it), displayLng: getLng(it) }))
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue
    idxs.forEach((itemIdx, k) => {
      const lat = getLat(items[itemIdx])
      const ang = (k / idxs.length) * 2 * Math.PI
      const dLat = (RING_M * Math.sin(ang)) / M_PER_DEG_LAT
      const dLng = (RING_M * Math.cos(ang)) / (M_PER_DEG_LAT * Math.max(0.15, Math.cos(lat * Math.PI / 180)))
      out[itemIdx].displayLat = lat + dLat
      out[itemIdx].displayLng = getLng(items[itemIdx]) + dLng
    })
  }
  return out
}
