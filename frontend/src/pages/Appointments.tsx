import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDays, addMinutes, addMonths, differenceInMinutes, isSameDay, isSameMonth,
  parseISO, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns'
import {
  Ban, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock3, Columns3,
  LayoutGrid, List, Pencil, Plus, ReceiptText, Search, SearchX, Stethoscope,
  UserPlus, UserRound, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import {
  age, cn, fmtDate, fmtDateTime, fmtMoment, fmtTime, isoLocal, titleCase, weekRange,
} from '../lib/format'
import { isRTL, translate } from '../lib/i18n'
import { useInterval } from '../lib/hooks'
import { displayPhone } from '../lib/phone'
import type { Appointment } from '../lib/types'
import {
  Avatar, Badge, Button, EmptyState, IconButton, PageHeader, Select, Sheet, Spinner,
  StatusBadge,
} from '../components/ui'
import { useToast } from '../components/Toast'
import { AppointmentDialog } from '../components/AppointmentDialog'
import { VisitDialog } from '../components/VisitDialog'

const ROW_HEIGHT = 40
type View = 'day' | 'week' | 'month' | 'agenda'

const viewOptions: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'day', label: 'Day', icon: <CalendarDays size={11} /> },
  { id: 'week', label: 'Week', icon: <Columns3 size={11} /> },
  { id: 'month', label: 'Month', icon: <LayoutGrid size={11} /> },
  { id: 'agenda', label: 'Agenda', icon: <List size={11} /> },
]

function minutesOfDay(value: string) {
  const d = parseISO(value)
  return d.getHours() * 60 + d.getMinutes()
}

function parseClock(value?: string, fallback = 480) {
  if (!value) return fallback
  const [h, m] = value.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function clockLabel(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')}`
}

function isClosed(status: string) {
  return status === 'cancelled' || status === 'no_show'
}

function statusDot(status: string) {
  switch (status) {
    case 'completed': return 'bg-emerald-500'
    case 'in_progress': return 'bg-accent-500'
    case 'arrived':
    case 'waiting': return 'bg-amber-500'
    case 'cancelled':
    case 'no_show': return 'bg-rose-400'
    case 'confirmed': return 'bg-sky-500'
    default: return 'bg-faint'
  }
}

function matchesStatus(appointment: Appointment, filter: string) {
  if (filter === 'all') return true
  if (filter === 'expected') return appointment.status === 'scheduled' || appointment.status === 'confirmed'
  return appointment.status === filter
}

function matchesSearch(appointment: Appointment, term: string) {
  if (!term) return true
  const haystack = [
    appointment.first_name, appointment.last_name, appointment.mrn, appointment.phone,
    appointment.reason, appointment.provider_name, appointment.room, appointment.notes,
  ].join(' ').toLowerCase()
  return haystack.includes(term)
}

function RailStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-line bg-elevated/40 px-2 py-1.5">
      <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-faint">{translate(label)}</div>
      <div className={cn('mt-0.5 font-mono text-[15px] font-semibold leading-none tabular-nums', tone)}>{value}</div>
    </div>
  )
}

function RailSection({
  title, meta, action, children,
}: { title: string; meta?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5">
        <span className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-faint">{translate(title)}</span>
        {meta !== undefined && <span className="font-mono text-[8.5px] text-faint/80">{meta}</span>}
        <span className="h-px flex-1 bg-line/70" />
        {action}
      </header>
      {children}
    </section>
  )
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-0 items-center gap-1.5 rounded-[5px] border border-line bg-surface px-2 py-1.5 text-start text-[10px] font-medium text-muted transition hover:border-accent-200 hover:bg-elevated hover:text-ink"
    >
      <span className="shrink-0 text-faint">{icon}</span>
      <span className="truncate">{translate(label)}</span>
    </button>
  )
}

function CalendarLoading({ label }: { label: string }) {
  return (
    <div className="flex h-[360px] items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-[11px] text-faint"><Spinner /><span>{translate(label)}</span></div>
    </div>
  )
}

function AppointmentDetailModal({
  appointment, onClose, onEdit, onStartVisit, onChanged, onOpenPatient,
}: {
  appointment: Appointment | null
  onClose: () => void
  onEdit: () => void
  onStartVisit: () => void
  onChanged: () => void
  onOpenPatient: () => void
}) {
  const toast = useToast()

  async function mark(status: string) {
    if (!appointment) return
    try {
      await api.setAppointmentStatus(appointment.id, status)
      toast.success('Appointment updated', `${appointment.first_name} ${appointment.last_name} · ${translate(titleCase(status))}`)
      onChanged()
      onClose()
    } catch (e: any) {
      toast.error('Could not update appointment', String(e?.message ?? e))
    }
  }

  if (!appointment) return null
  const start = parseISO(appointment.start_at)
  const end = parseISO(appointment.end_at)
  const duration = differenceInMinutes(end, start)

  return (
    <Sheet
      open={Boolean(appointment)}
      onClose={onClose}
      title={`${appointment.first_name} ${appointment.last_name}`}
      description={`${fmtDateTime(appointment.start_at)} · ${duration} ${translate('minutes')}`}
      size="md"
      footer={(
        <>
          <Button variant="ghost" onClick={() => mark('no_show')}><Ban size={13} /> No show</Button>
          <Button variant="ghost" onClick={() => mark('cancelled')}><X size={13} /> Cancel</Button>
          <div className="flex-1" />
          <Button onClick={onEdit}><Pencil size={13} /> Reschedule</Button>
          {appointment.encounter_id
            ? <Button variant="primary" onClick={onStartVisit}><Stethoscope size={13} /> Open visit</Button>
            : <Button variant="primary" onClick={onStartVisit}><Stethoscope size={13} /> Start visit</Button>}
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-elevated/50 p-3">
          <Avatar name={`${appointment.first_name} ${appointment.last_name}`} size={40} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">{appointment.first_name} {appointment.last_name}</div>
            <div className="text-[10.5px] text-faint">{appointment.mrn} · {age(appointment.date_of_birth)}{appointment.phone ? ` · ${displayPhone(appointment.phone)}` : ''}</div>
            <button onClick={onOpenPatient} className="mt-1 text-[10.5px] font-medium text-brand-700 hover:underline dark:text-brand-300">Open patient record</button>
          </div>
          <StatusBadge status={appointment.status} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint"><Clock3 size={11} /> When</div>
            <div className="mt-1 text-[12px] font-medium text-ink">{fmtDate(appointment.start_at, 'EEEE d MMMM')}</div>
            <div className="text-[11px] text-muted">{fmtTime(appointment.start_at)} – {fmtTime(appointment.end_at)}</div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint"><UserRound size={11} /> Provider</div>
            <div className="mt-1 text-[12px] font-medium text-ink">{appointment.provider_name}</div>
            <div className="text-[11px] text-muted">{appointment.room || translate('No room assigned')}</div>
          </div>
        </div>
        {appointment.checked_in_at && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/15 dark:text-amber-200">
            <Clock3 size={12} /> {translate('Checked in')} {fmtTime(appointment.checked_in_at)}
          </div>
        )}
        <div>
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">Reason for visit</div>
          <div className="mt-1 text-[12.5px] leading-5 text-ink">{appointment.reason || translate('Not specified')}</div>
        </div>
        {appointment.notes && (
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">Scheduling notes</div>
            <div className="mt-1 rounded-lg bg-elevated px-3 py-2 text-[11.5px] leading-5 text-muted">{appointment.notes}</div>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {['scheduled', 'confirmed', 'arrived', 'waiting', 'in_progress', 'completed'].map((s) => (
            <button
              key={s}
              onClick={() => mark(s)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition',
                appointment.status === s
                  ? 'border-brand-300 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
                  : 'border-line text-muted hover:border-brand-200 hover:text-ink',
              )}
            >
              {translate(titleCase(s))}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}

export function Appointments() {
  const { staff, clinic } = useApp()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [anchor, setAnchor] = useState(new Date())
  const [view, setView] = useState<View>('week')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [providerID, setProviderID] = useState('')
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [defaultDate, setDefaultDate] = useState<Date | undefined>()
  const [defaultTime, setDefaultTime] = useState<string | undefined>()
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [visitAppt, setVisitAppt] = useState<Appointment | null>(null)
  const [now, setNow] = useState(new Date())
  const timelineRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  useInterval(() => setNow(new Date()), 60_000)

  const todayStart = startOfDay(now)
  const todayKey = isoLocal(todayStart)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const range = useMemo(() => {
    const base = startOfDay(anchor)
    if (view === 'day') return { start: base, end: addDays(base, 1) }
    if (view === 'week') {
      const start = startOfWeek(anchor, { weekStartsOn: 1 })
      return { start, end: addDays(start, 7) }
    }
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
      return { start, end: addDays(start, 42) }
    }
    return { start: base, end: addDays(base, 14) }
  }, [anchor, view])
  const rangeKey = isoLocal(range.start)

  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const days = useMemo(
    () => Array.from({ length: view === 'week' ? 7 : view === 'month' ? 42 : view === 'agenda' ? 14 : 1 }, (_, i) => addDays(range.start, i)),
    [range.start, view],
  )

  const { data: appointments = [], isLoading, isFetching } = useQuery({
    queryKey: ['appointments', view, range.start.toISOString(), range.end.toISOString(), providerID],
    queryFn: () => api.appointments(range.start.toISOString(), range.end.toISOString(), providerID) as Promise<Appointment[]>,
    placeholderData: keepPreviousData,
  })
  const { data: todayAppointments = [] } = useQuery({
    queryKey: ['appointments-today', todayKey],
    queryFn: () => api.appointments(todayStart.toISOString(), addDays(todayStart, 1).toISOString(), '') as Promise<Appointment[]>,
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(null)
      setDefaultDate(anchor)
      setDefaultTime(undefined)
      setDialogOpen(true)
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const sorted = useMemo(() => [...appointments].sort((a, b) => a.start_at.localeCompare(b.start_at)), [appointments])
  const term = search.trim().toLowerCase()
  const hasFilters = Boolean(term || statusFilter !== 'all' || providerID)
  const filtered = useMemo(
    () => sorted.filter((a) => matchesStatus(a, statusFilter) && matchesSearch(a, term)),
    [sorted, statusFilter, term],
  )
  const expectedCount = filtered.filter((a) => a.status === 'scheduled' || a.status === 'confirmed').length

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const day of days) map.set(isoLocal(day), [])
    for (const appt of filtered) {
      const key = isoLocal(parseISO(appt.start_at))
      if (map.has(key)) map.get(key)!.push(appt)
    }
    return map
  }, [days, filtered])

  const openStart = parseClock(clinic?.opening_time, 480)
  const closeEnd = parseClock(clinic?.closing_time, 1080)
  const slotMinutes = clinic?.slot_minutes || 30

  const bounds = useMemo(() => {
    let min = Math.min(openStart, 7 * 60)
    let max = Math.max(closeEnd, 19 * 60)
    for (const appt of appointments) {
      min = Math.min(min, Math.floor(minutesOfDay(appt.start_at) / 30) * 30)
      max = Math.max(max, Math.ceil(minutesOfDay(appt.end_at) / 30) * 30)
    }
    return { min, max }
  }, [appointments, openStart, closeEnd])

  const slots = useMemo(() => {
    const out: number[] = []
    for (let m = bounds.min; m < bounds.max; m += 30) out.push(m)
    return out
  }, [bounds])
  const calendarHeight = slots.length * ROW_HEIGHT
  const nowTop = ((nowMinutes - bounds.min) / 30) * ROW_HEIGHT
  const today = new Date()
  const periodIsCurrent = view === 'day'
    ? isSameDay(anchor, today)
    : view === 'week'
      ? isSameDay(range.start, startOfWeek(today, { weekStartsOn: 1 }))
      : view === 'month'
        ? isSameMonth(anchor, today)
        : isSameDay(anchor, today)

  const rangeTitle = view === 'day'
    ? fmtMoment(anchor, 'EEEE d MMMM yyyy')
    : view === 'week'
      ? weekRange(range.start)
      : view === 'month'
        ? fmtMoment(anchor, 'MMMM yyyy')
        : `${fmtMoment(range.start, 'd MMM')} – ${fmtMoment(addDays(range.end, -1), 'd MMM yyyy')}`
  const rangeSub = view === 'day'
    ? translate('Day')
    : view === 'week'
      ? periodIsCurrent ? translate('This week') : fmtMoment(weekStart, 'yyyy')
      : view === 'month'
        ? translate('Month')
        : translate('Next 14 days')

  const focusedDayList = byDay.get(isoLocal(range.start)) ?? []

  useEffect(() => {
    if (view !== 'day' && view !== 'week') return
    const el = timelineRef.current
    if (!el) return
    const withinHours = nowMinutes >= bounds.min && nowMinutes <= bounds.max
    const target = Math.max(bounds.min, withinHours ? nowMinutes - (view === 'day' ? 120 : 150) : openStart)
    el.scrollTop = ((target - bounds.min) / 30) * ROW_HEIGHT
  }, [view, rangeKey, bounds.min, bounds.max, isLoading, openStart])

  function openNew(day = anchor, time?: string) {
    setEditing(null)
    setDefaultDate(day)
    setDefaultTime(time)
    setDialogOpen(true)
  }

  function openEdit(appt: Appointment) {
    setSelected(null)
    setEditing(appt)
    setDialogOpen(true)
  }

  function startVisit(appt: Appointment) {
    setSelected(null)
    if (appt.encounter_id) navigate(`/visits/${appt.encounter_id}`)
    else setVisitAppt(appt)
  }

  function goDay(day: Date) {
    setAnchor(day)
    setView('day')
  }

  function goPeriod(direction: 1 | -1) {
    if (view === 'day') setAnchor(addDays(anchor, direction))
    else if (view === 'week') setAnchor(addDays(weekStart, direction * 7))
    else if (view === 'month') setAnchor(addMonths(anchor, direction))
    else setAnchor(addDays(anchor, direction * 14))
  }

  function goToday() {
    setAnchor(new Date())
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setProviderID('')
  }

  const prevLabel = view === 'day' ? 'Previous day' : view === 'week' ? 'Previous week' : view === 'month' ? 'Previous month' : 'Previous 14 days'
  const nextLabel = view === 'day' ? 'Next day' : view === 'week' ? 'Next week' : view === 'month' ? 'Next month' : 'Next 14 days'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (dialogOpen || selected || visitAppt) return
      if (e.key === 'n') {
        e.preventDefault()
        openNew()
      } else if (e.key === 't') {
        e.preventDefault()
        goToday()
      } else if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        setView(viewOptions[Number(e.key) - 1].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, selected, visitAppt, anchor])

  const activeDoctors = useMemo(
    () => staff.filter((s) => Number(s.active ?? 1) === 1 && (s.role === 'doctor' || s.role === 'owner')),
    [staff],
  )
  const todaySorted = useMemo(() => [...todayAppointments].sort((a, b) => a.start_at.localeCompare(b.start_at)), [todayAppointments])
  const activeToday = todaySorted.filter((a) => !isClosed(a.status))
  const waitingCount = activeToday.filter((a) => a.status === 'arrived' || a.status === 'waiting').length
  const inProgressCount = activeToday.filter((a) => a.status === 'in_progress').length
  const completedCount = activeToday.filter((a) => a.status === 'completed').length
  const noShowCount = todaySorted.filter((a) => a.status === 'no_show').length
  const remainingCount = activeToday.filter((a) => a.status !== 'completed' && parseISO(a.end_at) > now).length
  const capacity = Math.max(1, Math.round((closeEnd - openStart) / slotMinutes))
  const loadPct = Math.min(100, Math.round((activeToday.length / capacity) * 100))
  const featured = activeToday.find((a) => a.status === 'in_progress')
    ?? activeToday.find((a) => parseISO(a.start_at) >= now && a.status !== 'completed')
    ?? null
  const providerLoad = useMemo(
    () => activeDoctors
      .map((s) => ({ ...s, count: activeToday.filter((a) => a.provider_id === s.id).length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    [activeDoctors, activeToday],
  )
  const maxProviderLoad = Math.max(1, ...providerLoad.map((p) => p.count))

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Clinic calendar"
        title="Appointments"
        description={`${filtered.length} ${filtered.length === 1 ? 'appointment' : 'appointments'} · ${expectedCount} still expected`}
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate('/visits?new=1')}><Stethoscope size={14} /> Walk-in</Button>
            <Button variant="primary" onClick={() => openNew()}><CalendarPlus size={14} /> New appointment</Button>
          </>
        )}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_286px]">
        <div className="card min-w-0 overflow-hidden">
          {isFetching && <div className="h-[2px] animate-pulse bg-accent-500/70" />}

          <div className="border-b border-line">
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
              <div className="inline-flex items-center rounded-md border border-line bg-elevated p-0.5">
                {viewOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setView(option.id)}
                    title={translate(option.label)}
                    aria-pressed={view === option.id}
                    className={cn(
                      'inline-flex h-6 items-center gap-1 rounded-[4px] px-1.5 text-[10.5px] font-medium transition sm:px-2',
                      view === option.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                    )}
                  >
                    {option.icon}
                    <span className="hidden sm:inline">{translate(option.label)}</span>
                  </button>
                ))}
              </div>

              <span className="mx-0.5 hidden h-4 w-px bg-line sm:block" />
              <IconButton label={translate(prevLabel)} onClick={() => goPeriod(-1)} className="h-7 w-7">
                <ChevronLeft size={14} className="rtl:rotate-180" />
              </IconButton>
              <IconButton label={translate(nextLabel)} onClick={() => goPeriod(1)} className="h-7 w-7">
                <ChevronRight size={14} className="rtl:rotate-180" />
              </IconButton>
              <Button size="sm" variant={periodIsCurrent ? 'secondary' : 'subtle'} onClick={goToday} className="h-7 px-2 text-[10.5px]">
                {translate('Today')}
              </Button>

              <div className="ms-1 min-w-0">
                <div className="truncate text-[12.5px] font-semibold leading-4 tracking-[-0.01em] text-ink">{rangeTitle}</div>
                <div className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-faint">{rangeSub}</div>
              </div>

              <div className="ms-auto flex items-center gap-2">
                <span className="hidden items-center gap-1.5 md:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                  <span className="font-mono text-[9px] text-faint">{filtered.length} / {sorted.length}</span>
                </span>
                <span className="hidden items-center gap-1 text-[9px] text-faint lg:flex">
                  <kbd className="rounded-[2px] border border-line bg-elevated px-1 font-mono">T</kbd>
                  <span>{translate('Today')}</span>
                  <kbd className="ms-1 rounded-[2px] border border-line bg-elevated px-1 font-mono">N</kbd>
                  <span>{translate('New')}</span>
                  <kbd className="ms-1 rounded-[2px] border border-line bg-elevated px-1 font-mono">1–4</kbd>
                  <span>{translate('Views')}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-line/70 bg-elevated/30 px-3 py-1.5">
              <div className="relative">
                <Search size={12} className="pointer-events-none absolute start-2 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={translate('Search appointments…')}
                  aria-label={translate('Search appointments…')}
                  className="h-7 w-[196px] rounded-md border border-line bg-surface ps-7 pe-6 text-[11px] text-ink outline-none transition placeholder:text-faint focus:border-accent-400 focus:ring-2 focus:ring-accent-500/15"
                />
                {search && (
                  <button onClick={() => setSearch('')} aria-label={translate('Clear')} className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink">
                    <X size={11} />
                  </button>
                )}
              </div>

              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-7 w-auto min-w-[128px] py-0 text-[10.5px]">
                <option value="all">{translate('All statuses')}</option>
                <option value="expected">{translate('Expected')}</option>
                <option value="scheduled">{translate('Scheduled')}</option>
                <option value="confirmed">{translate('Confirmed')}</option>
                <option value="arrived">{translate('Arrived')}</option>
                <option value="waiting">{translate('Waiting')}</option>
                <option value="in_progress">{translate('In Progress')}</option>
                <option value="completed">{translate('Completed')}</option>
                <option value="cancelled">{translate('Cancelled')}</option>
                <option value="no_show">{translate('No Show')}</option>
              </Select>

              <Select value={providerID} onChange={(e) => setProviderID(e.target.value)} className="h-7 w-auto min-w-[150px] py-0 text-[10.5px]">
                <option value="">{translate('All clinicians')}</option>
                {activeDoctors.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </Select>

              <div className="ms-auto flex items-center gap-2">
                {hasFilters && (
                  <button onClick={clearFilters} className="text-[9.5px] font-medium text-accent-700 hover:underline dark:text-accent-300">
                    {translate('Clear filters')}
                  </button>
                )}
                <span className="hidden font-mono text-[9px] text-faint sm:inline">{filtered.length} {translate('shown')}</span>
              </div>
            </div>
          </div>

          {!isLoading && hasFilters && filtered.length === 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-amber-50/60 px-4 py-1.5 text-[10.5px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <SearchX size={12} />
              <span>{translate('No appointments match these filters.')}</span>
              <button onClick={clearFilters} className="ms-auto font-semibold underline underline-offset-2">{translate('Clear filters')}</button>
            </div>
          )}

          {view === 'week' && (
            isLoading ? <CalendarLoading label="Loading appointments…" /> : (
              <div ref={timelineRef} className="max-h-[600px] overflow-auto">
                <div className="w-full min-w-[900px]">
                  <div className="sticky top-0 z-30 grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-line bg-surface/95 backdrop-blur">
                    <div />
                    {days.map((day) => {
                      const count = byDay.get(isoLocal(day))?.length ?? 0
                      const isToday = isSameDay(day, today)
                      return (
                        <div
                          key={day.toISOString()}
                          className={cn('group flex items-center justify-between gap-1 border-s border-line px-1.5 py-1.5', isToday && 'bg-brand-50/60 dark:bg-brand-900/20')}
                        >
                          <button onClick={() => goDay(day)} className="flex min-w-0 items-center gap-1.5 rounded px-0.5 py-0.5 transition hover:bg-elevated">
                            <span className={cn('font-semibold', isRTL() ? 'text-[10px]' : 'text-[8.5px] uppercase tracking-[0.1em]', isToday ? 'text-brand-700 dark:text-brand-300' : 'text-faint')}>{fmtMoment(day, isRTL() ? 'EEEE' : 'EEE')}</span>
                            <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[11px] font-semibold tabular-nums', isToday ? 'bg-brand-900 text-white dark:bg-brand-100 dark:text-brand-950' : 'text-ink')}>
                              {fmtMoment(day, 'd')}
                            </span>
                            {count > 0 && <span className="font-mono text-[8.5px] text-faint">{count}</span>}
                          </button>
                          <button
                            onClick={() => openNew(day)}
                            title={translate('Book on this day')}
                            aria-label={`${translate('Book on this day')} · ${fmtMoment(day, 'EEEE d MMMM')}`}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint opacity-0 transition hover:bg-elevated hover:text-ink group-hover:opacity-100"
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
                    <div className="relative border-e border-line" style={{ height: calendarHeight }}>
                      {slots.map((m) => (
                        <div key={m} className="absolute end-0 w-full pe-2 text-end font-mono text-[8.5px] tabular-nums text-faint" style={{ top: ((m - bounds.min) / 30) * ROW_HEIGHT - 5 }}>
                          {m % 60 === 0 ? fmtMoment(addMinutes(range.start, m), 'h a') : ''}
                        </div>
                      ))}
                    </div>
                    {days.map((day, dayIndex) => {
                      const dayKey = isoLocal(day)
                      const list = byDay.get(dayKey) ?? []
                      const isToday = isSameDay(day, today)
                      const weekend = day.getDay() === 0 || day.getDay() === 6
                      return (
                        <div
                          key={dayKey}
                          className={cn('relative border-s border-line', isToday && 'bg-brand-50/25 dark:bg-brand-900/10', weekend && !isToday && 'bg-elevated/25')}
                          style={{ height: calendarHeight }}
                        >
                          {slots.map((m) => (
                            <button
                              key={m}
                              onClick={() => openNew(day, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)}
                              className="block w-full border-b border-line/60 transition hover:bg-brand-50/50 dark:hover:bg-brand-900/20"
                              style={{ height: ROW_HEIGHT }}
                              aria-label={`${translate('Book on this day')} · ${fmtMoment(day, 'EEEE')} ${clockLabel(m)}`}
                            />
                          ))}
                          {isToday && nowMinutes >= bounds.min && nowMinutes <= bounds.max && (
                            <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: nowTop }}>
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              <span className="h-px flex-1 bg-rose-400/70" />
                            </div>
                          )}
                          {list.map((appt) => {
                            const start = minutesOfDay(appt.start_at)
                            const end = minutesOfDay(appt.end_at)
                            const top = ((start - bounds.min) / 30) * ROW_HEIGHT + 1
                            const height = Math.max(20, ((end - start) / 30) * ROW_HEIGHT - 3)
                            const compact = height < 34
                            const roomy = height >= 52
                            return (
                              <button
                                key={appt.id}
                                onClick={(e) => { e.stopPropagation(); setSelected(appt) }}
                                className={cn(
                                  'absolute inset-x-1 z-10 overflow-hidden rounded-[4px] border-s-[3px] bg-surface px-1.5 py-[2px] text-start shadow-sm ring-1 ring-line transition hover:z-20 hover:shadow-lift',
                                  isClosed(appt.status) && 'opacity-50',
                                )}
                                style={{ top, height, borderInlineStartColor: appt.provider_color || '#2a3747' }}
                                title={`${fmtTime(appt.start_at)} · ${appt.first_name} ${appt.last_name} — ${appt.reason || translate('Visit')}`}
                              >
                                <div className="flex items-center gap-1">
                                  <span className="shrink-0 font-mono text-[8px] font-semibold tabular-nums text-faint">{fmtDate(appt.start_at, 'h:mm')}</span>
                                  <span dir="auto" className="truncate text-[10px] font-semibold leading-3 text-ink">{appt.first_name} {appt.last_name}</span>
                                  <span className={cn('ms-auto h-1.5 w-1.5 shrink-0 rounded-full', statusDot(appt.status))} />
                                </div>
                                {!compact && <div dir="auto" className="truncate ps-[22px] text-[8.5px] leading-3 text-muted">{appt.reason || translate('Visit')}</div>}
                                {roomy && <div dir="auto" className="mt-0.5 truncate ps-[22px] text-[8px] leading-3 text-faint">{appt.provider_name}{appt.room ? ` · ${appt.room}` : ''}</div>}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          )}

          {view === 'day' && (
            isLoading ? <CalendarLoading label="Loading appointments…" /> : (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-elevated/30 px-4 py-1.5 text-[9.5px] text-faint">
                  <span className="font-mono text-[10.5px] font-semibold text-ink">
                    {translate(`${focusedDayList.length} ${focusedDayList.length === 1 ? 'appointment' : 'appointments'}`)}
                  </span>
                  <span><b className="font-mono text-[10.5px] text-amber-700 dark:text-amber-300">{focusedDayList.filter((a) => a.status === 'arrived' || a.status === 'waiting').length}</b> {translate('Waiting')}</span>
                  <span><b className="font-mono text-[10.5px] text-ink">{focusedDayList.filter((a) => a.status === 'completed').length}</b> {translate('Completed')}</span>
                  <span className="ms-auto font-mono text-[9px]">
                    {fmtMoment(addMinutes(range.start, openStart), 'h:mm a')} – {fmtMoment(addMinutes(range.start, closeEnd), 'h:mm a')}
                  </span>
                </div>
                <div ref={timelineRef} className="max-h-[620px] overflow-y-auto">
                  <div className="grid w-full min-w-[640px] grid-cols-[64px_minmax(0,1fr)]">
                    <div className="relative border-e border-line" style={{ height: calendarHeight }}>
                      {slots.map((m) => (
                        <div key={m} className="absolute end-0 w-full pe-2 text-end font-mono text-[8.5px] tabular-nums text-faint" style={{ top: ((m - bounds.min) / 30) * ROW_HEIGHT - 5 }}>
                          {m % 60 === 0 ? fmtMoment(addMinutes(range.start, m), 'h a') : ''}
                        </div>
                      ))}
                    </div>
                    <div className="relative" style={{ height: calendarHeight }}>
                      {slots.map((m) => (
                        <button
                          key={m}
                          onClick={() => openNew(range.start, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)}
                          className="block w-full border-b border-line/60 transition hover:bg-brand-50/50 dark:hover:bg-brand-900/20"
                          style={{ height: ROW_HEIGHT }}
                          aria-label={`${translate('Book on this day')} · ${clockLabel(m)}`}
                        />
                      ))}
                      {isSameDay(range.start, today) && nowMinutes >= bounds.min && nowMinutes <= bounds.max && (
                        <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: nowTop }}>
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                          <span className="h-px flex-1 bg-rose-400/70" />
                        </div>
                      )}
                      {focusedDayList.map((appt) => {
                        const start = minutesOfDay(appt.start_at)
                        const end = minutesOfDay(appt.end_at)
                        const top = ((start - bounds.min) / 30) * ROW_HEIGHT + 1
                        const height = Math.max(32, ((end - start) / 30) * ROW_HEIGHT - 4)
                        const compact = height < 50
                        return (
                          <button
                            key={appt.id}
                            onClick={() => setSelected(appt)}
                            className={cn(
                              'absolute inset-x-2 z-10 overflow-hidden rounded-md border-s-[3px] bg-surface px-2 py-1 text-start shadow-sm ring-1 ring-line transition hover:z-20 hover:shadow-lift',
                              isClosed(appt.status) && 'opacity-50',
                            )}
                            style={{ top, height, borderInlineStartColor: appt.provider_color || '#2a3747' }}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="shrink-0 font-mono text-[9px] font-semibold tabular-nums text-faint">
                                {fmtDate(appt.start_at, 'h:mm')} – {fmtDate(appt.end_at, 'h:mm')}
                              </span>
                              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot(appt.status))} />
                              <span dir="auto" className="truncate text-[11px] font-semibold text-ink">{appt.first_name} {appt.last_name}</span>
                              <StatusBadge status={appt.status} className="ms-auto hidden sm:inline-flex" />
                            </div>
                            {!compact && (
                              <div className="mt-0.5 flex items-center gap-1 truncate text-[9.5px] text-muted">
                                <span dir="auto" className="truncate">{appt.reason || translate('Visit')}</span>
                                <span>·</span>
                                <span dir="auto" className="truncate">{appt.provider_name}</span>
                                {appt.room && <><span>·</span><span dir="auto" className="truncate">{appt.room}</span></>}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </>
            )
          )}

          {view === 'month' && (
            isLoading ? <CalendarLoading label="Loading appointments…" /> : (
              <div className="overflow-x-auto">
                <div className="w-full min-w-[840px]">
                  <div className="grid grid-cols-7 border-b border-line bg-elevated/40">
                    {days.slice(0, 7).map((day) => (
                      <div key={day.toISOString()} className={cn('border-s border-line/70 px-2 py-1.5 font-semibold text-faint first:border-s-0', isRTL() ? 'text-[10px]' : 'text-[8.5px] uppercase tracking-[0.1em]')}>
                        {fmtMoment(day, isRTL() ? 'EEEE' : 'EEE')}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {days.map((day) => {
                      const list = byDay.get(isoLocal(day)) ?? []
                      const isToday = isSameDay(day, today)
                      const inMonth = isSameMonth(day, anchor)
                      const weekend = day.getDay() === 0 || day.getDay() === 6
                      return (
                        <div
                          key={day.toISOString()}
                          onClick={() => goDay(day)}
                          className={cn(
                            'group relative min-h-[108px] cursor-pointer border-b border-s border-line/70 p-1.5 transition hover:bg-elevated/40',
                            !inMonth && 'bg-elevated/20',
                            weekend && inMonth && 'bg-elevated/15',
                            isToday && 'bg-brand-50/50 dark:bg-brand-900/15',
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); goDay(day) }}
                              className={cn(
                                'flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold tabular-nums transition',
                                isToday ? 'bg-brand-900 text-white dark:bg-brand-100 dark:text-brand-950' : inMonth ? 'text-ink hover:bg-elevated' : 'text-faint hover:bg-elevated',
                              )}
                            >
                              {fmtMoment(day, 'd')}
                            </button>
                            <span className="flex items-center gap-1">
                              {list.length > 0 && <span className="font-mono text-[8px] text-faint">{list.length}</span>}
                              <button
                                onClick={(e) => { e.stopPropagation(); openNew(day) }}
                                title={translate('Book on this day')}
                                aria-label={`${translate('Book on this day')} · ${fmtMoment(day, 'EEEE d MMMM')}`}
                                className="flex h-5 w-5 items-center justify-center rounded text-faint opacity-0 transition hover:bg-elevated hover:text-ink group-hover:opacity-100"
                              >
                                <Plus size={10} />
                              </button>
                            </span>
                          </div>
                          <div className="mt-1 space-y-[2px]">
                            {list.slice(0, 3).map((appt) => (
                              <button
                                key={appt.id}
                                onClick={(e) => { e.stopPropagation(); setSelected(appt) }}
                                className={cn(
                                  'flex w-full items-center gap-1 rounded-[3px] border-s-2 bg-surface px-1 py-[1px] text-start text-[8.5px] ring-1 ring-line/70 transition hover:bg-elevated',
                                  isClosed(appt.status) && 'opacity-50',
                                )}
                                style={{ borderInlineStartColor: appt.provider_color || '#2a3747' }}
                                title={`${fmtTime(appt.start_at)} · ${appt.first_name} ${appt.last_name} — ${appt.reason || translate('Visit')}`}
                              >
                                <span className="shrink-0 font-mono text-[8px] tabular-nums text-faint">{fmtDate(appt.start_at, 'h:mm')}</span>
                                <span dir="auto" className="truncate font-medium text-ink">{appt.first_name} {appt.last_name}</span>
                              </button>
                            ))}
                            {list.length > 3 && (
                              <div className="ps-1 font-mono text-[8px] text-faint">+{list.length - 3}</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          )}

          {view === 'agenda' && (
            isLoading ? <CalendarLoading label="Loading appointments…" /> : (
              <div className="max-h-[620px] overflow-y-auto overflow-x-hidden">
                {filtered.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      icon={<CalendarDays size={18} />}
                      title={translate('No appointments in this period')}
                      description={translate('Try another search or clear the filters.')}
                      action={<Button variant="primary" size="sm" onClick={() => openNew(range.start)}><CalendarPlus size={13} /> {translate('New appointment')}</Button>}
                    />
                  </div>
                ) : days.map((day) => {
                  const list = byDay.get(isoLocal(day)) ?? []
                  if (!list.length) return null
                  const isToday = isSameDay(day, today)
                  return (
                    <section key={isoLocal(day)}>
                      <div className={cn('sticky top-0 z-20 flex items-center gap-2 border-b border-line px-4 py-1.5 backdrop-blur', isToday ? 'bg-brand-50/90 dark:bg-brand-900/40' : 'bg-elevated/90')}>
                        <span className={cn('text-[11px] font-semibold', isToday ? 'text-brand-800 dark:text-brand-200' : 'text-ink')}>{fmtMoment(day, 'EEEE d MMMM')}</span>
                        {isToday && <Badge tone="brand">{translate('Today')}</Badge>}
                        <span className="ms-auto font-mono text-[9px] text-faint">{translate(`${list.length} ${list.length === 1 ? 'appointment' : 'appointments'}`)}</span>
                      </div>
                      {list.map((appt) => (
                        <button
                          key={appt.id}
                          onClick={() => setSelected(appt)}
                          className="flex w-full items-center gap-2.5 border-b border-line/70 px-4 py-2 text-start transition last:border-b-0 hover:bg-elevated/50"
                        >
                          <span className="w-[54px] shrink-0 font-mono text-[10px] font-semibold tabular-nums text-muted">{fmtDate(appt.start_at, 'h:mm')}</span>
                          <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: appt.provider_color || '#2a3747' }} />
                          <Avatar name={`${appt.first_name} ${appt.last_name}`} size={26} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span dir="auto" className="truncate text-[11.5px] font-semibold text-ink">{appt.first_name} {appt.last_name}</span>
                              <StatusBadge status={appt.status} />
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 truncate text-[9.5px] text-muted">
                              <span dir="auto" className="truncate">{appt.reason || translate('Visit')}</span>
                              <span>·</span>
                              <span dir="auto" className="truncate">{appt.provider_name}</span>
                              {appt.room && <><span>·</span><span dir="auto" className="truncate">{appt.room}</span></>}
                            </span>
                          </span>
                          <span className="hidden font-mono text-[9px] text-faint md:inline">{fmtTime(appt.start_at)} – {fmtTime(appt.end_at)}</span>
                          <ChevronRight size={12} className="shrink-0 text-faint rtl:rotate-180" />
                        </button>
                      ))}
                    </section>
                  )
                })}
              </div>
            )
          )}
        </div>

        <aside className="space-y-2 xl:sticky xl:top-4">
          <section className="card overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-line px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-faint">{translate('Clinic day')}</div>
                <div className="mt-0.5 truncate text-[12px] font-semibold text-ink">{fmtMoment(todayStart, 'EEEE d MMM')}</div>
              </div>
              <div className="text-end">
                <div className="font-mono text-[12px] font-semibold tabular-nums leading-4 text-ink">{fmtMoment(now, 'h:mm a')}</div>
                <div className="flex items-center justify-end gap-1 text-[8px] uppercase tracking-[0.1em] text-faint"><span className="h-1 w-1 rounded-full bg-accent-500" />{translate('Live')}</div>
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-faint">{translate('Load')}</span>
                <span className="font-mono text-[9.5px] text-muted">{activeToday.length} / {capacity}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
                <div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${loadPct}%` }} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <RailStat label="Waiting" value={waitingCount} tone="text-amber-700 dark:text-amber-300" />
                <RailStat label="In Progress" value={inProgressCount} tone="text-accent-700 dark:text-accent-300" />
                <RailStat label="Completed" value={completedCount} tone="text-emerald-700 dark:text-emerald-300" />
                <RailStat label="No-shows" value={noShowCount} tone="text-rose-700 dark:text-rose-300" />
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[9px] text-faint">
                <Clock3 size={10} />
                <span>{remainingCount > 0 ? `${remainingCount} ${translate('remaining')}` : translate('None left today')}</span>
              </div>
            </div>
          </section>

          <RailSection title="Next up" meta={featured ? fmtDate(featured.start_at, 'h:mm') : undefined}>
            {featured ? (
              <button onClick={() => setSelected(featured)} className="group flex w-full items-start gap-2.5 px-2.5 py-2 text-start transition hover:bg-elevated/50">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-elevated font-mono text-[9px] font-semibold text-ink">
                  {fmtDate(featured.start_at, 'h:mm')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span dir="auto" className="truncate text-[11px] font-semibold text-ink">{featured.first_name} {featured.last_name}</span>
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot(featured.status))} />
                  </span>
                  <span dir="auto" className="mt-0.5 block truncate text-[9.5px] text-muted">{featured.reason || translate('Visit')} · {featured.provider_name}</span>
                </span>
                <ChevronRight size={11} className="mt-1 shrink-0 text-faint transition group-hover:text-ink rtl:rotate-180" />
              </button>
            ) : (
              <div className="px-3 py-2.5">
                <div className="text-[10px] text-faint">{translate('No more appointments today')}</div>
                <button onClick={() => openNew(new Date())} className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-accent-700 hover:underline dark:text-accent-300">
                  <Plus size={10} /> {translate('Book')}
                </button>
              </div>
            )}
          </RailSection>

          <RailSection
            title="On duty"
            meta={activeDoctors.length}
            action={providerID ? (
              <button onClick={() => setProviderID('')} className="text-[8px] font-semibold uppercase tracking-[0.08em] text-accent-700 hover:underline dark:text-accent-300">
                {translate('All clinicians')}
              </button>
            ) : undefined}
          >
            <div className="p-1.5">
              {providerLoad.map((s) => {
                const active = providerID === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setProviderID(active ? '' : s.id)}
                    title={translate('Filter by clinician')}
                    className={cn('flex w-full items-center gap-2 rounded-[4px] px-1.5 py-1 text-start transition hover:bg-elevated', active && 'bg-accent-50 dark:bg-accent-900/20')}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color || '#8a6a4a' }} />
                    <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-ink">{s.full_name}</span>
                    <span className="hidden h-1 w-9 overflow-hidden rounded-full bg-elevated sm:block">
                      <span className="block h-full rounded-full bg-accent-500/70" style={{ width: `${(s.count / maxProviderLoad) * 100}%` }} />
                    </span>
                    <span className="w-4 text-end font-mono text-[8.5px] tabular-nums text-faint">{s.count}</span>
                  </button>
                )
              })}
              {providerLoad.length === 0 && <div className="px-1.5 py-1 text-[10px] text-faint">{translate('No clinicians yet')}</div>}
            </div>
          </RailSection>

          <RailSection title="Quick actions">
            <div className="grid grid-cols-2 gap-1.5 p-2">
              <QuickAction icon={<CalendarPlus size={12} />} label="Book" onClick={() => openNew(new Date())} />
              <QuickAction icon={<UserPlus size={12} />} label="Register patient" onClick={() => navigate('/patients?new=1')} />
              <QuickAction icon={<Stethoscope size={12} />} label="Walk-in" onClick={() => navigate('/visits?new=1')} />
              <QuickAction icon={<ReceiptText size={12} />} label="New invoice" onClick={() => navigate('/billing?new=1')} />
            </div>
          </RailSection>

          <div className="flex items-center justify-center gap-1.5 px-1 text-[9px] text-faint">
            <kbd className="rounded border border-line bg-elevated px-1 font-mono text-[8px]">Ctrl K</kbd>
            <span>{translate('Search and commands')}</span>
          </div>
        </aside>
      </div>

      <AppointmentDetailModal
        appointment={selected}
        onClose={() => setSelected(null)}
        onEdit={() => selected && openEdit(selected)}
        onStartVisit={() => selected && startVisit(selected)}
        onChanged={() => qc.invalidateQueries()}
        onOpenPatient={() => { if (selected) { const pid = selected.patient_id; setSelected(null); navigate(`/patients/${pid}`) } }}
      />

      <AppointmentDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        appointment={editing}
        defaultDate={defaultDate}
        defaultTime={defaultTime}
      />
      <VisitDialog open={Boolean(visitAppt)} onClose={() => setVisitAppt(null)} appointment={visitAppt} />
    </div>
  )
}
