import { useEffect, useState } from 'react'
import { Sparkles, Loader2, Clock } from 'lucide-react'
import { fetchTrailAISummary } from '../../services/trailsService'

interface Props {
  wksiteId: number | undefined
}

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate + 'T12:00:00').getTime()) / 86_400_000)
}

function formatReportDate(isoDate: string): string {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function TrailAISummary({ wksiteId }: Props) {
  const [summary,           setSummary]           = useState<string | null>(null)
  const [latestReportDate,  setLatestReportDate]  = useState<string | null>(null)
  const [loading,           setLoading]           = useState(false)
  const [noData,            setNoData]            = useState(false)

  useEffect(() => {
    if (!wksiteId) return
    setLoading(true)
    setSummary(null)
    setLatestReportDate(null)
    setNoData(false)
    fetchTrailAISummary(wksiteId)
      .then(data => {
        if (data.summary) {
          setSummary(data.summary)
          setLatestReportDate(data.latestReportDate ?? null)
        } else setNoData(true)
      })
      .catch(() => setNoData(true))
      .finally(() => setLoading(false))
  }, [wksiteId])

  const reportAgeDays = latestReportDate ? daysSince(latestReportDate) : null
  const isStale = reportAgeDays !== null && reportAgeDays > 30

  if (!wksiteId || noData) return null

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 mb-4">
      <div className="mb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={2} />
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Recent Conditions
          </span>
          <span className="text-[10px] text-stone-300 dark:text-stone-600 ml-auto">AI · last 3 reports</span>
        </div>
        {isStale && latestReportDate && reportAgeDays !== null && (
          <p className="mt-1.5 flex items-start justify-end gap-1 text-[10px] leading-snug text-amber-600 dark:text-amber-400">
            <Clock className="w-2.5 h-2.5 shrink-0 mt-px" strokeWidth={2} />
            <span>
              Latest report {formatReportDate(latestReportDate)} ({reportAgeDays}d ago) — conditions may have changed since then.
            </span>
          </p>
        )}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-stone-400 dark:text-stone-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          Summarizing recent patrol reports…
        </div>
      ) : (
        <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">{summary}</p>
      )}
    </div>
  )
}
