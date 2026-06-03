import { useEffect, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { fetchTrailAISummary } from '../../services/trailsService'

interface Props {
  wksiteId: number | undefined
}

export function TrailAISummary({ wksiteId }: Props) {
  const [summary,  setSummary]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [noData,   setNoData]   = useState(false)

  useEffect(() => {
    if (!wksiteId) return
    setLoading(true)
    setSummary(null)
    setNoData(false)
    fetchTrailAISummary(wksiteId)
      .then(data => {
        if (data.summary) setSummary(data.summary)
        else setNoData(true)
      })
      .catch(() => setNoData(true))
      .finally(() => setLoading(false))
  }, [wksiteId])

  if (!wksiteId || noData) return null

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={2} />
        <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Recent Conditions
        </span>
        <span className="text-[10px] text-stone-300 dark:text-stone-600 ml-auto">AI · last 3 reports</span>
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
