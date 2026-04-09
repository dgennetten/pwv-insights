import { useState, useRef, useEffect } from 'react'
import { LogOut, ChevronUp, User } from 'lucide-react'

interface UserMenuProps {
  user?: {
    name: string
    email?: string
    avatarUrl?: string
  }
  onLogout?: () => void
  onSignIn?: () => void
  collapsed?: boolean
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : parts[0].slice(0, 2)
  return <span className="text-xs font-semibold uppercase tracking-wide">{initials}</span>
}

export function UserMenu({ user, onLogout, onSignIn, collapsed = false }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!user) {
    return (
      <div className={`px-2 pb-3 ${collapsed ? '' : ''}`}>
        <button
          onClick={onSignIn}
          className={`
            w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
            bg-emerald-600 text-white hover:bg-emerald-700 transition-colors
            ${collapsed ? 'justify-center px-2' : ''}
          `}
        >
          <User className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          {!collapsed && 'Sign In'}
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative px-2 pb-3">
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`
          w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors
          hover:bg-stone-100 dark:hover:bg-stone-800
          ${collapsed ? 'justify-center' : ''}
        `}
      >
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 overflow-hidden">
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
            : <Initials name={user.name} />
          }
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate leading-tight">
                {user.name}
              </div>
              {user.email && (
                <div className="text-xs text-stone-500 dark:text-stone-500 truncate leading-tight">
                  {user.email}
                </div>
              )}
            </div>
            <ChevronUp
              className={`w-3.5 h-3.5 text-stone-400 shrink-0 transition-transform ${open ? '' : 'rotate-180'}`}
              strokeWidth={2}
            />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className={`
          absolute bottom-full mb-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700
          rounded-lg shadow-lg py-1 z-50 min-w-[180px]
          ${collapsed ? 'left-0' : 'left-2 right-2'}
        `}>
          <div className="px-3 py-2 border-b border-stone-100 dark:border-stone-800">
            <div className="text-xs font-medium text-stone-900 dark:text-stone-100">{user.name}</div>
            {user.email && (
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{user.email}</div>
            )}
          </div>
          <button
            onClick={() => { setOpen(false); onLogout?.() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
