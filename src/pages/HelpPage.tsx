import { useState, useEffect, type FormEvent } from 'react'
import { Loader2, Send } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getStoredAuthToken } from '../services/authService'
import { sendFeedback } from '../services/feedbackService'

export function HelpPage() {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentOk, setSentOk] = useState(false)

  useEffect(() => {
    if (!user) return
    setName(n => n || user.name || '')
    setEmail(e => e || user.email || '')
  }, [user])

  async function handleFeedbackSubmit(e: FormEvent) {
    e.preventDefault()
    const text = message.trim()
    if (!text || sending) return

    setSending(true)
    setError(null)
    try {
      await sendFeedback({
        message: text,
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        token: getStoredAuthToken(),
        website: honeypot,
      })
      setMessage('')
      setSentOk(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send feedback')
      setSentOk(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 p-4 md:p-6 lg:p-8">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">About & Feedback</h2>
        <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
          Poudre Wilderness Volunteers
        </p>
      </div>

      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 max-w-2xl">
        <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-4">
          Poudre Wilderness Volunteers{' '}
          <a
            href="https://www.pwv.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
          >
            (PWV.ORG)
          </a>
        </h3>
        <div className="space-y-4 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
          <p>
            Poudre Wilderness Volunteers consists of over 250 northern Colorado residents aged
            18 to 80. This diverse group includes retirees and active professionals from fields
            such as medicine, education, and business.
          </p>
          <p>
            Members commit to six annual patrols within the{' '}
            <strong className="font-semibold text-stone-800 dark:text-stone-200">
              Canyon Lakes Ranger District
            </strong>
            , traveling via foot or horseback on day trips and overnights. Beyond
            patrolling—which about 20% of members do with stock—volunteers assist the{' '}
            <strong className="font-semibold text-stone-800 dark:text-stone-200">
              U.S. Forest Service
            </strong>{' '}
            with land stewardship, trail access, safety promotion, and public education.
          </p>
          <p>
            As a{' '}
            <strong className="font-semibold text-stone-800 dark:text-stone-200">
              501(c)(3) non-profit
            </strong>
            , PWV operates without paid staff and is managed by an elected board of directors.
          </p>
        </div>
      </div>

      <div className="mt-6 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 max-w-2xl">
        <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-2">
          Send Feedback to the Developer
        </h3>
        <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed mb-4">
          Thanks for trying PWV Insights! Your notes help shape what we build next — especially{' '}
          <strong className="font-medium text-stone-700 dark:text-stone-300">errors you&apos;ve found</strong>,{' '}
          <strong className="font-medium text-stone-700 dark:text-stone-300">features you like or don&apos;t like</strong>, and{' '}
          <strong className="font-medium text-stone-700 dark:text-stone-300">features you&apos;d like to see</strong>.
        </p>

        {sentOk && (
          <p className="mb-4 text-sm text-emerald-700 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2">
            Thank you — your feedback was sent to the developer.
          </p>
        )}

        <form onSubmit={handleFeedbackSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="feedback-name"
                className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1.5"
              >
                Your name <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <input
                id="feedback-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
                disabled={sending}
                className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 disabled:opacity-60"
                placeholder="Pat Smith"
              />
            </div>
            <div>
              <label
                htmlFor="feedback-email"
                className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1.5"
              >
                Your email <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <input
                id="feedback-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                disabled={sending}
                className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 disabled:opacity-60"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="feedback-message"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1.5"
            >
              Your feedback
            </label>
            <textarea
              id="feedback-message"
              required
              rows={5}
              value={message}
              onChange={e => {
                setMessage(e.target.value)
                if (sentOk) setSentOk(false)
              }}
              disabled={sending}
              className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 resize-y min-h-[7rem] disabled:opacity-60"
              placeholder="Example: The trail list sorts oddly on mobile… I'd love a filter for wilderness-only trails…"
            />
          </div>

          {/* Honeypot — hidden from users */}
          <div className="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
            <label htmlFor="feedback-website">Website</label>
            <input
              id="feedback-website"
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={e => setHoneypot(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
            ) : (
              <Send className="w-4 h-4" strokeWidth={2} />
            )}
            {sending ? 'Sending…' : sentOk ? 'Send more feedback' : 'Send feedback'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs text-stone-400 dark:text-stone-500 max-w-2xl">
        PWV Insights is in early beta. App is designed to be mobile friendly; additional details
        available via hover on desktop.
      </p>
    </div>
  )
}
