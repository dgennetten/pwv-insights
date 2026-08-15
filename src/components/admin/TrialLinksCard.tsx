import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Plus } from 'lucide-react'
import {
  createAdminTrialLink,
  fetchAdminTrialLinks,
  getStoredAuthToken,
  revokeAdminTrialLink,
  type TrialLink,
  type TrialLinkStatus,
} from '../../services/authService'

function trialUrl(token: string): string {
  return `${window.location.origin}/?trial=${token}`
}

function formatDate(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_META: Record<TrialLinkStatus, { label: string; className: string }> = {
  pending: { label: 'Not opened', className: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300' },
  active:  { label: 'Active',     className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  expired: { label: 'Expired',    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  revoked: { label: 'Revoked',    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
}

function statusDetail(link: TrialLink): string {
  if (link.status === 'active' && link.expiresAtMs > 0) {
    const daysLeft = Math.ceil((link.expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000))
    return `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left · expires ${formatDate(link.expiresAtMs)}`
  }
  if (link.status === 'expired') return `expired ${formatDate(link.expiresAtMs)}`
  if (link.status === 'pending') return 'starts when first opened'
  return ''
}

export function TrialLinksCard() {
  const [links, setLinks] = useState<TrialLink[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const token = getStoredAuthToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      setLinks(await fetchAdminTrialLinks(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trial links')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const generate = useCallback(async () => {
    const token = getStoredAuthToken()
    if (!token) return
    setGenerating(true)
    setError(null)
    try {
      const link = await createAdminTrialLink(token, label.trim())
      setLabel('')
      setLinks(prev => [link, ...prev])
      // Copy the fresh link straight to the clipboard for convenience.
      try {
        await navigator.clipboard.writeText(trialUrl(link.token))
        setCopiedId(link.id)
        setTimeout(() => setCopiedId(c => (c === link.id ? null : c)), 2000)
      } catch {
        /* clipboard blocked — the row still shows a Copy button */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate trial link')
    } finally {
      setGenerating(false)
    }
  }, [label])

  const copy = useCallback(async (link: TrialLink) => {
    try {
      await navigator.clipboard.writeText(trialUrl(link.token))
      setCopiedId(link.id)
      setTimeout(() => setCopiedId(c => (c === link.id ? null : c)), 2000)
    } catch {
      setError('Clipboard unavailable — copy the link manually.')
    }
  }, [])

  const revoke = useCallback(async (link: TrialLink) => {
    const token = getStoredAuthToken()
    if (!token) return
    if (!window.confirm(`Revoke this trial link${link.label ? ` for “${link.label}”` : ''}? The recipient will lose access immediately.`)) {
      return
    }
    setError(null)
    try {
      await revokeAdminTrialLink(token, link.id)
      setLinks(prev => prev.map(l => (l.id === link.id ? { ...l, status: 'revoked' } : l)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke trial link')
    }
  }, [])

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
        Trial Access Links
      </h3>
      <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">
        Generate a shareable link that grants password-free, read-only access to PWV Insights. The
        7-day trial clock starts when the recipient first opens the link. You can issue as many links
        as you like — each is independent — and revoke any of them at any time.
      </p>

      {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}

      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !generating) void generate() }}
          maxLength={120}
          placeholder="Recipient or note (optional)…"
          className="flex-1 max-w-sm text-sm border border-stone-300 dark:border-stone-700 rounded-lg px-3 py-1.5 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          {generating ? 'Generating…' : 'Generate link'}
        </button>
      </div>

      {loading && links.length === 0 ? (
        <p className="text-xs text-stone-400 dark:text-stone-500 py-4 text-center">Loading…</p>
      ) : links.length === 0 ? (
        <p className="text-xs text-stone-400 dark:text-stone-500 py-4 text-center">
          No trial links yet. Generate one above to share a free-access trial.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800 -mx-1">
          {links.map(link => {
            const meta = STATUS_META[link.status]
            const canRevoke = link.status === 'pending' || link.status === 'active'
            return (
              <li key={link.id} className="flex items-center gap-3 px-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${meta.className}`}>
                      {meta.label}
                    </span>
                    <span className="text-sm text-stone-800 dark:text-stone-200 truncate">
                      {link.label || <span className="text-stone-400 dark:text-stone-500 italic">No label</span>}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
                    Created {formatDate(link.createdAtMs)}
                    {statusDetail(link) && <> · {statusDetail(link)}</>}
                    {link.useCount > 0 && <> · {link.useCount} {link.useCount === 1 ? 'open' : 'opens'}</>}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void copy(link)}
                  title="Copy trial link"
                  className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors shrink-0"
                >
                  {copiedId === link.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === link.id ? 'Copied' : 'Copy'}
                </button>

                {canRevoke && (
                  <button
                    type="button"
                    onClick={() => void revoke(link)}
                    className="text-xs font-medium px-2 py-1 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
                  >
                    Revoke
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
