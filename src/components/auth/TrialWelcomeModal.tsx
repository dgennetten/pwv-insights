import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const SEEN_KEY = 'pwv_trial_welcome_seen'

function daysLeft(expiresAt: number | undefined): number | null {
  if (!expiresAt || !Number.isFinite(expiresAt)) return null
  const ms = expiresAt - Date.now()
  if (ms <= 0) return 0
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

/**
 * One-time-per-browser-session welcome for free-access trial guests. Shows the
 * trial value proposition and a nudge to become a PWV member.
 */
export function TrialWelcomeModal() {
  const { user } = useAuth()
  const isTrial = user?.role === 'trial'
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isTrial) return
    let seen = false
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1'
    } catch {
      /* sessionStorage unavailable — show it */
    }
    if (!seen) setOpen(true)
  }, [isTrial])

  if (!isTrial || !open) return null

  const remaining = daysLeft(user?.trialExpiresAt)

  const dismiss = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-[900] overflow-y-auto overscroll-contain bg-black/40 dark:bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-welcome-title"
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-xl px-8 py-7 flex flex-col items-center gap-4 w-full max-w-sm text-center shrink-0">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
          </div>

          <div>
            <h2 id="trial-welcome-title" className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Welcome to PWV Insights
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-300 mt-2 leading-relaxed">
              This is your 7&nbsp;day free-access trial of PWV Insights. Become a PWV member for
              full, unlimited access.
            </p>
          </div>

          {remaining !== null && (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {remaining > 0
                ? `${remaining} ${remaining === 1 ? 'day' : 'days'} left in your trial`
                : 'Your trial has ended'}
            </p>
          )}

          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed border-t border-stone-100 dark:border-stone-800 pt-3 w-full">
            The trial is read-only. The <span className="font-medium text-stone-600 dark:text-stone-300">Data Logger</span> and
            personal <span className="font-medium text-stone-600 dark:text-stone-300">Settings</span> are available to PWV members only.
          </p>

          <button
            type="button"
            onClick={dismiss}
            className="mt-1 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
          >
            Explore the app
          </button>
        </div>
      </div>
    </div>
  )
}
