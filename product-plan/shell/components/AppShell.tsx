import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { MainNav } from './MainNav'
import { UserMenu } from './UserMenu'

export interface AppShellProps {
  children: React.ReactNode
  activeHref?: string
  user?: {
    name: string
    email?: string
    avatarUrl?: string
  }
  onNavigate?: (href: string) => void
  onLogout?: () => void
}

const SIDEBAR_FULL = 'w-56'

export function AppShell({
  children,
  activeHref = '/dashboard',
  user,
  onNavigate,
  onLogout,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen bg-stone-50 dark:bg-stone-950 overflow-hidden font-[Inter,sans-serif]">

      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside
        className={`
          hidden md:flex flex-col shrink-0
          ${SIDEBAR_FULL} lg:${SIDEBAR_FULL}
          border-r border-stone-200 dark:border-stone-800
          bg-white dark:bg-stone-950
          transition-all duration-200
        `}
      >
        <div className="flex flex-col h-full overflow-y-auto">
          <MainNav activeHref={activeHref} onNavigate={onNavigate} collapsed={false} />
          <UserMenu user={user} onLogout={onLogout} collapsed={false} />
        </div>
      </aside>

      {/* ── Mobile overlay ──────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-stone-950 border-r border-stone-200 dark:border-stone-800 flex flex-col z-50">
            <div className="flex items-center justify-end px-3 pt-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <MainNav
                activeHref={activeHref}
                onNavigate={(href) => { onNavigate?.(href); setMobileOpen(false) }}
                collapsed={false}
              />
            </div>
            <UserMenu user={user} onLogout={onLogout} collapsed={false} />
          </aside>
        </div>
      )}

      {/* ── Main content area ───────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <Menu className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center">
              <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
                <path d="M8 2L14 11H2L8 2Z" fill="white" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">PWV Insights</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
