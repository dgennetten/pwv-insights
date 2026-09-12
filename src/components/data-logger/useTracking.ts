import { useState, useEffect, useRef, useCallback } from 'react'
import { saveTracker, getSessionTrackers, clearSessionTrackers } from '../../services/dataLoggerService'
import { getLoggerSettings } from '../../lib/loggerSettings'
import { haversineMeters } from '../../lib/gpsDistance'
import { nearestTrailInfo } from '../../lib/trailheadDistance'
import { trailPaths } from '../../data/trailPaths'
import { trailGeoData } from '../../data/trailGeoData'
import type { Tracker, TrackerSegment, GpsPoint } from '../../types/dataLogger'

// GPS is requested at maximum accuracy (enableHighAccuracy, maximumAge 0). We
// still drop fixes that report poor accuracy, and ignore sub-jitter movement.
const JITTER_M    = 3    // ignore GPS deltas < 3 m (noise while standing still)
const ACCURACY_M  = 50   // reject fixes with accuracy worse than 50 m
const CRUMB_MIN_M = 8    // thin the breadcrumb: keep a point every ~8 m of travel

export type OnTrailLight = 'green' | 'red' | 'gray'

export interface LiveStats {
  tracking:       boolean
  startedAt:      number | null
  elapsedMs:      number
  /** Cumulative distance travelled on the trail (both directions). Falls back
   *  to total GPS movement when the trail has no mapped centerline. */
  distanceM:      number
  trailheadDistM: number | null
  trailheadCrow:  boolean       // true = off-trail straight-line distance ("*")
  light:          OnTrailLight
  paceMinPerMi:   number | null
}

interface UseTrackingArgs {
  sessionId: string | null
  wksiteId:  number | undefined
  /** Notifies the page of the current tracker (as a single-element list) so it
   *  can build the report payload and feed the map. */
  onTrackerChange?: (trackers: Tracker[]) => void
}

function newTracker(sessionId: string): Tracker {
  const now = Date.now()
  const segment: TrackerSegment = { startAt: now, distanceM: 0, crumbs: [] }
  return {
    id:               `t-${now}`,
    sessionId,
    name:             '',
    state:            'tracking',
    startedAt:        now,
    segments:         [segment],
    totalDistanceM:   0,
    activeDurationMs: 0,
  }
}

/**
 * Drives the single, always-on patrol tracker. Start begins a high-accuracy GPS
 * watch that records the breadcrumb path, accumulates on-trail distance, and
 * keeps the On-Trail light + trailhead distance + average pace live. Stop ends
 * it; the page then sends the report. One tracker per session — no pause, no
 * manual waypoints, no multiple trackers.
 */
export function useTracking({ sessionId, wksiteId, onTrackerChange }: UseTrackingArgs) {
  const [tracker, setTracker] = useState<Tracker | null>(null)
  const [light,   setLight]   = useState<OnTrailLight>('gray')
  const [thDistM, setThDistM] = useState<number | null>(null)
  const [thCrow,  setThCrow]  = useState(false)
  const [, setTick]           = useState(0)

  const trackerRef     = useRef<Tracker | null>(null)
  const watchIdRef     = useRef<number | null>(null)
  const tickRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastFixRef     = useRef<{ lat: number; lng: number } | null>(null)
  const pendingRef     = useRef(0)          // sub-jitter distance carried forward
  const lastCrumbRef   = useRef<{ lat: number; lng: number } | null>(null)
  const lastSaveRef    = useRef(0)          // last IndexedDB persist time
  const wakeLockRef    = useRef<WakeLockSentinel | null>(null)
  const wksiteRef      = useRef<number | undefined>(wksiteId)
  useEffect(() => { wksiteRef.current = wksiteId }, [wksiteId])

  const onChangeRef = useRef(onTrackerChange)
  useEffect(() => { onChangeRef.current = onTrackerChange }, [onTrackerChange])

  const setAndNotify = useCallback((t: Tracker | null) => {
    trackerRef.current = t
    setTracker(t)
    onChangeRef.current?.(t ? [t] : [])
  }, [])

  // ── Wake Lock ────────────────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator) || wakeLockRef.current) return
    if (!getLoggerSettings().wakeLockEnabled) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
      wakeLockRef.current.addEventListener('release', () => { wakeLockRef.current = null })
    } catch { /* denied or unsupported */ }
  }, [])

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release()
    wakeLockRef.current = null
  }, [])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && trackerRef.current?.state === 'tracking') {
        void requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [requestWakeLock])

  // ── GPS fix handling ─────────────────────────────────────────────────────
  const onPosition = useCallback((pos: GeolocationPosition) => {
    if ((pos.coords.accuracy ?? 0) > ACCURACY_M) return
    const cur = trackerRef.current
    if (!cur || cur.state !== 'tracking') return

    const point: GpsPoint = {
      lat:      pos.coords.latitude,
      lng:      pos.coords.longitude,
      ts:       pos.timestamp,
      accuracy: pos.coords.accuracy ?? undefined,
    }

    // Classify on/off trail and compute trailhead distance from this fix.
    const wks  = wksiteRef.current
    const th   = wks != null ? trailGeoData[wks] : null
    const segs = wks != null ? (trailPaths[wks] ?? []) : []
    let   onTrail = false
    let   classifiable = false
    if (wks != null && th && segs.length > 0) {
      const { alongM, offsetM } = nearestTrailInfo(segs, th.lat, th.lng, point.lat, point.lng)
      if (Number.isFinite(offsetM)) {
        classifiable = true
        const thresholdM = getLoggerSettings().onTrailThresholdFt * 0.3048
        onTrail = offsetM <= thresholdM
        if (onTrail) { setThCrow(false); setThDistM(alongM) }
        else         { setThCrow(true);  setThDistM(haversineMeters(th.lat, th.lng, point.lat, point.lng)) }
      }
      setLight(onTrail ? 'green' : 'red')
    } else if (th) {
      // Trail selected but no centerline — crow-flies distance only.
      setThCrow(true)
      setThDistM(haversineMeters(th.lat, th.lng, point.lat, point.lng))
      setLight('gray')
    } else {
      setLight('gray')
    }

    // Distance delta since the last accepted fix, with a jitter floor.
    let distAdd = 0
    const last = lastFixRef.current
    if (last) {
      const d = haversineMeters(last.lat, last.lng, point.lat, point.lng)
      const pending = pendingRef.current + d
      if (pending >= JITTER_M) { distAdd = pending; pendingRef.current = 0 }
      else { pendingRef.current = pending }
    }
    lastFixRef.current = { lat: point.lat, lng: point.lng }

    // Count the distance toward the on-trail total when we can't classify
    // (no centerline) or when we're on the trail. Going up then back keeps
    // adding, so this is the total distance travelled on trail either direction.
    const countDist = (!classifiable || onTrail) ? distAdd : 0

    // Thin the breadcrumb: keep a crumb every ~CRUMB_MIN_M of travel.
    const lastCrumb = lastCrumbRef.current
    const addCrumb = !lastCrumb ||
      haversineMeters(lastCrumb.lat, lastCrumb.lng, point.lat, point.lng) >= CRUMB_MIN_M
    if (addCrumb) lastCrumbRef.current = { lat: point.lat, lng: point.lng }

    const seg  = cur.segments[cur.segments.length - 1]
    const newSeg: TrackerSegment = {
      ...seg,
      distanceM:  seg.distanceM + countDist,
      startPoint: seg.startPoint ?? point,
      endPoint:   point,
      crumbs:     addCrumb ? [...(seg.crumbs ?? []), point] : seg.crumbs,
    }
    const next: Tracker = {
      ...cur,
      totalDistanceM: cur.totalDistanceM + countDist,
      segments:       [...cur.segments.slice(0, -1), newSeg],
    }
    setAndNotify(next)

    // Persist periodically (and whenever a crumb lands) so a refresh mid-patrol
    // doesn't lose the path or distance.
    const nowMs = Date.now()
    if (addCrumb || nowMs - lastSaveRef.current > 5000) {
      lastSaveRef.current = nowMs
      void saveTracker(next)
    }
  }, [setAndNotify])

  const startWatch = useCallback(() => {
    if (watchIdRef.current !== null || !navigator.geolocation) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      onPosition,
      () => { /* keep last reading */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }, [onPosition])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current === null) return
    navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
  }, [])

  // 1 s re-render while tracking so elapsed time + pace stay live.
  useEffect(() => {
    if (tracker?.state === 'tracking' && tickRef.current === null) {
      tickRef.current = setInterval(() => setTick(n => n + 1), 1000)
    } else if (tracker?.state !== 'tracking' && tickRef.current !== null) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [tracker?.state])

  // Load any in-progress tracker for this session (e.g. after a refresh).
  useEffect(() => {
    stopWatch()
    lastFixRef.current = null
    pendingRef.current = 0
    lastCrumbRef.current = null
    setLight('gray'); setThDistM(null); setThCrow(false)

    if (!sessionId) { setAndNotify(null); return }
    void (async () => {
      const saved = await getSessionTrackers(sessionId)
      const live  = saved.find(t => t.state === 'tracking') ?? null
      setAndNotify(live)
      if (live) {
        const seg = live.segments[live.segments.length - 1]
        const lastCrumb = seg?.crumbs?.[seg.crumbs.length - 1] ?? seg?.endPoint
        if (lastCrumb) {
          lastFixRef.current   = { lat: lastCrumb.lat, lng: lastCrumb.lng }
          lastCrumbRef.current = { lat: lastCrumb.lat, lng: lastCrumb.lng }
        }
        startWatch()
        void requestWakeLock()
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => () => {
    stopWatch()
    releaseWakeLock()
    if (tickRef.current) clearInterval(tickRef.current)
  }, [stopWatch, releaseWakeLock])

  // ── Public actions ─────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!sessionId || trackerRef.current?.state === 'tracking') return
    const t = newTracker(sessionId)
    lastFixRef.current = null
    pendingRef.current = 0
    lastCrumbRef.current = null
    lastSaveRef.current = Date.now()
    setAndNotify(t)
    await saveTracker(t)
    startWatch()
    void requestWakeLock()
  }, [sessionId, setAndNotify, startWatch, requestWakeLock])

  const stop = useCallback(async () => {
    const cur = trackerRef.current
    stopWatch()
    releaseWakeLock()
    if (!cur) return null
    const now = Date.now()
    const seg = cur.segments[cur.segments.length - 1]
    const ended: Tracker = {
      ...cur,
      state: 'ended',
      segments: seg && !seg.endAt
        ? [...cur.segments.slice(0, -1), { ...seg, endAt: now }]
        : cur.segments,
      activeDurationMs: cur.activeDurationMs + (seg && !seg.endAt ? now - seg.startAt : 0),
    }
    setAndNotify(ended)
    await saveTracker(ended)
    return ended
  }, [setAndNotify, stopWatch, releaseWakeLock])

  /** Discard the tracker and its saved rows — used by Start's restart-confirm
   *  and by the page's full reset after a send. */
  const clear = useCallback(async () => {
    stopWatch()
    releaseWakeLock()
    lastFixRef.current = null
    pendingRef.current = 0
    lastCrumbRef.current = null
    setLight('gray'); setThDistM(null); setThCrow(false)
    setAndNotify(null)
    if (sessionId) await clearSessionTrackers(sessionId)
  }, [sessionId, setAndNotify, stopWatch, releaseWakeLock])

  // ── Derived live stats ───────────────────────────────────────────────────
  const tracking  = tracker?.state === 'tracking'
  const startedAt = tracker?.startedAt ?? null
  const elapsedMs = tracking && startedAt != null ? Date.now() - startedAt : (tracker?.activeDurationMs ?? 0)
  const distanceM = tracker?.totalDistanceM ?? 0
  const distMi    = distanceM / 1609.344
  const paceMinPerMi = tracking && distMi > 0.02 ? (elapsedMs / 60000) / distMi : null

  const stats: LiveStats = {
    tracking, startedAt, elapsedMs, distanceM,
    trailheadDistM: tracking ? thDistM : null,
    trailheadCrow:  thCrow,
    light:          tracking ? light : 'gray',
    paceMinPerMi,
  }

  return { tracker, stats, start, stop, clear }
}
