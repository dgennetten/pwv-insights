import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { MemberGate } from '../components/MemberGate'
import { useAuth } from '../contexts/AuthContext'
import { getStoredAuthToken } from '../services/authService'
import { version } from '../../package.json'
import { fetchUserPreferences, getLocalPreferences, saveUserPreferences } from '../services/settingsService'
import {
  type UserPreferences,
  type DashboardKpiPrefs,
  type TrailDetailPrefs,
  type ScheduleColumnsPrefs,
} from '../types/settings'
import { getStoredTheme, setStoredTheme, applyTheme, type Theme } from '../lib/theme'
import { getLoggerSettings, saveLoggerSettings, type LoggerSettings } from '../lib/loggerSettings'

// ─── Checkbox row ─────────────────────────────────────────────────────────────

interface PrefRowProps {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  afterLabel?: ReactNode
}

function PrefRow({ label, checked, onChange, afterLabel }: PrefRowProps) {
  return (
    <label className="flex items-center gap-3 py-2.5 cursor-pointer group select-none">
      <div className={`
        relative w-4 h-4 rounded border transition-colors shrink-0
        ${checked
          ? 'bg-emerald-600 border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500'
          : 'bg-white dark:bg-stone-800 border-stone-300 dark:border-stone-600 group-hover:border-stone-400 dark:group-hover:border-stone-500'
        }
      `}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
        {checked && (
          <Check className="absolute inset-0 w-full h-full p-0.5 text-white" strokeWidth={3} />
        )}
      </div>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
        <span className={`text-sm transition-colors ${
          checked
            ? 'text-stone-800 dark:text-stone-200'
            : 'text-stone-500 dark:text-stone-400'
        }`}>
          {label}
        </span>
        {afterLabel}
      </span>
    </label>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 mb-4">
      <div className="mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          {title}
        </h3>
        <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">{description}</p>
      </div>
      <div className="divide-y divide-stone-100 dark:divide-stone-800">
        {children}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuth()
  const [theme, setThemeState]           = useState<Theme>(getStoredTheme)
  const [prefs, setPrefs]                = useState<UserPreferences>(getLocalPreferences)
  const [loggerSettings, setLoggerSettings] = useState<LoggerSettings>(getLoggerSettings)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadPrefs = useCallback(async () => {
    const token = getStoredAuthToken()
    if (!token) return
    setLoading(true)
    try {
      const loaded = await fetchUserPreferences(token)
      setPrefs(loaded)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.personId) void loadPrefs()
  }, [user?.personId, loadPrefs])

  const updateKpi = (key: keyof DashboardKpiPrefs, value: boolean) => {
    setSavedAt(null)
    setPrefs(prev => ({
      ...prev,
      dashboardKpi: { ...prev.dashboardKpi, [key]: value },
    }))
  }

  const updateTrailDetail = (key: keyof TrailDetailPrefs, value: boolean) => {
    setSavedAt(null)
    setPrefs(prev => ({
      ...prev,
      trailDetail: { ...prev.trailDetail, [key]: value },
    }))
  }

  const updateScheduleColumns = (key: keyof ScheduleColumnsPrefs, value: boolean) => {
    setSavedAt(null)
    setPrefs(prev => ({
      ...prev,
      scheduleColumns: { ...prev.scheduleColumns, [key]: value },
    }))
  }

  const updateLoggerSettings = (patch: Partial<LoggerSettings>) => {
    setLoggerSettings(prev => {
      const next = { ...prev, ...patch }
      saveLoggerSettings(next)
      return next
    })
  }

  const handleTheme = (t: Theme) => {
    setThemeState(t)
    setStoredTheme(t)
    applyTheme(t)
  }

  const handleSave = async () => {
    const token = getStoredAuthToken()
    if (!token) {
      setError('No active session — sign in again.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveUserPreferences(token, prefs)
      setSavedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <MemberGate>
      <div className="min-h-full bg-stone-50 dark:bg-stone-950 p-4 md:p-6 lg:p-8">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Settings</h2>
            <span className="text-xs text-stone-400 dark:text-stone-500">v{version}</span>
          </div>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
            Personalize your dashboard experience
          </p>
        </div>

        {loading ? (
          <p className="text-xs text-stone-400 dark:text-stone-500 py-6 text-center">Loading…</p>
        ) : (
          <>
            {/* ── Appearance ────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 mb-4">
              <div className="mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Appearance</h3>
                <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">Choose your color theme preference.</p>
              </div>
              <div className="flex bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5 gap-0.5">
                {(['light', 'system', 'dark'] as Theme[]).map(opt => (
                  <button
                    key={opt}
                    onClick={() => handleTheme(opt)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                      theme === opt
                        ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Activity Dashboard ────────────────────────────────────── */}
            <SectionCard
              title="Activity Dashboard"
              description="Choose which KPI cards appear at the top of the Activity Dashboard and row details."
            >
              <PrefRow label="Patrols"            checked={prefs.dashboardKpi.patrols}          onChange={v => updateKpi('patrols', v)} />
              <PrefRow label="Trails Covered"     checked={prefs.dashboardKpi.trailsCovered}    onChange={v => updateKpi('trailsCovered', v)} />
              <PrefRow label="Trees Cleared"      checked={prefs.dashboardKpi.treesCleared}     onChange={v => updateKpi('treesCleared', v)} />
              <PrefRow label="Hikers Seen"        checked={prefs.dashboardKpi.hikersSeen}       onChange={v => updateKpi('hikersSeen', v)} />
              <PrefRow label="Hikers Contacted"   checked={prefs.dashboardKpi.hikersContacted}  onChange={v => updateKpi('hikersContacted', v)} />
              <PrefRow label="Days Patrolling"    checked={prefs.dashboardKpi.daysPatrolling}   onChange={v => updateKpi('daysPatrolling', v)} />
              <PrefRow label="Days Weeding"       checked={prefs.dashboardKpi.daysWeeding}      onChange={v => updateKpi('daysWeeding', v)} />
              <PrefRow label="Contact Efficiency" checked={prefs.dashboardKpi.patrolEfficiency} onChange={v => updateKpi('patrolEfficiency', v)} />
              <PrefRow label="Volunteer Hours"    checked={prefs.dashboardKpi.volunteerHours}   onChange={v => updateKpi('volunteerHours', v)} />
            </SectionCard>

            {/* ── Trails ────────────────────────────────────────────────── */}
            <SectionCard
              title="Trails"
              description="Choose which metrics appear as KPI cards on the trail detail and in patrol rows."
            >
              <PrefRow label="Trees Cleared"      checked={prefs.trailDetail.treesCleared}      onChange={v => updateTrailDetail('treesCleared', v)} />
              <PrefRow label="Hikers Seen"        checked={prefs.trailDetail.hikersSeen}        onChange={v => updateTrailDetail('hikersSeen', v)} />
              <PrefRow label="Hikers Contacted"   checked={prefs.trailDetail.hikersContacted}   onChange={v => updateTrailDetail('hikersContacted', v)} />
              <PrefRow label="Contact Efficiency" checked={prefs.trailDetail.patrolEfficiency}  onChange={v => updateTrailDetail('patrolEfficiency', v)} />
            </SectionCard>

            {/* ── My Schedule ───────────────────────────────────────────── */}
            <SectionCard
              title="My Schedule"
              description="Choose which columns appear in the My Schedule table."
            >
              <PrefRow label="Schedule #"    checked={prefs.scheduleColumns.scheduleId}      onChange={v => updateScheduleColumns('scheduleId', v)} />
              <PrefRow label="Trail"         checked={prefs.scheduleColumns.trail}           onChange={v => updateScheduleColumns('trail', v)} />
              <PrefRow label="Type"          checked={prefs.scheduleColumns.activityType}    onChange={v => updateScheduleColumns('activityType', v)} />
              <PrefRow label="Method"        checked={prefs.scheduleColumns.activityMethod}  onChange={v => updateScheduleColumns('activityMethod', v)} />
              <PrefRow label="Members"       checked={prefs.scheduleColumns.members}         onChange={v => updateScheduleColumns('members', v)} />
              <PrefRow label="Author"        checked={prefs.scheduleColumns.author}          onChange={v => updateScheduleColumns('author', v)} />
            </SectionCard>

            {/* ── Data Logger ───────────────────────────────────────────── */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 mb-4">
              <div className="mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Data Logger</h3>
                <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">Email format, screen wake lock, and auto-waypoint recording for distance tracking. All settings are saved locally.</p>
              </div>
              <div className="divide-y divide-stone-100 dark:divide-stone-800">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-stone-800 dark:text-stone-200">Email format</span>
                  <div className="flex bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5 gap-0.5">
                    {(['text', 'json'] as const).map(fmt => (
                      <button
                        key={fmt}
                        onClick={() => updateLoggerSettings({ emailFormat: fmt })}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          loggerSettings.emailFormat === fmt
                            ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
                            : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                        }`}
                      >
                        {fmt === 'text' ? 'Normal text' : 'JSON'}
                      </button>
                    ))}
                  </div>
                </div>
                <PrefRow
                  label="Keep screen awake while tracking"
                  checked={loggerSettings.wakeLockEnabled}
                  onChange={v => updateLoggerSettings({ wakeLockEnabled: v })}
                  afterLabel={
                    <span className="text-xs text-stone-400 dark:text-stone-500">
                      Prevents auto-lock; uses more battery
                    </span>
                  }
                />
                <PrefRow
                  label="Record waypoints"
                  checked={loggerSettings.waypointsEnabled}
                  onChange={v => updateLoggerSettings({ waypointsEnabled: v })}
                />
                {loggerSettings.waypointsEnabled && (
                  <div className="py-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-stone-500 dark:text-stone-400 w-12">Mode</span>
                      <div className="flex bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5 gap-0.5">
                        {(['distance', 'time'] as const).map(mode => (
                          <button
                            key={mode}
                            onClick={() => updateLoggerSettings({ waypointMode: mode })}
                            className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                              loggerSettings.waypointMode === mode
                                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
                                : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-stone-500 dark:text-stone-400 w-12">Every</span>
                      <input
                        type="number"
                        min={loggerSettings.waypointMode === 'distance' ? 0.05 : 1}
                        step={loggerSettings.waypointMode === 'distance' ? 0.05 : 1}
                        value={loggerSettings.waypointMode === 'distance'
                          ? loggerSettings.waypointDistanceMi
                          : loggerSettings.waypointTimeMin}
                        onChange={e => {
                          const v = parseFloat(e.target.value)
                          if (!isNaN(v) && v > 0) {
                            updateLoggerSettings(
                              loggerSettings.waypointMode === 'distance'
                                ? { waypointDistanceMi: v }
                                : { waypointTimeMin: v }
                            )
                          }
                        }}
                        className="w-16 px-2 py-1 text-xs bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-700 dark:text-stone-300 outline-none focus:border-emerald-400 transition-colors"
                      />
                      <span className="text-xs text-stone-400 dark:text-stone-500">
                        {loggerSettings.waypointMode === 'distance' ? 'mi' : 'min'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Save bar ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="min-h-[1.25rem]">
                {error && (
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                )}
                {savedAt && !error && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    Saved
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        )}

      </div>
    </MemberGate>
  )
}
