// Per-trail offline basemap packs. Downloads the tiles covering a trail's
// corridor into the shared "map-tiles" Cache Storage (the same cache the PWA's
// runtime rule and all three maps read from), so the basemap is guaranteed
// available offline for that trail — not just the areas the user happened to
// pan over. Metadata is tracked in IndexedDB (see dataLoggerService mapPacks).

import { trailPaths } from '../data/trailPaths'
import { trailGeoData, trailNames } from '../data/trailGeoData'
import { saveMapPack, getMapPack, deleteMapPack } from '../services/dataLoggerService'
import type { MapPack, TileLayerKey } from '../types/dataLogger'

const CACHE_NAME = 'map-tiles'
const SUBDOMAINS = ['a', 'b', 'c']
const AVG_TILE_BYTES = 20 * 1024   // rough estimate for pre-download sizing

export interface LatLngBounds { west: number; south: number; east: number; north: number }
export interface TileCoord { z: number; x: number; y: number }

// ── Web Mercator tile math ─────────────────────────────────────────
export function lng2tileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z)
}
export function lat2tileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

export function tilesForBounds(b: LatLngBounds, minZ: number, maxZ: number): TileCoord[] {
  const out: TileCoord[] = []
  for (let z = minZ; z <= maxZ; z++) {
    const x0 = lng2tileX(b.west, z), x1 = lng2tileX(b.east, z)
    const y0 = lat2tileY(b.north, z), y1 = lat2tileY(b.south, z)  // note: north = smaller y
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        out.push({ z, x, y })
      }
    }
  }
  return out
}

// Bounding box of a trail's centerline (+ trailhead), padded. Falls back to a
// box around the trailhead when the trail has no mapped centerline.
export function trailBounds(wksiteId: number): LatLngBounds | null {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const seg of (trailPaths[wksiteId] ?? [])) {
    for (const [lng, lat] of seg) {
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
    }
  }
  const th = trailGeoData[wksiteId]
  if (th) {
    minLat = Math.min(minLat, th.lat); maxLat = Math.max(maxLat, th.lat)
    minLng = Math.min(minLng, th.lng); maxLng = Math.max(maxLng, th.lng)
  }
  if (!Number.isFinite(minLat)) return null
  // No centerline (just a trailhead point) → give it a ~2 km box.
  if (minLat === maxLat && minLng === maxLng) {
    const d = 0.02
    return { west: minLng - d, south: minLat - d, east: maxLng + d, north: maxLat + d }
  }
  const pad = 0.004  // ~450 m margin around the corridor
  return { west: minLng - pad, south: minLat - pad, east: maxLng + pad, north: maxLat + pad }
}

// ── Tile URL per layer (matches what the maps request) ─────────────
export function tileUrl(layer: TileLayerKey, z: number, x: number, y: number): string {
  const s = SUBDOMAINS[(x + y) % SUBDOMAINS.length]
  switch (layer) {
    case 'street': return `https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`
    case 'topo':   return `https://${s}.tile.opentopomap.org/${z}/${x}/${y}.png`
    case 'aerial': return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
  }
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export interface PackEstimate { tiles: number; bytes: number }
export function estimatePack(
  wksiteId: number, layers: TileLayerKey[], minZ: number, maxZ: number,
): PackEstimate {
  const b = trailBounds(wksiteId)
  if (!b) return { tiles: 0, bytes: 0 }
  const tiles = tilesForBounds(b, minZ, maxZ).length * layers.length
  return { tiles, bytes: tiles * AVG_TILE_BYTES }
}

async function openTileCache(): Promise<Cache> {
  return caches.open(CACHE_NAME)
}

export interface DownloadOptions {
  layers?:  TileLayerKey[]
  minZoom?: number
  maxZoom?: number
  signal?:  AbortSignal
  onProgress?: (done: number, total: number, bytes: number) => void
  concurrency?: number
}

/**
 * Download a trail's tiles into the map-tiles cache. Fetches with a small worker
 * pool (CORS 200s — hosts allow it), writing each into Cache Storage directly so
 * it works regardless of service-worker timing. Persists a MapPack record with
 * the exact URLs for later precise deletion. Returns the saved pack.
 */
export async function downloadTrailPack(wksiteId: number, opts: DownloadOptions = {}): Promise<MapPack> {
  const layers = opts.layers ?? ['street']
  const minZ   = opts.minZoom ?? 12
  const maxZ   = opts.maxZoom ?? 15
  const conc   = opts.concurrency ?? 5
  const b = trailBounds(wksiteId)
  if (!b) throw new Error('No map data for this trail')

  const coords = tilesForBounds(b, minZ, maxZ)
  const urls: string[] = []
  for (const c of coords) for (const l of layers) urls.push(tileUrl(l, c.z, c.x, c.y))

  const cache = await openTileCache()
  const cached: string[] = []
  let bytes = 0
  let done = 0
  const total = urls.length
  opts.onProgress?.(0, total, 0)

  let cursor = 0
  const worker = async () => {
    while (cursor < urls.length) {
      if (opts.signal?.aborted) return
      const url = urls[cursor++]
      try {
        const res = await fetch(url, { mode: 'cors' })
        if (res.ok) {
          await cache.put(url, res.clone())
          bytes += (await res.blob()).size
          cached.push(url)
        }
      } catch { /* skip failed tile; partial pack is still useful */ }
      done++
      opts.onProgress?.(done, total, bytes)
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, urls.length) }, worker))

  // Merge with any existing pack for this trail (e.g. adding the aerial layer).
  const prev = await getMapPack(wksiteId)
  const mergedUrls = Array.from(new Set([...(prev?.tileUrls ?? []), ...cached]))
  const mergedLayers = Array.from(new Set([...(prev?.layers ?? []), ...layers])) as TileLayerKey[]
  const pack: MapPack = {
    wksiteId,
    trailName: trailNames[wksiteId] ?? `Trail ${wksiteId}`,
    layers:    mergedLayers,
    minZoom:   Math.min(prev?.minZoom ?? minZ, minZ),
    maxZoom:   Math.max(prev?.maxZoom ?? maxZ, maxZ),
    tileCount: mergedUrls.length,
    bytes:     (prev?.bytes ?? 0) + bytes,
    updatedAt: Date.now(),
    tileUrls:  mergedUrls,
  }
  await saveMapPack(pack)
  return pack
}

/** Remove a trail's cached tiles and its record. */
export async function deletePack(wksiteId: number): Promise<void> {
  const pack = await getMapPack(wksiteId)
  if (pack) {
    // Delete from every cache that looks like ours (name is "map-tiles", but be
    // defensive in case Workbox ever prefixes it).
    const names = (await caches.keys()).filter(n => n.includes(CACHE_NAME))
    for (const name of names.length ? names : [CACHE_NAME]) {
      const cache = await caches.open(name)
      await Promise.all(pack.tileUrls.map(u => cache.delete(u)))
    }
  }
  await deleteMapPack(wksiteId)
}
