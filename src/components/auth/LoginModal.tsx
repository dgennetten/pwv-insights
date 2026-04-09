import { useState, useRef, useEffect } from 'react'
import { X, Loader2, Mountain } from 'lucide-react'
import { requestOtp, verifyOtp } from '../../services/authService'

interface LoginModalProps {
  onClose: () => void
  onLoginSuccess: (token: string, email: string, name: string, role: string, personId: number, remember: boolean) => void
}

type Step = 'email' | 'code'

export function LoginModal({ onClose, onLoginSuccess }: LoginModalProps) {
  const [step, setStep]       = useState<Step>('email')
  const [email, setEmail]     = useState('')
  const [code, setCode]       = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [step])

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await requestOtp(email)
      setStep('code')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await verifyOtp(email, code)
      onLoginSuccess(result.token, result.email, result.name, result.role, result.personId, remember)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Mountain className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">PWV Insights</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-1">Sign in</p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Enter your email — we'll send a one-time code.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  Email address
                </label>
                <input
                  ref={inputRef}
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400"
                  placeholder="you@example.com"
                />
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Send code
              </button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div>
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-1">Check your email</p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Enter the 6-digit code sent to <span className="font-medium text-stone-700 dark:text-stone-300">{email}</span>.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  One-time code
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 tracking-widest font-mono text-center"
                  placeholder="000000"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-stone-300 dark:border-stone-600 text-emerald-600 focus:ring-emerald-500 dark:focus:ring-emerald-400 bg-white dark:bg-stone-800"
                />
                <span className="text-xs text-stone-600 dark:text-stone-400">Remember this device</span>
              </label>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Verify &amp; sign in
              </button>
              <button
                type="button"
                onClick={() => { setStep('email'); setCode(''); setError('') }}
                className="w-full text-xs text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
