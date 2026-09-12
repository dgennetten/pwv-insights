import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Download, Check, Trash2, Loader2 } from 'lucide-react'
import {
  estimatePack, downloadTrailPack, deletePack, humanBytes,
} from '../lib/offlineTiles'
import { getMapPack } from '../services/dataLoggerService'
import type { MapPack, TileLayerKey } from '../types/dataLogger'

interface Props {
  wksiteId:  number
  /** Base layer(s) this map uses — 'street' for the Data Logger, 'topo' for Trails. */
  layers:    TileLayerKey[]
  /** Offer an "include aerial" checkbox (Data Logger only). */
  aerialOption?: boolean
  minZoom?:  number
  maxZoom?:  number
  className?: string
}

const MIN_Z = 12
const MAX_Z = 15

/**
 * Download / manage this trail's offline basemap pack. Shows an estimate, a
 * progress bar while fetching, and a saved/delete state once cached.
 */
export function OfflineMapButton({ wksiteId, layers, aerialOption, minZoom = MIN_Z, maxZoom = MAX_Z, className }: Props) {
  const [pack,     setPack]     = useState<MapPack | null>(null)
  const [loaded,   setLoaded]   = useState(false)
  const [aerial,   setAerial]   = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; bytes: number } | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const layersKey = layers.join(',')
  const activeLayers = useMemo<TileLayerKey[]>(
    () => (aerial ? [...layers, 'aerial'] : layers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aerial, layersKey],
  )
  const estimate = useMemo(
    () => estimatePack(wksiteId, activeLayers, minZoom, maxZoom),
    [wksiteId, activeLayers, minZoom, maxZoom],
  )

  useEffect(() => {
    let live = true
    void getMapPack(wksiteId).then(p => { if (live) { setPack(p ?? null); setLoaded(true) } })
    return () => { live = false }
  }, [wksiteId])

  const handleDownload = useCallback(async () => {
    setBusy(true); setError(null); setProgress({ done: 0, total: estimate.tiles, bytes: 0 })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const saved = await downloadTrailPack(wksiteId, {
        layers: activeLayers, minZoom, maxZoom, signal: ctrl.signal,
        onProgress: (done, total, bytes) => setProgress({ done, total, bytes }),
      })
      setPack(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setBusy(false); setProgress(null); abortRef.current = null
    }
  }, [wksiteId, activeLayers, minZoom, maxZoom, estimate.tiles])

  const handleCancel = useCallback(() => { abortRef.current?.abort() }, [])

  const handleDelete = useCallback(async () => {
    setBusy(true); setError(null)
    try { await deletePack(wksiteId); setPack(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Delete failed') }
    finally { setBusy(false) }
  }, [wksiteId])

  if (!loaded || estimate.tiles === 0) return null

  return (
    <div className={className}>
      {busy && progress ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-300">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              Downloading… {progress.done}/{progress.total} · {humanBytes(progress.bytes)}
            </span>
            <button onClick={handleCancel} className="text-stone-400 hover:text-red-500 underline underline-offset-2">Cancel</button>
          </div>
          <div className="h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      ) : pack ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
            Offline map saved · {humanBytes(pack.bytes)}
          </span>
          <button
            onClick={() => void handleDelete()}
            disabled={busy}
            title="Delete this trail's offline map"
            className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-red-500 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
            Delete
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => void handleDownload()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
            Download offline map
          </button>
          <span className="text-xs text-stone-400 dark:text-stone-500">
            ~{estimate.tiles} tiles · ~{humanBytes(estimate.bytes)}
          </span>
          {aerialOption && (
            <label className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 cursor-pointer select-none">
              <input type="checkbox" checked={aerial} onChange={e => setAerial(e.target.checked)} className="w-3.5 h-3.5 rounded accent-blue-600" />
              incl. aerial
            </label>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
