import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight, Banknote, Boxes, CalendarDays, CalendarPlus, Check, ChevronRight, Clock3,
  FileText, FolderOpen, Plus, ReceiptText, Stethoscope, TrendingUp, UserPlus, Users, Wallet,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { formatBytes } from '../lib/files'
import {
  age, cn, dayBounds, fmtDate, fmtTime, formatNumber, fromNow, fullDay, greeting, money,
  patientName, sexLabel,
} from '../lib/format'
import type { Appointment, ClinicTask, DashboardData, Patient, PatientFile } from '../lib/types'
import { Avatar, Badge, Button, EmptyState, StatusBadge } from '../components/ui'
import { useToast } from '../components/Toast'
import { VisitDialog } from '../components/VisitDialog'
import { PatientDialog } from '../components/PatientDialog'
import { AppointmentDialog } from '../components/AppointmentDialog'
import { FileTypeTile } from '../components/PatientFileBits'

function StatCell({
  label, value, hint, icon, onClick, accent,
}: {
  label: string
  value: React.ReactNode
  hint: React.ReactNode
  icon: React.ReactNode
  onClick?: () => void
  accent?: React.ReactNode
}) {
  return (
    <button onClick={onClick} className="group relative bg-surface px-4 py-4 text-start transition hover:bg-elevated/60">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-faint">{label}</span>
        <span className="text-faint transition group-hover:text-accent-600">{icon}</span>
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="stat-value text-[29px] font-semibold leading-none text-ink">{value}</span>
        {accent}
      </div>
      <div className="mt-2.5 border-t border-line pt-2 text-[10.5px] leading-4 text-muted">{hint}</div>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] origin-left scale-x-0 bg-accent-600 transition-transform duration-300 group-hover:scale-x-100 rtl:origin-right" />
    </button>
  )
}

function ScheduleRow({
  appt, onCheckIn, onStart, onOpen,
}: {
  appt: Appointment
  onCheckIn: () => void
  onStart: () => void
  onOpen: () => void
}) {
  const isWaiting = ['arrived', 'waiting', 'in_progress'].includes(appt.status)
  const dot = isWaiting
    ? 'bg-amber-500'
    : appt.status === 'completed'
      ? 'bg-emerald-500'
      : appt.status === 'no_show'
        ? 'bg-rose-500'
        : 'bg-brand-300'
  return (
    <div className="group flex items-stretch gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-elevated/50">
      <div className="w-11 shrink-0 pt-0.5">
        <div className="font-mono text-[11px] font-medium tabular-nums text-ink">{fmtTime(appt.start_at)}</div>
        <div className="mt-0.5 truncate text-[8.5px] uppercase tracking-[0.08em] text-faint">{appt.room || 'No room'}</div>
      </div>

      <div className="relative flex w-3 shrink-0 justify-center">
        <span aria-hidden className="absolute inset-y-[-12px] w-px bg-line" />
        <span className={cn('relative mt-1 h-[7px] w-[7px] rounded-full ring-4 ring-surface', dot)} />
      </div>

      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-start">
        <Avatar name={`${appt.first_name ?? ''} ${appt.last_name ?? ''}`} size={29} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-ink">{appt.first_name} {appt.last_name}</span>
          <span className="block truncate text-[10px] text-muted">{appt.reason || 'Visit'} · {appt.provider_name}</span>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        <StatusBadge status={appt.status} />
        {['scheduled', 'confirmed'].includes(appt.status) && (
          <Button size="sm" variant="ghost" onClick={onCheckIn} title="Mark as arrived" className="opacity-0 transition group-hover:opacity-100">
            <Check size={12} /> Check in
          </Button>
        )}
        {isWaiting && (
          <Button size="sm" variant="subtle" onClick={onStart} className="opacity-0 transition group-hover:opacity-100">
            <Stethoscope size={11} /> See
          </Button>
        )}
      </div>
    </div>
  )
}

function LedgerHeader({ title, meta, action }: { title: string; meta?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-full bg-accent-600" />
        <h2 className="truncate text-[12.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {meta}
      </div>
      {action}
    </div>
  )
}

export function Dashboard() {
  const { currentStaff, clinic } = useApp()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const bounds = useMemo(() => dayBounds(), [])
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', bounds.start],
    queryFn: () => api.dashboard(bounds.start, bounds.end) as Promise<DashboardData>,
  })
  const { data: recentFiles = [] } = useQuery({
    queryKey: ['recent-files'],
    queryFn: () => api.recentPatientFiles(4) as Promise<PatientFile[]>,
  })
  const { data: filesOverview } = useQuery({
    queryKey: ['files-overview'],
    queryFn: () => api.filesOverview(),
  })
  const [visitAppt, setVisitAppt] = useState<Appointment | null>(null)
  const [apptOpen, setApptOpen] = useState(false)
  const [patientOpen, setPatientOpen] = useState(false)

  const firstName = (currentStaff?.full_name ?? '').replace(/^Dr\.?\s+/i, '') || 'there'
  const totals = data ?? ({} as DashboardData)
  const today = [...(data?.today ?? [])].sort((a, b) => a.start_at.localeCompare(b.start_at))
  const waiting = today.filter((a) => ['arrived', 'waiting', 'in_progress'].includes(a.status))
  const completed = today.filter((a) => a.status === 'completed').length
  const remaining = today.filter((a) => ['scheduled', 'confirmed'].includes(a.status)).length
  const progress = today.length ? Math.round((completed / today.length) * 100) : 0

  async function checkIn(appt: Appointment) {
    try {
      await api.setAppointmentStatus(appt.id, 'arrived')
      await qc.invalidateQueries()
      toast.success('Checked in', `${appt.first_name} ${appt.last_name} · ${fmtTime(appt.start_at)}`)
    } catch (e: any) {
      toast.error('Could not check in', String(e?.message ?? e))
    }
  }

  function openVisit(appt: Appointment) {
    if (appt.encounter_id) navigate(`/visits/${appt.encounter_id}`)
    else setVisitAppt(appt)
  }

  async function completeTask(task: ClinicTask) {
    try {
      await api.setTaskStatus(task.id, task.status === 'done' ? 'open' : 'done')
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      await qc.invalidateQueries({ queryKey: ['tasks'] })
    } catch (e: any) {
      toast.error('Could not update task', String(e?.message ?? e))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-5">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2.5">
            <span aria-hidden className="h-px w-5 bg-accent-600" />
            <span className="eyebrow">{fullDay()}</span>
          </div>
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.04em] text-ink">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-5 text-muted">
            {today.length
              ? `${remaining} appointment${remaining === 1 ? '' : 's'} still to come · ${waiting.length} ${waiting.length === 1 ? 'person' : 'people'} in the clinic right now.`
              : 'A clear day ahead. Register a walk-in or review the clinical work waiting for you.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setApptOpen(true)}><CalendarPlus size={14} /> Book appointment</Button>
          <Button variant="copper" onClick={() => setPatientOpen(true)}><UserPlus size={14} /> Register patient</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-3 xl:grid-cols-6">
        <StatCell
          label="Today’s appointments"
          value={formatNumber(totals.appointments_today ?? 0)}
          hint={`${completed} completed · ${waiting.length} waiting`}
          icon={<CalendarDays size={15} />}
          onClick={() => navigate('/appointments')}
        />
        <StatCell
          label="Waiting now"
          value={formatNumber(totals.waiting ?? 0)}
          hint={waiting.length ? `Longest wait ${waiting[0]?.checked_in_at ? fromNow(waiting[0].checked_in_at).replace(' ago', '') : 'just now'}` : 'The waiting room is clear'}
          icon={<Clock3 size={15} />}
          onClick={() => navigate('/appointments')}
        />
        <StatCell
          label="Collected this month"
          value={money(totals.month_revenue_cents, clinic?.currency_symbol)}
          hint={`${totals.new_patients_month ?? 0} new patient${(totals.new_patients_month ?? 0) === 1 ? '' : 's'} this month`}
          icon={<Banknote size={15} />}
          onClick={() => navigate('/billing')}
        />
        <StatCell
          label="Outstanding balances"
          value={money(totals.outstanding_cents, clinic?.currency_symbol)}
          hint={`${(totals.unpaid ?? []).length} invoice${(totals.unpaid ?? []).length === 1 ? '' : 's'} needing attention`}
          icon={<Wallet size={15} />}
          onClick={() => navigate('/billing?filter=open')}
        />
        <StatCell
          label="Net this month"
          value={money(Number(totals.month_revenue_cents ?? 0) - Number(totals.month_expenses_cents ?? 0), clinic?.currency_symbol)}
          hint={`${money(totals.month_expenses_cents, clinic?.currency_symbol)} expenses recorded`}
          icon={<TrendingUp size={15} />}
          onClick={() => navigate('/expenses')}
        />
        <StatCell
          label="Stock alerts"
          value={formatNumber(Number(totals.low_stock ?? 0) + Number(totals.out_of_stock ?? 0))}
          hint={`${Number(totals.out_of_stock ?? 0)} out of stock · ${money(totals.stock_value_cents, clinic?.currency_symbol)} on hand`}
          icon={<Boxes size={15} />}
          onClick={() => navigate('/inventory?filter=low')}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.58fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <LedgerHeader
            title="Today’s schedule"
            meta={<Badge tone="neutral">{today.length} booked</Badge>}
            action={(
              <button onClick={() => navigate('/appointments')} className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-accent-700 hover:text-accent-600 dark:text-accent-300">
                Calendar <ArrowRight size={12} className="rtl:rotate-180" />
              </button>
            )}
          />
          <div className="flex items-center gap-3 border-b border-line bg-elevated/40 px-4 py-2">
            <span className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-faint">Day progress</span>
            <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="font-mono text-[9.5px] tabular-nums text-muted">{completed}/{today.length}</span>
          </div>
          <div>
            {isLoading ? (
              <div className="divide-y divide-line">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-4">
                    <div className="h-3 w-10 rounded bg-elevated" />
                    <div className="h-7 w-7 rounded-full bg-elevated" />
                    <div className="flex-1 space-y-1.5"><div className="h-3 w-36 rounded bg-elevated" /><div className="h-2.5 w-52 rounded bg-elevated" /></div>
                  </div>
                ))}
              </div>
            ) : today.length === 0 ? (
              <EmptyState
                className="m-4 border-0"
                icon={<CalendarDays size={17} />}
                title="Nothing booked for today"
                description="A quiet calendar is a good moment to catch up on records or prepare tomorrow."
                action={<Button variant="subtle" size="sm" onClick={() => setApptOpen(true)}><Plus size={13} /> Book an appointment</Button>}
              />
            ) : today.map((a) => (
              <ScheduleRow
                key={a.id}
                appt={a}
                onCheckIn={() => checkIn(a)}
                onStart={() => openVisit(a)}
                onOpen={() => navigate(`/patients/${a.patient_id}`)}
              />
            ))}
          </div>
        </section>

        <div className="space-y-5">
          <section className="card overflow-hidden">
            <LedgerHeader
              title="In the clinic"
              meta={<Badge tone={waiting.length ? 'warning' : 'neutral'} dot>{waiting.length}</Badge>}
            />
            {waiting.length === 0 ? (
              <div className="px-4 py-7 text-center text-[11px] leading-5 text-faint">
                No one is waiting. Checked-in patients appear here.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {waiting.map((a, index) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-5 shrink-0 font-mono text-[9.5px] tabular-nums text-accent-600">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11.5px] font-semibold text-ink">{a.first_name} {a.last_name}</div>
                      <div className="mt-0.5 truncate text-[9.5px] text-muted">
                        {a.status === 'in_progress' ? 'In consultation' : `Waiting ${a.checked_in_at ? fromNow(a.checked_in_at).replace(' ago', '') : 'now'}`}
                        {' · '}{a.provider_name}
                      </div>
                    </div>
                    <Button size="sm" variant={a.status === 'in_progress' ? 'secondary' : 'subtle'} onClick={() => openVisit(a)}>
                      {a.status === 'in_progress' ? 'Open' : 'Start'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <LedgerHeader
              title="Follow-ups due"
              action={<FileText size={13} className="text-faint" />}
            />
            {(data?.followups ?? []).length === 0 ? (
              <div className="px-4 py-6 text-center text-[11px] text-faint">No follow-ups scheduled.</div>
            ) : (
              <div className="divide-y divide-line">
                {(data?.followups ?? []).slice(0, 5).map((f: any) => (
                  <button key={f.id} onClick={() => navigate(`/patients/${f.patient_id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-elevated/50">
                    <span className="w-10 shrink-0 border-e border-line pe-2 text-center">
                      <span className="block font-mono text-[13px] font-semibold leading-4 tabular-nums text-ink">{fmtDate(f.follow_up_on, 'd')}</span>
                      <span className="block text-[8px] font-semibold uppercase tracking-[0.08em] text-accent-700 dark:text-accent-300">{fmtDate(f.follow_up_on, 'MMM')}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-ink">{f.first_name} {f.last_name}</span>
                      <span className="block truncate text-[9.5px] text-faint">{f.provider_name}</span>
                    </span>
                    <ChevronRight size={12} className="text-faint rtl:rotate-180" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <LedgerHeader
              title="Tasks"
              meta={Number(data?.tasks_overdue ?? 0) > 0 ? <Badge tone="error">{data?.tasks_overdue} overdue</Badge> : <Badge tone="neutral">{data?.tasks_open ?? 0} open</Badge>}
              action={<button onClick={() => navigate('/tasks')} className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-accent-700 hover:text-accent-600 dark:text-accent-300">All tasks</button>}
            />
            {(data?.tasks ?? []).length === 0 ? (
              <div className="px-4 py-7 text-center text-[11px] leading-5 text-faint">
                Nothing outstanding. Add a task for anything that needs a follow-up.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {(data?.tasks ?? []).slice(0, 4).map((task: ClinicTask) => (
                  <div key={task.id} className="group flex items-start gap-2.5 px-4 py-2.5">
                    <button
                      onClick={() => completeTask(task)}
                      title="Mark complete"
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line-strong text-transparent transition hover:border-accent-500 hover:text-accent-600"
                    >
                      <Check size={9} strokeWidth={3} />
                    </button>
                    <button onClick={() => navigate('/tasks')} className="min-w-0 flex-1 text-start">
                      <span className="block truncate text-[11px] font-medium text-ink">{task.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-faint">
                        <span className={cn(
                          'block h-1.5 w-1.5 rounded-full',
                          task.priority === 'urgent' ? 'bg-rose-500' : task.priority === 'high' ? 'bg-amber-500' : 'bg-brand-300',
                        )} />
                        {task.due_on ? fmtDate(task.due_on, 'd MMM') : 'No date'}
                        {task.assignee_name ? ` · ${task.assignee_name}` : ''}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <LedgerHeader
              title="Recent documents"
              meta={<Badge tone={Number(filesOverview?.expiring ?? 0) > 0 ? 'warning' : 'neutral'}>{formatNumber(filesOverview?.documents ?? 0)}</Badge>}
              action={<button onClick={() => navigate('/files')} className="inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-accent-700 hover:text-accent-600 dark:text-accent-300">Files <FolderOpen size={11} /></button>}
            />
            {recentFiles.length === 0 ? (
              <button onClick={() => navigate('/files?new=1')} className="flex w-full flex-col items-center gap-1.5 px-4 py-7 text-center transition hover:bg-elevated/40">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-elevated text-accent-600"><FolderOpen size={14} /></span>
                <span className="text-[11px] font-medium text-ink">No patient documents yet</span>
                <span className="text-[10px] leading-4 text-faint">Upload lab results, scans and signed forms here.</span>
              </button>
            ) : recentFiles.map((file) => (
              <button
                key={file.id}
                onClick={() => navigate(`/patients/${file.patient_id}?tab=documents`)}
                className="flex w-full items-center gap-2.5 border-b border-line px-4 py-2.5 text-start last:border-0 transition hover:bg-elevated/50"
              >
                <FileTypeTile file={file} size={27} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium text-ink">{file.title}</span>
                  <span className="block truncate text-[9px] text-faint">
                    {patientName({ first_name: file.first_name, last_name: file.last_name, preferred_name: file.preferred_name })} · {fmtDate(file.created_at, 'd MMM')}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[9px] text-faint">{formatBytes(file.size_bytes)}</span>
              </button>
            ))}
          </section>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="card overflow-hidden">
          <LedgerHeader
            title="Open invoices"
            action={<button onClick={() => navigate('/billing?filter=open')} className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-accent-700 hover:text-accent-600 dark:text-accent-300">View all</button>}
          />
          {(data?.unpaid ?? []).length === 0 ? (
            <div className="px-4 py-7 text-center text-[11px] text-faint">Every invoice is settled.</div>
          ) : (data?.unpaid ?? []).map((inv: any) => {
            const balance = (inv.total_cents ?? 0) - (inv.paid_cents ?? 0)
            return (
              <button key={inv.id} onClick={() => navigate('/billing')} className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-start last:border-0 transition hover:bg-elevated/50">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-elevated text-faint"><ReceiptText size={12} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium text-ink">{inv.first_name} {inv.last_name}</span>
                  <span className="block truncate font-mono text-[9px] text-faint">{inv.number} · {fmtDate(inv.issued_at, 'd MMM')}</span>
                </span>
                <span className="text-[11.5px] font-semibold tabular-nums text-ink">{money(balance, clinic?.currency_symbol)}</span>
              </button>
            )
          })}
        </section>

        <section className="card overflow-hidden">
          <LedgerHeader
            title="Recently registered"
            action={<button onClick={() => navigate('/patients')} className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-accent-700 hover:text-accent-600 dark:text-accent-300">All patients</button>}
          />
          {(data?.recent_patients ?? []).length === 0 ? (
            <div className="px-4 py-7 text-center text-[11px] text-faint">No patients yet.</div>
          ) : (data?.recent_patients ?? []).map((p: Patient) => (
            <button key={p.id} onClick={() => navigate(`/patients/${p.id}`)} className="flex w-full items-center gap-2.5 border-b border-line px-4 py-2.5 text-start last:border-0 transition hover:bg-elevated/50">
              <Avatar name={patientName(p)} size={27} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-ink">{patientName(p)}</span>
                <span className="block truncate font-mono text-[9px] text-faint">{p.mrn} · {age(p.date_of_birth)} · {sexLabel(p.sex)}</span>
              </span>
              <span className="text-[9px] text-faint">{fromNow(p.created_at)}</span>
            </button>
          ))}
        </section>

        <section className="card overflow-hidden">
          <LedgerHeader
            title="Unfinished visits"
            action={<button onClick={() => navigate('/visits')} className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-accent-700 hover:text-accent-600 dark:text-accent-300">All visits</button>}
          />
          {(data?.draft_visits ?? []).length === 0 ? (
            <div className="px-4 py-7 text-center text-[11px] text-faint">No draft visits left open.</div>
          ) : (data?.draft_visits ?? []).map((v: any) => (
            <button key={v.id} onClick={() => navigate(`/visits/${v.id}`)} className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-start last:border-0 transition hover:bg-elevated/50">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/25 dark:text-amber-200"><Stethoscope size={12} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-ink">{v.first_name} {v.last_name}</span>
                <span className="block truncate text-[9px] text-faint">Started {fromNow(v.started_at)} · {v.mrn}</span>
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-accent-700 dark:text-accent-300">Resume</span>
            </button>
          ))}
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[9.5px] uppercase tracking-[0.1em] text-faint">
        <span className="inline-flex items-center gap-1.5"><Users size={11} /> {totals.new_patients_month ?? 0} new patient{(totals.new_patients_month ?? 0) === 1 ? '' : 's'} this month</span>
        <span>{clinic?.name} · {fullDay()}</span>
      </div>

      <VisitDialog open={Boolean(visitAppt)} onClose={() => setVisitAppt(null)} appointment={visitAppt} />
      <AppointmentDialog open={apptOpen} onClose={() => setApptOpen(false)} />
      <PatientDialog open={patientOpen} onClose={() => setPatientOpen(false)} onSaved={(p) => navigate(`/patients/${p.id}`)} />
    </div>
  )
}
