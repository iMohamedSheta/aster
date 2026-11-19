import { NavLink, useNavigate } from 'react-router-dom'
import {
  BarChart3, Boxes, Building2, CalendarDays, CheckSquare2, ChevronsUpDown, CircleHelp, ClipboardList,
  FolderOpen, LayoutDashboard, LogOut, Palette, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pill,
  Plus, ReceiptText, Settings2, Stethoscope, Users, Wallet,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { roleLabel, useApp } from '../lib/AppContext'
import { useLocale } from '../lib/LocaleContext'
import { cn } from '../lib/format'
import { Avatar, Dropdown, MenuItem } from './ui'
import { useToast } from './Toast'
import { AsterMark } from './Logo'

const groups: {
  label: string
  items: { to: string; label: string; icon: any; end?: boolean }[]
}[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/appointments', label: 'Appointments', icon: CalendarDays },
      { to: '/patients', label: 'Patients', icon: Users },
      { to: '/visits', label: 'Visits', icon: Stethoscope },
      { to: '/files', label: 'Files', icon: FolderOpen },
    ],
  },
  {
    label: 'Care',
    items: [
      { to: '/prescriptions', label: 'Prescriptions', icon: Pill },
      { to: '/treatment-plans', label: 'Treatment plans', icon: ClipboardList },
      { to: '/tasks', label: 'Tasks', icon: CheckSquare2 },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/billing', label: 'Billing', icon: ReceiptText },
      { to: '/expenses', label: 'Expenses', icon: Wallet },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Boxes },
      { to: '/network', label: 'Network', icon: Building2 },
      { to: '/settings', label: 'Settings', icon: Settings2 },
    ],
  },
]

function modeLabel(mode: string) {
  switch (mode) {
    case 'lan_host': return 'Clinic network · Host'
    case 'lan_client': return 'Clinic network · Device'
    case 'cloud': return 'Aster Cloud · Synced'
    default: return 'Local workspace'
  }
}

export function Sidebar() {
  const { data, clinic, currentStaff, locations, activeLocation, sidebar, setSidebar, setBootstrap } = useApp()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { isRTL } = useLocale()
  const compact = sidebar === 'compact'
  const CollapseIcon = isRTL ? PanelRightClose : PanelLeftClose
  const ExpandIcon = isRTL ? PanelRightOpen : PanelLeftOpen
  const ToggleIcon = compact ? ExpandIcon : CollapseIcon
  const toggleLabel = compact ? 'Expand sidebar' : 'Compact sidebar'

  async function switchAccount() {
    try {
      const next = await api.signOut()
      setBootstrap(next)
      navigate('/', { replace: true })
      await qc.invalidateQueries()
    } catch (e: any) {
      toast.error('Could not switch account', String(e?.message ?? e))
    }
  }

  async function switchLocation(id: string) {
    if (!id || id === data.activeLocationId) return
    try {
      const next = await api.setActiveLocation(id)
      setBootstrap(next)
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]) !== 'bootstrap' })
      toast.success('Clinic switched', next.activeLocation?.name || '')
    } catch (e: any) {
      toast.error('Could not switch clinic', String(e?.message ?? e))
    }
  }

  const locationMenu = (
    <>
      <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-1">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border border-line bg-elevated">
          <AsterMark size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold text-ink">{clinic?.name || 'Your clinic'}</span>
          <span className="block truncate text-[8.5px] font-medium uppercase tracking-[0.1em] text-faint">{modeLabel(data.mode)}</span>
        </span>
      </div>
      <div className="my-1 h-px bg-line" />
      <div className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
        Clinic location
      </div>
      {locations.map((loc) => (
        <MenuItem
          key={loc.id}
          icon={<span className="block h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: loc.color || '#2a3747' }} />}
          onClick={() => switchLocation(loc.id)}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{loc.name}</span>
            {loc.id === data.activeLocationId && <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-accent-600">Active</span>}
          </span>
        </MenuItem>
      ))}
      <div className="my-1 h-px bg-line" />
      <MenuItem icon={<Settings2 size={14} />} onClick={() => navigate('/settings/clinic')}>
        Clinic profile
      </MenuItem>
      <MenuItem icon={<Building2 size={14} />} onClick={() => navigate('/network')}>
        Network control centre
      </MenuItem>
      <MenuItem icon={<Plus size={14} />} onClick={() => navigate('/network?add=1')}>
        Add a clinic
      </MenuItem>
    </>
  )

  return (
    <aside
      className={cn(
        'no-print flex shrink-0 flex-col overflow-hidden border-e border-line bg-surface transition-[width] duration-200',
        compact ? 'w-[66px]' : 'w-[264px]',
      )}
    >
      {compact ? (
        <div className="flex flex-col items-center p-2 pb-1">
          <Dropdown
            align="right"
            trigger={(
              <button
                className="relative flex h-9 w-9 items-center justify-center rounded-md border border-line bg-elevated transition hover:border-line-strong"
                title={activeLocation?.name || clinic?.name || 'Switch clinic'}
                aria-label="Switch clinic and workspace"
              >
                <AsterMark size={19} />
                <span
                  className="absolute -bottom-0.5 -end-0.5 block h-2.5 w-2.5 rounded-full border-2 border-surface"
                  style={{ background: activeLocation?.color || '#2a3747' }}
                />
              </button>
            )}
          >
            {locationMenu}
          </Dropdown>
        </div>
      ) : (
        <div className="p-3 pb-2">
          <Dropdown
            className="w-full"
            align="left"
            trigger={(
              <button
                className="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-start transition hover:border-line hover:bg-elevated"
                title="Switch clinic and workspace"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-line bg-elevated">
                  <AsterMark size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-semibold leading-4 text-ink">
                    {activeLocation?.name || clinic?.name || 'Your clinic'}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.1em] text-faint">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: activeLocation?.color || '#2a3747' }} />
                    <span className="min-w-0 truncate">{clinic?.name || modeLabel(data.mode)}</span>
                  </span>
                </span>
                <ChevronsUpDown size={12} className="shrink-0 text-faint" />
              </button>
            )}
          >
            {locationMenu}
          </Dropdown>
        </div>
      )}

      <div className={cn('h-px bg-line', compact ? 'mx-2' : 'mx-3')} />

      <nav className={cn('flex-1 overflow-y-auto py-4', compact ? 'px-2' : 'px-2.5')}>
        {groups.map((group, index) => (
          <div key={group.label} className={cn(compact ? 'mb-1 last:mb-0' : 'mb-5 last:mb-0')}>
            {compact ? (
              index > 0 && <div className="mx-auto mb-1.5 mt-2 h-px w-6 bg-line" />
            ) : (
              <div className="mb-1.5 flex items-baseline gap-2 px-2.5">
                <span className="font-mono text-[8.5px] font-medium leading-none text-accent-600 dark:text-accent-400">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-[8.5px] font-semibold uppercase tracking-[0.18em] text-faint">
                  {group.label}
                </span>
              </div>
            )}
            <div className="space-y-px">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={compact ? item.label : undefined}
                  className={({ isActive }) => cn(
                    'group relative flex h-[33px] items-center rounded-md text-[12px] font-medium transition',
                    compact ? 'justify-center px-0' : 'gap-2.5 px-2.5',
                    isActive
                      ? 'bg-elevated text-ink'
                      : 'text-muted hover:bg-elevated/70 hover:text-ink',
                  )}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span aria-hidden className="absolute inset-y-1.5 start-0 w-[2px] rounded-full bg-accent-600 dark:bg-accent-400" />}
                      <item.icon
                        size={compact ? 17 : 15}
                        strokeWidth={isActive ? 2.1 : 1.7}
                        className={isActive ? 'text-accent-700 dark:text-accent-300' : 'text-faint group-hover:text-muted'}
                      />
                      {!compact && <span className="flex-1">{item.label}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className={cn('border-t border-line', compact ? 'p-2' : 'p-2.5')}>
        <Dropdown
          className="w-full"
          align="left"
          side="top"
          trigger={(
            <button
              className={cn(
                'flex w-full items-center rounded-lg text-start transition hover:bg-elevated',
                compact ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-1.5 py-1.5',
              )}
              title={compact ? currentStaff?.full_name || 'Clinic team' : undefined}
            >
              <Avatar name={currentStaff?.full_name} color={currentStaff?.color} size={compact ? 28 : 29} className="ring-line" />
              {!compact && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold leading-4 text-ink">
                      {currentStaff?.full_name || 'Clinic team'}
                    </span>
                    <span className="block truncate text-[9.5px] text-faint">{roleLabel(currentStaff?.role)}</span>
                  </span>
                  <ChevronsUpDown size={12} className="text-faint" />
                </>
              )}
            </button>
          )}
        >
          <div className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
            Working as
          </div>
          <div className="mb-1 flex items-center gap-2 px-2.5 pb-1.5 text-[11.5px] font-medium text-muted">
            <Avatar name={currentStaff?.full_name} color={currentStaff?.color} size={18} />
            <span className="min-w-0 flex-1 truncate">{currentStaff?.full_name}</span>
            <span className="text-[10px] text-faint">{roleLabel(currentStaff?.role)}</span>
          </div>
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<Palette size={14} />} onClick={() => navigate('/settings/appearance')}>
            Appearance
          </MenuItem>
          <MenuItem icon={<Settings2 size={14} />} onClick={() => navigate('/settings/clinic')}>
            Clinic settings
          </MenuItem>
          <MenuItem icon={<CircleHelp size={14} />} onClick={() => navigate('/settings/about')}>
            About Aster
          </MenuItem>
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<LogOut size={14} />} onClick={switchAccount}>
            Sign out
          </MenuItem>
        </Dropdown>
        {compact ? (
          <button
            onClick={() => setSidebar('expanded')}
            className="mt-1 flex h-7 w-full items-center justify-center rounded-md text-faint transition hover:bg-elevated hover:text-ink"
            title={toggleLabel}
            aria-label={toggleLabel}
          >
            <ToggleIcon size={14} />
          </button>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-2 px-2 pb-0.5">
            <span className="shrink-0 font-mono text-[9px] text-faint">v{data.version || '0.1.0'}</span>
            <button
              onClick={() => setSidebar('compact')}
              className="ms-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-faint transition hover:bg-elevated hover:text-ink"
              title={toggleLabel}
              aria-label={toggleLabel}
            >
              <ToggleIcon size={13} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
