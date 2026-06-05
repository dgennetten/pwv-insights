#!/usr/bin/env node
/**
 * Fetch OSM path segments for a single WksiteID and merge into src/data/trailPaths.ts.
 *
 * Usage: node scripts/fetch-trail-path.mjs <WksiteID> "Search Name 1" "Search Name 2"
 * Example: node scripts/fetch-trail-path.mjs 84 "Elkhorn Creek Trail" "Elkhorn Creek"
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PATHS_FILE = path.join(__dirname, '../src/data/trailPaths.ts')

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const USER_AGENT = 'pwv-insights-trail-fetch/1.0 (douglas@gennetten.com)'
const BBOX = '40.20,-106.25,40.90,-103.85'

const wksiteId = Number(process.argv[2])
const searchNames = process.argv.slice(3)

if (!wksiteId || searchNames.length === 0) {
  console.error('Usage: node scripts/fetch-trail-path.mjs <WksiteID> "Name 1" ["Name 2" …]')
  process.exit(1)
}

function buildQuery(terms) {
  const nameRegex = terms.join('|')
  return `[out:json][timeout:60];
way[highway~"^(path|footway|track|bridleway)$"]["name"~"${nameRegex}",i](${BBOX});
(._;);out geom;`
}

function wayMatchesEntry(wayName, names) {
  const lc = wayName.toLowerCase()
  return names.some(s => lc.includes(s.toLowerCase()))
}

const res = await fetch(OVERPASS_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': USER_AGENT,
  },
  body: 'data=' + encodeURIComponent(buildQuery(searchNames)),
})
if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
const data = await res.json()

const matching = (data.elements ?? []).filter(
  w => w.tags?.name && wayMatchesEntry(w.tags.name, searchNames) && w.geometry?.length > 0
)
if (matching.length === 0) {
  console.error(`No OSM ways matched WksiteID ${wksiteId} for: ${searchNames.join(', ')}`)
  process.exit(1)
}

const paths = matching.map(w => w.geometry.map(({ lon, lat }) => [lon, lat]))
console.log(`WksiteID ${wksiteId}: ${matching.length} segment(s) from "${matching[0]?.tags?.name}"`)

const src = fs.readFileSync(PATHS_FILE, 'utf8')
const entry = `  ${wksiteId}: ${JSON.stringify(paths)},`
const keyRe = new RegExp(`^  ${wksiteId}:.*,$`, 'm')

let next
if (keyRe.test(src)) {
  next = src.replace(keyRe, entry)
} else {
  const lines = src.split('\n')
  const closeIdx = lines.findIndex(l => l.trim() === '};')
  if (closeIdx < 0) throw new Error('Could not find trailPaths closing brace')
  lines.splice(closeIdx, 0, entry)
  next = lines.join('\n')
}

fs.writeFileSync(PATHS_FILE, next, 'utf8')
console.log(`Updated ${path.relative(process.cwd(), PATHS_FILE)}`)
