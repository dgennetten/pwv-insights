import type { Tracker } from '../types/dataLogger'

/** Minimal tracker shape for distance/pace stats (saved logs omit id/sessionId). */
export type TrackerStats = Pick<Tracker, 'totalDistanceM' | 'activeDurationMs' | 'startedAt' | 'segments'>

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function gpsPathDistanceM(points: Array<{ lat: number; lng: number }>): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
  }
  return total
}

/** Best distance for a tracker: stored total or path reconstructed from recorded GPS points. */
export function trackerDistanceM(tracker: TrackerStats): number {
  let best = tracker.totalDistanceM
  for (const seg of tracker.segments) {
    const points: Array<{ lat: number; lng: number }> = []
    if (seg.startPoint) points.push({ lat: seg.startPoint.lat, lng: seg.startPoint.lng })
    for (const wp of [...(seg.waypoints ?? [])].sort((a, b) => a.ts - b.ts)) {
      if (wp.lat != null && wp.lng != null) points.push({ lat: wp.lat, lng: wp.lng })
    }
    if (seg.endPoint) {
      const last = points[points.length - 1]
      if (!last || last.lat !== seg.endPoint.lat || last.lng !== seg.endPoint.lng) {
        points.push({ lat: seg.endPoint.lat, lng: seg.endPoint.lng })
      }
    }
    if (points.length >= 2) best = Math.max(best, gpsPathDistanceM(points))
  }
  return best
}

/** Wall-clock span from first tracker start to last segment end. */
export function trackersWallClockDurationMs(trackers: TrackerStats[]): number {
  if (trackers.length === 0) return 0
  let start = Infinity
  let end = 0
  for (const t of trackers) {
    start = Math.min(start, t.startedAt)
    for (const seg of t.segments) {
      end = Math.max(end, seg.endAt ?? seg.startAt)
    }
  }
  return start === Infinity || end <= start ? 0 : end - start
}

/**
 * Distance and duration for survey summary / pace.
 * Single tracker: active time (excludes pauses). Multiple trackers: wall-clock span (no overlap double-count).
 */
export function surveyTrackingStats(trackers: TrackerStats[]): { distanceM: number; durationMs: number } {
  const distanceM = trackers.reduce((s, t) => s + trackerDistanceM(t), 0)
  const durationMs = trackers.length <= 1
    ? (trackers[0]?.activeDurationMs ?? trackersWallClockDurationMs(trackers))
    : trackersWallClockDurationMs(trackers)
  return { distanceM, durationMs }
}

export interface PacePoint { ts: number; paceMinPerMi: number }

// Minimal input shape — both the live Tracker and the saved-log tracker satisfy it.
interface PaceInputTracker {
  segments: Array<{
    startPoint?: { lat: number; lng: number; ts: number } | null
    endPoint?:   { lat: number; lng: number; ts: number } | null
    crumbs?:     Array<{ lat: number; lng: number; ts: number }>
  }>
}

/**
 * Pace series across the whole session, derived from the recorded GPS breadcrumb.
 * The crumbs are binned by distance (~0.1 mi) so the line is smooth rather than
 * jumping between adjacent fixes; each point's pace is that bin's time ÷ distance,
 * plotted at the bin's midpoint time. Falls back to a segment's start/end points
 * when a (legacy) tracker recorded no crumbs. Computed on demand at view time —
 * i.e. once the session has ended and the map is shown.
 */
export function paceSeriesFromTrackers(trackers: PaceInputTracker[], binMeters = 161): PacePoint[] {
  const pts: PacePoint[] = []
  for (const t of trackers) {
    for (const seg of t.segments) {
      const path = (seg.crumbs && seg.crumbs.length >= 2)
        ? seg.crumbs
        : [seg.startPoint, seg.endPoint].filter((p): p is { lat: number; lng: number; ts: number } => !!p)
      if (path.length < 2) continue
      let accDist    = 0
      let binStartTs = path[0].ts
      const emit = (endTs: number) => {
        const dtMs = endTs - binStartTs
        if (accDist > 0 && dtMs > 0) {
          pts.push({
            ts: Math.round((binStartTs + endTs) / 2),
            paceMinPerMi: (dtMs / 60000) / (accDist / 1609.344),
          })
        }
      }
      for (let i = 1; i < path.length; i++) {
        accDist += haversineMeters(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng)
        if (accDist >= binMeters) {
          emit(path[i].ts)
          accDist = 0
          binStartTs = path[i].ts
        }
      }
      // Trailing remainder — keep it only if it covers a meaningful distance.
      if (accDist >= binMeters * 0.5) emit(path[path.length - 1].ts)
    }
  }
  return pts.sort((a, b) => a.ts - b.ts)
}

export function fmtPaceMinPerMi(distM: number, durationMs: number): string {
  if (distM <= 0 || durationMs <= 0) return '—'
  const minPerMile = (durationMs / 1000 / 60) / (distM / 1609.344)
  const m = Math.floor(minPerMile)
  const s = Math.round((minPerMile - m) * 60)
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')} min/mi`
}
