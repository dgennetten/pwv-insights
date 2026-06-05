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

export function fmtPaceMinPerMi(distM: number, durationMs: number): string {
  if (distM <= 0 || durationMs <= 0) return '—'
  const minPerMile = (durationMs / 1000 / 60) / (distM / 1609.344)
  const m = Math.floor(minPerMile)
  const s = Math.round((minPerMile - m) * 60)
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')} min/mi`
}
