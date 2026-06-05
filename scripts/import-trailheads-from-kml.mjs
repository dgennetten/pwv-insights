#!/usr/bin/env node
/**
 * Sync trailhead coordinates in src/data/trailGeoData.ts from PWV KML exports.
 *
 * The KML files in db/ contain Point placemarks (trailheads) only — not trail
 * route geometry. Trail paths remain in src/data/trailPaths.ts (OpenStreetMap).
 *
 * Usage:
 *   node scripts/import-trailheads-from-kml.mjs [path/to/All PWV Trails.kml]
 *
 * Default input: db/temp/All PWV Trails.kml
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GEO_FILE = path.join(__dirname, '../src/data/trailGeoData.ts')
const DEFAULT_KML = path.join(__dirname, '../db/temp/All PWV Trails.kml')

/** KML placemark name → primary WksiteID (one trailhead per worksite). */
const KML_TO_WKSITE = {
  'Beaver Creek Trailhead #2': 3,
  'Big South': 6,
  'Blue Lake': 9,
  'Brackenbury': 15,
  'Browns Lake': 18,
  'Bulwark Ridge': 21,
  'Comanche Lake': 45,
  'Crosier Rainbow': 66,
  'Elkhorn Creek': 84,
  'Emmaline Lake': 87,
  'Fish Creek': 93,
  'Flowers Trailhead #1 & Little Beaver Creek': 96,
  'Hewlett Gulch': 126,
  'Hourglass': 135,
  'Killpecker': 153,
  'Lily Mountain': 165,
  'Lion Gulch': 171,
  'Lost Lake': 192,
  'Lower Dadd Gulch': 195,
  'McIntyre Creek': 204,
  'McIntyre Lake': 207,
  'Mirror Lake': 216,
  'Mummy Pass': 240,
  'Neota Creek': 243,
  'North Fork': 249,
  'North Lone Pine': 252,
  'Roaring Creek': 264,
  'Round Mountain': 267,
  'Sandbar Lakes': 270,
  'Signal Mountain': 276,
  'Stormy Peaks': 285,
  'Trap Park': 294,
  'Twin Crater Lakes': 297,
  'Twin Sisters': 300,
  'West Branch': 312,
  'Young Gulch': 318,
  'Montgomery Pass/Zimmerman Lake': 324,
  'Pawnee Buttes': 348,
  'Crosier Mountain (Garden Gate)': 400,
  'Crosier Mountain (Glen Haven)': 403,
  'Mt. McConnel & Kreutzer': 406,
  'Zimmerman North & Zimmerman South': 409,
  'Corral Creek & Upper Big South': 415,
  'Camp Lake & Upper Camp Lake': 418,
  'Medicine Bow North & Medicine Bow South': 421,
  'Rawah (North)': 427,
  'Rawah (South)': 430,
  'Greyrock & Greyrock Meadows': 433,
  'Lady Moon & Disappointment Falls Trailhead #1': 439,
  'Granite Ridge (West)': 442,
  'Frog Pond & East Dowdy Lake': 445,
  'Columbine Complex': 448,
  'Link & McIntyre': 201,
}

/** Individual worksites that share a combined KML trailhead point. */
const ALIAS_WKSITES = {
  117: 433, 120: 433,   // Greyrock variants
  24: 418, 27: 418, 303: 418,  // Camp Lake variants
  48: 415,              // Corral Creek
  57: 400,              // Crosier Garden Gate
  177: 96,              // Little Beaver Creek
  198: 270, 309: 270,  // Sandbar Lakes
  210: 421, 424: 421,  // Medicine Bow
  225: 324, 321: 409, 412: 409,  // Zimmerman family
  261: 430,             // Rawah individual
  306: 195,             // Upper Dadd Gulch
}

const KML_NS = 'http://www.opengis.net/kml/2.2'

function parseKmlPoints(kmlPath) {
  const xml = fs.readFileSync(kmlPath, 'utf8')
  const placemarks = []

  for (const block of xml.match(/<Placemark>[\s\S]*?<\/Placemark>/g) ?? []) {
    const nameMatch = block.match(/<name>([^<]+)<\/name>/)
    const coordMatch = block.match(/<Point>\s*<coordinates>\s*([^<]+?)<\/coordinates>/s)
    if (!nameMatch || !coordMatch) continue
    const name = nameMatch[1].trim()
    if (name === 'All PWV Trails' || name === 'PWV Trails') continue
    const [lng, lat] = coordMatch[1].trim().split(',').map(Number)
    placemarks.push({ name, lat, lng })
  }

  return placemarks
}

function formatCoord(n) {
  const rounded = Math.round(n * 1e5) / 1e5
  return String(rounded).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

function main() {
  const kmlPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : DEFAULT_KML

  if (!fs.existsSync(kmlPath)) {
    console.error(`KML not found: ${kmlPath}`)
    process.exit(1)
  }

  const placemarks = parseKmlPoints(kmlPath)
  const byWksite = new Map()

  for (const pm of placemarks) {
    const wksiteId = KML_TO_WKSITE[pm.name]
    if (wksiteId == null) {
      console.warn(`  No WksiteID mapping for KML placemark "${pm.name}" — skipped`)
      continue
    }
    byWksite.set(wksiteId, pm)
  }

  for (const [aliasId, primaryId] of Object.entries(ALIAS_WKSITES)) {
    const pm = byWksite.get(primaryId)
    if (pm) byWksite.set(Number(aliasId), pm)
  }

  let src = fs.readFileSync(GEO_FILE, 'utf8')
  let updated = 0

  for (const [wksiteId, pm] of byWksite.entries()) {
    const re = new RegExp(`^(\\s+${wksiteId}:\\s*\\{\\s*lat:\\s*)[-\\d.]+(,\\s*lng:\\s*)[-\\d.]+`, 'm')
    if (!re.test(src)) {
      console.warn(`  WksiteID ${wksiteId} not in trailGeoData.ts — add manually`)
      continue
    }
    src = src.replace(re, `$1${formatCoord(pm.lat)}$2${formatCoord(pm.lng)}`)
    updated++
  }

  fs.writeFileSync(GEO_FILE, src, 'utf8')
  console.log(`Updated ${updated} trailhead coordinates from ${path.relative(process.cwd(), kmlPath)}`)
}

main()
