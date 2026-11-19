import { useState } from 'react'
import {
  ArrowDownToLine, CheckCircle2, ExternalLink, RefreshCw, RotateCcw, ShieldCheck, Sparkles, TriangleAlert,
} from 'lucide-react'
import { api } from '../lib/api'
import { bytes, cn, fmtDateTime, fromNow } from '../lib/format'
import { translate } from '../lib/i18n'
import type { UpdateState } from '../lib/types'
import { useUpdate } from '../lib/UpdateContext'
import { updateStatusLabel, updateStatusTone } from '../lib/updates'
import { Badge, Button, ConfirmDialog, Modal, Spinner, Toggle } from './ui'

export function UpdateDialog() {
  const { state, open, closeDialog, busy, check, download, install, setAutoCheck, skip, clearSkip } = useUpdate()
  const [confirmInstall, setConfirmInstall] = useState(false)

  const status = state?.status || 'idle'
  const available = status === 'available'
  const ready = status === 'ready'
  const downloading = status === 'downloading'
  const installing = status === 'installing'
  const current = state?.currentVersion || ''
  const latest = state?.latestVersion || ''

  const footer = (
    <>
      {(available || ready) && (
        <Button onClick={closeDialog} disabled={busy}>Later</Button>
      )}
      {available && !state?.skipped && (
        <Button variant="ghost" onClick={skip} disabled={busy}>Skip this version</Button>
      )}
      {available && state?.skipped && (
        <Button variant="ghost" onClick={clearSkip} disabled={busy}>Stop skipping this version</Button>
      )}
      {available && (
        <Button variant="copper" onClick={download} loading={busy}>
          <ArrowDownToLine size={14} /> Download update
        </Button>
      )}
      {ready && (
        <Button variant="copper" onClick={() => setConfirmInstall(true)} disabled={busy}>
          <RotateCcw size={14} /> Install and restart
        </Button>
      )}
      {downloading && (
        <Button onClick={closeDialog}>Hide</Button>
      )}
      {(status === 'idle' || status === 'up-to-date' || status === 'error' || status === 'unsupported') && (
        <Button variant="copper" onClick={() => check(true)} loading={busy}>
          <RefreshCw size={14} /> Check now
        </Button>
      )}
    </>
  )

  return (
    <>
      <Modal
        open={open}
        onClose={closeDialog}
        title={translate(available || ready || downloading ? 'Aster update' : 'Software updates')}
        description={translate('Signed releases from GitHub, verified before they are installed.')}
        size="md"
        footer={footer}
      >
        {!state ? (
          <div className="flex items-center gap-3 py-8 text-[12px] text-muted"><Spinner /> {translate('Reading update status…')}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={updateStatusTone(status)}>{translate(updateStatusLabel(status))}</Badge>
              {state.verified && (
                <Badge tone="success"><ShieldCheck size={11} /> {translate('Signed release')}</Badge>
              )}
              {state.skipped && <Badge tone="warning">{translate('Skipped')}</Badge>}
              <span className="ms-auto font-mono text-[10.5px] text-faint">{state.platform}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-elevated/50 px-3 py-2.5">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">{translate('Installed version')}</div>
                <div className="mt-0.5 font-mono text-[13px] font-semibold text-ink">v{current || '—'}</div>
              </div>
              <div className="rounded-lg border border-line bg-elevated/50 px-3 py-2.5">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">{translate('Latest release')}</div>
                <div className={cn('mt-0.5 font-mono text-[13px] font-semibold', latest ? 'text-accent-700 dark:text-accent-300' : 'text-faint')}>
                  {latest ? `v${latest}` : '—'}
                </div>
              </div>
            </div>

            {status === 'available' && (
              <div className="rounded-xl border border-accent-200 bg-accent-50/60 p-3.5 dark:border-accent-800 dark:bg-accent-900/15">
                <div className="flex items-start gap-2.5">
                  <Sparkles size={17} className="mt-0.5 shrink-0 text-accent-600" />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-ink">
                      {translate(`Version ${latest} is available`)}
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-muted">
                      {translate('The download is approximately {size}. Aster checks its signature and SHA-256 before installing it.').replace('{size}', bytes(state.assetSize))}
                    </div>
                    {state.publishedAt && (
                      <div className="mt-1 text-[10.5px] text-faint">
                        {translate('Published')} {fromNow(state.publishedAt)}
                      </div>
                    )}
                  </div>
                </div>
                {state.notesUrl && (
                  <button
                    type="button"
                    onClick={() => api.openExternal(state.notesUrl).catch(() => {})}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-700 hover:text-accent-600 dark:text-accent-300"
                  >
                    <ExternalLink size={12} /> {translate('Read release notes')}
                  </button>
                )}
              </div>
            )}

            {downloading && (
              <div className="rounded-xl border border-line bg-elevated/40 p-3.5">
                <div className="flex items-center justify-between gap-3 text-[11.5px]">
                  <span className="font-medium text-ink">{translate('Downloading update…')}</span>
                  <span className="font-mono text-[10.5px] text-muted">{state.progress}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface ring-1 ring-line" role="progressbar" aria-valuenow={state.progress} aria-valuemin={0} aria-valuemax={100}>
                  <div
                    className="h-full rounded-full bg-accent-600 transition-[width] duration-200"
                    style={{ width: `${Math.max(2, Math.min(100, state.progress))}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-faint">
                  <span className="font-mono">{bytes(state.downloaded)} / {bytes(state.assetSize)}</span>
                  <span>{translate('Keep Aster open while it downloads.')}</span>
                </div>
              </div>
            )}

            {ready && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />
                  <div>
                    <div className="text-[12.5px] font-semibold text-ink">{translate('Update downloaded and verified')}</div>
                    <div className="mt-1 text-[11px] leading-5 text-muted">
                      {translate('Aster will close, replace the installed copy, and reopen on version {version}.').replace('{version}', latest)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {installing && (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-elevated/50 p-3.5 text-[12px] text-muted">
                <Spinner /> {translate('Restarting Aster to finish the update…')}
              </div>
            )}

            {status === 'up-to-date' && (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />
                <div>
                  <div className="text-[12.5px] font-semibold text-ink">{translate('You are running the latest version')}</div>
                  <div className="mt-1 text-[11px] leading-5 text-muted">{translate('Aster will check again in the background.')}</div>
                </div>
              </div>
            )}

            {(status === 'error' || status === 'unsupported') && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20">
                <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink">
                    {status === 'unsupported' ? translate('No package for this computer') : translate('The update check did not finish')}
                  </div>
                  <div className="mt-1 break-words text-[11px] leading-5 text-muted">
                    {state.error || translate('Check the internet connection and try again.')}
                  </div>
                  {state.notesUrl && (
                    <button
                      type="button"
                      onClick={() => api.openExternal(state.notesUrl).catch(() => {})}
                      className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-700 hover:text-accent-600 dark:text-accent-300"
                    >
                      <ExternalLink size={12} /> {translate('Open the release page')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {status === 'idle' && (
              <div className="rounded-xl border border-line bg-elevated/40 p-3.5 text-[11.5px] leading-5 text-muted">
                {translate('Aster checks GitHub Releases for a newer signed build. Your patient data stays on this computer.')}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-[10.5px] text-faint">
              <span>
                {state.checkedAt ? `${translate('Last checked')} ${fmtDateTime(state.checkedAt)}` : translate('Not checked yet')}
              </span>
              <span className="font-mono">{state.assetName || ''}</span>
            </div>

            <Toggle
              checked={state.autoCheck}
              onChange={(next) => setAutoCheck(next)}
              label={translate('Check for updates automatically')}
              description={translate('A quiet check at launch and every six hours. Updates never install without your confirmation.')}
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmInstall}
        onClose={() => setConfirmInstall(false)}
        onConfirm={() => {
          setConfirmInstall(false)
          install()
        }}
        title={translate('Install this update?')}
        description={translate('Aster will close and reopen on version {version}. Save any open work first.').replace('{version}', latest)}
        confirmLabel={translate('Install and restart')}
        busy={busy}
      />
    </>
  )
}

export function UpdateIndicator() {
  const { state, openDialog } = useUpdate()
  if (!state) return null
  const status = state.status
  const visible = (status === 'available' && !state.skipped) || status === 'ready' || status === 'downloading' || status === 'installing'
  if (!visible) return null

  const label = status === 'ready'
    ? translate('Restart to update')
    : status === 'downloading'
      ? `${translate('Updating')} ${state.progress}%`
      : status === 'installing'
        ? translate('Restarting')
        : translate('Update')

  return (
    <button
      type="button"
      onClick={openDialog}
      title={state.latestVersion ? `Aster ${state.latestVersion}` : label}
      className={cn(
        'group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition',
        status === 'ready'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
          : 'border-accent-300 bg-accent-50 text-accent-800 hover:bg-accent-100 dark:border-accent-800 dark:bg-accent-900/25 dark:text-accent-200',
      )}
    >
      {status === 'downloading' || status === 'installing'
        ? <Spinner className="text-current" />
        : status === 'ready'
          ? <RotateCcw size={14} />
          : <ArrowDownToLine size={14} className="transition group-hover:translate-y-px" />}
      <span className="hidden xl:inline">{label}</span>
      {status === 'available' && state.latestVersion && (
        <span className="rounded bg-accent-600 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">v{state.latestVersion}</span>
      )}
    </button>
  )
}
