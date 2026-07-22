#!/usr/bin/env node
/**
 * One-time script to fetch PWV trail path centerlines from OpenStreetMap
 * via the Overpass API and write src/data/trailPaths.ts.
 *
 * Trails are keyed by lu_worksite.WksiteID (matching trailGeoData).
 * Matching is by trail name — OSM trail names generally match the PWV names.
 *
 * Run:  node scripts/fetch-trail-paths.mjs
 *
 * Requires Node 18+ (native fetch).
 * May take 30–60 s depending on Overpass load.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE  = path.join(__dirname, '../src/data/trailPaths.ts')

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const USER_AGENT   = 'pwv-insights-trail-fetch/1.0 (douglas@gennetten.com)'

// ── WksiteID → search name(s) ─────────────────────────────────────────────────
// Each entry maps a WksiteID to one or more name fragments to search in OSM.
// The fragments are used in a case-insensitive regex alternation.
const TRAIL_SEARCH = [
  [3,   ['Beaver Creek Trail']],
  [6,   ['Big South Trail']],
  [9,   ['Blue Lake Trail']],
  [15,  ['Brackenbury']],
  [18,  ['Browns Lake']],
  [21,  ['Bulwark Ridge']],
  [24,  ['Camp Lake Trail']],
  [45,  ['Comanche Lake']],
  [48,  ['Corral Creek', 'Upper Big South']],
  [57,  ['Crosier Mountain', 'Garden Gate']],
  [66,  ['Crosier Rainbow']],
  [84,  ['Elkhorn Creek Trail', 'Elkhorn Creek']],
  [87,  ['Emmaline Lake']],
  [93,  ['Fish Creek Trail']],
  [96,  ['Flowers Trail', 'Flowers Road']],
  [117, ['Greyrock Trail']],
  [120, ['Greyrock Meadows Trail']],
  [126, ['Hewlett Gulch']],
  [135, ['Hourglass Trail']],
  [153, ['Killpecker Trail']],
  [165, ['Lily Mountain']],
  [168, ['Link Trail']],
  [171, ['Lion Gulch Trail', 'Lion Gulch']],
  [177, ['Little Beaver Creek']],
  [192, ['Lost Lake Trail']],
  [195, ['Dadd Gulch', 'Lower Dadd']],
  [201, ['McIntyre Trail']],
  [204, ['McIntyre Creek Trail']],
  [207, ['McIntyre Lake Trail']],
  [210, ['Medicine Bow Trail']],
  [216, ['Mirror Lake Trail']],
  [225, ['Montgomery Pass', 'Zimmerman Lake Trail']],
  [234, ['Mt. McConnel', 'Kreutzer Nature Trail']],
  [240, ['Mummy Pass Trail']],
  [243, ['Neota Creek']],
  [249, ['North Fork Trail', 'North Fork of the Big Thompson']],
  [252, ['North Lone Pine']],
  [261, ['Rawah Trail']],
  [264, ['Roaring Creek']],
  [267, ['Round Mountain Trail']],
  [276, ['Signal Mountain Trail']],
  [285, ['Stormy Peaks Trail']],
  [294, ['Trap Park Trail']],
  [297, ['Twin Crater Lakes']],
  [300, ['Twin Sisters Trail', 'Twin Sisters Peaks']],
  [312, ['West Branch Trail']],
  [318, ['Young Gulch']],
  [321, ['Zimmerman Trail']],
  [324, ['Zimmerman Lake Trail']],
  [348, ['Pawnee Buttes Trail']],
  // Combined worksites reuse same path data:
  [400, ['Crosier Mountain', 'Garden Gate']],
  [403, ['Crosier Glen Haven', 'Crosier Mountain']],
  [406, ['McConnel', 'Kreutzer']],
  [409, ['Zimmerman Trail']],
  [412, ['Zimmerman Trail']],
  [415, ['Corral Creek', 'Upper Big South']],
  [418, ['Camp Lake']],
  [421, ['Medicine Bow Trail']],
  [424, ['Medicine Bow Trail']],
  [427, ['Rawah Trail']],
  [430, ['Rawah Trail']],
  [433, ['Greyrock']],
  [436, ['Mt. Margaret', 'Divide Trail']],
  [439, ['Lady Moon', 'Disappointment Falls']],
  [442, ['Granite Ridge']],
  [445, ['Frog Pond', 'East Dowdy Lake']],
  [448, ['Columbine']],
]

// ── USFS-sourced trails ───────────────────────────────────────────────────────
// Authoritative geometry pulled from the USFS EDW "TrailNFSPublish" layer for
// trails that OSM lacks or gets wrong. These OVERWRITE any OSM match for the same
// WksiteID and are preserved across re-runs (see the merge step in main()), so
// regenerating this file will never clobber them.
//   wksiteId  – lu_worksite.WksiteID (matches trailGeoData / trailPaths keys)
//   trailNo   – USFS TRAIL_NO
//   adminOrg  – USFS ADMIN_ORG, required to disambiguate: TRAIL_NO is not unique
//               nationwide (e.g. #974 exists in NM, WA, OR and CO). 021005 = ARP.
//   trimMiles – optional; keep only the first N miles from the `startNear` end
//   startNear – optional [lng, lat] anchor marking mile 0 (the trail's access end)
const USFS_TRAILS = [
  {
    wksiteId:  273,           // Shipman Park (Rawah Wilderness)
    trailNo:   '974',
    adminOrg:  '021005',      // Arapaho & Roosevelt NF
    trimMiles: 4.25,          // officially shortened to the first 4.25 mi
    startNear: [-106.0475, 40.815],  // trailhead-access (mile 0) end
  },
]

const USFS_QUERY_BASE =
  'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0/query'

// ── Bounding box (Canyon Lakes RD + Pawnee Buttes area) ──────────────────────
const BBOX = '40.20,-106.25,40.90,-103.85'

// ── Build batched Overpass queries ─────────────────────────────────────────────
// Split into batches of ~15 name groups to avoid Overpass timeout.
const BATCH_SIZE = 15

function buildQuery(searchTerms) {
  const nameRegex = searchTerms.join('|')
  return `[out:json][timeout:60];
way[highway~"^(path|footway|track|bridleway)$"]["name"~"${nameRegex}",i](${BBOX});
(._;);out geom;`
}

async function overpassFetch(query, attempt = 1) {
  const res = await fetch(OVERPASS_URL, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':   USER_AGENT,
    },
    body: 'data=' + encodeURIComponent(query),
  })
  if (res.status === 429 || res.status === 504) {
    if (attempt >= 4) throw new Error(`Overpass HTTP ${res.status} after ${attempt} attempts`)
    const wait = attempt * 30000
    console.log(`  Rate limited (${res.status}), waiting ${wait/1000}s before retry…`)
    await new Promise(r => setTimeout(r, wait))
    return overpassFetch(query, attempt + 1)
  }
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Overpass parse error: ${text.slice(0, 200)}`)
  }
}

// ── Match OSM way name to WksiteID ────────────────────────────────────────────

function wayMatchesEntry(wayName, searchNames) {
  const lc = wayName.toLowerCase()
  return searchNames.some(s => lc.includes(s.toLowerCase()))
}

// ── USFS geometry helpers ─────────────────────────────────────────────────────

// Great-circle distance in miles between two [lng, lat] points.
function haversineMiles(a, b) {
  const R = 3958.8, rad = x => x * Math.PI / 180
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0])
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function pathLengthMiles(coords) {
  let sum = 0
  for (let i = 1; i < coords.length; i++) sum += haversineMiles(coords[i - 1], coords[i])
  return sum
}

// Keep only the first `miles` of a path, measured from whichever end is nearest
// `startNear` ([lng, lat]); interpolates the final point so the cut is exact.
function trimPath(coords, miles, startNear) {
  let c = coords.slice()
  if (startNear &&
      haversineMiles(c[0], startNear) > haversineMiles(c[c.length - 1], startNear)) {
    c.reverse()
  }
  let cum = 0
  const out = [c[0]]
  for (let i = 1; i < c.length; i++) {
    const seg = haversineMiles(c[i - 1], c[i])
    if (cum + seg >= miles) {
      const f = (miles - cum) / seg
      out.push([c[i - 1][0] + (c[i][0] - c[i - 1][0]) * f,
                c[i - 1][1] + (c[i][1] - c[i - 1][1]) * f])
      return out
    }
    cum += seg
    out.push(c[i])
  }
  return out  // whole path is shorter than `miles`
}

const round5 = ([lng, lat]) => [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]

// Fetch one trail's centerline from the USFS EDW layer, filtered by ADMIN_ORG,
// optionally trimmed. Returns an array of paths: [ [ [lng,lat], … ], … ].
async function fetchUsfsTrail({ trailNo, adminOrg, trimMiles, startNear }) {
  const url = `${USFS_QUERY_BASE}?where=${encodeURIComponent(`TRAIL_NO='${trailNo}'`)}` +
              `&outFields=*&f=geojson`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`USFS HTTP ${res.status}`)
  const data = JSON.parse(await res.text())
  const feats = (data.features ?? []).filter(f =>
    f.geometry && (!adminOrg || String(f.properties?.admin_org) === String(adminOrg)))

  const lines = []
  for (const f of feats) {
    if (f.geometry.type === 'LineString') lines.push(f.geometry.coordinates)
    else if (f.geometry.type === 'MultiLineString') lines.push(...f.geometry.coordinates)
  }
  if (lines.length === 0) {
    throw new Error(`no geometry for TRAIL_NO=${trailNo} ADMIN_ORG=${adminOrg}`)
  }

  if (trimMiles) {
    // Trimming needs a single ordered line — use the longest matched segment.
    const longest = lines.reduce((a, b) => pathLengthMiles(b) > pathLengthMiles(a) ? b : a)
    return [trimPath(longest, trimMiles, startNear).map(round5)]
  }
  return lines.map(l => l.map(round5))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Collect all search terms for batching
  const allTerms   = TRAIL_SEARCH.flatMap(([, terms]) => terms)
  const uniqueTerms = [...new Set(allTerms)]

  // Split into batches
  const batches = []
  for (let i = 0; i < uniqueTerms.length; i += BATCH_SIZE) {
    batches.push(uniqueTerms.slice(i, i + BATCH_SIZE))
  }

  console.log(`Fetching ${batches.length} batches from Overpass…`)

  const allWays = []
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    console.log(`  Batch ${i+1}/${batches.length}: ${batch.join(', ')}`)
    const data = await overpassFetch(buildQuery(batch))
    allWays.push(...(data.elements ?? []))
    if (i < batches.length - 1) {
      await new Promise(r => setTimeout(r, 8000))
    }
  }

  console.log(`\nTotal OSM ways fetched: ${allWays.length}`)

  // Build wksiteId → paths map
  const result = new Map()
  for (const [wksiteId, searchNames] of TRAIL_SEARCH) {
    const matching = allWays.filter(w =>
      w.tags?.name && wayMatchesEntry(w.tags.name, searchNames) && w.geometry?.length > 0
    )
    if (matching.length === 0) continue

    const paths = matching.map(w =>
      w.geometry.map(({ lon, lat }) => [lon, lat])
    )
    // If this WksiteID was already added (e.g., combined worksite sharing paths), skip
    if (!result.has(wksiteId)) {
      result.set(wksiteId, paths)
      console.log(`  WksiteID ${wksiteId}: ${matching.length} segment(s) from "${matching[0]?.tags?.name}"`)
    }
  }

  // ── Merge USFS-sourced trails (authoritative; never clobbered) ───────────────
  // Read the current file first so a failed fetch falls back to the existing
  // value instead of dropping the trail. The file is machine-generated by this
  // script, so its object body is plain JSON-ish JS we can safely evaluate.
  let existingPaths = {}
  try {
    const prev    = fs.readFileSync(OUT_FILE, 'utf8')
    const objText = prev.slice(prev.indexOf('{'), prev.lastIndexOf('}') + 1)
    existingPaths = new Function(`return (${objText})`)()
  } catch { /* no readable existing file (first run) — no fallback available */ }

  for (const entry of USFS_TRAILS) {
    try {
      const paths = await fetchUsfsTrail(entry)
      result.set(entry.wksiteId, paths)
      console.log(`  USFS WksiteID ${entry.wksiteId}: trail #${entry.trailNo}` +
        (entry.trimMiles ? `, trimmed to ${entry.trimMiles} mi` : '') +
        ` (${paths[0].length} pts)`)
    } catch (err) {
      const fallback = existingPaths[entry.wksiteId]
      if (fallback) {
        result.set(entry.wksiteId, fallback)
        console.warn(`  USFS WksiteID ${entry.wksiteId}: fetch failed (${err.message}) — kept existing geometry`)
      } else {
        console.error(`  USFS WksiteID ${entry.wksiteId}: fetch failed (${err.message}) and no existing geometry to keep`)
      }
    }
    await new Promise(r => setTimeout(r, 1000))
  }

  // Write output
  const entries = []
  for (const [wksiteId, paths] of [...result.entries()].sort((a,b)=>a[0]-b[0])) {
    entries.push(`  ${wksiteId}: ${JSON.stringify(paths)},`)
  }

  const ts = [
    `// Trail path centerlines keyed by lu_worksite.WksiteID.`,
    `// Generated by scripts/fetch-trail-paths.mjs — OpenStreetMap (Overpass API) for`,
    `// most trails, overlaid with authoritative USFS EDW geometry for the trails in`,
    `// USFS_TRAILS (e.g. Shipman Park #974). USFS entries overwrite OSM and survive`,
    `// re-runs, so regenerating this file will not clobber them.`,
    `// Each value is [path, …] where path is [[lng, lat], …].`,
    `// Re-run the script to refresh.`,
    `export const trailPaths: Record<number, [number, number][][]> = {`,
    ...entries,
    `};`,
  ].join('\n')

  fs.writeFileSync(OUT_FILE, ts, 'utf8')
  console.log(`\nWrote ${result.size} trails to ${path.relative(process.cwd(), OUT_FILE)}`)
}

// Only run the full fetch pipeline when invoked directly (not when imported for tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1) })
}

export { fetchUsfsTrail, trimPath, pathLengthMiles, haversineMiles }
