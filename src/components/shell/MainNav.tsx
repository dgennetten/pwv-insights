import { LayoutDashboard, Map, Trophy, BarChart3, Settings, HelpCircle, Mountain } from 'lucide-react'
import { canAccessAdminPage } from '../../lib/adminAccess'

export interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  isActive?: boolean
  group?: 'main' | 'admin' | 'utility'
}

interface MainNavProps {
  activeHref?: string
  onNavigate?: (href: string) => void
  collapsed?: boolean
  /** Signed-in email; Admin nav item only when this matches `canAccessAdminPage`. */
  userEmail?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Activity Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'main' },
  { label: 'Trails', href: '/trails', icon: Map, group: 'main' },
  { label: 'Leaderboards & Trends', href: '/leaderboards', icon: Trophy, group: 'main' },
  { label: 'Admin', href: '/admin', icon: BarChart3, group: 'admin' },
  { label: 'Settings', href: '/settings', icon: Settings, group: 'utility' },
  { label: 'About', href: '/help', icon: HelpCircle, group: 'utility' },
]

function NavLink({
  item,
  isActive,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  isActive: boolean
  collapsed: boolean
  onNavigate?: (href: string) => void
}) {
  const Icon = item.icon
  return (
    <button
      onClick={() => onNavigate?.(item.href)}
      title={collapsed ? item.label : undefined}
      className={`
        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left
        ${isActive
          ? 'bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white'
          : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
        }
        ${collapsed ? 'justify-center px-2' : ''}
      `}
    >
      <Icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2 : 1.5} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  )
}

export function MainNav({ activeHref = '/dashboard', onNavigate, collapsed = false, userEmail }: MainNavProps) {
  const mainItems = NAV_ITEMS.filter(i => i.group === 'main')
  const adminItems = NAV_ITEMS.filter(i => i.group === 'admin').filter(() => canAccessAdminPage(userEmail))
  const utilityItems = NAV_ITEMS.filter(i => i.group === 'utility')

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className={`flex items-center gap-2.5 px-3 py-4 mb-2 ${collapsed ? 'justify-center px-2' : ''}`}>
        <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
          <Mountain className="w-4 h-4 text-white" strokeWidth={2} />
        </div>
        {!collapsed && (
          <div>
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-tight">
              PWV Insights
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-500 leading-tight">
              Canyon Lakes RD
            </div>
          </div>
        )}
      </div>

      {/* Main navigation */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2">
        {mainItems.map(item => (
          <NavLink
            key={item.href}
            item={item}
            isActive={activeHref === item.href}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}

        {adminItems.length > 0 && (
          <>
            <div className={`my-2 border-t border-stone-200 dark:border-stone-800 ${collapsed ? 'mx-1' : 'mx-1'}`} />
            {adminItems.map(item => (
              <NavLink
                key={item.href}
                item={item}
                isActive={activeHref === item.href}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </>
        )}
      </nav>

      {/* Utility nav at bottom */}
      <div className={`flex flex-col gap-0.5 px-2 pb-3 border-t border-stone-200 dark:border-stone-800 pt-3`}>
        {utilityItems.map(item => (
          <NavLink
            key={item.href}
            item={item}
            isActive={activeHref === item.href}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  )
}
