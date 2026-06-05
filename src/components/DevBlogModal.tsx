import { useState } from 'react'
import { X, Rss } from 'lucide-react'
import { BLOG_ENTRIES, setBlogPref, type BlogPref } from '../lib/devBlog'

interface DevBlogModalProps {
  onClose: () => void
}

type DismissChoice = 'until-new' | 'never' | null

export function DevBlogModal({ onClose }: DevBlogModalProps) {
  const [choice, setChoice] = useState<DismissChoice>('until-new')

  const latest = BLOG_ENTRIES[BLOG_ENTRIES.length - 1]
  const older = [...BLOG_ENTRIES].reverse().slice(1)

  function formatDate(iso: string) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
  }

  function handleDismiss() {
    if (choice === 'never') {
      setBlogPref({ mode: 'never' })
    } else if (choice === 'until-new') {
      setBlogPref({ mode: 'until-new', lastSeenId: latest.id } satisfies BlogPref)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-700 flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center">
              <Rss className="w-3.5 h-3.5 text-white" strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">Developer's Log</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            aria-label="Close without saving preference"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Scrollable entries */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
          {/* Latest entry */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Latest</span>
              <span className="text-[10px] text-stone-400 dark:text-stone-500">{formatDate(latest.date)}</span>
            </div>
            <p className="text-sm text-stone-800 dark:text-stone-200 leading-relaxed whitespace-pre-line">{latest.content}</p>
          </div>

          {/* Older entries */}
          {older.map(entry => (
            <div key={entry.id} className="space-y-1.5 pt-3 border-t border-stone-100 dark:border-stone-800">
              <span className="text-[10px] text-stone-400 dark:text-stone-500">{formatDate(entry.date)}</span>
              <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed whitespace-pre-line">{entry.content}</p>
            </div>
          ))}
        </div>

        {/* Dismiss options */}
        <div className="px-5 py-4 border-t border-stone-100 dark:border-stone-800 shrink-0 space-y-3">
          <p className="text-xs font-medium text-stone-600 dark:text-stone-400">When would you like to see this again?</p>
          <div className="space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="blog-dismiss"
                checked={choice === 'until-new'}
                onChange={() => setChoice('until-new')}
                className="mt-0.5 accent-emerald-600"
              />
              <span className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
                Only when there's something new
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="blog-dismiss"
                checked={choice === 'never'}
                onChange={() => setChoice('never')}
                className="mt-0.5 accent-emerald-600"
              />
              <span className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
                Never — don't show again
                <span className="block text-stone-400 dark:text-stone-500 text-[10px]">Restore anytime in Settings</span>
              </span>
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
            >
              Got it
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
