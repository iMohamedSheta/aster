import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Check, ChevronDown, AlertTriangle, Inbox } from 'lucide-react'
import { cn, initials, statusTone, titleCase } from '../lib/format'

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'copper'
type ButtonSize = 'sm' | 'md' | 'lg'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-900 text-white shadow-soft hover:bg-brand-800 active:bg-brand-950 border border-brand-950 dark:border-brand-200 dark:bg-brand-100 dark:text-brand-950 dark:hover:bg-white dark:active:bg-brand-200',
  copper: 'bg-accent-600 text-white shadow-soft hover:bg-accent-500 active:bg-accent-700 border border-accent-700',
  secondary: 'border border-line-strong bg-surface text-ink hover:border-brand-300 hover:bg-elevated active:bg-canvas',
  ghost: 'text-muted hover:bg-elevated hover:text-ink border border-transparent',
  danger: 'bg-berry-600 text-white hover:bg-berry-700 border border-berry-700',
  subtle: 'bg-brand-50 text-brand-800 hover:bg-brand-100 border border-brand-100 dark:bg-brand-900/30 dark:text-brand-200 dark:border-brand-800/60 dark:hover:bg-brand-900/50',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[12px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[12.5px] gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[13px] gap-2 rounded-lg',
}

export function Button({
  variant = 'secondary', size = 'md', loading, className, children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variants[variant], sizes[size], className,
      )}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

export function IconButton({
  label, className, children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-elevated hover:text-ink disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Badges & avatars                                                    */
/* ------------------------------------------------------------------ */

const tones: Record<string, string> = {
  neutral: 'bg-elevated text-muted border-line',
  info: 'bg-accent-50 text-accent-800 border-accent-200 dark:bg-accent-900/25 dark:text-accent-200 dark:border-accent-800/50',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/25 dark:text-emerald-200 dark:border-emerald-800/50',
  warning: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/25 dark:text-amber-200 dark:border-amber-800/50',
  error: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/25 dark:text-rose-200 dark:border-rose-800/50',
  brand: 'bg-brand-50 text-brand-800 border-brand-100 dark:bg-brand-900/30 dark:text-brand-200 dark:border-brand-800/50',
}

export function Badge({
  tone = 'neutral', dot, className, children,
}: { tone?: string; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('badge inline-flex items-center gap-1.5 rounded-[5px] border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase leading-4 tracking-[0.06em]', tones[tone] ?? tones.neutral, className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', tone === 'success' ? 'bg-emerald-500' : tone === 'warning' ? 'bg-amber-500' : tone === 'error' ? 'bg-rose-500' : tone === 'info' ? 'bg-accent-500' : 'bg-faint')} />}
      {children}
    </span>
  )
}

export function StatusBadge({ status, className }: { status?: string; className?: string }) {
  if (!status) return null
  return <Badge tone={statusTone(status)} dot className={className}>{titleCase(status)}</Badge>
}

const avatarColors = [
  '#2a3747', '#526379', '#a85833', '#7d5a78', '#c4506d', '#9c8455', '#6b5a45', '#2f6d9e',
]

export function Avatar({
  name, color, size = 36, className,
}: { name?: string; color?: string; size?: number; className?: string }) {
  const hue = (name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length
  const bg = color || avatarColors[hue]
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-inset ring-black/10', className)}
      style={{ width: size, height: size, background: bg, fontSize: Math.max(10, size * 0.34) }}
    >
      {initials(name ?? '')}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export function Field({
  label, hint, className, children,
}: { label?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('input', props.className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('textarea', props.className)} />
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn('select', props.className)}>{children}</select>
}

export function Checkbox({
  checked, onChange, label, description, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; description?: string; disabled?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 select-none', disabled && 'opacity-60')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition',
          checked ? 'border-brand-950 bg-brand-900 text-white' : 'border-line-strong bg-surface hover:border-accent-400',
        )}
      >
        {checked && <Check size={12} strokeWidth={3} />}
      </button>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[11.5px] leading-4 text-muted">{description}</span>}
      </span>
    </label>
  )
}

export function Toggle({
  checked, onChange, label, description,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[13px] font-medium text-ink">{label}</div>
        {description && <div className="mt-0.5 text-[11.5px] text-muted">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-10 shrink-0 rounded-full border transition-colors', checked ? 'border-brand-950 bg-brand-900' : 'border-line-strong bg-elevated')}
      >
        <span
          className={cn('absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform start-0.5', checked ? 'translate-x-[18px] rtl:-translate-x-[18px]' : 'translate-x-0')}
          style={{ width: 18, height: 18 }}
        />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open, onClose, title, description, children, footer, size = 'md', hideClose,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  hideClose?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const widths = {
    sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-[min(1180px,94vw)]',
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0b0f14]/55 p-4 pt-[7vh] backdrop-blur-[2px] animate-fade-in" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('relative w-full animate-slide-up rounded-xl border border-line bg-surface shadow-lift', widths[size])}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              {title && <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>}
              {description && <p className="mt-0.5 text-[12px] leading-5 text-muted">{description}</p>}
            </div>
            {!hideClose && (
              <IconButton label="Close" onClick={onClose} className="-me-1 -mt-1">
                <X size={17} />
              </IconButton>
            )}
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 rounded-b-xl border-t border-line bg-elevated/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

/**
 * A form or detail surface that slides in from the inline end of the
 * window. Sheets keep the list underneath visible, so people can move
 * between records without losing their place.
 */
export function Sheet({
  open, onClose, title, description, children, footer, size = 'md', hideClose,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  hideClose?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const widths = {
    sm: 'max-w-[420px]',
    md: 'max-w-[480px]',
    lg: 'max-w-[680px]',
    xl: 'max-w-[880px]',
    full: 'max-w-[min(1120px,94vw)]',
  }

  return createPortal(
    <div
      className="sheet-overlay fixed inset-0 z-50 flex justify-end bg-[#0b0f14]/45"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          'sheet-panel relative flex h-full w-full flex-col border-s border-line bg-surface shadow-lift',
          widths[size],
        )}
      >
        {(title || !hideClose) && (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="flex min-w-0 items-start gap-3">
              {title && <span aria-hidden className="mt-1 h-4 w-[3px] shrink-0 rounded-full bg-accent-600" />}
              <div className="min-w-0">
                {title && <h3 className="text-[17px] font-semibold leading-6 tracking-[-0.02em] text-ink">{title}</h3>}
                {description && <p className="mt-1 max-w-[62ch] text-[12px] leading-5 text-muted">{description}</p>}
              </div>
            </div>
            {!hideClose && (
              <IconButton label="Close" onClick={onClose} className="-me-1 -mt-1">
                <X size={17} />
              </IconButton>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>

        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-elevated/60 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', tone = 'primary', busy,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  tone?: 'primary' | 'danger'
  busy?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      )}
    >
      <div className="flex items-start gap-3 rounded-xl bg-elevated p-3.5 text-[12.5px] leading-5 text-muted">
        <AlertTriangle size={18} className={tone === 'danger' ? 'mt-0.5 text-rose-600' : 'mt-0.5 text-amber-600'} />
        <span>{description ?? 'This action changes clinical or financial records. Please review before continuing.'}</span>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Tabs, empty states, misc                                            */
/* ------------------------------------------------------------------ */

export function Tabs<T extends string>({
  value, onChange, tabs, className,
}: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => {
        const active = value === t.value
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative -mb-px inline-flex h-9 shrink-0 items-center gap-2 border-b-2 px-3 text-[12.5px] font-medium transition',
              active
                ? 'border-accent-600 text-ink'
                : 'border-transparent text-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('rounded-[4px] px-1.5 py-px text-[10px] tabular-nums', active ? 'bg-accent-50 text-accent-800 dark:bg-accent-900/30 dark:text-accent-200' : 'bg-elevated text-faint')}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function EmptyState({
  icon, title, description, action, className,
}: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-10 text-center', className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-line bg-elevated text-accent-700 dark:text-accent-300">
        {icon ?? <Inbox size={18} />}
      </div>
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      {description && <div className="mt-1 max-w-sm text-[11.5px] leading-5 text-muted">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-faint', className)} size={18} />
}

export function PageHeader({
  eyebrow, title, description, actions, className,
}: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-5', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 flex items-center gap-2.5">
            <span aria-hidden className="h-px w-5 bg-accent-600" />
            <span className="eyebrow">{eyebrow}</span>
          </div>
        )}
        <h1 className="text-[29px] font-semibold leading-[1.12] tracking-[-0.035em] text-ink">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[12.5px] leading-5 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionCard({
  title, subtitle, actions, children, className, bodyClassName,
}: { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {title && <span aria-hidden className="mt-[3px] h-3.5 w-[3px] shrink-0 rounded-full bg-accent-600" />}
            <div className="min-w-0">
              {title && <h2 className="text-[13px] font-semibold leading-5 tracking-[-0.01em] text-ink">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[11px] leading-4 text-muted">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function InlineStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className={cn('stat-value mt-1 text-[18px] font-semibold text-ink', tone)}>{value}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dropdown                                                            */
/* ------------------------------------------------------------------ */

export function Dropdown({
  trigger, children, align = 'right', side = 'bottom', className,
}: { trigger: React.ReactNode; children: React.ReactNode; align?: 'left' | 'right'; side?: 'top' | 'bottom'; className?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // The menu is portalled to the body: table wrappers scroll horizontally and
  // cards clip their overflow, which used to cut the menu off mid-row. Fixed
  // coordinates also let the menu flip above the trigger near the window edge.
  const place = React.useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const menu = menuRef.current
    const menuWidth = menu?.offsetWidth || 190
    const menuHeight = menu?.offsetHeight || 0
    const margin = 6
    const viewportW = document.documentElement.clientWidth
    const viewportH = document.documentElement.clientHeight
    const rtl = getComputedStyle(trigger).direction === 'rtl'
    const endAligned = align === 'right'
    let left = rtl
      ? (endAligned ? rect.left : rect.right - menuWidth)
      : (endAligned ? rect.right - menuWidth : rect.left)
    let top = side === 'top' ? rect.top - menuHeight - margin : rect.bottom + margin
    if (top < 8 && rect.bottom + margin + menuHeight <= viewportH - 8) {
      top = rect.bottom + margin
    } else if (top + menuHeight > viewportH - 8 && rect.top - margin - menuHeight >= 8) {
      top = rect.top - menuHeight - margin
    }
    left = Math.min(Math.max(8, left), Math.max(8, viewportW - menuWidth - 8))
    top = Math.min(Math.max(8, top), Math.max(8, viewportH - Math.min(menuHeight, viewportH - 16) - 8))
    setPos({ top, left, maxHeight: Math.max(160, viewportH - 16) })
  }, [align, side])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    place()
    const onMove = () => place()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div ref={triggerRef} onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && createPortal(
        <div
          ref={menuRef}
          onClick={() => setOpen(false)}
          style={pos
            ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight }
            : { top: 0, left: 0, visibility: 'hidden', maxHeight: 'calc(100vh - 16px)' }}
          className="fixed z-40 min-w-[190px] max-w-[calc(100vw-16px)] overflow-y-auto overflow-x-hidden rounded-lg border border-line bg-surface p-1 shadow-lift animate-fade-in"
        >
          {children}
        </div>,
        document.body,
      )}
    </div>
  )
}

export function MenuItem({
  icon, children, onClick, danger, disabled,
}: { icon?: React.ReactNode; children: React.ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start text-[12.5px] transition disabled:opacity-40',
        danger ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20' : 'text-ink hover:bg-elevated',
      )}
    >
      {icon && <span className="text-faint">{icon}</span>}
      {children}
    </button>
  )
}

export function Chevron({ className }: { className?: string }) {
  return <ChevronDown size={14} className={cn('text-faint', className)} />
}
