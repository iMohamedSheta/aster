import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle, CalendarClock, Check, CheckCircle2, CircleDashed, ClipboardList, Clock3,
  MapPin, Pencil, Plus, RefreshCw, UserRound,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { cn, fmtDate, fmtTime, isoLocal, patientName, plural } from '../lib/format'
import type { ClinicTask, Patient } from '../lib/types'
import {
  Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea,
} from '../components/ui'
import { PatientPicker } from '../components/PatientPicker'
import { useToast } from '../components/Toast'

type TaskFilter = 'open' | 'today' | 'overdue' | 'done' | 'all'

const categories = [
  ['clinical', 'Clinical follow-up'],
  ['follow_up', 'Patient follow-up'],
  ['admin', 'Administration'],
  ['billing', 'Billing'],
  ['inventory', 'Inventory'],
  ['referral', 'Referral'],
]

const priorities = [
  ['urgent', 'Urgent'],
  ['high', 'High'],
  ['normal', 'Normal'],
  ['low', 'Low'],
]

const priorityTone: Record<string, string> = {
  urgent: 'text-rose-700 dark:text-rose-300',
  high: 'text-amber-700 dark:text-amber-300',
  normal: 'text-muted',
  low: 'text-faint',
}

const priorityBadge: Record<string, 'error' | 'warning' | 'neutral' | 'info'> = {
  urgent: 'error',
  high: 'warning',
  normal: 'neutral',
  low: 'info',
}

function emptyTask() {
  return {
    title: '', notes: '', category: 'clinical', priority: 'normal', status: 'open',
    due_on: isoLocal(new Date()), assignee_id: '', patient_id: '',
  }
}

function dueMeta(task: ClinicTask) {
  if (!task.due_on) return { label: 'No date', tone: 'text-faint', overdue: false }
  const today = isoLocal(new Date())
  if (task.status === 'done') return { label: fmtDate(task.due_on, 'd MMM'), tone: 'text-faint', overdue: false }
  if (task.due_on < today) return { label: `Overdue · ${fmtDate(task.due_on, 'd MMM')}`, tone: 'text-rose-600 dark:text-rose-300', overdue: true }
  if (task.due_on === today) return { label: 'Due today', tone: 'text-amber-700 dark:text-amber-300', overdue: false }
  return { label: fmtDate(task.due_on, 'EEE d MMM'), tone: 'text-muted', overdue: false }
}

export function Tasks() {
  const { staff, locations, activeLocation, data } = useApp()
  const toast = useToast()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<TaskFilter>('open')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ClinicTask | null>(null)
  const [form, setForm] = useState<Record<string, any>>(emptyTask)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState('')

  const { data: tasks = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => api.tasks('all'),
  })

  const patientId = String(form.patient_id ?? '')
  const { data: initialPatient } = useQuery({
    queryKey: ['task-patient', patientId],
    queryFn: () => api.patient(patientId),
    enabled: open && Boolean(patientId) && !form._patientName,
  })

  const selectedPatient = useMemo<Patient | null>(() => {
    if (!patientId) return null
    if (form._patientName) return { id: patientId, first_name: form._patientName, last_name: '', mrn: form._patientMrn } as any
    return initialPatient?.patient ?? null
  }, [patientId, form._patientName, form._patientMrn, initialPatient])

  const today = isoLocal(new Date())
  const counts = useMemo(() => {
    const openTasks = tasks.filter((t) => ['open', 'in_progress'].includes(t.status))
    return {
      open: openTasks.length,
      today: openTasks.filter((t) => t.due_on === today).length,
      overdue: openTasks.filter((t) => t.due_on && t.due_on < today).length,
      done: tasks.filter((t) => t.status === 'done').length,
      all: tasks.length,
    }
  }, [tasks, today])

  const visible = useMemo(() => {
    if (filter === 'all') return tasks
    if (filter === 'done') return tasks.filter((t) => t.status === 'done')
    const openTasks = tasks.filter((t) => ['open', 'in_progress'].includes(t.status))
    if (filter === 'today') return openTasks.filter((t) => t.due_on === today)
    if (filter === 'overdue') return openTasks.filter((t) => t.due_on && t.due_on < today)
    return openTasks
  }, [tasks, filter, today])

  function startNew() {
    setEditing(null)
    setForm(emptyTask())
    setOpen(true)
  }

  function startEdit(task: ClinicTask) {
    setEditing(task)
    setForm({
      title: task.title, notes: task.notes ?? '', category: task.category || 'clinical',
      priority: task.priority || 'normal', status: task.status || 'open',
      due_on: task.due_on || '', assignee_id: task.assignee_id || '',
      patient_id: task.patient_id || '', _patientName: task.first_name || '', _patientMrn: task.mrn,
    })
    setOpen(true)
  }

  async function save() {
    if (!String(form.title ?? '').trim()) {
      toast.error('Task title required', 'Say what needs to be done.')
      return
    }
    setSaving(true)
    try {
      const payload = { ...form }
      delete payload._patientName
      delete payload._patientMrn
      if (editing) payload.id = editing.id
      await api.saveTask(payload)
      toast.success(editing ? 'Task updated' : 'Task created', form.title)
      setOpen(false)
      await qc.invalidateQueries({ queryKey: ['tasks'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (e: any) {
      toast.error('Could not save task', String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  async function toggle(task: ClinicTask) {
    setBusy(task.id)
    try {
      const next = task.status === 'done' ? 'open' : 'done'
      await api.setTaskStatus(task.id, next)
      await qc.invalidateQueries({ queryKey: ['tasks'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      if (next === 'done') toast.success('Task completed', task.title)
    } catch (e: any) {
      toast.error('Could not update task', String(e?.message ?? e))
    } finally {
      setBusy('')
    }
  }

  async function begin(task: ClinicTask) {
    setBusy(task.id)
    try {
      await api.setTaskStatus(task.id, 'in_progress')
      await qc.invalidateQueries({ queryKey: ['tasks'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (e: any) {
      toast.error('Could not start task', String(e?.message ?? e))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Clinical administration"
        title="Tasks"
        description="The small things that keep care moving: results to call back, notes to sign, stock to order. Tasks are shared across the clinic network."
        actions={(
          <>
            <Button onClick={() => refetch()} loading={isFetching && !isLoading}><RefreshCw size={14} /> Refresh</Button>
            <Button variant="copper" onClick={startNew}><Plus size={14} /> New task</Button>
          </>
        )}
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        {[
          { key: 'open', label: 'Open', value: counts.open, icon: <CircleDashed size={14} /> },
          { key: 'today', label: 'Due today', value: counts.today, icon: <CalendarClock size={14} /> },
          { key: 'overdue', label: 'Overdue', value: counts.overdue, icon: <AlertCircle size={14} /> },
          { key: 'done', label: 'Completed', value: counts.done, icon: <CheckCircle2 size={14} /> },
        ].map((stat) => (
          <button
            key={stat.key}
            onClick={() => setFilter(stat.key as TaskFilter)}
            className={cn('bg-surface px-4 py-3 text-start transition hover:bg-elevated/60', filter === stat.key && 'bg-elevated/70')}
          >
            <div className="flex items-center justify-between text-faint">
              <span className="text-[9px] font-semibold uppercase tracking-[0.13em]">{stat.label}</span>
              {stat.icon}
            </div>
            <div className={cn('mt-1.5 text-[22px] font-semibold leading-none tabular-nums', stat.key === 'overdue' && stat.value > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-ink')}>{stat.value}</div>
          </button>
        ))}
      </div>

      <Tabs
        value={filter}
        onChange={(v) => setFilter(v)}
        tabs={[
          { value: 'open', label: 'Open', count: counts.open },
          { value: 'today', label: 'Due today', count: counts.today },
          { value: 'overdue', label: 'Overdue', count: counts.overdue },
          { value: 'done', label: 'Completed', count: counts.done },
          { value: 'all', label: 'All', count: counts.all },
        ]}
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-elevated/40 px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
            {filter === 'open' ? 'Work still open' : filter === 'all' ? 'Every task' : `Tasks · ${filter}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-faint">
            <MapPin size={11} /> {activeLocation?.name ?? 'Clinic network'} · {visible.length} shown
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-elevated" />)}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            className="m-4 border-0"
            icon={<ClipboardList size={18} />}
            title={filter === 'done' ? 'No completed tasks yet' : 'Nothing on this list'}
            description={filter === 'open' ? 'Every open item is done. Add a task for anything that needs a follow-up.' : 'Try another filter, or add a task to get started.'}
            action={<Button variant="subtle" size="sm" onClick={startNew}><Plus size={13} /> New task</Button>}
          />
        ) : (
          <div className="divide-y divide-line">
            {visible.map((task) => {
              const due = dueMeta(task)
              const done = task.status === 'done'
              const location = locations.find((l) => l.id === task.location_id)
              return (
                <div key={task.id} className={cn('group flex items-start gap-3 px-4 py-3 transition hover:bg-elevated/40', done && 'opacity-70')}>
                  <button
                    onClick={() => toggle(task)}
                    disabled={busy === task.id}
                    title={done ? 'Reopen task' : 'Mark complete'}
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition',
                      done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-line-strong text-transparent hover:border-accent-500 hover:text-accent-600',
                    )}
                  >
                    <Check size={11} strokeWidth={3} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn('text-[12.5px] font-medium text-ink', done && 'line-through')}>{task.title}</span>
                      <Badge tone={priorityBadge[task.priority] ?? 'neutral'}>{task.priority}</Badge>
                      {task.status === 'in_progress' && <Badge tone="info">in progress</Badge>}
                      {location && location.id !== activeLocation?.id && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-[9px] font-medium text-muted">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: location.color || '#2a3747' }} /> {location.name}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
                      <span className={cn('inline-flex items-center gap-1 font-medium', due.tone)}><Clock3 size={11} /> {due.label}</span>
                      <span className="inline-flex items-center gap-1 text-muted">
                        <UserRound size={11} /> {task.assignee_name || 'Unassigned'}
                      </span>
                      {task.first_name && (
                        <span className="inline-flex items-center gap-1 text-muted">
                          <ClipboardList size={11} /> {task.first_name} {task.last_name} {task.mrn ? `· ${task.mrn}` : ''}
                        </span>
                      )}
                      <span className="text-faint">{categories.find(([v]) => v === task.category)?.[1] ?? task.category}</span>
                    </div>
                    {task.notes && <p className="mt-1.5 max-w-3xl text-[10.5px] leading-4 text-muted">{task.notes}</p>}
                  </div>

                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    {!done && task.status !== 'in_progress' && (
                      <Button size="sm" variant="ghost" onClick={() => begin(task)} loading={busy === task.id}>Start</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => startEdit(task)} title="Edit task"><Pencil size={12} /></Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.1em] text-faint">
        <ClipboardList size={11} /> {counts.open} open item{counts.open === 1 ? '' : 's'} · {counts.overdue} overdue · {plural(counts.done, 'task')} completed
      </p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit task' : 'New task'}
        description={editing ? 'Change what needs doing, who owns it and when it is due.' : 'Record a follow-up, an administrative job or a stock item.'}
        size="md"
        footer={(
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>{editing ? 'Save task' : 'Create task'}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Field label="What needs to happen?">
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Call about INR results" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                {priorities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Due">
              <Input type="date" value={form.due_on} onChange={(e) => setForm((f) => ({ ...f, due_on: e.target.value }))} />
            </Field>
            <Field label="Assigned to">
              <Select value={form.assignee_id} onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value }))}>
                <option value="">Unassigned</option>
                {staff.filter((s) => Number(s.active)).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </Field>
          </div>
          <Field label="Patient" hint="Optional — link the task to a patient record.">
            <PatientPicker
              value={form.patient_id}
              initial={selectedPatient}
              onChange={(id, patient) => setForm((f) => ({
                ...f,
                patient_id: id,
                _patientName: patient ? patientName(patient) : f._patientName,
                _patientMrn: patient?.mrn ?? f._patientMrn,
              }))}
            />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="min-h-[96px]" placeholder="Context, phone number, next step…" />
          </Field>
          <div className="rounded-lg border border-line bg-elevated/50 px-3 py-2.5 text-[10.5px] leading-4 text-muted">
            New tasks are attributed to <span className="font-medium text-ink">{activeLocation?.name ?? 'the active clinic'}</span> and travel with the workspace when synced.
            {editing?.created_by_name && <> Created by {editing.created_by_name}.</>}
          </div>
          {editing && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-faint">
              <span>Created {fmtDate(editing.created_at, 'd MMM yyyy')} at {fmtTime(editing.created_at)}</span>
              {editing.completed_at && <span>Completed {fmtDate(editing.completed_at, 'd MMM yyyy')}</span>}
              <span>Reference {editing.id.slice(0, 8)}</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
