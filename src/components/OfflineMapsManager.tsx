import { useState, useEffect, useCallback } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { getAllMapPacks } from '../services/dataLoggerService'
import { deletePack, humanBytes } from '../lib/offlineTiles'
import type { MapPack } from '../types/dataLogger'

const LAYER_LABEL: Record<string, string> = { street: 'Street', topo: 'Topo', aerial: 'Aerial' }

/** Lists downloaded per-trail offline map packs with sizes, and lets the user
 *  delete them individually or all at once. */
export function OfflineMapsManager() {
  const [packs,   setPacks]   = useState<MapPack[] | null>(null)
  const [busy,    setBusy]    = useState<number | 'all' | null>(null)

  const load = useCallback(async () => { setPacks(await getAllMapPacks()) }, [])
  useEffect(() => { void load() }, [load])

  const removeOne = useCallback(async (wksiteId: number) => {
    setBusy(wksiteId)
    try { await deletePack(wksiteId); await load() } finally { setBusy(null) }
  }, [load])

  const removeAll = useCallback(async () => {
    if (!packs) return
    setBusy('all')
    try { for (const p of packs) await deletePack(p.wksiteId); await load() } finally { setBusy(null) }
  }, [packs, load])

  if (packs === null) {
    return <p className="text-xs text-stone-400 dark:text-stone-500 py-2">Loading…</p>
  }

  const total = packs.reduce((s, p) => s + p.bytes, 0)

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm text-stone-700 dark:text-stone-300">Offline maps</span>
        {packs.length > 0 && (
          <span className="text-xs text-stone-400 dark:text-stone-500">
            {packs.length} trail{packs.length === 1 ? '' : 's'} · {humanBytes(total)}
          </span>
        )}
      </div>

      {packs.length === 0 ? (
        <p className="text-xs text-stone-400 dark:text-stone-500">
          No offline maps downloaded. Open a trail's map and tap <strong>Download offline map</strong> to save its tiles for use out of signal.
        </p>
      ) : (
        <div className="space-y-1.5">
          {packs.map(p => (
            <div key={p.wksiteId} className="flex items-center justify-between gap-3 bg-stone-50 dark:bg-stone-800/50 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-stone-700 dark:text-stone-200 truncate">
                  <span className="text-stone-400 dark:text-stone-500 tabular-nums">#{p.wksiteId}</span> {p.trailName}
                </div>
                <div className="text-[11px] text-stone-400 dark:text-stone-500">
                  {humanBytes(p.bytes)} · z{p.minZoom}–{p.maxZoom} · {p.layers.map(l => LAYER_LABEL[l] ?? l).join(', ')}
                </div>
              </div>
              <button
                onClick={() => void removeOne(p.wksiteId)}
                disabled={busy !== null}
                aria-label={`Delete offline map for #${p.wksiteId} ${p.trailName}`}
                className="shrink-0 inline-flex items-center gap-1 text-xs text-stone-400 hover:text-red-500 disabled:opacity-50 transition-colors"
              >
                {busy === p.wksiteId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          ))}
          <button
            onClick={() => void removeAll()}
            disabled={busy !== null}
            className="text-xs text-stone-400 dark:text-stone-500 hover:text-red-500 dark:hover:text-red-400 underline underline-offset-2 disabled:opacity-50 transition-colors"
          >
            {busy === 'all' ? 'Deleting…' : 'Delete all offline maps'}
          </button>
        </div>
      )}
      <p className="text-xs text-stone-400 dark:text-stone-500 mt-1.5">
        Per-trail basemap tiles saved on this device for offline use (zoom 12–15).
      </p>
    </div>
  )
}
