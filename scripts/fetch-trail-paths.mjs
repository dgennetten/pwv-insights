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

  // Write output
  const entries = []
  for (const [wksiteId, paths] of [...result.entries()].sort((a,b)=>a[0]-b[0])) {
    entries.push(`  ${wksiteId}: ${JSON.stringify(paths)},`)
  }

  const ts = [
    `// Trail path centerlines keyed by lu_worksite.WksiteID.`,
    `// Generated by scripts/fetch-trail-paths.mjs from OpenStreetMap via Overpass API.`,
    `// Each value is [path, …] where path is [[lng, lat], …].`,
    `// Re-run the script to refresh.`,
    `export const trailPaths: Record<number, [number, number][][]> = {`,
    ...entries,
    `};`,
  ].join('\n')

  fs.writeFileSync(OUT_FILE, ts, 'utf8')
  console.log(`\nWrote ${result.size} trails to ${path.relative(process.cwd(), OUT_FILE)}`)
}

main().catch(err => { console.error(err); process.exit(1) })
