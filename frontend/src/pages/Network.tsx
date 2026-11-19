import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, ArrowRight, Banknote, Building2, CalendarCheck2, MapPin, Plus, RefreshCw,
  ShieldAlert, Stethoscope, Users, Wallet,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { clinicPacks, clinicPack } from '../lib/clinicPacks'
import { cn, fmtDate, formatNumber, isoLocal, money, plural } from '../lib/format'
import { Sparkline } from '../components/charts'
import {
  Badge, Button, Field, Input, Modal, PageHeader, SectionCard, Select, Spinner, Textarea,
} from '../components/ui'
import { useToast } from '../components/Toast'
import type { ClinicLocation, NetworkOverview } from '../lib/types'

type RangePreset = '7d' | '30d' | 'month' | 'year'
type LocationForm = Record<string, any>

const emptyLocation: LocationForm = {
  name: '', code: '', type: 'family', specialty: '', phone: '', email: '',
  address_line1: '', address_line2: '', city: '', state: '', postal_code: '',
  country: '', timezone: '', opening_time: '09:00', closing_time: '17:00',
  slot_minutes: 30, rooms: 1, color: '#2a3747', active: 1, notes: '',
}

const toneClass: Record<string, string> = {
  warning: 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-100',
  info: 'border-sky-200 bg-sky-50/70 text-sky-900 dark:border-sky-800/60 dark:bg-sky-900/20 dark:text-sky-100',
  error: 'border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-800/60 dark:bg-rose-900/20 dark:text-rose-100',
  neutral: 'border-line bg-elevated/60 text-ink',
}

function rangeFor(preset: RangePreset) {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  switch (preset) {
    case '7d': return { start: new Date(end.getTime() - 7 * 86400000), end }
    case 'month': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end }
    case 'year': return { start: new Date(now.getFullYear(), 0, 1), end }
    default: return { start: new Date(end.getTime() - 30 * 86400000), end }
  }
}

function locationType(loc: ClinicLocation) {
  return clinicPack(loc.type)
}

export function Network() {
  const { data, locations: bootLocations, setBootstrap } = useApp()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [preset, setPreset] = useState<RangePreset>('30d')
  const [formOpen, setFormOpen] = useState(params.get('add') === '1')
  const [editing, setEditing] = useState<ClinicLocation | null>(null)
  const [form, setForm] = useState<LocationForm>(emptyLocation)
  const [saving, setSaving] = useState(false)
  const [switching, setSwitching] = useState('')

  const range = useMemo(() => rangeFor(preset), [preset])
  const startISO = range.start.toISOString()
  const endISO = range.end.toISOString()

  const { data: overview, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['network', startISO, endISO],
    queryFn: () => api.networkOverview(startISO, endISO),
  })

  useEffect(() => {
    if (params.get('add') === '1') {
      openAdd()
      setParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openAdd() {
    setEditing(null)
    setForm({ ...emptyLocation, country: data.clinic?.country ?? '', timezone: data.clinic?.timezone ?? '' })
    setFormOpen(true)
  }

  function openEdit(loc: ClinicLocation) {
    setEditing(loc)
    const next: LocationForm = { ...emptyLocation }
    for (const key of Object.keys(emptyLocation)) next[key] = loc[key] ?? emptyLocation[key]
    next.active = Number(loc.active) ? 1 : 0
    setForm(next)
    setFormOpen(true)
  }

  async function save() {
    if (!String(form.name ?? '').trim()) {
      toast.error('Clinic name required', 'Give the new clinic a name before saving.')
      return
    }
    setSaving(true)
    try {
      const payload: LocationForm = { ...form }
      if (editing) payload.id = editing.id
      payload.rooms = Number(payload.rooms || 1)
      payload.slot_minutes = Number(payload.slot_minutes || 30)
      payload.active = Number(payload.active ?? 1) ? 1 : 0
      await api.saveLocation(payload)
      toast.success(editing ? 'Clinic updated' : 'Clinic added', String(form.name))
      setFormOpen(false)
      await qc.invalidateQueries()
      const next = await api.bootstrap()
      setBootstrap(next)
    } catch (e: any) {
      toast.error('Could not save clinic', String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  async function openClinic(loc: ClinicLocation) {
    if (loc.id === data.activeLocationId) {
      navigate('/')
      return
    }
    setSwitching(loc.id)
    try {
      const next = await api.setActiveLocation(loc.id)
      setBootstrap(next)
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]) !== 'bootstrap' })
      toast.success('Working in ' + loc.name, 'The dashboard, schedule and billing now show this clinic.')
      navigate('/')
    } catch (e: any) {
      toast.error('Could not switch clinic', String(e?.message ?? e))
    } finally {
      setSwitching('')
    }
  }

  async function archive() {
    if (!editing) return
    if (!window.confirm(`Archive ${editing.name}? Its records stay available in reports.`)) return
    try {
      await api.archiveLocation(editing.id)
      toast.success('Clinic archived', editing.name)
      setFormOpen(false)
      await qc.invalidateQueries()
      setBootstrap(await api.bootstrap())
    } catch (e: any) {
      toast.error('Could not archive clinic', String(e?.message ?? e))
    }
  }

  const total = overview?.totals
  const activeCount = (overview?.locations ?? []).filter((l) => Number(l.active)).length
  const noShowRate = total && total.appointments > 0 ? Math.round((total.no_shows / total.appointments) * 100) : 0

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Network control"
        title="All clinics"
        description="One workspace, every location. Switch the clinic you are working in, compare performance and watch the numbers that need a manager's attention."
        actions={(
          <>
            <Button onClick={() => refetch()} loading={isFetching && !isLoading}><RefreshCw size={14} /> Refresh</Button>
            <Button variant="copper" onClick={openAdd}><Plus size={14} /> Add clinic</Button>
          </>
        )}
      />

      <div className="card flex flex-wrap items-center gap-2 p-2.5">
        {([
          ['7d', '7 days'], ['30d', '30 days'], ['month', 'This month'], ['year', 'This year'],
        ] as [RangePreset, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setPreset(value)}
            className={cn(
              'h-7 rounded-[7px] px-2.5 text-[11.5px] font-medium transition',
              preset === value ? 'bg-brand-700 text-white shadow-sm' : 'text-muted hover:bg-elevated hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
        <span className="text-[11px] text-faint">
          {fmtDate(startISO, 'd MMM yyyy')} – {fmtDate(new Date(endISO).toISOString(), 'd MMM yyyy')}
        </span>
        <span className="ms-auto inline-flex items-center gap-1.5 text-[10.5px] text-faint">
          <Building2 size={12} /> {activeCount} active clinic{activeCount === 1 ? '' : 's'} · figures sum the whole network
        </span>
      </div>

      {isLoading ? (
        <div className="flex h-56 items-center justify-center rounded-2xl border border-line bg-surface"><Spinner /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="card flex items-center gap-4 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><Banknote size={18} /></span>
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">Collected</div>
                <div className="mt-0.5 text-[22px] font-semibold tabular-nums leading-none text-ink">{money(total?.revenue_cents, data.clinic?.currency_symbol)}</div>
                <div className="mt-1 text-[10px] text-muted">{money(total?.invoiced_cents, data.clinic?.currency_symbol)} invoiced</div>
              </div>
            </div>
            <div className="card flex items-center gap-4 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200"><Stethoscope size={18} /></span>
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">Visits</div>
                <div className="mt-0.5 text-[22px] font-semibold tabular-nums leading-none text-ink">{formatNumber(total?.visits ?? 0)}</div>
                <div className="mt-1 text-[10px] text-muted">{total?.unique_patients ?? 0} people seen</div>
              </div>
            </div>
            <div className="card flex items-center gap-4 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200"><CalendarCheck2 size={18} /></span>
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">Appointments</div>
                <div className="mt-0.5 text-[22px] font-semibold tabular-nums leading-none text-ink">{formatNumber(total?.appointments ?? 0)}</div>
                <div className="mt-1 text-[10px] text-muted">{noShowRate}% no-show · {total?.completed ?? 0} completed</div>
              </div>
            </div>
            <div className="card flex items-center gap-4 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-900/25 dark:text-rose-200"><Wallet size={18} /></span>
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">Open balances</div>
                <div className="mt-0.5 text-[22px] font-semibold tabular-nums leading-none text-ink">{money(total?.outstanding_cents, data.clinic?.currency_symbol)}</div>
                <div className="mt-1 text-[10px] text-muted">{total?.new_patients ?? 0} new patients</div>
              </div>
            </div>
            <div className="card flex items-center gap-4 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200"><Banknote size={18} /></span>
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">Expenses</div>
                <div className="mt-0.5 text-[22px] font-semibold tabular-nums leading-none text-ink">{money(total?.expenses_cents, data.clinic?.currency_symbol)}</div>
                <div className="mt-1 text-[10px] text-muted">Network running costs</div>
              </div>
            </div>
            <div className="card flex items-center gap-4 p-4">
              <span className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl',
                Number(total?.net_cents ?? 0) >= 0
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-200'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-900/25 dark:text-rose-200',
              )}><Activity size={18} /></span>
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">Net after expenses</div>
                <div className="mt-0.5 text-[22px] font-semibold tabular-nums leading-none text-ink">{money(total?.net_cents, data.clinic?.currency_symbol)}</div>
                <div className="mt-1 text-[10px] text-muted">{money(overview?.inventory?.stock_value_cents, data.clinic?.currency_symbol)} stock on hand</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
            <div className="grid gap-4 md:grid-cols-2">
              {(overview?.locations ?? []).map((loc) => {
                const pack = locationType(loc as ClinicLocation)
                const revenue = Number(loc.revenue_cents ?? 0)
                const visits = Number(loc.visits ?? 0)
                const spark = ((loc.revenue_by_day as any[]) ?? []).map((d) => Number(d.cents ?? 0))
                const active = loc.id === data.activeLocationId
                return (
                  <section key={loc.id} className="card relative overflow-hidden">
                    <span aria-hidden className="absolute inset-y-0 start-0 w-[3px]" style={{ background: loc.color || pack.color }} />
                    <div className="flex items-start justify-between gap-3 border-b border-line px-4 pb-3 pt-3.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate text-[13.5px] font-semibold text-ink">{loc.name}</h2>
                          {active && <Badge tone="success">Working here</Badge>}
                          {!Number(loc.active) && <Badge tone="neutral">Archived</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-faint">
                          <span className="inline-flex items-center gap-1"><MapPin size={10} /> {[loc.city, loc.state].filter(Boolean).join(', ') || 'No address'}</span>
                          <span aria-hidden>·</span>
                          <span>{pack.label}</span>
                          {loc.specialty && <><span aria-hidden>·</span><span>{loc.specialty}</span></>}
                        </div>
                      </div>
                      <Sparkline values={spark.length ? spark : [0, 0]} color={loc.color || pack.color} width={78} height={28} />
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
                      {[
                        ['Collected', money(revenue, data.clinic?.currency_symbol)],
                        ['Net', money(Number(loc.net_cents ?? 0), data.clinic?.currency_symbol)],
                        ['Visits', String(visits)],
                      ].map(([label, value]) => (
                        <div key={label} className="px-3 py-2.5">
                          <div className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</div>
                          <div className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">{value}</div>
                        </div>
                      ))}
                    </div>
                    {(Number(loc.low_stock ?? 0) + Number(loc.out_of_stock ?? 0)) > 0 && (
                      <div className="flex items-center gap-1.5 border-b border-line bg-amber-50/60 px-3 py-1.5 text-[9.5px] font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                        <ShieldAlert size={11} />
                        {Number(loc.low_stock ?? 0) + Number(loc.out_of_stock ?? 0)} stock item{Number(loc.low_stock ?? 0) + Number(loc.out_of_stock ?? 0) === 1 ? '' : 's'} need replenishing
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 px-3 py-2">
                      <Button size="sm" variant={active ? 'secondary' : 'subtle'} onClick={() => openClinic(loc as ClinicLocation)} loading={switching === loc.id} disabled={!Number(loc.active)}>
                        {active ? 'Open dashboard' : 'Work here'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(loc as ClinicLocation)}>Manage</Button>
                      <span className="ms-auto text-[9.5px] text-faint">{loc.staff_count ?? 0} staff · {loc.rooms ?? 1} rooms</span>
                    </div>
                  </section>
                )
              })}
              <button
                onClick={openAdd}
                className="flex min-h-[176px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface/60 p-5 text-center transition hover:border-accent-400 hover:bg-elevated/40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-elevated text-accent-700 dark:text-accent-300"><Plus size={16} /></span>
                <span className="text-[12px] font-semibold text-ink">Add another clinic</span>
                <span className="max-w-[220px] text-[10.5px] leading-4 text-faint">New locations share the patient network, team and reports.</span>
              </button>
            </div>

            <div className="space-y-4">
              <SectionCard title="Needs attention" subtitle="Operational signals from the selected period" bodyClassName="p-0">
                {(overview?.alerts ?? []).length === 0 ? (
                  <div className="px-4 py-8 text-center text-[11.5px] leading-5 text-faint">Nothing urgent across the network. The clinics are collecting, signing and keeping their schedules.</div>
                ) : (
                  <div className="divide-y divide-line">
                    {(overview?.alerts ?? []).map((alert, i) => (
                      <div key={i} className={cn('border-s-2 px-4 py-3', toneClass[alert.tone] ?? toneClass.neutral)}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11.5px] font-semibold">{alert.title}</span>
                          <span className="shrink-0 text-[9px] uppercase tracking-[0.08em] opacity-70">{alert.location}</span>
                        </div>
                        <p className="mt-0.5 text-[10.5px] leading-4 opacity-80">{alert.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <div className="card p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><Activity size={15} /></span>
                  <div>
                    <div className="text-[12.5px] font-semibold text-ink">Network at a glance</div>
                    <div className="text-[10px] text-faint">{overview?.network_name}</div>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-[11.5px]">
                  {[
                    ['Clinics', String(overview?.locations?.length ?? 0)],
                    ['Unique patients', String(total?.unique_patients ?? 0)],
                    ['Returning patients', String(total?.returning_patients ?? 0)],
                    ['Unsigned visits', String(total?.unsigned_notes ?? 0)],
                    ['Expenses', money(total?.expenses_cents, data.clinic?.currency_symbol)],
                    ['Net after expenses', money(total?.net_cents, data.clinic?.currency_symbol)],
                    ['Stock on hand', money(overview?.inventory?.stock_value_cents, data.clinic?.currency_symbol)],
                    ['Stock alerts', String(Number(overview?.inventory?.low_stock ?? 0) + Number(overview?.inventory?.out_of_stock ?? 0))],
                    ['Average wait', `${total?.avg_wait_minutes ?? 0} min`],
                    ['Average visit', `${total?.avg_visit_minutes ?? 0} min`],
                    ['Prescriptions', String(total?.prescriptions ?? 0)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line/70 pb-1.5 last:border-0 last:pb-0">
                      <span className="text-muted">{label}</span>
                      <span className="font-semibold tabular-nums text-ink">{value}</span>
                    </div>
                  ))}
                </div>
                <Button className="mt-4 w-full justify-center" variant="subtle" onClick={() => navigate('/reports')}>
                  Open network reports <ArrowRight size={13} />
                </Button>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-accent-600" />
                <div>
                  <h2 className="text-[13px] font-semibold text-ink">Compare clinics</h2>
                  <p className="mt-0.5 text-[11px] text-muted">The same period, side by side. Click a row to work in that clinic.</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-faint"><ShieldAlert size={12} /> Manager view</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-[11.5px]">
                <thead>
                  <tr className="border-b border-line bg-elevated/50 text-[9px] uppercase tracking-[0.1em] text-faint">
                    <th className="px-4 py-2 text-start font-semibold">Clinic</th>
                    <th className="px-3 py-2 text-end font-semibold">Patients</th>
                    <th className="px-3 py-2 text-end font-semibold">Visits</th>
                    <th className="px-3 py-2 text-end font-semibold">Appointments</th>
                    <th className="px-3 py-2 text-end font-semibold">No-shows</th>
                    <th className="px-3 py-2 text-end font-semibold">Collected</th>
                    <th className="px-3 py-2 text-end font-semibold">Expenses</th>
                    <th className="px-3 py-2 text-end font-semibold">Net</th>
                    <th className="px-3 py-2 text-end font-semibold">Outstanding</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(overview?.locations ?? []).map((loc) => (
                    <tr key={loc.id} className="border-b border-line/70 last:border-0 hover:bg-elevated/40">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: loc.color || '#2a3747' }} />
                          <span className="font-medium text-ink">{loc.name}</span>
                          {loc.id === data.activeLocationId && <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-accent-600">active</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-muted">{loc.patient_count ?? 0}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-muted">{loc.visits ?? 0}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-muted">{loc.appointments ?? 0}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-muted">{loc.no_shows ?? 0}</td>
                      <td className="px-3 py-2.5 text-end font-medium tabular-nums text-ink">{money(loc.revenue_cents, data.clinic?.currency_symbol)}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-muted">{money(loc.expenses_cents, data.clinic?.currency_symbol)}</td>
                      <td className={cn('px-3 py-2.5 text-end font-medium tabular-nums', Number(loc.net_cents ?? 0) >= 0 ? 'text-ink' : 'text-rose-600 dark:text-rose-300')}>{money(loc.net_cents, data.clinic?.currency_symbol)}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-muted">{money(loc.outstanding_cents, data.clinic?.currency_symbol)}</td>
                      <td className="px-3 py-2.5 text-end">
                        <button onClick={() => openClinic(loc as ClinicLocation)} className="text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-700 hover:text-accent-600 dark:text-accent-300">
                          {loc.id === data.activeLocationId ? 'Open' : 'Switch'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Manage clinic' : 'Add a clinic'}
        description={editing ? 'Update the location, hours and clinic type.' : 'The new clinic joins this workspace and shares its reports.'}
        size="lg"
        footer={(
          <>
            {editing && (
              <Button variant="ghost" className="me-auto text-rose-600" onClick={archive}>Archive clinic</Button>
            )}
            <Button onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>{editing ? 'Save changes' : 'Add clinic'}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Clinic name" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Northside Dental Studio" autoFocus />
            </Field>
            <Field label="Clinic type">
              <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {clinicPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.label}</option>)}
              </Select>
            </Field>
            <Field label="Specialty" hint="Shown to the team and in reports.">
              <Input value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))} placeholder="General dentistry" />
            </Field>
            <Field label="Short code">
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="DENTAL" />
            </Field>
            <Field label="Rooms">
              <Input type="number" min={1} value={form.rooms} onChange={(e) => setForm((f) => ({ ...f, rooms: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Street address" className="sm:col-span-2">
              <Input value={form.address_line1} onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))} />
            </Field>
            <Field label="Address line 2" className="sm:col-span-2">
              <Input value={form.address_line2} onChange={(e) => setForm((f) => ({ ...f, address_line2: e.target.value }))} placeholder="Suite, floor, building" />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </Field>
            <Field label="State or region">
              <Input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
            </Field>
            <Field label="Postal code">
              <Input value={form.postal_code} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} />
            </Field>
            <Field label="Country">
              <Input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
            </Field>
            <Field label="Opens">
              <Input type="time" value={form.opening_time} onChange={(e) => setForm((f) => ({ ...f, opening_time: e.target.value }))} />
            </Field>
            <Field label="Closes">
              <Input type="time" value={form.closing_time} onChange={(e) => setForm((f) => ({ ...f, closing_time: e.target.value }))} />
            </Field>
            <Field label="Slot length" hint="Minutes per appointment.">
              <Input type="number" min={5} step={5} value={form.slot_minutes} onChange={(e) => setForm((f) => ({ ...f, slot_minutes: e.target.value }))} />
            </Field>
            <Field label="Colour" hint="Used in the network view and reports.">
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="h-8 w-10 cursor-pointer rounded border border-line bg-surface p-0.5" />
                <Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="font-mono text-[11px]" />
              </div>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="min-h-[70px]" placeholder="Access details, parking, shared equipment…" />
            </Field>
            <label className="flex items-center gap-2 text-[12px] text-muted sm:col-span-2">
              <input type="checkbox" checked={Number(form.active) === 1} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked ? 1 : 0 }))} className="h-4 w-4 rounded border-line" />
              Active clinic — available for booking, recording visits and reports
            </label>
          </div>
          <div className="rounded-lg border border-line bg-elevated/50 px-3 py-2.5 text-[10.5px] leading-4 text-muted">
            <span className="font-semibold text-ink">{clinicPack(form.type).label}:</span> {clinicPack(form.type).description}
          </div>
        </div>
      </Modal>
    </div>
  )
}
