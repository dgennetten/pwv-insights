import { useState, useEffect, useRef, useCallback } from 'react'
import { saveTracker, getSessionTrackers } from '../../services/dataLoggerService'
import { getLoggerSettings } from '../../lib/loggerSettings'
import { trailPaths } from '../../data/trailPaths'
import type { Tracker, TrackerSegment, TrackerState, GpsPoint, Waypoint } from '../../types/dataLogger'

// ── Utilities ─────────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fmtMiles(meters: number): string {
  return (meters / 1609.344).toFixed(2) + ' mi'
}

// Along-path distance from trailhead to user's closest point on the trail.
// pathSegs is [lng, lat][][] (Overpass convention); TH/user coords are {lat, lng}.
function distAlongPath(
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

function fmtDuration(ms: number): string {
  const s   = Math.floor(ms / 1000)
  const h   = Math.floor(s / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const JITTER_M   = 3   // ignore GPS deltas < 3 m
const ACCURACY_M = 50  // ignore fixes with accuracy > 50 m

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackerUi extends Tracker {
  nameInput: string
  wpInputOpen?: boolean
  wpInput?: string
}

function makePersistable(t: TrackerUi): Tracker {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { nameInput, wpInputOpen, wpInput, ...rest } = t
  return rest
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface DistanceTrackerProps {
  sessionId: string | null
  trailheadCoords?: { lat: number; lng: number }
  wksiteId?: number
  onTrackersChange?: (trackers: Tracker[]) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DistanceTracker({ sessionId, trailheadCoords, wksiteId, onTrackersChange }: DistanceTrackerProps) {
  const [trackers,         setTrackers]         = useState<TrackerUi[]>([])
  const [showAllTrackers,  setShowAllTrackers]  = useState(false)
  const [, setTick]                             = useState(0)

  const watchIdRef      = useRef<number | null>(null)
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPointsRef   = useRef<Map<string, GpsPoint>>(new Map())
  const trackersRef     = useRef<TrackerUi[]>([])
  const wakeLockRef     = useRef<WakeLockSentinel | null>(null)
  const currentPosRef   = useRef<{ lat: number; lng: number } | null>(null)

  // Maps tracker ID → { segDistM, ts } at the last waypoint for that tracker
  const lastWaypointRef = useRef<Map<string, { segDistM: number; ts: number }>>(new Map())

  // Sync ref and notify parent after every commit where trackers change
  useEffect(() => {
    trackersRef.current = trackers
    onTrackersChange?.(trackers.map(makePersistable))
  }, [trackers, onTrackersChange])

  // ── Wake Lock ───────────────────────────────────────────────────────────────

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    if (wakeLockRef.current) return
    if (!getLoggerSettings().wakeLockEnabled) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
      wakeLockRef.current.addEventListener('release', () => { wakeLockRef.current = null })
    } catch { /* denied or not supported */ }
  }, [])

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release()
    wakeLockRef.current = null
  }, [])

  // Re-acquire after the browser releases it on tab-hide / screen-off
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' &&
          trackersRef.current.some(t => t.state === 'tracking')) {
        void requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [requestWakeLock])

  // ── GPS watch ───────────────────────────────────────────────────────────────

  const onGpsError = useCallback(() => {/* silently continue */}, [])

  const onGpsPosition = useCallback((pos: GeolocationPosition) => {
    if ((pos.coords.accuracy ?? 0) > ACCURACY_M) return
    const point: GpsPoint = {
      lat:      pos.coords.latitude,
      lng:      pos.coords.longitude,
      ts:       pos.timestamp,
      accuracy: pos.coords.accuracy ?? undefined,
    }
    currentPosRef.current = { lat: point.lat, lng: point.lng }

    const settings = getLoggerSettings()

    setTrackers(prev => {
      const updated = prev.map(tracker => {
        if (tracker.state !== 'tracking') return tracker
        const last  = lastPointsRef.current.get(tracker.id)
        let distAdd = 0
        if (last) {
          const d = haversineMeters(last.lat, last.lng, point.lat, point.lng)
          if (d >= JITTER_M) distAdd = d
        }
        lastPointsRef.current.set(tracker.id, point)

        const segs = [...tracker.segments]
        const cur  = segs[segs.length - 1]
        if (!cur) return tracker

        const newSegDistM = cur.distanceM + distAdd

        // ── Waypoint check ──────────────────────────────────────────────────
        let newWaypoints: Waypoint[] = cur.waypoints ? [...cur.waypoints] : []
        if (settings.waypointsEnabled && distAdd > 0) {
          const lastWp       = lastWaypointRef.current.get(tracker.id)
          const lastWpDistM  = lastWp?.segDistM ?? 0
          const lastWpTs     = lastWp?.ts ?? cur.startAt

          let shouldAdd = false
          if (settings.waypointMode === 'distance') {
            const thresholdM = settings.waypointDistanceMi * 1609.344
            shouldAdd = (newSegDistM - lastWpDistM) >= thresholdM
          } else {
            const thresholdMs = settings.waypointTimeMin * 60 * 1000
            shouldAdd = (point.ts - lastWpTs) >= thresholdMs
          }

          if (shouldAdd) {
            newWaypoints = [...newWaypoints, {
              lat: point.lat, lng: point.lng, ts: point.ts,
              segmentDistanceM: newSegDistM,
            }]
            lastWaypointRef.current.set(tracker.id, { segDistM: newSegDistM, ts: point.ts })
          }
        }

        segs[segs.length - 1] = {
          ...cur,
          distanceM:  newSegDistM,
          startPoint: cur.startPoint ?? point,
          endPoint:   point,
          waypoints:  newWaypoints.length > 0 ? newWaypoints : undefined,
        }
        return { ...tracker, totalDistanceM: tracker.totalDistanceM + distAdd, segments: segs }
      })
      return updated
    })
  }, [])

  const startWatch = useCallback(() => {
    if (watchIdRef.current !== null || !navigator.geolocation) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      onGpsPosition,
      onGpsError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }, [onGpsPosition, onGpsError])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current === null) return
    navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
  }, [])

  // ── Ticker (1 s re-render while tracking) ───────────────────────────────────

  useEffect(() => {
    const isTracking = trackers.some(t => t.state === 'tracking')
    if (isTracking && tickIntervalRef.current === null) {
      tickIntervalRef.current = setInterval(() => setTick(n => n + 1), 1000)
    } else if (!isTracking && tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current)
      tickIntervalRef.current = null
    }
  }, [trackers])

  // ── Load trackers for session ────────────────────────────────────────────────

  useEffect(() => {
    stopWatch()
    if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null }
    lastPointsRef.current.clear()
    lastWaypointRef.current.clear()
    setTrackers([])

    if (!sessionId) return

    void (async () => {
      const saved = await getSessionTrackers(sessionId)
      const ui    = saved.map(t => ({
        ...t,
        state:     (t.state === 'tracking' ? 'paused' : t.state) as TrackerState,
        nameInput: t.name,
      }))
      setTrackers(ui)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Cleanup on unmount
  useEffect(() => () => {
    stopWatch()
    releaseWakeLock()
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)
  }, [stopWatch, releaseWakeLock])

  // ── Helper: persist ──────────────────────────────────────────────────────────

  const persist = useCallback(async (updated: TrackerUi[]) => {
    for (const t of updated) await saveTracker(makePersistable(t))
  }, [])

  // Fixed: compute next from ref synchronously — avoids React 18 batching race
  const update = useCallback(async (fn: (prev: TrackerUi[]) => TrackerUi[]) => {
    const next = fn(trackersRef.current)
    trackersRef.current = next
    setTrackers(next)
    await persist(next)
  }, [persist])

  // ── Actions ──────────────────────────────────────────────────────────────────

  const startTracker = useCallback(async () => {
    if (!sessionId) return
    const now      = Date.now()
    const segment: TrackerSegment = { startAt: now, distanceM: 0 }
    const tracker: TrackerUi = {
      id:              `t-${now}`,
      sessionId,
      name:            '',
      nameInput:       '',
      state:           'tracking',
      startedAt:       now,
      segments:        [segment],
      totalDistanceM:  0,
      activeDurationMs: 0,
    }
    await update(prev => [...prev, tracker])
    startWatch()
    void requestWakeLock()
  }, [sessionId, update, startWatch, requestWakeLock])

  const pauseTracker = useCallback(async (id: string) => {
    const now = Date.now()
    await update(prev => prev.map(t => {
      if (t.id !== id || t.state !== 'tracking') return t
      const segs = [...t.segments]
      const cur  = segs[segs.length - 1]
      if (cur) segs[segs.length - 1] = { ...cur, endAt: now }
      const addedMs = cur ? now - cur.startAt : 0
      return { ...t, state: 'paused', segments: segs, activeDurationMs: t.activeDurationMs + addedMs }
    }))
    if (!trackersRef.current.some(t => t.id !== id && t.state === 'tracking')) {
      stopWatch()
      releaseWakeLock()
    }
  }, [update, stopWatch, releaseWakeLock])

  const resumeTracker = useCallback(async (id: string) => {
    const now = Date.now()
    lastWaypointRef.current.delete(id)  // new segment — reset waypoint baseline
    await update(prev => prev.map(t => {
      if (t.id !== id || t.state !== 'paused') return t
      const seg: TrackerSegment = { startAt: now, distanceM: 0 }
      return { ...t, state: 'tracking', segments: [...t.segments, seg] }
    }))
    startWatch()
    void requestWakeLock()
  }, [update, startWatch, requestWakeLock])

  const endTracker = useCallback(async (id: string) => {
    const now = Date.now()
    await update(prev => prev.map(t => {
      if (t.id !== id || (t.state !== 'tracking' && t.state !== 'paused')) return t
      const segs = [...t.segments]
      const cur  = segs[segs.length - 1]
      if (cur && !cur.endAt) segs[segs.length - 1] = { ...cur, endAt: now }
      const addedMs = cur && !cur.endAt ? now - cur.startAt : 0
      return { ...t, state: 'ended', segments: segs, activeDurationMs: t.activeDurationMs + addedMs }
    }))
    if (!trackersRef.current.some(t => t.id !== id && t.state === 'tracking')) {
      stopWatch()
      releaseWakeLock()
    }
  }, [update, stopWatch, releaseWakeLock])

  const saveTrackerName = useCallback(async (id: string) => {
    await update(prev => prev.map(t => {
      if (t.id !== id || t.state !== 'ended') return t
      return { ...t, state: 'saved', name: t.nameInput.trim() || `Tracker ${prev.findIndex(x => x.id === id) + 1}` }
    }))
  }, [update])

  const setNameInput = useCallback((id: string, value: string) => {
    setTrackers(prev => prev.map(t => t.id === id ? { ...t, nameInput: value } : t))
  }, [])

  const openWpInput = useCallback((id: string) => {
    setTrackers(prev => prev.map(t => t.id === id ? { ...t, wpInputOpen: true, wpInput: '' } : t))
  }, [])

  const cancelWpInput = useCallback((id: string) => {
    setTrackers(prev => prev.map(t => t.id === id ? { ...t, wpInputOpen: false, wpInput: '' } : t))
  }, [])

  const setWpInput = useCallback((id: string, value: string) => {
    setTrackers(prev => prev.map(t => t.id === id ? { ...t, wpInput: value } : t))
  }, [])

  const saveManualWaypoint = useCallback(async (id: string, name: string) => {
    const tracker = trackersRef.current.find(t => t.id === id)
    if (!tracker || tracker.state !== 'tracking') return
    const lastPoint = lastPointsRef.current.get(id)
    const seg = tracker.segments[tracker.segments.length - 1]
    if (!seg) return
    const now = Date.now()
    const waypoint: Waypoint = {
      lat:              lastPoint?.lat ?? null,
      lng:              lastPoint?.lng ?? null,
      ts:               now,
      segmentDistanceM: seg.distanceM,
      name:             name.trim() || undefined,
    }
    lastWaypointRef.current.set(id, { segDistM: seg.distanceM, ts: now })
    await update(prev => prev.map(t => {
      if (t.id !== id || t.state !== 'tracking') return t
      const segs = [...t.segments]
      const cur  = segs[segs.length - 1]
      if (!cur) return t
      segs[segs.length - 1] = { ...cur, waypoints: [...(cur.waypoints ?? []), waypoint] }
      return { ...t, segments: segs, wpInputOpen: false, wpInput: '' }
    }))
  }, [update])

  // ── Display helpers ──────────────────────────────────────────────────────────

  function getDisplayDuration(t: TrackerUi): number {
    let ms = t.activeDurationMs
    if (t.state === 'tracking') {
      const cur = t.segments[t.segments.length - 1]
      if (cur) ms += Date.now() - cur.startAt
    }
    return ms
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const stateColors: Record<TrackerState, string> = {
    tracking: 'text-emerald-600 dark:text-emerald-400',
    paused:   'text-amber-600 dark:text-amber-400',
    ended:    'text-stone-500 dark:text-stone-400',
    saved:    'text-stone-400 dark:text-stone-500',
  }

  const stateLabel: Record<TrackerState, string> = {
    tracking: '● Tracking',
    paused:   '‖ Paused',
    ended:    '■ Ended',
    saved:    '✓ Saved',
  }

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Distance / Time Trackers
      </span>

      {trackers.length > 0 && (
        <div className="space-y-2">
          {(showAllTrackers ? trackers : trackers.slice(-1)).map(t => {
            const idx = trackers.indexOf(t)
            const dur   = getDisplayDuration(t)
            const label = t.name || `Tracker ${idx + 1}`
            return (
              <div
                key={t.id}
                className="bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-xl p-3 space-y-2"
              >
                {/* Stats row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold tabular-nums text-stone-800 dark:text-stone-100">
                      {fmtMiles(t.totalDistanceM)}
                    </span>
                    <span className="text-sm tabular-nums text-stone-500 dark:text-stone-400">
                      {fmtDuration(dur)}
                    </span>
                  </div>
                  <span className={`text-xs font-medium ${stateColors[t.state]}`}>
                    {stateLabel[t.state]}
                  </span>
                </div>
                {trailheadCoords && (t.state === 'tracking' || t.state === 'paused') && currentPosRef.current && (
                  <div className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                    {(() => {
                      const pos = currentPosRef.current!
                      const segs = wksiteId != null ? (trailPaths[wksiteId] ?? []) : []
                      const distM = segs.length > 0
                        ? distAlongPath(segs, trailheadCoords.lat, trailheadCoords.lng, pos.lat, pos.lng)
                        : haversineMeters(trailheadCoords.lat, trailheadCoords.lng, pos.lat, pos.lng)
                      return fmtMiles(distM)
                    })()} from trailhead
                  </div>
                )}

                {/* Saved: show name */}
                {t.state === 'saved' && (
                  <p className="text-xs font-medium text-stone-600 dark:text-stone-400">{label}</p>
                )}

                {/* Tracking controls */}
                {t.state === 'tracking' && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => void pauseTracker(t.id)}
                        className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-white transition-colors"
                      >
                        Pause
                      </button>
                      {!t.wpInputOpen && (
                        <button
                          onClick={() => openWpInput(t.id)}
                          className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        >
                          Add Waypoint
                        </button>
                      )}
                    </div>
                    {t.wpInputOpen && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={t.wpInput ?? ''}
                          onChange={e => setWpInput(t.id, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') void saveManualWaypoint(t.id, t.wpInput ?? '')
                            if (e.key === 'Escape') cancelWpInput(t.id)
                          }}
                          placeholder="Waypoint name (optional)"
                          autoFocus
                          className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-700 dark:text-stone-300 placeholder:text-stone-400 outline-none focus:border-emerald-400 transition-colors"
                        />
                        <button
                          onClick={() => void saveManualWaypoint(t.id, t.wpInput ?? '')}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => cancelWpInput(t.id)}
                          className="px-2.5 py-1.5 text-xs rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Paused controls */}
                {t.state === 'paused' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => void resumeTracker(t.id)}
                      className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                    >
                      Resume
                    </button>
                    <button
                      onClick={() => void endTracker(t.id)}
                      className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-300 transition-colors"
                    >
                      End
                    </button>
                  </div>
                )}

                {/* Ended: name + save */}
                {t.state === 'ended' && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={t.nameInput}
                      onChange={e => setNameInput(t.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void saveTrackerName(t.id) }}
                      placeholder={label}
                      className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-700 dark:text-stone-300 placeholder:text-stone-400 outline-none focus:border-emerald-400 transition-colors"
                    />
                    <button
                      onClick={() => void saveTrackerName(t.id)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                )}

                {/* Segment summary (paused / ended / saved) */}
                {t.state !== 'tracking' && t.segments.length > 1 && (
                  <div className="space-y-0.5 pt-1 border-t border-stone-200 dark:border-stone-700">
                    {t.segments.map((seg, si) => (
                      <div key={si} className="flex items-center justify-between text-xs text-stone-400 dark:text-stone-500">
                        <span>
                          Seg {si + 1}: {fmtTime(seg.startAt)}
                          {seg.endAt ? ` – ${fmtTime(seg.endAt)}` : ' (active)'}
                        </span>
                        <span>{fmtMiles(seg.distanceM)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {trackers.length > 1 && (
            <button
              onClick={() => setShowAllTrackers(p => !p)}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 underline underline-offset-2 transition-colors"
            >
              {showAllTrackers ? 'Show less' : `Show all ${trackers.length} trackers`}
            </button>
          )}
        </div>
      )}

      {/* Start button — always available unless no session */}
      <button
        onClick={() => void startTracker()}
        disabled={!sessionId}
        className="w-full py-2 text-xs font-semibold rounded-xl border-2 border-dashed border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-40 transition-colors"
      >
        {trackers.length === 0 ? '▶ Start Tracker' : '▶ Start New Tracker'}
      </button>
    </div>
  )
}
