import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, BarChart3, Boxes, CalendarDays, CalendarPlus, ClipboardList, CornerDownLeft, Database,
  FolderOpen, HandCoins, LayoutDashboard, Palette, Pill, ReceiptText, Search, Settings2, Stethoscope,
  Tag, UserPlus, Users, Wallet, Wifi,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { age, cn, patientName, sexLabel } from '../lib/format'
import { translate } from '../lib/i18n'
import { useDebounced } from '../lib/hooks'
import { displayPhone } from '../lib/phone'
import type { Patient } from '../lib/types'
import { Avatar, Spinner } from './ui'

type Kind = 'action' | 'page' | 'patient'

interface Entry {
  key: string
  kind: Kind
  label: string
  hint?: string
  icon: React.ReactNode
  run: () => void
  meta?: string
}

const pages: { key: string; label: string; icon: React.ReactNode; to: string; ownerOnly?: boolean }[] = [
  { key: 'nav-dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} />, to: '/' },
  { key: 'nav-appointments', label: 'Appointments', icon: <CalendarDays size={14} />, to: '/appointments' },
  { key: 'nav-patients', label: 'Patients', icon: <Users size={14} />, to: '/patients' },
  { key: 'nav-visits', label: 'Visits', icon: <Stethoscope size={14} />, to: '/visits' },
  { key: 'nav-files', label: 'Files', icon: <FolderOpen size={14} />, to: '/files' },
  { key: 'nav-prescriptions', label: 'Prescriptions', icon: <Pill size={14} />, to: '/prescriptions' },
  { key: 'nav-treatment-plans', label: 'Treatment plans', icon: <ClipboardList size={14} />, to: '/treatment-plans' },
  { key: 'nav-billing', label: 'Billing', icon: <ReceiptText size={14} />, to: '/billing' },
  { key: 'nav-services', label: 'Services', icon: <Tag size={14} />, to: '/services' },
  { key: 'nav-expenses', label: 'Expenses', icon: <Wallet size={14} />, to: '/expenses' },
  { key: 'nav-payroll', label: 'Payroll', icon: <HandCoins size={14} />, to: '/payroll', ownerOnly: true },
  { key: 'nav-inventory', label: 'Inventory', icon: <Boxes size={14} />, to: '/inventory' },
  { key: 'nav-reports', label: 'Reports', icon: <BarChart3 size={14} />, to: '/reports' },
  { key: 'nav-settings', label: 'Clinic settings', icon: <Settings2 size={14} />, to: '/settings/clinic' },
  { key: 'nav-appearance', label: 'Appearance', icon: <Palette size={14} />, to: '/settings/appearance' },
  { key: 'nav-data', label: 'Data & backups', icon: <Database size={14} />, to: '/settings/data' },
  { key: 'nav-connectivity', label: 'Connectivity', icon: <Wifi size={14} />, to: '/settings/connectivity' },
]

const actions: { key: string; label: string; hint: string; icon: React.ReactNode; to: string }[] = [
  { key: 'new-patient', label: 'Register a patient', hint: 'New record', icon: <UserPlus size={14} />, to: '/patients?new=1' },
  { key: 'new-appointment', label: 'Book an appointment', hint: 'Calendar', icon: <CalendarPlus size={14} />, to: '/appointments?new=1' },
  { key: 'new-visit', label: 'Start a visit', hint: 'Encounter', icon: <Stethoscope size={14} />, to: '/visits?new=1' },
  { key: 'new-invoice', label: 'Create an invoice', hint: 'Billing', icon: <ReceiptText size={14} />, to: '/billing?new=1' },
  { key: 'new-document', label: 'Add a document', hint: 'Patient files', icon: <FolderOpen size={14} />, to: '/files?new=1' },
]

function Section({
  title, count, children,
}: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <div className="flex items-center gap-2 px-2.5 pb-1 pt-2">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">{translate(title)}</span>
        {count !== undefined && <span className="font-mono text-[9px] text-faint/80">{count}</span>}
        <span className="h-px flex-1 bg-line/70" />
      </div>
      {children}
    </div>
  )
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { clinic, currentStaff } = useApp()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const debounced = useDebounced(query, 160)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    window.setTimeout(() => inputRef.current?.focus(), 20)
  }, [open])

  const trimmed = query.trim()
  const mode: 'all' | 'actions' | 'patients' = trimmed.startsWith('>') ? 'actions' : trimmed.startsWith('@') ? 'patients' : 'all'
  const term = trimmed.replace(/^[>@]\s*/, '')

  const { data: patients = [], isFetching } = useQuery({
    queryKey: ['palette-patients', debounced],
    queryFn: () => api.patients(term, 'all', 8) as Promise<Patient[]>,
    enabled: open && mode !== 'actions' && term.length > 0,
  })

  const go = (to: string) => () => { onClose(); navigate(to) }

  const matchedPages = useMemo(() => {
    const q = term.toLowerCase()
    const visible = pages.filter((p) => !p.ownerOnly || currentStaff?.role === 'owner')
    if (!q) return visible.slice(0, 7)
    if (mode === 'patients') return []
    return visible.filter((p) => translate(p.label).toLowerCase().includes(q) || p.label.toLowerCase().includes(q)).slice(0, 5)
  }, [term, mode, currentStaff?.role])

  const matchedActions = useMemo(() => {
    const q = term.toLowerCase()
    if (!q) return actions
    if (mode === 'patients') return []
    return actions.filter((a) => translate(a.label).toLowerCase().includes(q) || a.label.toLowerCase().includes(q))
  }, [term, mode])

  const patientEntries = useMemo<Entry[]>(() => patients.map((p) => ({
    key: `patient-${p.id}`,
    kind: 'patient' as Kind,
    label: patientName(p) || translate('Unnamed patient'),
    meta: `${p.mrn} · ${age(p.date_of_birth)} · ${sexLabel(p.sex)}${p.phone ? ` · ${displayPhone(p.phone)}` : ''}`,
    icon: <Avatar name={patientName(p)} color={p.color} size={24} />,
    run: go(`/patients/${p.id}`),
  })), [patients])

  const pageEntries = useMemo<Entry[]>(() => matchedPages.map((p) => ({
    key: p.key, kind: 'page', label: p.label, icon: p.icon, run: go(p.to),
  })), [matchedPages])

  const actionEntries = useMemo<Entry[]>(() => matchedActions.map((a) => ({
    key: a.key, kind: 'action', label: a.label, hint: a.hint, icon: a.icon, run: go(a.to),
  })), [matchedActions])

  const flat = useMemo(() => [...actionEntries, ...pageEntries, ...patientEntries], [actionEntries, pageEntries, patientEntries])

  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(flat.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        flat[active]?.run()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, flat, active, onClose])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const indexOf = (key: string) => flat.findIndex((entry) => entry.key === key)
  const row = (entry: Entry, extra?: React.ReactNode) => {
    const idx = indexOf(entry.key)
    const selected = active === idx
    return (
      <button
        key={entry.key}
        data-index={idx}
        onMouseEnter={() => setActive(idx)}
        onClick={entry.run}
        role="option"
        aria-selected={selected}
        className={cn(
          'relative flex w-full items-center gap-2.5 rounded-[5px] px-2 py-[7px] text-start transition',
          selected ? 'bg-accent-50 text-accent-900 dark:bg-accent-900/25 dark:text-accent-50' : 'text-ink hover:bg-elevated',
        )}
      >
        {selected && <span aria-hidden className="absolute inset-y-1 start-0 w-[2px] rounded-full bg-accent-500" />}
        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center', entry.kind === 'patient' ? '' : selected ? 'text-accent-700 dark:text-accent-200' : 'text-faint')}>
          {entry.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[12px]', entry.kind === 'patient' ? 'font-semibold' : 'font-medium')}>{translate(entry.label)}</span>
          {entry.meta && <span className="mt-px block truncate font-mono text-[9px] text-faint">{entry.meta}</span>}
        </span>
        {extra}
        {entry.hint && <span className="shrink-0 text-[9.5px] text-faint">{translate(entry.hint)}</span>}
        <span className="shrink-0 rounded-[3px] border border-line px-1 py-px text-[8px] font-semibold uppercase tracking-[0.08em] text-faint">
          {translate(entry.kind === 'action' ? 'Action' : entry.kind === 'page' ? 'Page' : 'Patient')}
        </span>
        {selected && <CornerDownLeft size={12} className="shrink-0 text-faint" />}
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[#0b0f14]/45 px-4 pt-[9vh] backdrop-blur-[2px] animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-[620px] overflow-hidden rounded-xl border border-line bg-surface shadow-lift animate-slide-up"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={translate('Search and commands')}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
          <Search size={16} className="shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={translate('Search patients, or type > for actions…')}
            className="h-6 min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-faint"
            aria-label={translate('Search patients, or type > for actions…')}
          />
          {isFetching && <Spinner />}
          {mode !== 'all' && (
            <span className="rounded-[3px] border border-line bg-elevated px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
              {translate(mode === 'actions' ? 'Actions' : 'Patients')}
            </span>
          )}
          <kbd className="rounded-[3px] border border-line bg-elevated px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-faint">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[430px] overflow-y-auto p-1.5" role="listbox">
          {flat.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <div className="text-[12.5px] font-medium text-ink">{translate('No match for')} “{query.replace(/^[>@]\s*/, '')}”.</div>
              <div className="mt-1 text-[10.5px] text-faint">{translate('Try a name, phone number, MRN or a page name.')}</div>
            </div>
          ) : (
            <>
              {actionEntries.length > 0 && (
                <Section title={term ? 'Actions' : 'Quick actions'} count={actionEntries.length}>
                  {actionEntries.map((entry) => row(entry))}
                </Section>
              )}
              {pageEntries.length > 0 && mode !== 'actions' && (
                <Section title="Go to" count={pageEntries.length}>
                  {pageEntries.map((entry) => row(entry))}
                </Section>
              )}
              {patientEntries.length > 0 && (
                <Section title="Patients" count={patientEntries.length}>
                  {patientEntries.map((entry) => row(entry))}
                </Section>
              )}
              {!term && flat.length > 0 && (
                <div className="mt-1 flex items-center gap-2 rounded-[5px] border border-dashed border-line px-2.5 py-2 text-[10px] text-faint">
                  <ArrowRight size={11} className="shrink-0" />
                  <span>{translate('Type > to search actions, or @ for patients.')}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-elevated/50 px-3.5 py-1.5 text-[9.5px] text-faint">
          <span className="flex items-center gap-1"><kbd className="rounded-[2px] border border-line bg-surface px-1 font-mono">↑</kbd><kbd className="rounded-[2px] border border-line bg-surface px-1 font-mono">↓</kbd> {translate('navigate')}</span>
          <span className="flex items-center gap-1"><kbd className="rounded-[2px] border border-line bg-surface px-1 font-mono">↵</kbd> {translate('open')}</span>
          <span className="flex items-center gap-1"><kbd className="rounded-[2px] border border-line bg-surface px-1 font-mono">Esc</kbd> {translate('close')}</span>
          <span className="ms-auto truncate font-mono text-[9px] text-faint">
            {clinic?.name || translate('Aster Clinic')} · {currentStaff?.full_name || translate('Clinic team')}
          </span>
        </div>
      </div>
    </div>
  )
}
