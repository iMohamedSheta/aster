import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check, ChevronRight, ClipboardList, Loader2, Pencil, Plus, Search, Target, Trash2, UserRound,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { cn, fmtDate, formatNumber, money, patientName, titleCase } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import type { Patient, PatientDetailData, Service, Staff, TreatmentPlan, TreatmentPlanItem } from '../lib/types'
import {
  Avatar, Badge, Button, ConfirmDialog, EmptyState, Field, IconButton, Input, PageHeader,
  SectionCard, Select, Sheet, StatusBadge, Tabs, Textarea,
} from '../components/ui'
import { PatientPicker } from '../components/PatientPicker'
import { useToast } from '../components/Toast'

type Status = 'active' | 'draft' | 'completed' | 'all'

const emptyPlan = {
  patient_id: '', provider_id: '', title: '', status: 'active',
  started_on: new Date().toISOString().slice(0, 10), target_on: '', notes: '',
}

export function TreatmentPlans() {
  const { clinic, staff, locations, activeLocation } = useApp()
  const toast = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const patientFilter = params.get('patient') || ''
  const [status, setStatus] = useState<Status>('active')
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search, 200)
  const [selected, setSelected] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(params.get('new') === '1')
  const [planForm, setPlanForm] = useState(emptyPlan)
  const [editID, setEditID] = useState('')
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<TreatmentPlan | null>(null)
  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [itemSaving, setItemSaving] = useState(false)
  const [itemForm, setItemForm] = useState({
    service_id: '', name: '', tooth: '', phase: 'Treatment', quantity: '1', unit_price: '0', status: 'planned', notes: '',
  })

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['treatment-plans', patientFilter, status, activeLocation?.id],
    queryFn: () => api.treatmentPlans(patientFilter, status === 'all' ? '' : status),
  })
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['treatment-plan', selected],
    queryFn: () => api.treatmentPlan(selected as string),
    enabled: !!selected,
  })
  const { data: filterPatientData } = useQuery({
    queryKey: ['patient', 'plan-filter', patientFilter],
    queryFn: () => api.patient(patientFilter) as Promise<PatientDetailData>,
    enabled: Boolean(patientFilter),
  })
  const patient = filterPatientData?.patient as Patient | undefined
  const { data: pickerPatientData } = useQuery({
    queryKey: ['patient', 'plan-editor', planForm.patient_id],
    queryFn: () => api.patient(planForm.patient_id) as Promise<PatientDetailData>,
    enabled: planOpen && Boolean(planForm.patient_id),
  })
  const pickerPatient = pickerPatientData?.patient as Patient | undefined
  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.services(),
  })

  useEffect(() => {
    if (params.get('new') === '1') {
      setPlanOpen(true)
      setPlanForm({ ...emptyPlan, patient_id: patientFilter })
    }
  }, [params, patientFilter])

  const symbol = clinic?.currency_symbol
  const filtered = useMemo(() => {
    const term = debounced.trim().toLowerCase()
    return plans.filter((p) => {
      if (patientFilter && p.patient_id !== patientFilter) return false
      if (!term) return true
      return `${p.first_name ?? ''} ${p.last_name ?? ''} ${p.title} ${p.mrn ?? ''} ${p.provider_name ?? ''}`
        .toLowerCase().includes(term)
    })
  }, [plans, debounced, patientFilter])

  const totals = useMemo(() => {
    const total = plans.reduce((sum, p) => sum + Number(p.total_cents ?? 0), 0)
    const done = plans.reduce((sum, p) => sum + Number(p.completed_cents ?? 0), 0)
    return { total, done, active: plans.filter((p) => p.status === 'active').length }
  }, [plans])

  function closePlanEditor() {
    setPlanOpen(false)
    setEditID('')
    setPlanForm(emptyPlan)
    if (params.get('new') === '1') {
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }

  function openNewPlan() {
    setEditID('')
    setPlanForm({ ...emptyPlan, patient_id: patientFilter })
    setPlanOpen(true)
  }

  function openEditPlan(plan: TreatmentPlan) {
    setEditID(plan.id)
    setPlanForm({
      patient_id: plan.patient_id,
      provider_id: plan.provider_id || '',
      title: plan.title,
      status: plan.status,
      started_on: plan.started_on || '',
      target_on: plan.target_on || '',
      notes: plan.notes || '',
    })
    setPlanOpen(true)
  }

  async function savePlan() {
    if (!planForm.patient_id) return toast.error('Choose a patient', 'A treatment plan belongs to one patient.')
    if (!planForm.title.trim()) return toast.error('Name the plan', 'Use a short description such as Full-mouth restoration.')
    setSaving(true)
    try {
      const saved = await api.saveTreatmentPlan(editID ? { id: editID, ...planForm } : planForm)
      await qc.invalidateQueries({ queryKey: ['treatment-plans'] })
      await qc.invalidateQueries({ queryKey: ['treatment-plan', saved.id] })
      setSelected(saved.id)
      toast.success(editID ? 'Treatment plan updated' : 'Treatment plan created', saved.title)
      closePlanEditor()
    } catch (e: any) {
      toast.error('Could not save the plan', String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  async function archivePlan() {
    if (!archiveTarget) return
    try {
      await api.deleteEntity('treatment_plans', archiveTarget.id)
      await qc.invalidateQueries({ queryKey: ['treatment-plans'] })
      if (selected === archiveTarget.id) setSelected(null)
      toast.success('Treatment plan archived', archiveTarget.title)
      setArchiveTarget(null)
    } catch (e: any) {
      toast.error('Could not archive the plan', String(e?.message ?? e))
    }
  }

  async function toggleItem(item: TreatmentPlanItem) {
    try {
      await api.setTreatmentPlanItemStatus(item.id, item.status === 'completed' ? 'planned' : 'completed')
      await qc.invalidateQueries({ queryKey: ['treatment-plan', item.plan_id] })
      await qc.invalidateQueries({ queryKey: ['treatment-plans'] })
    } catch (e: any) {
      toast.error('Could not update the procedure', String(e?.message ?? e))
    }
  }

  async function removeItem(item: TreatmentPlanItem) {
    try {
      await api.deleteEntity('treatment_plan_items', item.id)
      await qc.invalidateQueries({ queryKey: ['treatment-plan', item.plan_id] })
      await qc.invalidateQueries({ queryKey: ['treatment-plans'] })
    } catch (e: any) {
      toast.error('Could not remove the procedure', String(e?.message ?? e))
    }
  }

  async function addItem() {
    if (!selected) return
    if (!itemForm.name.trim()) return toast.error('Name the procedure', 'Choose a service or type a procedure name.')
    setItemSaving(true)
    try {
      await api.saveTreatmentPlanItem({
        plan_id: selected, service_id: itemForm.service_id, name: itemForm.name,
        tooth: itemForm.tooth, phase: itemForm.phase, status: itemForm.status,
        quantity: Number(itemForm.quantity) || 1,
        unit_price_cents: Math.round((Number(itemForm.unit_price) || 0) * 100),
        notes: itemForm.notes,
      })
      await qc.invalidateQueries({ queryKey: ['treatment-plan', selected] })
      await qc.invalidateQueries({ queryKey: ['treatment-plans'] })
      setItemForm({ service_id: '', name: '', tooth: '', phase: 'Treatment', quantity: '1', unit_price: '0', status: 'planned', notes: '' })
      setItemFormOpen(false)
      toast.success('Procedure added')
    } catch (e: any) {
      toast.error('Could not add the procedure', String(e?.message ?? e))
    } finally {
      setItemSaving(false)
    }
  }

  function pickService(id: string) {
    const svc = (services as Service[]).find((s) => s.id === id)
    setItemForm((f) => ({
      ...f,
      service_id: id,
      name: svc?.name ?? f.name,
      unit_price: svc ? (Number(svc.price_cents) / 100).toFixed(2) : f.unit_price,
    }))
  }

  const plan = detail?.plan
  const items = detail?.items ?? []
  const planProgress = plan && Number(plan.item_count ?? 0) > 0
    ? Math.round((Number(plan.completed_count ?? 0) / Number(plan.item_count ?? 1)) * 100)
    : 0

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Care planning"
        title="Treatment plans"
        description="Staged procedures, expected value and progress for each patient — visible across the care team."
        actions={<Button variant="primary" onClick={openNewPlan}><Plus size={14} /> New plan</Button>}
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        <div className="bg-surface px-4 py-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Active plans</div>
          <div className="stat-value mt-1.5 text-[24px] font-semibold leading-none text-ink">{totals.active}</div>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Planned value</div>
          <div className="stat-value mt-1.5 text-[24px] font-semibold leading-none text-ink">{money(totals.total, symbol)}</div>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Completed value</div>
          <div className="stat-value mt-1.5 text-[24px] font-semibold leading-none text-ink">{money(totals.done, symbol)}</div>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Completion</div>
          <div className="stat-value mt-1.5 text-[24px] font-semibold leading-none text-ink">{totals.total ? Math.round((totals.done / totals.total) * 100) : 0}%</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { value: 'active', label: 'Active' },
            { value: 'draft', label: 'Draft' },
            { value: 'completed', label: 'Completed' },
            { value: 'all', label: 'All plans' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {patient && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elevated px-2.5 py-1 text-[10.5px] text-muted">
              <UserRound size={11} /> {patientName(patient)}
              <button onClick={() => { const next = new URLSearchParams(params); next.delete('patient'); setParams(next) }} className="ms-1 text-faint hover:text-ink">×</button>
            </span>
          )}
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plans" className="h-8 w-[210px] ps-8 text-[11.5px]" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl border border-line bg-surface" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={18} />}
          title="No treatment plans in view"
          description={patient ? 'Create the first plan for this patient, or widen the status filter.' : 'Start a plan when a patient agrees to a staged course of treatment.'}
          action={<Button variant="primary" onClick={openNewPlan}><Plus size={14} /> New plan</Button>}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((p) => {
            const count = Number(p.item_count ?? 0)
            const done = Number(p.completed_count ?? 0)
            const progress = count ? Math.round((done / count) * 100) : 0
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className="card group p-4 text-start transition hover:border-line-strong hover:bg-elevated/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Avatar name={`${p.first_name ?? ''} ${p.last_name ?? ''}`} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-ink">{p.title}</div>
                      <div className="truncate text-[10.5px] text-muted">{p.first_name} {p.last_name} · {p.mrn}</div>
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-[4px] flex-1 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="font-mono text-[9.5px] tabular-nums text-faint">{done}/{count}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-faint">
                  <span className="inline-flex items-center gap-1.5">
                    {locations.length > 1 && p.location_name && (
                      <><span className="h-1.5 w-1.5 rounded-full" style={{ background: p.location_color || '#2a3747' }} />{p.location_name} · </>
                    )}
                    {p.provider_name}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    {p.target_on && <span>Target {fmtDate(p.target_on, 'd MMM')}</span>}
                    <span className="font-semibold text-ink">{money(Number(p.total_cents ?? 0), symbol)}</span>
                    <ChevronRight size={12} className="text-faint transition group-hover:translate-x-0.5 rtl:rotate-180" />
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={detailLoading ? 'Loading plan…' : plan?.title || 'Treatment plan'}
        description={plan ? `${plan.first_name} ${plan.last_name} · ${plan.mrn}` : undefined}
        size="lg"
        footer={plan ? (
          <>
            <Button variant="ghost" onClick={() => setArchiveTarget(plan)}><Trash2 size={13} /> Archive</Button>
            <Button onClick={() => openEditPlan(plan)}><Pencil size={13} /> Edit plan</Button>
            <Button variant="primary" onClick={() => setItemFormOpen(true)}><Plus size={13} /> Add procedure</Button>
          </>
        ) : undefined}
      >
        {detailLoading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 size={20} className="animate-spin text-faint" /></div>
        ) : plan ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Status', titleCase(plan.status)],
                ['Progress', `${planProgress}%`],
                ['Plan value', money(Number(plan.total_cents ?? 0), symbol)],
                ['Target', plan.target_on ? fmtDate(plan.target_on, 'd MMM yyyy') : 'Open'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-elevated/50 px-3 py-2.5">
                  <div className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</div>
                  <div className="mt-1 truncate text-[12px] font-semibold text-ink">{value}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-[10px] text-faint">
                <span>{formatNumber(plan.completed_count)} of {formatNumber(plan.item_count)} procedures complete</span>
                <span>{money(Number(plan.completed_cents ?? 0), symbol)} completed</span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${planProgress}%` }} />
              </div>
            </div>

            <SectionCard title="Procedures" subtitle="Tick a procedure to mark it complete" bodyClassName="p-0">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-[11.5px] text-faint">No procedures yet. Add the first step of the plan.</div>
              ) : (
                <div>
                  {items.map((item) => (
                    <div key={item.id} className="group flex items-start gap-3 border-b border-line px-4 py-3 last:border-0">
                      <button
                        onClick={() => toggleItem(item)}
                        title={item.status === 'completed' ? 'Mark as planned' : 'Mark complete'}
                        className={cn(
                          'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition',
                          item.status === 'completed'
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-line-strong text-transparent hover:border-accent-500 hover:text-accent-600',
                        )}
                      >
                        <Check size={10} strokeWidth={3} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={cn('flex flex-wrap items-center gap-2 text-[12px] font-medium', item.status === 'completed' ? 'text-muted line-through' : 'text-ink')}>
                          {item.name}
                          {item.tooth && <span className="rounded border border-line px-1 py-px font-mono text-[9px] text-faint">Tooth {item.tooth}</span>}
                          {item.phase && <Badge tone="neutral">{item.phase}</Badge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-faint">
                          <span>{formatNumber(Number(item.quantity))} × {money(Number(item.unit_price_cents), symbol)}</span>
                          {item.completed_at && <span>· completed {fmtDate(item.completed_at, 'd MMM yyyy')}</span>}
                          {item.notes && <span>· {item.notes}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[11.5px] font-semibold tabular-nums text-ink">{money(Number(item.total_cents), symbol)}</span>
                        <IconButton label="Remove procedure" onClick={() => removeItem(item)} className="opacity-0 transition group-hover:opacity-100">
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {itemFormOpen && (
              <div className="rounded-xl border border-accent-200 bg-accent-50/50 p-3.5 dark:border-accent-800/50 dark:bg-accent-900/15">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[11.5px] font-semibold text-ink">Add a procedure</div>
                  <button onClick={() => setItemFormOpen(false)} className="text-[10.5px] text-faint hover:text-ink">Cancel</button>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Field label="Service catalogue" className="sm:col-span-2">
                    <Select value={itemForm.service_id} onChange={(e) => pickService(e.target.value)}>
                      <option value="">Custom procedure</option>
                      {(services as Service[]).map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.price_cents, symbol)}</option>)}
                    </Select>
                  </Field>
                  <Field label="Procedure" className="sm:col-span-2">
                    <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="e.g. Composite filling" />
                  </Field>
                  <Field label="Tooth / site"><Input value={itemForm.tooth} onChange={(e) => setItemForm({ ...itemForm, tooth: e.target.value })} placeholder="Optional" /></Field>
                  <Field label="Phase"><Input value={itemForm.phase} onChange={(e) => setItemForm({ ...itemForm, phase: e.target.value })} placeholder="Treatment" /></Field>
                  <Field label="Quantity"><Input type="number" min="1" step="1" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} /></Field>
                  <Field label={`Unit price (${clinic?.currency || 'USD'})`}><Input type="number" min="0" step="0.01" value={itemForm.unit_price} onChange={(e) => setItemForm({ ...itemForm, unit_price: e.target.value })} /></Field>
                  <Field label="Status">
                    <Select value={itemForm.status} onChange={(e) => setItemForm({ ...itemForm, status: e.target.value })}>
                      <option value="planned">Planned</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                    </Select>
                  </Field>
                  <Field label="Note"><Input value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} placeholder="Optional" /></Field>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="primary" loading={itemSaving} onClick={addItem}><Plus size={12} /> Add procedure</Button>
                </div>
              </div>
            )}

            {plan.notes && (
              <SectionCard title="Plan notes"><p className="prose-note text-[11.5px] leading-6 text-muted">{plan.notes}</p></SectionCard>
            )}
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={planOpen}
        onClose={closePlanEditor}
        title={editID ? 'Edit treatment plan' : 'New treatment plan'}
        description="Set the outcome, owner and target date. Procedures are added after the plan is saved."
        footer={(
          <>
            <Button onClick={closePlanEditor}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={savePlan}>{editID ? 'Save changes' : 'Create plan'}</Button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Patient" className="sm:col-span-2">
            <PatientPicker
              value={planForm.patient_id}
              initial={pickerPatient ?? null}
              disabled={!!editID}
              onChange={(id) => setPlanForm((current) => ({ ...current, patient_id: id }))}
            />
          </Field>
          <Field label="Plan name" className="sm:col-span-2">
            <Input value={planForm.title} onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })} placeholder="e.g. Full-mouth restoration" />
          </Field>
          <Field label="Lead clinician">
            <Select value={planForm.provider_id} onChange={(e) => setPlanForm({ ...planForm, provider_id: e.target.value })}>
              <option value="">Unassigned</option>
              {(staff as Staff[]).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={planForm.status} onChange={(e) => setPlanForm({ ...planForm, status: e.target.value })}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
          <Field label="Started"><Input type="date" value={planForm.started_on} onChange={(e) => setPlanForm({ ...planForm, started_on: e.target.value })} /></Field>
          <Field label="Target date"><Input type="date" value={planForm.target_on} onChange={(e) => setPlanForm({ ...planForm, target_on: e.target.value })} /></Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={4} value={planForm.notes} onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })} placeholder="Agreed outcomes, consent, sequencing…" />
          </Field>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-elevated/60 px-3 py-2.5 text-[10.5px] leading-4 text-faint">
          <Target size={14} className="mt-0.5 shrink-0 text-accent-600" />
          New plans are attributed to {activeLocation?.name ?? 'the active clinic'}. The plan travels with the patient across the network.
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={archivePlan}
        title="Archive treatment plan?"
        description={`${archiveTarget?.title ?? 'This plan'} will be removed from the active list. Its procedures stay in the database for reporting and audit.`}
        confirmLabel="Archive plan"
        tone="danger"
      />
    </div>
  )
}
