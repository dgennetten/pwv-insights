import { Lock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { ReactNode } from 'react'

interface MemberGateProps {
  children: ReactNode
  onBack?: () => void
}

export function MemberGate({ children, onBack }: MemberGateProps) {
  const { user, openLogin } = useAuth()

  if (user) return <>{children}</>

  return (
    <div className="relative">
      <div className="blur-md pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-xl px-8 py-6 flex flex-col items-center gap-3 max-w-xs text-center">
          <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
            <Lock className="w-5 h-5 text-stone-500 dark:text-stone-400" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Member Login Required</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              Sign in to view member activity data.
            </p>
          </div>
          <button
            onClick={openLogin}
            className="mt-1 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
          >
            Sign In
          </button>
          {onBack && (
            <button
              onClick={onBack}
              className="text-xs text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
            >
              ← Go back
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
