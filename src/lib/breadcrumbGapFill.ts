import { trailPaths } from '../data/trailPaths'
import { haversineMeters } from './gpsDistance'
import { isValidLatLng } from './geo'

/**
 * Trail-snapped breadcrumb gap fill.
 *
 * The GPS breadcrumb has holes — mostly when the phone suspends the web app
 * (screen locked, app backgrounded), occasionally a GPS blackout. Joining the
 * crumbs either side of a hole draws a straight line across switchbacks. Since
 * a patroller is almost always on the trail, we instead route each hole along
 * the trail centerline between the two crumbs, and mark it as inferred so the
 * map can draw it differently from measured GPS.
 *
 * Computed at view time; the recorded crumbs are never modified.
 */

export interface CrumbPoint { lat: number; lng: number; ts: number }

/** 'gps' = measured; 'trail' = gap routed along the trail; 'gap' = gap we couldn't route. */
export type BreadcrumbRunKind = 'gps' | 'trail' | 'gap'

export interface BreadcrumbRun {
  kind:   BreadcrumbRunKind
  points: [number, number][]   // [lat, lng]
}

interface SegmentLike {
  startPoint?: CrumbPoint | null
  endPoint?:   CrumbPoint | null
  crumbs?:     CrumbPoint[]
}
interface TrackerLike { segments: SegmentLike[] }

// Crumbs are kept every ~8 m of travel, so consecutive crumbs further apart
// than this mean fixes were missed.
const GAP_M = 40
// Each end of a gap must be within this of the trail for us to route it. Loose
// on purpose — the fix right after resuming is often noisy.
const SNAP_MAX_M = 150
// Trail pieces whose ends are this close are treated as one continuous line.
const JOIN_M = 20
// Reject a route implying an impossible speed (a sign we picked the wrong trail).
const MAX_SPEED_MPS = 12

// ── Trail lines ─────────────────────────────────────────────────────

interface TrailLine {
  pts:    [number, number][]   // [lat, lng]
  cum:    number[]             // cumulative metres at each vertex
  length: number
  closed: boolean              // loop trail: last vertex meets the first
}

const lineCache = new Map<number, TrailLine[]>()

function dist(a: [number, number], b: [number, number]) {
  return haversineMeters(a[0], a[1], b[0], b[1])
}

/** Chain a trail's OSM pieces end-to-end into as few continuous lines as possible. */
function trailLines(wksiteId: number): TrailLine[] {
  const cached = lineCache.get(wksiteId)
  if (cached) return cached

  const pieces = (trailPaths[wksiteId] ?? [])
    .filter(p => p.length >= 2)
    .map(p => p.map(([lng, lat]) => [lat, lng] as [number, number]))

  const chains: [number, number][][] = []
  while (pieces.length > 0) {
    let chain = pieces.shift()!
    let grew = true
    while (grew) {
      grew = false
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i]
        const head = chain[0], tail = chain[chain.length - 1]
        const pHead = p[0], pTail = p[p.length - 1]
        if      (dist(tail, pHead) <= JOIN_M) chain = [...chain, ...p]
        else if (dist(tail, pTail) <= JOIN_M) chain = [...chain, ...[...p].reverse()]
        else if (dist(head, pTail) <= JOIN_M) chain = [...p, ...chain]
        else if (dist(head, pHead) <= JOIN_M) chain = [...[...p].reverse(), ...chain]
        else continue
        pieces.splice(i, 1)
        grew = true
        break
      }
    }
    chains.push(chain)
  }

  const lines = chains.map((pts): TrailLine => {
    const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]))
    const length = cum[cum.length - 1]
    const closed = pts.length > 3 && length > 4 * JOIN_M && dist(pts[0], pts[pts.length - 1]) <= JOIN_M
    return { pts, cum, length, closed }
  })
  lineCache.set(wksiteId, lines)
  return lines
}

interface Projection {
  i:       number             // segment index (between vertex i and i+1)
  along:   number             // metres from the line's start
  offsetM: number
  point:   [number, number]
}

/** Closest point on the line, using a local equirectangular projection. */
function project(line: TrailLine, lat: number, lng: number): Projection {
  const kx = Math.cos((lat * Math.PI) / 180)
  let best: Projection = { i: 0, along: 0, offsetM: Infinity, point: line.pts[0] }
  for (let i = 0; i < line.pts.length - 1; i++) {
    const [aLat, aLng] = line.pts[i]
    const [bLat, bLng] = line.pts[i + 1]
    const dx = (bLng - aLng) * kx, dy = bLat - aLat
    const lenSq = dx * dx + dy * dy
    const t = lenSq > 0
      ? Math.max(0, Math.min(1, (((lng - aLng) * kx) * dx + (lat - aLat) * dy) / lenSq))
      : 0
    const point: [number, number] = [aLat + t * (bLat - aLat), aLng + t * (bLng - aLng)]
    const offsetM = haversineMeters(lat, lng, point[0], point[1])
    if (offsetM < best.offsetM) {
      best = { i, along: line.cum[i] + t * (line.cum[i + 1] - line.cum[i]), offsetM, point }
    }
  }
  return best
}

/** Trail vertices strictly between two projections, walking forward or backward. */
function verticesBetween(line: TrailLine, a: Projection, b: Projection, wrap: boolean): [number, number][] {
  const n = line.pts.length
  const out: [number, number][] = []
  if (!wrap) {
    if (a.along <= b.along) for (let k = a.i + 1; k <= b.i; k++) out.push(line.pts[k])
    else                    for (let k = a.i; k > b.i; k--)      out.push(line.pts[k])
    return out
  }
  // Loop trail: go the other way round, through the start/end vertex.
  if (a.along <= b.along) {
    for (let k = a.i; k >= 0; k--)      out.push(line.pts[k])
    for (let k = n - 1; k > b.i; k--)   out.push(line.pts[k])
  } else {
    for (let k = a.i + 1; k < n; k++)   out.push(line.pts[k])
    for (let k = 0; k <= b.i; k++)      out.push(line.pts[k])
  }
  return out
}

/** Route a gap along the best-matching trail line, or null if neither end is near one. */
function routeGap(a: CrumbPoint, b: CrumbPoint, lines: TrailLine[]): [number, number][] | null {
  let best: { route: [number, number][]; score: number } | null = null
  for (const line of lines) {
    const pa = project(line, a.lat, a.lng)
    const pb = project(line, b.lat, b.lng)
    if (pa.offsetM > SNAP_MAX_M || pb.offsetM > SNAP_MAX_M) continue

    const direct = Math.abs(pb.along - pa.along)
    const wrap   = line.closed && line.length - direct < direct
    const alongM = wrap ? line.length - direct : direct

    const dtS = (b.ts - a.ts) / 1000
    const routeM = pa.offsetM + alongM + pb.offsetM
    if (dtS > 0 && routeM / dtS > MAX_SPEED_MPS) continue

    const score = pa.offsetM + pb.offsetM
    if (best && score >= best.score) continue
    best = {
      score,
      route: [
        [a.lat, a.lng],
        pa.point,
        ...verticesBetween(line, pa, pb, wrap),
        pb.point,
        [b.lat, b.lng],
      ],
    }
  }
  return best?.route ?? null
}

/** Give routed points timestamps spread evenly by distance between a and b. */
function timeRoute(route: [number, number][], a: CrumbPoint, b: CrumbPoint): CrumbPoint[] {
  const cum = [0]
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + dist(route[i - 1], route[i]))
  const total = cum[cum.length - 1]
  return route.slice(1, -1).map(([lat, lng], j) => ({
    lat, lng,
    ts: total > 0 ? a.ts + ((b.ts - a.ts) * cum[j + 1]) / total : a.ts,
  }))
}

// ── Public API ──────────────────────────────────────────────────────

/** Leaflet path style per run: solid measured GPS, dashed trail-inferred, faint dotted unrouted gap. */
export function breadcrumbStyle(kind: BreadcrumbRunKind) {
  switch (kind) {
    case 'gps':   return { color: '#dc2626', weight: 4, opacity: 0.85 }
    case 'trail': return { color: '#dc2626', weight: 4, opacity: 0.7, dashArray: '6 8' }
    case 'gap':   return { color: '#dc2626', weight: 2, opacity: 0.45, dashArray: '2 6' }
  }
}

export interface FilledBreadcrumb {
  /** Polylines to draw, in order, tagged measured / trail-inferred / unrouted gap. */
  runs: BreadcrumbRun[]
  /** Trackers whose crumbs include the inferred points (with interpolated times),
   *  for a pace series that doesn't spike across gaps. */
  trackers: TrackerLike[]
}

/**
 * Build the breadcrumb for display, filling GPS gaps along whichever of the
 * session's trails both ends sit on.
 */
export function fillBreadcrumbGaps(trackers: TrackerLike[], trailIds: number[]): FilledBreadcrumb {
  const lines = trailIds.flatMap(trailLines)
  const runs: BreadcrumbRun[] = []
  const outTrackers: TrackerLike[] = []

  for (const tracker of trackers) {
    const outSegs: SegmentLike[] = []
    for (const seg of tracker.segments) {
      const raw = (seg.crumbs && seg.crumbs.length > 0)
        ? seg.crumbs
        : [seg.startPoint, seg.endPoint].filter((p): p is CrumbPoint => !!p)
      const pts = raw.filter(p => isValidLatLng(p.lat, p.lng))
      if (pts.length < 2) { outSegs.push(seg); continue }

      const filled: CrumbPoint[] = [pts[0]]
      let gps: [number, number][] = [[pts[0].lat, pts[0].lng]]
      const flushGps = () => { if (gps.length >= 2) runs.push({ kind: 'gps', points: gps }) }

      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]
        const bLL: [number, number] = [b.lat, b.lng]
        if (haversineMeters(a.lat, a.lng, b.lat, b.lng) < GAP_M) {
          gps.push(bLL)
          filled.push(b)
          continue
        }
        flushGps()
        const route = lines.length > 0 ? routeGap(a, b, lines) : null
        if (route) {
          runs.push({ kind: 'trail', points: route })
          filled.push(...timeRoute(route, a, b))
        } else {
          runs.push({ kind: 'gap', points: [[a.lat, a.lng], bLL] })
        }
        filled.push(b)
        gps = [bLL]
      }
      flushGps()
      outSegs.push({ ...seg, crumbs: filled })
    }
    outTrackers.push({ ...tracker, segments: outSegs })
  }
  return { runs, trackers: outTrackers }
}
