import { useLocation } from 'react-router-dom'
import {
  CalendarDays, Check, FileText, FolderOpen, Info, Lightbulb, Search, Sparkles, UploadCloud, Users,
} from 'lucide-react'
import { pageGuideFor, type GuideFigureKind } from '../lib/pageGuides'
import { translate } from '../lib/i18n'
import { Badge, Sheet } from './ui'

function Callout({ n, className }: { n: number; className?: string }) {
  return (
    <span className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-600 text-[9px] font-semibold text-white shadow-sm ${className ?? ''}`}>
      {n}
    </span>
  )
}

/**
 * A small, deliberately abstract picture of the page. It is drawn with the
 * app's own surfaces so it reads in both light and dark appearance and never
 * needs a screenshot that could go stale.
 */
function GuideFigure({ kind, accent }: { kind: GuideFigureKind; accent?: string }) {
  if (kind === 'calendar') {
    return (
      <div aria-hidden className="space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-md border border-line bg-surface p-0.5">
            <span className="h-5 w-9 rounded bg-accent-600/90" />
            <span className="h-5 w-9 rounded bg-elevated" />
            <span className="h-5 w-9 rounded bg-elevated" />
          </div>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="h-5 w-16 rounded-md border border-line bg-surface" />
            <Callout n={1} />
          </div>
        </div>
        <div className="grid grid-cols-[26px_repeat(5,minmax(0,1fr))] gap-1.5">
          <div className="space-y-2 pt-5">
            {['09', '10', '11', '12', '13'].map((t) => (
              <div key={t} className="font-mono text-[7px] text-faint">{t}:00</div>
            ))}
          </div>
          {[0, 1, 2, 3, 4].map((col) => (
            <div key={col} className="space-y-1.5 rounded-md border border-line bg-surface p-1">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent ?? '#2a3747' }} />
                <span className="h-1 w-8 rounded bg-line" />
              </div>
              {[0, 1, 2].map((row) => {
                const colors = ['bg-accent-600/85', 'bg-emerald-500/70', 'bg-amber-500/70', 'bg-rose-400/60', 'bg-brand-400/70']
                const height = ['h-8', 'h-6', 'h-10', 'h-5', 'h-7'][(col + row) % 5]
                return (
                  <div
                    key={row}
                    className={`${height} ${colors[(col + row * 2) % colors.length]} flex items-start gap-1 rounded-[4px] p-1`}
                  >
                    <span className="mt-0.5 h-1 w-1 rounded-full bg-white/80" />
                    <span className="mt-0.5 h-1 w-6 rounded bg-white/50" />
                  </div>
                )
              })}
              {col === 2 && (
                <div className="flex justify-end pt-0.5"><Callout n={2} /></div>
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-md border border-line bg-surface p-2">
              <div className="h-1.5 w-10 rounded bg-line" />
              <div className="mt-1.5 h-1 w-full rounded bg-line/70" />
              <div className="mt-1 h-1 w-2/3 rounded bg-line/50" />
            </div>
          ))}
          <div className="flex items-center justify-end"><Callout n={3} /></div>
        </div>
      </div>
    )
  }

  if (kind === 'documents') {
    const tints = [
      'bg-rose-400/15 text-rose-500 dark:text-rose-300',
      'bg-emerald-400/15 text-emerald-600 dark:text-emerald-300',
      'bg-amber-400/15 text-amber-600 dark:text-amber-300',
      'bg-sky-400/15 text-sky-600 dark:text-sky-300',
    ]
    return (
      <div aria-hidden className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5">
            <Search size={9} className="text-faint" />
            <span className="h-1 w-24 rounded bg-line" />
          </span>
          <span className="h-5 w-16 rounded-md border border-line bg-elevated" />
          <span className="h-5 w-16 rounded-md border border-line bg-elevated" />
          <Callout n={1} className="ms-auto" />
        </div>

        <div className="grid gap-2 md:grid-cols-[1.65fr_1fr]">
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
              <span className="h-1.5 w-16 rounded bg-line" />
              <span className="h-1.5 w-10 rounded bg-line/60" />
              <Callout n={2} className="ms-auto" />
            </div>
            {tints.map((tint, i) => (
              <div key={tint} className={`flex items-center gap-2 px-2.5 py-2 ${i < tints.length - 1 ? 'border-b border-line/70' : ''}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tint}`}>
                  <FileText size={11} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block h-1.5 w-24 rounded bg-ink/45 dark:bg-white/20" />
                  <span className="mt-1 block h-1 w-14 rounded bg-line" />
                </span>
                <span className={`h-3.5 w-10 rounded border ${
                  i === 2
                    ? 'border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-900/25'
                    : 'border-line bg-elevated'
                }`} />
                <span className="h-1.5 w-8 rounded bg-line/70" />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="relative flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-elevated/35 px-3 py-4 text-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-accent-600">
                <UploadCloud size={13} />
              </span>
              <span className="h-1.5 w-20 rounded bg-line" />
              <span className="h-1 w-14 rounded bg-line/60" />
              <Callout n={3} className="absolute end-2 top-2" />
            </div>
            <div className="rounded-lg border border-line bg-surface p-2">
              <div className="flex items-center gap-1.5">
                <span className="flex h-6 w-5 shrink-0 items-center justify-center rounded-sm bg-elevated text-faint">
                  <FileText size={10} />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block h-1.5 w-16 rounded bg-ink/45 dark:bg-white/20" />
                  <span className="block h-1 w-10 rounded bg-line" />
                </span>
                <span className="h-3.5 w-7 rounded border border-line bg-elevated" />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-14 rounded-sm border border-line/70 bg-elevated/60" />
                ))}
              </div>
              <div className="mt-2 h-1 w-full rounded bg-line/60" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (kind === 'settings') {
    return (
      <div aria-hidden className="grid gap-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)]">
        <div className="rounded-lg border border-line bg-surface p-2">
          <div className="flex items-center justify-between pb-1.5">
            <span className="h-1.5 w-12 rounded bg-line" />
            <Callout n={1} />
          </div>
          {[0, 1, 2].map((group) => (
            <div key={group} className="space-y-1 pt-1.5">
              <div className="px-1 font-mono text-[7px] uppercase tracking-[0.12em] text-faint">
                {['01', '02', '03'][group]}
              </div>
              {[0, 1].map((row) => (
                <div
                  key={row}
                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-1.5 ${
                    group === 0 && row === 0 ? 'bg-accent-600/10 text-accent-600 dark:bg-accent-400/10 dark:text-accent-300' : ''
                  }`}
                >
                  <span className="h-3 w-3 rounded-sm border border-current opacity-40" />
                  <span className={`h-1.5 rounded ${group === 0 && row === 0 ? 'w-16 bg-current opacity-60' : 'w-14 bg-line'}`} />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-line bg-surface p-2.5">
          <div className="flex items-center gap-2 border-b border-line pb-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-600/10 text-accent-600 dark:bg-accent-400/15 dark:text-accent-300">
              <Sparkles size={12} />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <span className="block h-1.5 w-20 rounded bg-ink/50 dark:bg-white/25" />
              <span className="block h-1 w-28 rounded bg-line" />
            </div>
            <Callout n={2} />
          </div>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((field) => (
              <div key={field} className="space-y-1">
                <span className="block h-1 w-12 rounded bg-line" />
                <span className="block h-7 rounded-md border border-line-strong bg-elevated/60" />
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2 rounded-md border border-line bg-elevated/40 px-2 py-1.5">
            <span className="h-1.5 w-24 rounded bg-line/70" />
            <span className="ms-auto inline-flex h-5 items-center gap-1 rounded bg-accent-600 px-2">
              <Check size={8} className="text-white" />
              <span className="h-1 w-8 rounded bg-white/80" />
            </span>
            <Callout n={3} />
          </div>
        </div>
      </div>
    )
  }

  if (kind === 'record') {
    return (
      <div aria-hidden className="space-y-3">
        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface p-2.5">
          <span className="h-8 w-8 rounded-full" style={{ background: accent ?? '#526379' }} />
          <div className="min-w-0 flex-1">
            <div className="h-2 w-32 rounded bg-ink/60 dark:bg-white/30" />
            <div className="mt-1.5 flex gap-1.5">
              <span className="h-1.5 w-14 rounded bg-line" />
              <span className="h-1.5 w-10 rounded bg-line" />
              <span className="h-1.5 w-16 rounded bg-line" />
            </div>
          </div>
          <span className="h-5 w-14 rounded-md border border-line bg-elevated" />
          <Callout n={1} />
        </div>

        <div className="flex items-center gap-1 border-b border-line pb-1.5">
          {['Overview', 'Visits', 'Billing', 'Documents'].map((label, i) => (
            <span
              key={label}
              className={`rounded px-2 py-1 text-[7.5px] font-medium ${i === 3 ? 'bg-accent-600 text-white' : 'text-faint'}`}
            >
              {translate(label)}
            </span>
          ))}
          <Callout n={2} className="ms-1" />
        </div>

        <div className="grid gap-2 sm:grid-cols-[1.5fr_1fr]">
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-line bg-surface p-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-600/10 text-accent-600 dark:bg-accent-400/15 dark:text-accent-300">
                  {i === 2 ? <FolderOpen size={11} /> : <Users size={11} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block h-1.5 w-24 rounded bg-ink/50 dark:bg-white/25" />
                  <span className="mt-1 block h-1 w-32 rounded bg-line" />
                </span>
                <span className="h-4 w-10 rounded border border-line bg-elevated" />
              </div>
            ))}
          </div>
          <div className="space-y-2 rounded-lg border border-line bg-surface p-2">
            <div className="flex items-center justify-between">
              <span className="h-1.5 w-14 rounded bg-line" />
              <Callout n={3} />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-1.5 rounded border border-line/70 bg-elevated/50 p-1.5">
                <span className="h-4 w-4 rounded-full bg-line" />
                <span className="h-1 w-16 rounded bg-line" />
              </div>
            ))}
            <div className="h-1 w-full rounded bg-line/60" />
            <div className="h-1 w-3/4 rounded bg-line/50" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div aria-hidden className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-28 rounded bg-ink/60 dark:bg-white/25" />
        <span className="h-6 w-20 rounded-md border border-line bg-elevated" />
        <span className="h-6 w-16 rounded-md border border-line bg-elevated" />
        <span className="ms-auto flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5">
          <Search size={9} className="text-faint" />
          <span className="h-1 w-16 rounded bg-line" />
        </span>
        <Callout n={1} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface p-2.5">
            <div className="flex items-center justify-between">
              <span className="h-1.5 w-12 rounded bg-line" />
              <span className="h-2 w-2 rounded-full" style={{ background: accent ?? '#2a3747' }} />
            </div>
            <div className="mt-2 h-3.5 w-10 rounded bg-ink/60 dark:bg-white/25" />
            <div className="mt-2 h-1 w-full rounded bg-line/60" />
          </div>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-[1.7fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
            <span className="h-1.5 w-16 rounded bg-line" />
            <span className="h-1.5 w-10 rounded bg-line/60" />
            <Callout n={2} className="ms-auto" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`flex items-center gap-2 px-2.5 py-2 ${i < 3 ? 'border-b border-line/70' : ''}`}>
              <span className="h-5 w-5 rounded-full" style={{ background: ['#2a3747', '#a85833', '#526379', '#7d5a78'][i] }} />
              <span className="min-w-0 flex-1">
                <span className="block h-1.5 w-24 rounded bg-ink/45 dark:bg-white/20" />
                <span className="mt-1 block h-1 w-14 rounded bg-line" />
              </span>
              <span className={`h-3.5 w-10 rounded border ${i === 1 ? 'border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-900/25' : 'border-line bg-elevated'}`} />
              <span className="h-1.5 w-8 rounded bg-line/70" />
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded-lg border border-line bg-surface p-2">
          <div className="flex items-center justify-between">
            <span className="h-1.5 w-12 rounded bg-line" />
            <Callout n={3} />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded border border-line/70 bg-elevated/50 p-1.5">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                <span className="h-1 w-16 rounded bg-line" />
              </div>
              <div className="mt-1.5 h-1 w-full rounded bg-line/60" />
              <div className="mt-1 h-1 w-2/3 rounded bg-line/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FigureFrame({ guide }: { guide: ReturnType<typeof pageGuideFor> }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-canvas">
      <div className="flex items-center gap-1.5 border-b border-line bg-surface px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-rose-400/60" />
        <span className="h-2 w-2 rounded-full bg-amber-400/60" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
        <span className="ms-2 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
          {translate(guide.eyebrow)} / {translate(guide.title)}
        </span>
        <span className="ms-auto inline-flex items-center gap-1 rounded border border-line bg-elevated px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.1em] text-muted">
          <Info size={9} /> {translate('Guide')}
        </span>
      </div>
      <div className="p-3 sm:p-4">
        <GuideFigure kind={guide.figure} />
      </div>
      <figcaption className="grid gap-2 border-t border-line bg-surface px-3 py-3 sm:grid-cols-3">
        {guide.legend.map((label, index) => (
          <span key={label} className="flex items-start gap-2 text-[10.5px] leading-4 text-muted">
            <Callout n={index + 1} className="mt-px" />
            <span className="min-w-0">{translate(label)}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  )
}

function BulletList({ items, numbered }: { items: string[]; numbered?: boolean }) {
  return (
    <ol className="mt-3 space-y-2.5">
      {items.map((item, index) => (
        <li key={item} className="flex items-start gap-2.5 text-[12px] leading-5 text-muted">
          <span className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
            numbered
              ? 'bg-accent-600 text-white'
              : 'border border-accent-200 bg-accent-50 text-accent-700 dark:border-accent-800/60 dark:bg-accent-900/30 dark:text-accent-200'
          }`}>
            {numbered ? index + 1 : <Check size={9} strokeWidth={3} />}
          </span>
          <span className="min-w-0">{translate(item)}</span>
        </li>
      ))}
    </ol>
  )
}

export function PageGuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation()
  const guide = pageGuideFor(pathname)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={translate(guide.title)}
      description={translate(guide.summary)}
      size="full"
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2 text-[10.5px] text-faint">
          <span className="inline-flex items-center gap-1.5"><Search size={11} /> {translate('Press Ctrl K to jump to a patient, page or action.')}</span>
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={11} /> {translate('Esc closes this guide.')}</span>
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{translate('Page guide')}</Badge>
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">{translate(guide.eyebrow)}</span>
          <span className="ms-auto inline-flex items-center gap-1.5 text-[10.5px] text-faint">
            <Sparkles size={11} /> {translate('What this page is for')}
          </span>
        </div>

        <FigureFrame guide={guide} />

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-accent-600" />
              <h3 className="text-[13px] font-semibold text-ink">{translate('What you can do here')}</h3>
            </div>
            <BulletList items={guide.canDo} />
          </section>
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-accent-600" />
              <h3 className="text-[13px] font-semibold text-ink">{translate('Typical workflow')}</h3>
            </div>
            <BulletList items={guide.steps} numbered />
          </section>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-900/15">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/40 dark:text-amber-200">
            <Lightbulb size={14} />
          </span>
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">{translate('Good to know')}</div>
            <p className="mt-1 text-[12px] leading-5 text-amber-900 dark:text-amber-100">{translate(guide.tip)}</p>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
