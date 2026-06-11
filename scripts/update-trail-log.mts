/**
 * Retrofit a saved trail-log JSON with the v1.16 fields:
 *   - top-level wksiteId / trailName
 *   - per-entry distFromTrailheadM (along-trail distance from the trailhead)
 *   - distFromTrailheadM on manual (named) waypoints
 *
 * Usage: npx tsx scripts/update-trail-log.mts <log.json> [wksiteId]
 * Without wksiteId the trail is inferred from the nearest trailhead to the
 * log's GPS points. Writes the enriched JSON in place.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { trailGeoData, trailNames } from '../src/data/trailGeoData'
import { distFromTrailheadM } from '../src/lib/trailheadDistance'
import { haversineMeters } from '../src/lib/gpsDistance'

const [, , file, wksiteArg] = process.argv
if (!file) {
  console.error('Usage: npx tsx scripts/update-trail-log.mts <log.json> [wksiteId]')
  process.exit(1)
}

interface Entry {
  type: string
  lat: number | null
  lng: number | null
  distFromTrailheadM?: number
  [k: string]: unknown
}
interface Waypoint {
  lat: number | null
  lng: number | null
  name?: string
  distFromTrailheadM?: number
  [k: string]: unknown
}
interface Log {
  wksiteId?: number | null
  trailName?: string | null
  entries: Entry[]
  trackers: Array<{ segments: Array<{ waypoints?: Waypoint[] }> }>
  [k: string]: unknown
}

const log = JSON.parse(readFileSync(file, 'utf8')) as Log

const gpsPoints = log.entries
  .filter(e => e.lat != null && e.lng != null)
  .map(e => ({ lat: e.lat!, lng: e.lng! }))

let wksiteId: number
if (wksiteArg) {
  wksiteId = parseInt(wksiteArg, 10)
} else {
  if (gpsPoints.length === 0) {
    console.error('No GPS points in log — pass a wksiteId explicitly.')
    process.exit(1)
  }
  // Infer: trailhead with the smallest mean distance to the log's GPS points
  const candidates = Object.entries(trailGeoData)
    .map(([id, th]) => ({
      id: Number(id),
      meanM: gpsPoints.reduce((s, p) => s + haversineMeters(th.lat, th.lng, p.lat, p.lng), 0) / gpsPoints.length,
    }))
    .sort((a, b) => a.meanM - b.meanM)
  console.log('Nearest trailhead candidates (mean distance to log GPS points):')
  for (const c of candidates.slice(0, 3)) {
    console.log(`  ${trailNames[c.id] ?? c.id} (wksiteId ${c.id}): ${(c.meanM / 1609.344).toFixed(2)} mi`)
  }
  wksiteId = candidates[0].id
}

const trailName = trailNames[wksiteId]
if (!trailName) {
  console.error(`Unknown wksiteId ${wksiteId}`)
  process.exit(1)
}
console.log(`\nUsing trail: ${trailName} (wksiteId ${wksiteId})`)

log.wksiteId = wksiteId
log.trailName = trailName

let entriesUpdated = 0
for (const e of log.entries) {
  if (e.type === 'trail') continue
  const d = distFromTrailheadM(wksiteId, e.lat, e.lng)
  if (d != null) {
    e.distFromTrailheadM = Math.round(d * 10) / 10
    entriesUpdated++
  }
}

let wpsUpdated = 0
for (const t of log.trackers) {
  for (const seg of t.segments) {
    for (const wp of seg.waypoints ?? []) {
      if (!wp.name) continue  // auto-waypoints excluded
      const d = distFromTrailheadM(wksiteId, wp.lat, wp.lng)
      if (d != null) {
        wp.distFromTrailheadM = Math.round(d * 10) / 10
        wpsUpdated++
      }
    }
  }
}

writeFileSync(file, JSON.stringify(log, null, 4))
console.log(`Updated ${entriesUpdated}/${log.entries.length} entries, ${wpsUpdated} manual waypoints.`)
console.log(`Wrote ${file}`)
