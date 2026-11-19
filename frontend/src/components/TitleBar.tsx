import { useNavigate } from 'react-router-dom'
import {
  Check, Cloud, CloudOff, HardDrive, Languages, Loader2, Minus, Monitor, Moon, Palette,
  PanelLeftClose, PanelLeftOpen, RefreshCw, Square, Sun, TriangleAlert, X, RadioTower,
} from 'lucide-react'
import { appWindow } from '../lib/api'
import { cn } from '../lib/format'
import { translate } from '../lib/i18n'
import { useLocale } from '../lib/LocaleContext'
import { useApp } from '../lib/AppContext'
import { ACCENTS, RADII } from '../lib/appearance'
import { Dropdown } from './ui'
import type { BootstrapData, SyncStatus } from '../lib/types'
import { LogoLockup } from './Logo'

function syncMeta(sync?: SyncStatus) {
  switch (sync?.state) {
    case 'syncing':
      return { label: sync.pending ? `Syncing ${sync.pending}…` : 'Syncing…', tone: 'info', Icon: Loader2, spin: true }
    case 'synced':
      return { label: 'All changes synced', tone: 'success', Icon: Cloud, spin: false }
    case 'offline':
      return {
        label: sync.pending ? `Offline · ${sync.pending} queued` : 'Offline · local changes kept',
        tone: 'warning',
        Icon: CloudOff,
        spin: false,
      }
    case 'error':
      return { label: 'Sync needs attention', tone: 'error', Icon: TriangleAlert, spin: false }
    case 'local':
    default:
      return { label: 'On this computer', tone: 'muted', Icon: HardDrive, spin: false }
  }
}

const dotTone: Record<string, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-rose-500',
  info: 'bg-sky-500',
  muted: 'bg-faint',
}

const radiusPreview: Record<string, number> = { sharp: 2, balanced: 5, round: 9 }

export function TitleBar({
  data, theme, onToggleTheme,
}: {
  data: BootstrapData
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}) {
  const navigate = useNavigate()
  const { locale, setLocale } = useLocale()
  const { theme: themeMode, setTheme, accent, setAccent, radius, setRadius, sidebar, setSidebar } = useApp()
  const meta = syncMeta(data.sync)
  const conflicts = data.conflicts || data.sync?.conflicts || 0
  const inverse = theme === 'dark'

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const

  return (
    <header
      dir="ltr"
      className="no-print relative z-40 flex h-9 shrink-0 select-none items-stretch border-b border-line bg-surface text-ink shadow-[0_1px_0_rgb(var(--accent-600)/0.22)]"
      onDoubleClick={() => appWindow.toggleMaximise()}
    >
      <div className="flex w-[264px] shrink-0 items-center border-e border-line px-4">
        <LogoLockup size={21} light={inverse} />
      </div>

      <div className="wails-drag flex min-w-0 flex-1 items-center gap-3 px-4">
        {data.clinic?.name && (
          <span className="truncate text-[10px] font-medium uppercase tracking-[0.16em] text-muted">{data.clinic.name}</span>
        )}
        {conflicts > 0 && (
          <button
            onClick={() => navigate('/settings/connectivity')}
            className="wails-no-drag inline-flex items-center gap-1 rounded-[3px] border border-amber-300 bg-amber-50 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-[0.08em] text-amber-800 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-900/25 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            <TriangleAlert size={10} />
            {conflicts} conflict{conflicts === 1 ? '' : 's'}
          </button>
        )}
      </div>

      <div className="wails-no-drag flex items-stretch">
        <button
          onClick={() => navigate('/settings/connectivity')}
          title={data.sync?.error || meta.label}
          className="my-[7px] me-1.5 inline-flex h-[22px] items-center gap-1.5 rounded-[4px] border border-line bg-elevated px-2 text-[10px] font-medium text-muted transition hover:border-line-strong hover:bg-surface hover:text-ink"
        >
          {meta.spin ? (
            <RefreshCw size={10} className="animate-spin" />
          ) : meta.Icon === RadioTower ? (
            <RadioTower size={10} />
          ) : (
            <meta.Icon size={10} />
          )}
          <span className="max-w-[180px] truncate">{meta.label}</span>
          <span className={cn('h-1.5 w-1.5 rounded-full', dotTone[meta.tone])} />
        </button>

        <Dropdown
          align="right"
          className="my-[6px] me-1"
          trigger={(
            <button
              className="flex h-[24px] w-8 items-center justify-center rounded-[4px] text-muted transition hover:bg-elevated hover:text-ink"
              title="Appearance"
              aria-label="Appearance"
            >
              <Palette size={13} />
            </button>
          )}
        >
          <div className="w-[262px]" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <div className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
              Appearance
            </div>
            <div className="grid grid-cols-3 gap-1 px-1.5 pb-1.5">
              {themeOptions.map((option) => {
                const Icon = option.icon
                const active = themeMode === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      'flex h-8 items-center justify-center gap-1.5 rounded-[5px] border text-[10.5px] font-medium transition',
                      active
                        ? 'border-accent-300 bg-accent-50 text-accent-900 dark:border-accent-800/60 dark:bg-accent-900/25 dark:text-accent-100'
                        : 'border-line bg-surface text-muted hover:bg-elevated hover:text-ink',
                    )}
                  >
                    <Icon size={12} />
                    {translate(option.label)}
                  </button>
                )
              })}
            </div>
            <div className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
              Accent
            </div>
            <div className="flex items-center gap-1.5 px-2.5 pb-2">
              {ACCENTS.map((item) => {
                const active = accent === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setAccent(item.id)}
                    title={translate(item.label)}
                    aria-label={translate(item.label)}
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-[4px] ring-1 ring-inset ring-black/10 transition',
                      active && 'ring-2 ring-accent-500 ring-offset-2 ring-offset-surface',
                    )}
                    style={{ background: item.swatch }}
                  >
                    {active && <Check size={11} strokeWidth={3} className="text-white drop-shadow" />}
                  </button>
                )
              })}
            </div>
            <div className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
              Corners
            </div>
            <div className="grid grid-cols-3 gap-1 px-1.5 pb-2">
              {RADII.map((item) => {
                const active = radius === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setRadius(item.id)}
                    className={cn(
                      'flex h-7 items-center justify-center gap-1.5 rounded-[5px] border text-[10px] font-medium transition',
                      active
                        ? 'border-accent-300 bg-accent-50 text-accent-900 dark:border-accent-800/60 dark:bg-accent-900/25 dark:text-accent-100'
                        : 'border-line bg-surface text-muted hover:bg-elevated hover:text-ink',
                    )}
                  >
                    <span
                      aria-hidden
                      className="block h-3 w-3 border border-current opacity-70"
                      style={{ borderRadius: radiusPreview[item.id] }}
                    />
                    {translate(item.label)}
                  </button>
                )
              })}
            </div>
            <div className="border-t border-line p-1">
              <button
                onClick={() => setSidebar(sidebar === 'compact' ? 'expanded' : 'compact')}
                className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-[10.5px] font-medium text-muted transition hover:bg-elevated hover:text-ink"
              >
                {sidebar === 'compact' ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
                {translate(sidebar === 'compact' ? 'Expand sidebar' : 'Compact sidebar')}
              </button>
              <button
                onClick={() => navigate('/settings/appearance')}
                className="flex w-full items-center justify-center rounded-[4px] px-2 py-1.5 text-[10.5px] font-medium text-muted transition hover:bg-elevated hover:text-ink"
              >
                All appearance settings
              </button>
            </div>
          </div>
        </Dropdown>

        <button
          onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
          className="flex w-10 items-center justify-center gap-1 text-muted transition hover:bg-elevated hover:text-ink"
          title={locale === 'ar' ? 'English' : 'العربية'}
          aria-label="Language"
        >
          <Languages size={13} />
          <span className="text-[9px] font-semibold leading-none">{locale === 'ar' ? 'EN' : 'ع'}</span>
        </button>

        <button
          onClick={onToggleTheme}
          className="flex w-10 items-center justify-center text-muted transition hover:bg-elevated hover:text-ink"
          title={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'}
          aria-label="Toggle appearance"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={13.5} />}
        </button>

        <div className="mx-1.5 my-2 w-px bg-line" />

        <button
          onClick={() => appWindow.minimize()}
          className="flex w-11 items-center justify-center text-muted transition hover:bg-elevated hover:text-ink"
          aria-label="Minimise"
          title="Minimise"
        >
          <Minus size={15} strokeWidth={1.8} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximise()}
          className="flex w-11 items-center justify-center text-muted transition hover:bg-elevated hover:text-ink"
          aria-label="Maximise"
          title="Maximise or restore"
        >
          <Square size={11.5} strokeWidth={1.9} />
        </button>
        <button
          onClick={() => appWindow.close()}
          className="flex w-11 items-center justify-center text-muted transition hover:bg-[#d93a40] hover:text-white"
          aria-label="Close"
          title="Close"
        >
          <X size={15} strokeWidth={1.9} />
        </button>
      </div>
    </header>
  )
}
