import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, ArrowLeft, CalendarDays, CalendarPlus, ChevronRight,
  ClipboardList, HeartPulse, Mail, MapPin, MessageCircle, MoreHorizontal, Pencil, Phone, Pill,
  Plus, ReceiptText, Stethoscope, Thermometer, UserRound, Weight, Wind,
  Droplets, ShieldCheck, Archive, FileText, FolderOpen,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import {
  age, bmi, cn, fmtDate, fmtDateTime, fmtTime, fromNow, money, patientName, sexLabel,
  statusTone,
} from '../lib/format'
import { translate } from '../lib/i18n'
import {
  displayPhone, resolveDefaultCountry, telHref, whatsappGreeting, whatsappHref,
} from '../lib/phone'
import type { Patient, PatientDetailData, TreatmentPlan } from '../lib/types'
import {
  Avatar, Badge, Button, ConfirmDialog, Dropdown, EmptyState, IconButton, InlineStat,
  MenuItem, PageHeader, SectionCard, StatusBadge, Tabs,
} from '../components/ui'
import { Sparkline } from '../components/charts'
import { useToast } from '../components/Toast'
import { PatientDialog } from '../components/PatientDialog'
import { AppointmentDialog } from '../components/AppointmentDialog'
import { VisitDialog } from '../components/VisitDialog'
import { PrescriptionDialog } from '../components/PrescriptionDialog'
import { InvoiceDialog } from '../components/BillingDialogs'
import { AllergyDialog, ConditionDialog } from '../components/ClinicalDialogs'
import { PrescriptionDetailModal } from '../components/PrescriptionDetailModal'
import { InvoiceDetailModal } from '../components/InvoiceDetailModal'
import { PatientFilesPanel } from '../components/PatientFilesPanel'

type TabValue = 'overview' | 'visits' | 'prescriptions' | 'plans' | 'billing' | 'appointments' | 'documents'

const TAB_VALUES: TabValue[] = ['overview', 'visits', 'prescriptions', 'plans', 'billing', 'appointments', 'documents']

function Vital({ label, value, unit, icon }: { label: string; value: React.ReactNode; unit?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-elevated/70 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.07em] text-faint">
        {icon}{label}
      </div>
      <div className="mt-1 text-[14px] font-semibold tabular-nums leading-none text-ink">
        {value ?? '—'}{unit && value ? <span className="ms-1 text-[9.5px] font-normal text-faint">{unit}</span> : null}
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 py-1.5">
      <span className="mt-0.5 text-faint">{icon}</span>
      <div className="min-w-0">
        <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</div>
        <div className="text-[11.5px] leading-4 text-ink">{value || '—'}</div>
      </div>
    </div>
  )
}

export function PatientDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { clinic, locations, activeLocation } = useApp()
  const defaultCountry = resolveDefaultCountry(clinic, activeLocation)
  const toast = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabValue>(() => {
    const requested = (searchParams.get('tab') ?? '') as TabValue
    return TAB_VALUES.includes(requested) ? requested : 'overview'
  })
  const requestedTab = searchParams.get('tab')
  useEffect(() => {
    const next = (requestedTab ?? '') as TabValue
    setTab(TAB_VALUES.includes(next) ? next : 'overview')
  }, [id, requestedTab])
  const [editOpen, setEditOpen] = useState(false)
  const [apptOpen, setApptOpen] = useState(false)
  const [visitOpen, setVisitOpen] = useState(false)
  const [rxOpen, setRxOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [allergyOpen, setAllergyOpen] = useState(false)
  const [editingAllergy, setEditingAllergy] = useState<any | null>(null)
  const [conditionOpen, setConditionOpen] = useState(false)
  const [editingCondition, setEditingCondition] = useState<any | null>(null)
  const [rxDetail, setRxDetail] = useState<string | null>(null)
  const [invoiceDetail, setInvoiceDetail] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.patient(id) as Promise<PatientDetailData>,
    enabled: Boolean(id),
  })

  const { data: plans = [] } = useQuery({
    queryKey: ['treatment-plans', 'patient', id],
    queryFn: () => api.treatmentPlans(id, ''),
    enabled: Boolean(id),
  })

  const patient = data?.patient as Patient | undefined
  const activeAllergies = useMemo(() => (data?.allergies ?? []).filter((a) => Number(a.active ?? 1) !== 0), [data?.allergies])
  const activeConditions = useMemo(() => (data?.conditions ?? []).filter((c) => c.status === 'active'), [data?.conditions])
  const latestVitals = data?.vitals?.length ? data.vitals[data.vitals.length - 1] : null
  const systolicSeries = (data?.vitals ?? []).slice(-12).map((v: any) => Number(v.systolic || 0)).filter((n) => n > 0)
  const weightSeries = (data?.vitals ?? []).slice(-12).map((v: any) => Number(v.weight_kg || 0)).filter((n) => n > 0)
  const patientBMI = latestVitals ? bmi(Number(latestVitals.weight_kg), Number(latestVitals.height_cm)) : null
  const severe = activeAllergies.filter((a) => ['severe', 'life-threatening'].includes(a.severity))
  const upcoming = useMemo(
    () => (data?.appointments ?? [])
      .filter((a: any) => a.start_at >= new Date(Date.now() - 3600_000).toISOString() && !['cancelled', 'no_show', 'completed'].includes(a.status))
      .sort((a: any, b: any) => a.start_at.localeCompare(b.start_at)),
    [data?.appointments],
  )
  const nextAppt = upcoming[0]
  const balance = Number(data?.stats?.outstanding_cents ?? patient?.balance_cents ?? 0)

  async function archivePatient() {
    if (!patient) return
    setArchiving(true)
    try {
      await api.archivePatient(patient.id)
      toast.success('Patient archived', `${patient.first_name} ${patient.last_name} was removed from the active register.`)
      await qc.invalidateQueries()
      navigate('/patients')
    } catch (e: any) {
      toast.error('Could not archive patient', String(e?.message ?? e))
    } finally {
      setArchiving(false)
    }
  }

  async function messageOnWhatsApp() {
    if (!patient?.phone) return
    const link = whatsappHref(
      patient.phone,
      defaultCountry,
      whatsappGreeting(patient.first_name, clinic?.name),
    )
    if (!link) return
    try {
      await api.openExternal(link)
    } catch (e: any) {
      toast.error(translate('Could not open WhatsApp'), String(e?.message ?? e))
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-24 animate-pulse rounded bg-elevated" />
        <div className="flex animate-pulse items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-elevated" />
          <div className="space-y-2"><div className="h-5 w-52 rounded bg-elevated" /><div className="h-3 w-72 rounded bg-elevated" /></div>
        </div>
        <div className="grid gap-4 pt-4 xl:grid-cols-[1fr_320px]">
          <div className="card h-72 animate-pulse" />
          <div className="card h-72 animate-pulse" />
        </div>
      </div>
    )
  }

  if (isError || !patient) {
    return (
      <div className="py-10">
        <EmptyState
          icon={<UserRound size={18} />}
          title="Patient record not found"
          description="It may have been archived or removed on another device."
          action={<Button onClick={() => navigate('/patients')}><ArrowLeft size={14} /> Back to patients</Button>}
        />
      </div>
    )
  }

  const tabItems: { value: TabValue; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'visits', label: 'Visits', count: data?.encounters?.length ?? 0 },
    { value: 'prescriptions', label: 'Prescriptions', count: data?.prescriptions?.length ?? 0 },
    { value: 'plans', label: 'Plans', count: plans.length },
    { value: 'billing', label: 'Billing', count: data?.invoices?.length ?? 0 },
    { value: 'appointments', label: 'Appointments', count: data?.appointments?.length ?? 0 },
    { value: 'documents', label: 'Documents', count: data?.stats?.documents ?? 0 },
  ]
  const whatsappAvailable = Boolean(patient.phone && whatsappHref(patient.phone, defaultCountry))

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/patients')} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted transition hover:text-ink">
        <ArrowLeft size={13} /> Patient register
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={patientName(patient)} size={54} className="mt-0.5 shadow-sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink">{patientName(patient)}</h1>
              <StatusBadge status={patient.status || 'active'} />
              {locations.length > 1 && patient.location_name && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elevated/60 px-2 py-0.5 text-[10px] font-medium text-muted">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: patient.location_color || '#2a3747' }} />
                  {patient.location_name}
                </span>
              )}
              {severe.length > 0 && <Badge tone="error" dot>Allergy alert</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted">
              <span className="font-mono text-[10.5px] tracking-wide text-faint">{patient.mrn}</span>
              <span className="text-faint">·</span>
              <span>{age(patient.date_of_birth)} · {sexLabel(patient.sex)}</span>
              {patient.blood_type && <><span className="text-faint">·</span><span className="inline-flex items-center gap-1"><Droplets size={11} className="text-rose-500" />{patient.blood_type}</span></>}
              {patient.phone && <><span className="text-faint">·</span><a href={telHref(patient.phone, defaultCountry)} className="hover:text-ink">{displayPhone(patient.phone, defaultCountry)}</a></>}
              {patient.email && <><span className="text-faint">·</span><a href={`mailto:${patient.email}`} className="truncate hover:text-ink">{patient.email}</a></>}
            </div>
            <div className="mt-1 text-[10.5px] text-faint">
              Registered {fmtDate(patient.created_at)} · Last visit {data?.stats?.last_visit_at ? fromNow(data.stats.last_visit_at) : 'never'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {whatsappAvailable && (
            <Button onClick={messageOnWhatsApp}><MessageCircle size={14} /> WhatsApp</Button>
          )}
          <Button onClick={() => setApptOpen(true)}><CalendarPlus size={14} /> Book</Button>
          <Button variant="primary" onClick={() => setVisitOpen(true)}><Stethoscope size={14} /> Start visit</Button>
          <Dropdown
            trigger={<IconButton label="More patient actions" className="h-9 w-9 border border-line bg-surface"><MoreHorizontal size={16} /></IconButton>}
          >
            <MenuItem icon={<Pencil size={13} />} onClick={() => setEditOpen(true)}>Edit patient record</MenuItem>
            <MenuItem icon={<Pill size={13} />} onClick={() => setRxOpen(true)}>New prescription</MenuItem>
            <MenuItem icon={<ClipboardList size={13} />} onClick={() => navigate(`/treatment-plans?patient=${patient.id}`)}>Treatment plans</MenuItem>
            <MenuItem icon={<FolderOpen size={13} />} onClick={() => setTab('documents')}>Patient documents</MenuItem>
            <MenuItem icon={<ReceiptText size={13} />} onClick={() => setInvoiceOpen(true)}>New invoice</MenuItem>
            <div className="my-1 h-px bg-line" />
            <MenuItem icon={<Archive size={13} />} danger onClick={() => setArchiveOpen(true)}>Archive patient</MenuItem>
          </Dropdown>
        </div>
      </div>

      {severe.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 dark:border-rose-900/60 dark:bg-rose-900/20">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-300" />
          <div className="text-[11.5px] leading-5 text-rose-800 dark:text-rose-200">
            <span className="font-semibold">Allergy alert: </span>
            {severe.map((a) => `${a.allergen} (${a.severity}${a.reaction ? ` — ${a.reaction}` : ''})`).join('; ')}. Confirm before prescribing.
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_318px]">
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Tabs value={tab} onChange={setTab} tabs={tabItems} />
            {nextAppt && (
              <span className="hidden items-center gap-1.5 text-[10.5px] text-faint sm:inline-flex">
                <CalendarDays size={12} /> <span>Next visit</span> · {fmtDate(nextAppt.start_at, 'd MMM')} · {fmtTime(nextAppt.start_at)}
              </span>
            )}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              <SectionCard
                title="Vitals trend"
                subtitle={latestVitals ? `Last recorded ${fmtDateTime(latestVitals.measured_at)}` : 'No measurements recorded'}
                actions={systolicSeries.length > 1 ? <span className="text-[10px] text-faint">Blood pressure · last {systolicSeries.length} readings</span> : undefined}
              >
                {latestVitals ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      <Vital label="BP" value={`${latestVitals.systolic ?? '—'}/${latestVitals.diastolic ?? '—'}`} unit="mmHg" icon={<Activity size={10} />} />
                      <Vital label="Pulse" value={latestVitals.pulse || null} unit="bpm" icon={<HeartPulse size={10} />} />
                      <Vital label="Temp" value={latestVitals.temperature_c || null} unit="°C" icon={<Thermometer size={10} />} />
                      <Vital label="SpO₂" value={latestVitals.spo2 || null} unit="%" icon={<Wind size={10} />} />
                      <Vital label="Weight" value={latestVitals.weight_kg || null} unit="kg" icon={<Weight size={10} />} />
                      <Vital label="BMI" value={patientBMI ? patientBMI.toFixed(1) : null} icon={<Activity size={10} />} />
                    </div>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-faint">Systolic trend</div>
                        {systolicSeries.length > 1 ? (
                          <Sparkline values={systolicSeries} width={280} height={54} className="mt-1" />
                        ) : (
                          <div className="mt-2 text-[11px] text-faint">Two or more readings will plot a trend.</div>
                        )}
                      </div>
                      <div className="text-end">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-faint">Weight trend</div>
                        {weightSeries.length > 1 ? (
                          <Sparkline values={weightSeries} width={150} height={54} color="#4f7fab" className="mt-1" />
                        ) : (
                          <div className="mt-2 text-[11px] text-faint">No trend yet.</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-[11.5px] text-faint">Vitals recorded during a visit appear here.</div>
                )}
              </SectionCard>

              <div className="grid gap-4 md:grid-cols-2">
                <SectionCard
                  title="Recent visits"
                  actions={<button onClick={() => setTab('visits')} className="text-[10.5px] font-medium text-brand-700 hover:underline dark:text-brand-300">All visits</button>}
                  bodyClassName="p-0"
                >
                  {(data?.encounters ?? []).length === 0 ? (
                    <div className="px-4 py-6 text-center text-[11.5px] text-faint">No visits yet.</div>
                  ) : (data?.encounters ?? []).slice(0, 4).map((e: any) => (
                    <button key={e.id} onClick={() => navigate(`/visits/${e.id}`)} className="flex w-full items-center gap-2.5 border-b border-line px-4 py-2.5 text-start last:border-0 hover:bg-elevated/50">
                      <span className="w-9 shrink-0 rounded-md bg-elevated py-1 text-center text-[9.5px] font-semibold leading-3 text-muted">{fmtDate(e.started_at, 'd MMM')}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11.5px] font-medium text-ink">{e.chief_complaint || e.assessment || 'Clinical visit'}</span>
                        <span className="block truncate text-[10px] text-faint">{e.provider_name} · {fmtDate(e.started_at, 'yyyy')}</span>
                      </span>
                      <StatusBadge status={e.status} />
                    </button>
                  ))}
                </SectionCard>

                <SectionCard
                  title="Recent prescriptions"
                  actions={<button onClick={() => setTab('prescriptions')} className="text-[10.5px] font-medium text-brand-700 hover:underline dark:text-brand-300">All</button>}
                  bodyClassName="p-0"
                >
                  {(data?.prescriptions ?? []).length === 0 ? (
                    <div className="px-4 py-6 text-center text-[11.5px] text-faint">No prescriptions issued.</div>
                  ) : (data?.prescriptions ?? []).slice(0, 4).map((rx: any) => (
                    <button key={rx.id} onClick={() => setRxDetail(rx.id)} className="flex w-full items-center gap-2.5 border-b border-line px-4 py-2.5 text-start last:border-0 hover:bg-elevated/50">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><Pill size={13} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11.5px] font-medium text-ink">{rx.item_count} medication{rx.item_count === 1 ? '' : 's'}</span>
                        <span className="block text-[10px] text-faint">{fmtDate(rx.issued_at, 'd MMM yyyy')} · {rx.provider_name}</span>
                      </span>
                      <StatusBadge status={rx.status} />
                    </button>
                  ))}
                </SectionCard>
              </div>

              {patient.notes && (
                <SectionCard title="Patient notes" subtitle="Visible to the whole care team">
                  <p className="prose-note text-[12px] leading-6 text-muted">{patient.notes}</p>
                </SectionCard>
              )}
            </div>
          )}

          {tab === 'visits' && (
            <SectionCard
              title="Visit history"
              subtitle={`${data?.encounters?.length ?? 0} clinical records`}
              actions={<Button size="sm" variant="subtle" onClick={() => setVisitOpen(true)}><Plus size={12} /> New visit</Button>}
              bodyClassName="p-0"
            >
              {(data?.encounters ?? []).length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={<Stethoscope size={17} />} title="No visits recorded" description="Start a visit to document the first clinical encounter." action={<Button size="sm" variant="primary" onClick={() => setVisitOpen(true)}>Start visit</Button>} />
                </div>
              ) : (data?.encounters ?? []).map((e: any) => (
                <button key={e.id} onClick={() => navigate(`/visits/${e.id}`)} className="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-start last:border-0 hover:bg-elevated/50">
                  <span className="w-11 shrink-0 rounded-lg bg-elevated py-1.5 text-center">
                    <span className="block text-[10px] font-semibold uppercase text-faint">{fmtDate(e.started_at, 'MMM')}</span>
                    <span className="block text-[15px] font-semibold leading-5 tabular-nums text-ink">{fmtDate(e.started_at, 'd')}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-ink">{e.chief_complaint || 'Clinical visit'}</span>
                      <StatusBadge status={e.status} />
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">{e.assessment || e.plan || 'No assessment recorded'}</span>
                    <span className="mt-1 flex items-center gap-2 text-[10px] text-faint">
                      <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: e.provider_color || '#2a3747' }} />{e.provider_name}</span>
                      <span>·</span><span>{fmtTime(e.started_at)}</span>
                      {locations.length > 1 && e.location_name && <><span>·</span><span>{e.location_name}</span></>}
                      {e.follow_up_on && <><span>·</span><span>Follow-up {fmtDate(e.follow_up_on, 'd MMM')}</span></>}
                    </span>
                  </span>
                  <ChevronRight size={14} className="mt-1 shrink-0 text-faint" />
                </button>
              ))}
            </SectionCard>
          )}

          {tab === 'prescriptions' && (
            <SectionCard
              title="Prescriptions"
              subtitle="Medication issued to this patient"
              actions={<Button size="sm" variant="subtle" onClick={() => setRxOpen(true)}><Plus size={12} /> New prescription</Button>}
              bodyClassName="p-0"
            >
              {(data?.prescriptions ?? []).length === 0 ? (
                <div className="p-4"><EmptyState icon={<Pill size={17} />} title="No prescriptions" description="Prescriptions issued during a visit appear here, ready to print." /></div>
              ) : (data?.prescriptions ?? []).map((rx: any) => (
                <button key={rx.id} onClick={() => setRxDetail(rx.id)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-start last:border-0 hover:bg-elevated/50">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><Pill size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-ink">{rx.item_count} medication{rx.item_count === 1 ? '' : 's'}</span>
                    <span className="block text-[10.5px] text-faint">{fmtDate(rx.issued_at, 'd MMM yyyy')} · {rx.provider_name}{locations.length > 1 && rx.location_name ? ` · ${rx.location_name}` : ''}</span>
                  </span>
                  <StatusBadge status={rx.status} />
                  <ChevronRight size={14} className="text-faint" />
                </button>
              ))}
            </SectionCard>
          )}

          {tab === 'plans' && (
            <SectionCard
              title="Treatment plans"
              subtitle="Staged care agreed with the patient"
              actions={<Button size="sm" variant="subtle" onClick={() => navigate(`/treatment-plans?patient=${patient.id}&new=1`)}><Plus size={12} /> New plan</Button>}
              bodyClassName="p-0"
            >
              {plans.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<ClipboardList size={17} />}
                    title="No treatment plans"
                    description="Plan staged procedures so the whole team knows what comes next."
                    action={<Button size="sm" variant="primary" onClick={() => navigate(`/treatment-plans?patient=${patient.id}&new=1`)}>Create plan</Button>}
                  />
                </div>
              ) : plans.map((plan: TreatmentPlan) => {
                const count = Number(plan.item_count ?? 0)
                const done = Number(plan.completed_count ?? 0)
                const progress = count ? Math.round((done / count) * 100) : 0
                return (
                  <button
                    key={plan.id}
                    onClick={() => navigate(`/treatment-plans?patient=${patient.id}`)}
                    className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-start last:border-0 hover:bg-elevated/50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300"><ClipboardList size={14} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-semibold text-ink">{plan.title}</span>
                        <StatusBadge status={plan.status} />
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-[4px] w-24 overflow-hidden rounded-full bg-line">
                          <span className="block h-full rounded-full bg-accent-600" style={{ width: `${progress}%` }} />
                        </span>
                        <span className="text-[10px] text-faint">{done}/{count} procedures · {plan.provider_name}</span>
                      </span>
                    </span>
                    <span className="text-end">
                      <span className="block text-[12px] font-semibold tabular-nums text-ink">{money(Number(plan.total_cents ?? 0), clinic?.currency_symbol)}</span>
                      {plan.target_on && <span className="block text-[10px] text-faint">Target {fmtDate(plan.target_on, 'd MMM')}</span>}
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-faint" />
                  </button>
                )
              })}
            </SectionCard>
          )}

          {tab === 'billing' && (
            <SectionCard
              title="Invoices"
              subtitle="Charges, payments and outstanding balance"
              actions={<Button size="sm" variant="subtle" onClick={() => setInvoiceOpen(true)}><Plus size={12} /> New invoice</Button>}
              bodyClassName="p-0"
            >
              {(data?.invoices ?? []).length === 0 ? (
                <div className="p-4"><EmptyState icon={<ReceiptText size={17} />} title="No invoices" description="Create an invoice after a visit to record charges and payments." /></div>
              ) : (data?.invoices ?? []).map((inv: any) => {
                const due = (inv.total_cents ?? 0) - (inv.paid_cents ?? 0)
                return (
                  <button key={inv.id} onClick={() => setInvoiceDetail(inv.id)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-start last:border-0 hover:bg-elevated/50">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-elevated text-faint"><ReceiptText size={14} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold text-ink">{inv.number}</span>
                      <span className="block text-[10.5px] text-faint">Issued {fmtDate(inv.issued_at, 'd MMM yyyy')} · {inv.item_count} item{inv.item_count === 1 ? '' : 's'}{locations.length > 1 && inv.location_name ? ` · ${inv.location_name}` : ''}</span>
                    </span>
                    <span className="text-end">
                      <span className="block text-[12px] font-semibold tabular-nums text-ink">{money(inv.total_cents, clinic?.currency_symbol)}</span>
                      {due > 0 && <span className="block text-[10px] text-rose-600 dark:text-rose-300">{money(due, clinic?.currency_symbol)} due</span>}
                    </span>
                    <StatusBadge status={inv.status} />
                  </button>
                )
              })}
            </SectionCard>
          )}

          {tab === 'appointments' && (
            <SectionCard
              title="Appointments"
              subtitle="Scheduled, past and cancelled"
              actions={<Button size="sm" variant="subtle" onClick={() => setApptOpen(true)}><CalendarPlus size={12} /> Book</Button>}
              bodyClassName="p-0"
            >
              {(data?.appointments ?? []).length === 0 ? (
                <div className="p-4"><EmptyState icon={<CalendarDays size={17} />} title="No appointments" description="Book the next visit to reserve time in the clinic calendar." action={<Button size="sm" variant="primary" onClick={() => setApptOpen(true)}>Book appointment</Button>} /></div>
              ) : (data?.appointments ?? []).map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                  <span className="w-10 shrink-0 rounded-md bg-elevated py-1 text-center">
                    <span className="block text-[9px] font-semibold uppercase text-faint">{fmtDate(a.start_at, 'MMM')}</span>
                    <span className="block text-[13px] font-semibold leading-4 tabular-nums text-ink">{fmtDate(a.start_at, 'd')}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium text-ink">{a.reason || 'Clinic appointment'}</span>
                    <span className="block text-[10px] text-faint">{fmtTime(a.start_at)} · {a.provider_name}{a.room ? ` · ${a.room}` : ''}{locations.length > 1 && a.location_name ? ` · ${a.location_name}` : ''}</span>
                  </span>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </SectionCard>
          )}

          {tab === 'documents' && (
            <PatientFilesPanel patient={patient} />
          )}
        </div>

        <aside className="space-y-4">
          <section className="card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">At a glance</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <InlineStat label="Visits" value={data?.stats?.visits ?? 0} />
              <InlineStat label="Active Rx" value={data?.stats?.active_prescriptions ?? 0} />
              <InlineStat label="Documents" value={data?.stats?.documents ?? 0} />
              <InlineStat label="Balance" value={<span className={balance > 0 ? 'text-rose-600 dark:text-rose-300' : ''}>{money(balance, clinic?.currency_symbol)}</span>} />
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Next appointment</span>
                <CalendarDays size={12} className="text-faint" />
              </div>
              {nextAppt ? (
                <div className="mt-1.5 text-[11.5px] leading-5 text-ink">
                  {fmtDate(nextAppt.start_at, 'EEE d MMM')} · {fmtTime(nextAppt.start_at)}
                  <div className="text-[10px] text-faint">{nextAppt.reason || 'Visit'} · {nextAppt.provider_name}</div>
                </div>
              ) : <div className="mt-1.5 text-[11px] text-faint">Nothing booked.</div>}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink"><ShieldCheck size={13} className="text-rose-500" /> Allergies</div>
              <button onClick={() => { setEditingAllergy(null); setAllergyOpen(true) }} className="rounded-md p-1 text-faint hover:bg-elevated hover:text-ink" aria-label="Add allergy"><Plus size={13} /></button>
            </div>
            <div className="p-2">
              {activeAllergies.length === 0 ? (
                <div className="px-2 py-3 text-center text-[10.5px] text-faint">No known allergies recorded.</div>
              ) : activeAllergies.map((a: any) => (
                <button key={a.id} onClick={() => { setEditingAllergy(a); setAllergyOpen(true) }} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-start transition hover:bg-elevated">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', a.severity === 'life-threatening' || a.severity === 'severe' ? 'bg-rose-500' : a.severity === 'moderate' ? 'bg-amber-500' : 'bg-faint')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium text-ink">{a.allergen}</span>
                    <span className="block truncate text-[9.5px] text-faint">{a.reaction || a.severity}</span>
                  </span>
                  <Badge tone={statusTone(a.severity)}>{a.severity}</Badge>
                </button>
              ))}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink"><ClipboardList size={13} className="text-sky-600" /> Active conditions</div>
              <button onClick={() => { setEditingCondition(null); setConditionOpen(true) }} className="rounded-md p-1 text-faint hover:bg-elevated hover:text-ink" aria-label="Add condition"><Plus size={13} /></button>
            </div>
            <div className="p-2">
              {activeConditions.length === 0 ? (
                <div className="px-2 py-3 text-center text-[10.5px] text-faint">No active problems recorded.</div>
              ) : activeConditions.map((c: any) => (
                <button key={c.id} onClick={() => { setEditingCondition(c); setConditionOpen(true) }} className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-start transition hover:bg-elevated">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] font-medium leading-4 text-ink">{c.name}</span>
                    <span className="block text-[9.5px] text-faint">{c.code || 'No code'}{c.diagnosed_on ? ` · ${fmtDate(c.diagnosed_on, 'MMM yyyy')}` : ''}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="card p-3.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">Contact & coverage</div>
            <InfoRow
              icon={<Phone size={12} />}
              label="Phone"
              value={patient.phone || patient.alt_phone ? (
                <a
                  href={telHref(patient.phone || patient.alt_phone, defaultCountry)}
                  className="hover:underline"
                >
                  {displayPhone(patient.phone || patient.alt_phone, defaultCountry)}
                </a>
              ) : '—'}
            />
            <InfoRow icon={<Mail size={12} />} label="Email" value={patient.email} />
            <InfoRow icon={<MapPin size={12} />} label="Address" value={[patient.address, patient.city].filter(Boolean).join(', ')} />
            <InfoRow icon={<CalendarDays size={12} />} label="Age" value={patient.date_of_birth ? age(patient.date_of_birth) : '—'} />
            <InfoRow
              icon={<UserRound size={12} />}
              label="Emergency contact"
              value={patient.emergency_contact_name
                ? [patient.emergency_contact_name, displayPhone(patient.emergency_contact_phone, defaultCountry)].filter(Boolean).join(' · ')
                : '—'}
            />
            <InfoRow icon={<ShieldCheck size={12} />} label="Insurance" value={patient.insurance_provider ? `${patient.insurance_provider} · ${patient.insurance_number}` : '—'} />
            {patient.occupation && <InfoRow icon={<FileText size={12} />} label="Occupation" value={patient.occupation} />}
          </section>
        </aside>
      </div>

      <PatientDialog open={editOpen} onClose={() => setEditOpen(false)} patient={patient} onSaved={() => qc.invalidateQueries({ queryKey: ['patient', id] })} />
      <AppointmentDialog open={apptOpen} onClose={() => setApptOpen(false)} defaultPatient={patient} />
      <VisitDialog open={visitOpen} onClose={() => setVisitOpen(false)} patient={patient} />
      <PrescriptionDialog open={rxOpen} onClose={() => setRxOpen(false)} patient={patient} />
      <InvoiceDialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} patient={patient} />
      <AllergyDialog open={allergyOpen} onClose={() => setAllergyOpen(false)} patientID={patient.id} allergy={editingAllergy} />
      <ConditionDialog open={conditionOpen} onClose={() => setConditionOpen(false)} patientID={patient.id} condition={editingCondition} />
      <PrescriptionDetailModal open={Boolean(rxDetail)} onClose={() => setRxDetail(null)} prescriptionId={rxDetail} />
      <InvoiceDetailModal open={Boolean(invoiceDetail)} onClose={() => setInvoiceDetail(null)} invoiceId={invoiceDetail} />
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={archivePatient}
        busy={archiving}
        tone="danger"
        title="Archive this patient?"
        confirmLabel="Archive patient"
        description={`${patientName(patient)} will be removed from the active register. Clinical and financial history is retained.`}
      />
    </div>
  )
}
