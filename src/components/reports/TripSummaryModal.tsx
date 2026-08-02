import { useEffect, useState } from 'react'
import { Loader2, X, Copy, Check } from 'lucide-react'
import { getStoredAuthToken } from '../../services/authService'
import { formatInteger } from '../../lib/formatNumber'
import type { TripSummaryResponse } from '../../types/reports'

interface TripSummaryModalProps {
  reportIds: number[]
  onClose: () => void
}

function plainText(data: TripSummaryResponse): string {
  const t = data.totals
  const lines: string[] = [
    'PWV TRIP SUMMARY',
    `${t.reportCount} report${t.reportCount === 1 ? '' : 's'} · ${t.dayCount} day${t.dayCount === 1 ? '' : 's'}`,
    '',
    `Trees cleared (total): ${t.totalTrees}`,
    'By size: ' + t.treesBySize.map(s => `${s.sizeClass} ${s.count}`).join('  ·  '),
    `Brushing: ${t.totalBrushingFt} ft`,
    '',
    'By trail:',
    ...t.byTrail.map(b => `  • ${b.trailName}: ${b.trees} trees`),
  ]
  if (data.narrative) {
    lines.push('', 'DAILY ADVENTURE', '', data.narrative)
  }
  return lines.join('\n')
}

export function TripSummaryModal({ reportIds, onClose }: TripSummaryModalProps) {
  const [data, setData]     = useState<TripSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const token = getStoredAuthToken()
    if (!token) { setError('No session token found. Sign in again.'); setLoading(false); return }
    fetch('/api/reports/trip-summary.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ token, reportIds }),
    })
      .then(async res => {
        const json = (await res.json()) as TripSummaryResponse
        if (!res.ok || (json.error && !json.totals)) {
          throw new Error(json.error || `HTTP ${res.status}`)
        }
        if (!cancelled) setData(json)
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to generate summary') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reportIds])

  const handleCopy = () => {
    if (!data) return
    void navigator.clipboard?.writeText(plainText(data)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const t = data?.totals

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl max-h-[88dvh] bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl border border-stone-200 dark:border-stone-800 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Trip Summary</h2>
            {t && (
              <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                {t.reportCount} report{t.reportCount === 1 ? '' : 's'} · {t.dayCount} day{t.dayCount === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                title="Copy summary text"
              >
                {copied ? <Check className="w-4 h-4" strokeWidth={2} /> : <Copy className="w-4 h-4" strokeWidth={2} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-4 py-4 space-y-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-stone-500 dark:text-stone-400">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
              Generating trip summary…
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">{error}</p>
          )}

          {!loading && t && (
            <>
              {/* Totals */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-4 py-3 col-span-2 sm:col-span-1">
                  <div className="text-3xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100 leading-none">
                    {formatInteger(t.totalTrees)}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mt-1">Trees Cleared</div>
                </div>
                <div className="rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-100 dark:border-stone-800 px-4 py-3">
                  <div className="text-3xl font-bold tabular-nums text-stone-800 dark:text-stone-100 leading-none">
                    {formatInteger(t.totalBrushingFt)}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 mt-1">Brushing (ft)</div>
                </div>
                <div className="rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-100 dark:border-stone-800 px-4 py-3">
                  <div className="text-3xl font-bold tabular-nums text-stone-800 dark:text-stone-100 leading-none">
                    {formatInteger(t.byTrail.length)}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 mt-1">Trails</div>
                </div>
              </div>

              {/* Trees by size */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">Trees by Size</p>
                <div className="flex flex-wrap gap-2">
                  {t.treesBySize.map(s => (
                    <div key={s.sizeClass} className="rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-100 dark:border-stone-800 px-3 py-1.5">
                      <span className="text-sm font-bold tabular-nums text-stone-800 dark:text-stone-100">{formatInteger(s.count)}</span>
                      <span className="ml-1.5 text-xs text-stone-400 dark:text-stone-500">{s.sizeClass}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* By trail */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">Trees by Trail</p>
                <ul className="divide-y divide-stone-100 dark:divide-stone-800 rounded-lg border border-stone-100 dark:border-stone-800 overflow-hidden">
                  {t.byTrail.map(b => (
                    <li key={b.trailName} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-stone-700 dark:text-stone-300 truncate">{b.trailName}</span>
                      <span className="tabular-nums font-medium text-stone-800 dark:text-stone-200 shrink-0 ml-3">{formatInteger(b.trees)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Daily Adventure narrative */}
              <div className="border-t border-stone-100 dark:border-stone-800 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">Daily Adventure</p>
                {data?.narrative ? (
                  <div className="space-y-3 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                    {data.narrative.split(/\n\s*\n/).map((para, i) => (
                      <p key={i} className="whitespace-pre-wrap">{para.trim()}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-stone-400 dark:text-stone-500 italic">
                    {data?.reason === 'ai_not_configured'
                      ? 'The AI narrative isn’t available in this environment. Totals above are complete.'
                      : 'The AI narrative couldn’t be generated right now. Totals above are complete.'}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
