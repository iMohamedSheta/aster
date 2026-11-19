import { useNavigate } from 'react-router-dom'
import { Cloud, CloudOff, Database, HardDrive, Keyboard, Loader2, RadioTower, Search, TriangleAlert } from 'lucide-react'
import { useApp } from '../lib/AppContext'
import { useLocale } from '../lib/LocaleContext'
import { cn } from '../lib/format'
import { translate } from '../lib/i18n'

/**
 * A quiet strip along the bottom of the workspace, in the spirit of a
 * developer console: it answers the three questions a clinic computer
 * always needs to answer — where is my data, is it saved, and how do I get
 * somewhere fast.
 */
export function StatusBar({ onSearch }: { onSearch: () => void }) {
  const { data, clinic, currentStaff } = useApp()
  const navigate = useNavigate()
  const { isRTL } = useLocale()
  const sync = data.sync
  const conflicts = data.conflicts || sync?.conflicts || 0
  const pending = sync?.pending ?? 0

  const mode = (() => {
    switch (data.mode) {
      case 'lan_host': return { label: 'Clinic network · Host', icon: RadioTower }
      case 'lan_client': return { label: 'Clinic network · Device', icon: RadioTower }
      case 'cloud': return { label: 'Aster Cloud · Synced', icon: Cloud }
      default: return { label: 'Just this computer', icon: HardDrive }
    }
  })()
  const ModeIcon = mode.icon

  const syncMeta = (() => {
    if (conflicts > 0) return { label: `${conflicts} ${conflicts === 1 ? 'conflict' : 'conflicts'}`, tone: 'error', icon: TriangleAlert }
    if (sync?.state === 'syncing') return { label: pending ? `Syncing ${pending}…` : 'Syncing…', tone: 'info', icon: Loader2, spin: true }
    if (sync?.state === 'error') return { label: 'Sync needs attention', tone: 'error', icon: TriangleAlert }
    if (sync?.state === 'offline') return { label: pending ? `Offline · ${pending} queued` : 'Offline · local changes kept', tone: 'warning', icon: CloudOff }
    if (sync?.state === 'synced') return { label: 'All changes synced', tone: 'success', icon: Cloud }
    if (pending > 0) return { label: `${pending} ${pending === 1 ? 'change' : 'changes'} queued`, tone: 'warning', icon: CloudOff }
    return { label: 'Saved on this device', tone: 'neutral', icon: Database }
  })()
  const SyncIcon = syncMeta.icon

  return (
    <footer className="no-print flex h-[26px] shrink-0 items-center gap-1 border-t border-line bg-surface px-2 text-[10px] text-faint">
      <button
        onClick={() => navigate(data.mode === 'local' ? '/settings/data' : '/settings/connectivity')}
        className="inline-flex h-[19px] items-center gap-1.5 rounded-[3px] px-1.5 transition hover:bg-elevated hover:text-ink"
        title={clinic?.name || mode.label}
      >
        <ModeIcon size={10.5} />
        <span className="font-medium">{translate(mode.label)}</span>
      </button>

      <span className="h-3 w-px bg-line" />

      <button
        onClick={() => navigate('/settings/connectivity')}
        className={cn(
          'inline-flex h-[19px] items-center gap-1.5 rounded-[3px] px-1.5 transition hover:bg-elevated hover:text-ink',
          syncMeta.tone === 'error' && 'text-rose-600 dark:text-rose-300',
          syncMeta.tone === 'warning' && 'text-amber-700 dark:text-amber-300',
        )}
        title={sync?.error || translate(syncMeta.label)}
      >
        <SyncIcon size={10.5} className={cn(syncMeta.spin && 'animate-spin')} />
        <span>{translate(syncMeta.label)}</span>
      </button>

      {currentStaff?.full_name && (
        <>
          <span className="hidden h-3 w-px bg-line sm:block" />
          <span className="hidden max-w-[180px] truncate px-1.5 text-[10px] sm:inline">{currentStaff.full_name}</span>
        </>
      )}

      <div className="ms-auto flex items-center gap-1">
        <button
          onClick={onSearch}
          className="inline-flex h-[19px] items-center gap-1.5 rounded-[3px] px-1.5 transition hover:bg-elevated hover:text-ink"
          title={translate('Search and commands')}
        >
          <Search size={10.5} />
          <span className="hidden sm:inline">{translate('Search')}</span>
          <kbd className="hidden rounded-[2px] border border-line bg-elevated px-1 font-mono text-[9px] leading-4 sm:inline">
            {isRTL ? 'K + Ctrl' : 'Ctrl K'}
          </kbd>
        </button>
        <span className="h-3 w-px bg-line" />
        <span className="inline-flex h-[19px] items-center gap-1 px-1.5 font-mono text-[9.5px]" title={translate('Keyboard shortcuts')}>
          <Keyboard size={10.5} />
          <span>{data.signedIn ? translate('Ready') : translate('Signed out')}</span>
        </span>
        <span className="h-3 w-px bg-line" />
        <span className="px-1.5 font-mono text-[9.5px]" title={translate('Version')}>v{data.version || '0.1.0'}</span>
      </div>
    </footer>
  )
}
