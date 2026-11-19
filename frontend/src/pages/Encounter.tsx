import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, ArrowLeft, CalendarDays, Check, ChevronRight, CircleDot,
  ClipboardList, FileSignature, HeartPulse, Lock, Pill, Plus, Printer, Save, Sparkles, Stethoscope,
  Thermometer, Trash2, Wind,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { clinicPack, parseSpecialtyData, type SpecialtyField } from '../lib/clinicPacks'
import {
  age, bmi, cn, fmtDate, fmtDateTime, fmtTime, fromNow, patientName, sexLabel, titleCase,
} from '../lib/format'
import { useInterval } from '../lib/hooks'
import type { Encounter, EncounterDetailData, Patient } from '../lib/types'
import {
  Avatar, Badge, Button, Checkbox, ConfirmDialog, EmptyState, Field, Input, Sheet, Select,
  StatusBadge, Textarea,
} from '../components/ui'
import { useToast } from '../components/Toast'
import { PrescriptionDialog } from '../components/PrescriptionDialog'
import { PrescriptionDetailModal } from '../components/PrescriptionDetailModal'

const visitTypes = ['visit', 'follow_up', 'annual', 'urgent', 'telehealth', 'procedure']

function SectionLabel({ letter, title, hint }: { letter: string; title: string; hint: string }) {
  return (
    <div className="mb-1.5 flex items-baseline gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-50 text-[10px] font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">{letter}</span>
      <span className="text-[12px] font-semibold text-ink">{title}</span>
      <span className="text-[10.5px] text-faint">{hint}</span>
    </div>
  )
}

function ReadonlySection({ letter, title, value, hint }: { letter: string; title: string; value?: string; hint: string }) {
  return (
    <div>
      <SectionLabel letter={letter} title={title} hint={hint} />
      {value
        ? <div className="prose-note rounded-xl border border-line bg-elevated/40 px-3.5 py-3 text-[12.5px] leading-6 text-ink">{value}</div>
        : <div className="rounded-xl border border-dashed border-line px-3.5 py-3 text-[11.5px] text-faint">Not documented.</div>}
    </div>
  )
}

function SpecialtyInput({
  field, value, onChange, disabled,
}: {
  field: SpecialtyField
  value: any
  onChange: (value: any) => void
  disabled?: boolean
}) {
  if (field.kind === 'checkbox') {
    return (
      <label className={cn('flex h-8 items-center gap-2 text-[11.5px] text-muted', disabled && 'opacity-70')}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-line"
        />
        {field.label}
      </label>
    )
  }
  const label = field.unit ? `${field.label} (${field.unit})` : field.label
  return (
    <Field label={label}>
      {field.kind === 'select' ? (
        <Select value={String(value ?? '')} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not recorded</option>
          {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
      ) : field.kind === 'textarea' ? (
        <Textarea value={String(value ?? '')} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="min-h-[64px]" placeholder={field.placeholder} />
      ) : (
        <Input
          type={field.kind === 'number' ? 'number' : 'text'}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={(e) => onChange(field.kind === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
          placeholder={field.placeholder}
        />
      )}
    </Field>
  )
}

export function EncounterEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { clinic, activeLocation, data: boot } = useApp()
  const toast = useToast()
  const qc = useQueryClient()
  const pack = clinicPack(activeLocation?.type || boot?.clinicType || clinic?.clinic_type)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['encounter', id],
    queryFn: () => api.encounter(id) as Promise<EncounterDetailData>,
    enabled: Boolean(id),
  })

  const [form, setForm] = useState({
    type: 'visit', chief_complaint: '', subjective: '', objective: '', assessment: '', plan: '', follow_up_on: '',
  })
  const [specialtyData, setSpecialtyData] = useState<Record<string, any>>({})
  const [templateOpen, setTemplateOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [signing, setSigning] = useState(false)
  const [addendumOpen, setAddendumOpen] = useState(false)
  const [addendum, setAddendum] = useState('')
  const [addendumSaving, setAddendumSaving] = useState(false)
  const [rxOpen, setRxOpen] = useState(false)
  const [rxDetail, setRxDetail] = useState<string | null>(null)
  const [vitals, setVitals] = useState<Record<string, string>>({})
  const [vitalsDirty, setVitalsDirty] = useState(false)
  const [vitalsSaving, setVitalsSaving] = useState(false)
  const [dxOpen, setDxOpen] = useState(false)
  const [dx, setDx] = useState({ code: '', description: '', kind: 'primary' })
  const [dxSaving, setDxSaving] = useState(false)
  const [tick, setTick] = useState(0)
  const initializedRef = useRef('')
  useInterval(() => setTick((t) => t + 1), 30_000)

  const enc = data?.encounter as Encounter | undefined
  const patient = data?.patient as Patient | undefined
  const signed = enc?.status === 'signed'

  useEffect(() => {
    if (!data || initializedRef.current === id) return
    initializedRef.current = id
    const e = data.encounter as Encounter
    setForm({
      type: e.type || 'visit',
      chief_complaint: e.chief_complaint ?? '',
      subjective: e.subjective ?? '',
      objective: e.objective ?? '',
      assessment: e.assessment ?? '',
      plan: e.plan ?? '',
      follow_up_on: e.follow_up_on ?? '',
    })
    setSpecialtyData(parseSpecialtyData(e.specialty_data))
    const v = data.vitals as any
    setVitals(v ? {
      systolic: String(v.systolic || ''),
      diastolic: String(v.diastolic || ''),
      pulse: String(v.pulse || ''),
      temperature_c: String(v.temperature_c || ''),
      resp_rate: String(v.resp_rate || ''),
      spo2: String(v.spo2 || ''),
      weight_kg: String(v.weight_kg || ''),
      height_cm: String(v.height_cm || ''),
      glucose: String(v.glucose || ''),
    } : { systolic: '', diastolic: '', pulse: '', temperature_c: '', resp_rate: '', spo2: '', weight_kg: '', height_cm: '', glucose: '' })
    setDirty(false)
    setVitalsDirty(false)
    setInitialized(true)
    setLastSaved(null)
  }, [data, id])

  async function persist(showToast = false): Promise<boolean> {
    if (!enc || signed || !initialized) return false
    setSaving(true)
    try {
      await api.saveEncounter({
        id: enc.id,
        provider_id: enc.provider_id,
        type: form.type,
        chief_complaint: form.chief_complaint,
        subjective: form.subjective,
        objective: form.objective,
        assessment: form.assessment,
        plan: form.plan,
        follow_up_on: form.follow_up_on,
        specialty_data: JSON.stringify(specialtyData),
      })
      setDirty(false)
      setLastSaved(new Date())
      await qc.invalidateQueries({ queryKey: ['encounter', id] })
      if (showToast) toast.success('Visit saved', 'Draft updated on this device.')
      return true
    } catch (e: any) {
      toast.error('Could not save visit', String(e?.message ?? e))
      return false
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!dirty || !initialized || signed || saving) return
    const t = window.setTimeout(() => { persist(false) }, 1400)
    return () => window.clearTimeout(t)
  }, [form, dirty, initialized, signed])

  const hasNarrative = Boolean(form.subjective.trim() || form.objective.trim() || form.assessment.trim() || form.plan.trim())

  function applyTemplate() {
    const template = pack.noteTemplate
    setForm((f) => ({
      ...f,
      chief_complaint: f.chief_complaint || template.chief_complaint,
      subjective: template.subjective,
      objective: template.objective,
      assessment: template.assessment,
      plan: template.plan,
    }))
    setDirty(true)
    setTemplateOpen(false)
    toast.success('Template inserted', `${pack.label} note structure is ready to complete.`)
  }

  async function saveVitals(showToast = true) {
    if (!enc || signed) return true
    setVitalsSaving(true)
    try {
      await api.saveVitals(enc.id, {
        systolic: Number(vitals.systolic) || 0,
        diastolic: Number(vitals.diastolic) || 0,
        pulse: Number(vitals.pulse) || 0,
        temperature_c: Number(vitals.temperature_c) || 0,
        resp_rate: Number(vitals.resp_rate) || 0,
        spo2: Number(vitals.spo2) || 0,
        weight_kg: Number(vitals.weight_kg) || 0,
        height_cm: Number(vitals.height_cm) || 0,
        glucose: Number(vitals.glucose) || 0,
      })
      setVitalsDirty(false)
      await qc.invalidateQueries({ queryKey: ['encounter', id] })
      if (showToast) toast.success('Vitals recorded', 'Measurements attached to this visit.')
      return true
    } catch (e: any) {
      toast.error('Could not save vitals', String(e?.message ?? e))
      return false
    } finally {
      setVitalsSaving(false)
    }
  }

  async function signEncounter() {
    if (!enc) return
    if (!form.assessment.trim()) {
      toast.error('Assessment required', 'Document the clinical assessment before signing.')
      setSignOpen(false)
      return
    }
    setSigning(true)
    const saved = dirty ? await persist(false) : true
    if (!saved) { setSigning(false); return }
    if (vitalsDirty) await saveVitals(false)
    try {
      await api.signEncounter(enc.id)
      toast.success('Visit signed', 'The record is now read-only. Addendums can still be added.')
      await qc.invalidateQueries()
      setSignOpen(false)
    } catch (e: any) {
      toast.error('Could not sign visit', String(e?.message ?? e))
    } finally {
      setSigning(false)
    }
  }

  async function saveAddendum() {
    if (!enc || !addendum.trim()) return
    setAddendumSaving(true)
    try {
      await api.addAddendum(enc.id, addendum.trim())
      toast.success('Addendum added', 'The original signed note remains unchanged.')
      setAddendum('')
      setAddendumOpen(false)
      await qc.invalidateQueries({ queryKey: ['encounter', id] })
    } catch (e: any) {
      toast.error('Could not add addendum', String(e?.message ?? e))
    } finally {
      setAddendumSaving(false)
    }
  }

  async function addDiagnosis(e: React.FormEvent) {
    e.preventDefault()
    if (!enc || !dx.description.trim()) return
    setDxSaving(true)
    try {
      await api.saveDiagnosis(enc.id, { code: dx.code, description: dx.description, kind: dx.kind })
      toast.success('Diagnosis added', dx.description)
      setDx({ code: '', description: '', kind: 'primary' })
      setDxOpen(false)
      await qc.invalidateQueries({ queryKey: ['encounter', id] })
    } catch (e: any) {
      toast.error('Could not add diagnosis', String(e?.message ?? e))
    } finally {
      setDxSaving(false)
    }
  }

  async function removeDiagnosis(diagnosis: any) {
    try {
      await api.deleteEntity('diagnoses', diagnosis.id)
      await qc.invalidateQueries({ queryKey: ['encounter', id] })
      toast.success('Diagnosis removed', diagnosis.description)
    } catch (e: any) {
      toast.error('Could not remove diagnosis', String(e?.message ?? e))
    }
  }

  const vitalBMI = useMemo(() => bmi(Number(vitals.weight_kg), Number(vitals.height_cm)), [vitals.weight_kg, vitals.height_cm])
  const severeAllergies = (data?.allergies ?? []).filter((a: any) => Number(a.active ?? 1) !== 0 && ['severe', 'life-threatening'].includes(a.severity))

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-24 animate-pulse rounded bg-elevated" />
        <div className="grid animate-pulse gap-4 xl:grid-cols-[1fr_340px]">
          <div className="card h-[520px]" />
          <div className="card h-[520px]" />
        </div>
      </div>
    )
  }
  if (isError || !enc || !patient) {
    return (
      <div className="py-10">
        <EmptyState
          icon={<Stethoscope size={18} />}
          title="Visit not found"
          description="It may have been removed or belongs to a workspace that is no longer connected."
          action={<Button onClick={() => navigate('/visits')}><ArrowLeft size={14} /> Back to visits</Button>}
        />
      </div>
    )
  }

  const vitalsFields: { key: string; label: string; unit: string; step?: string }[] = [
    { key: 'systolic', label: 'Systolic', unit: 'mmHg' },
    { key: 'diastolic', label: 'Diastolic', unit: 'mmHg' },
    { key: 'pulse', label: 'Pulse', unit: 'bpm' },
    { key: 'temperature_c', label: 'Temp', unit: '°C', step: '0.1' },
    { key: 'resp_rate', label: 'Resp', unit: '/min' },
    { key: 'spo2', label: 'SpO₂', unit: '%' },
    { key: 'weight_kg', label: 'Weight', unit: 'kg', step: '0.1' },
    { key: 'height_cm', label: 'Height', unit: 'cm', step: '0.1' },
    { key: 'glucose', label: 'Glucose', unit: 'mg/dL', step: '0.1' },
  ]

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/visits')} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted transition hover:text-ink">
        <ArrowLeft size={13} /> All visits
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <Avatar name={patientName(patient)} size={46} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">{patientName(patient)}</h1>
              <StatusBadge status={enc.status} />
              <Badge tone="neutral">{titleCase(enc.type || 'visit')}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
              <span className="font-mono text-[10px] text-faint">{patient.mrn}</span>
              <span className="text-faint">·</span>
              <span>{age(patient.date_of_birth)} · {sexLabel(patient.sex)}</span>
              <span className="text-faint">·</span>
              <span>{fmtDate(enc.started_at, 'EEE d MMM yyyy')} · {fmtTime(enc.started_at)}</span>
              <span className="text-faint">·</span>
              <span>{enc.provider_name}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!signed && (
            <>
              <div className="me-1 flex items-center gap-1.5 text-[10.5px] text-faint">
                {saving ? <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> Saving…</>
                  : dirty ? <><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes</>
                    : lastSaved ? <><Check size={11} className="text-emerald-600" /> Saved {fromNow(lastSaved.toISOString())}</>
                      : <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Draft saved</>}
              </div>
              <Button onClick={() => persist(true)} loading={saving}><Save size={14} /> Save</Button>
              <Button variant="primary" onClick={() => setSignOpen(true)}><FileSignature size={14} /> Sign & close</Button>
            </>
          )}
          {signed && (
            <>
              <span className="flex items-center gap-1.5 text-[10.5px] text-muted"><Lock size={12} /> Signed {fromNow(enc.signed_at)} by {enc.signed_name || enc.provider_name}</span>
              <Button variant="primary" onClick={() => setAddendumOpen(true)}><Plus size={14} /> Add addendum</Button>
            </>
          )}
        </div>
      </div>

      {signed && (
        <div className="flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50/70 px-3.5 py-2.5 text-[11.5px] leading-5 text-brand-900 dark:border-brand-800/60 dark:bg-brand-900/25 dark:text-brand-100">
          <Lock size={14} className="mt-0.5 shrink-0" />
          <span>This visit was signed on {fmtDateTime(enc.signed_at)}. Clinical text is read-only. Record later changes as an addendum so the original note stays intact.</span>
        </div>
      )}

      {severeAllergies.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 dark:border-rose-900/60 dark:bg-rose-900/20">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-300" />
          <div className="text-[11.5px] leading-5 text-rose-800 dark:text-rose-200">
            <span className="font-semibold">Allergy alert: </span>
            {severeAllergies.map((a: any) => `${a.allergen} (${a.severity}${a.reaction ? ` — ${a.reaction}` : ''})`).join('; ')}
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_342px]">
        <div className="space-y-4">
          <section className="card p-4">
            <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-line pb-3">
              <Field label="Chief complaint" className="min-w-[240px] flex-1">
                {signed
                  ? <div className="py-1.5 text-[13px] font-medium text-ink">{form.chief_complaint || '—'}</div>
                  : <Input value={form.chief_complaint} onChange={(e) => { setForm((f) => ({ ...f, chief_complaint: e.target.value })); setDirty(true) }} placeholder="In the patient’s words" />}
              </Field>
              <Field label="Visit type" className="w-[150px]">
                {signed
                  ? <div className="py-1.5 text-[12px] text-ink">{titleCase(form.type)}</div>
                  : <Select value={form.type} onChange={(e) => { setForm((f) => ({ ...f, type: e.target.value })); setDirty(true) }}>
                    {visitTypes.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                  </Select>}
              </Field>
              <Field label="Follow-up" className="w-[160px]">
                {signed
                  ? <div className="py-1.5 text-[12px] text-ink">{form.follow_up_on ? fmtDate(form.follow_up_on) : 'Not scheduled'}</div>
                  : <Input type="date" value={form.follow_up_on} onChange={(e) => { setForm((f) => ({ ...f, follow_up_on: e.target.value })); setDirty(true) }} />}
              </Field>
            </div>

            {!signed && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-elevated/40 px-3 py-2">
                <span className="flex items-center gap-2 text-[10.5px] text-muted">
                  <span className="block h-2 w-2 rounded-full" style={{ background: pack.color }} />
                  <span className="font-semibold text-ink">{pack.label}</span> note template
                </span>
                <Button size="sm" variant="ghost" onClick={() => (hasNarrative ? setTemplateOpen(true) : applyTemplate())}>
                  <Sparkles size={12} /> Insert template
                </Button>
              </div>
            )}

            {signed ? (
              <div className="space-y-5">
                <ReadonlySection letter="S" title="Subjective" hint="History and patient report" value={form.subjective} />
                <ReadonlySection letter="O" title="Objective" hint="Examination and findings" value={form.objective} />
                <ReadonlySection letter="A" title="Assessment" hint="Clinical impression" value={form.assessment} />
                <ReadonlySection letter="P" title="Plan" hint="Treatment and follow-up" value={form.plan} />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <SectionLabel letter="S" title="Subjective" hint="History, symptoms and patient report" />
                  <Textarea value={form.subjective} onChange={(e) => { setForm((f) => ({ ...f, subjective: e.target.value })); setDirty(true) }} className="min-h-[110px]" placeholder="What the patient reports: onset, duration, severity, context…" />
                </div>
                <div>
                  <SectionLabel letter="O" title="Objective" hint="Examination, vitals and investigations" />
                  <Textarea value={form.objective} onChange={(e) => { setForm((f) => ({ ...f, objective: e.target.value })); setDirty(true) }} className="min-h-[110px]" placeholder="Examination findings, vitals, test results…" />
                </div>
                <div>
                  <SectionLabel letter="A" title="Assessment" hint="Clinical impression and differential" />
                  <Textarea value={form.assessment} onChange={(e) => { setForm((f) => ({ ...f, assessment: e.target.value })); setDirty(true) }} className="min-h-[96px]" placeholder="Working diagnosis and reasoning. Required before signing." />
                </div>
                <div>
                  <SectionLabel letter="P" title="Plan" hint="Treatment, prescriptions, follow-up" />
                  <Textarea value={form.plan} onChange={(e) => { setForm((f) => ({ ...f, plan: e.target.value })); setDirty(true) }} className="min-h-[96px]" placeholder="Treatment, patient education, investigations, follow-up interval…" />
                </div>
              </div>
            )}

            {pack.specialtyFields.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-elevated text-[10px] font-bold text-muted">+</span>
                    <span className="text-[12px] font-semibold text-ink">{pack.label} details</span>
                    <span className="text-[10.5px] text-faint">Recorded with this visit</span>
                  </div>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">Specialty data</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {pack.specialtyFields.map((field) => (
                    <SpecialtyInput
                      key={field.key}
                      field={field}
                      value={specialtyData[field.key]}
                      disabled={signed}
                      onChange={(value) => {
                        setSpecialtyData((current) => ({ ...current, [field.key]: value }))
                        setDirty(true)
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>

          {(data?.addenda ?? []).length > 0 && (
            <section className="card overflow-hidden">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-[13px] font-semibold text-ink">Addenda</h2>
                <p className="mt-0.5 text-[10.5px] text-muted">Later changes to the signed record, kept in order.</p>
              </div>
              <div className="divide-y divide-line">
                {(data?.addenda ?? []).map((a: any) => (
                  <div key={a.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 text-[10px] text-faint">
                      <span className="font-medium text-muted">{a.provider_name || 'Care team'}</span>
                      <span>·</span>
                      <span>{fmtDateTime(a.created_at)}</span>
                    </div>
                    <p className="prose-note mt-1.5 text-[12px] leading-6 text-ink">{a.body}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="card p-3.5">
            <div className="flex items-center gap-2.5">
              <Avatar name={patientName(patient)} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-ink">{patientName(patient)}</div>
                <div className="text-[10px] text-faint">{patient.mrn} · {age(patient.date_of_birth)} · {sexLabel(patient.sex)}</div>
              </div>
              <button onClick={() => navigate(`/patients/${patient.id}`)} className="rounded-md p-1.5 text-faint hover:bg-elevated hover:text-ink" title="Open patient record" aria-label="Open patient record"><ChevronRight size={14} /></button>
            </div>
            <div className="mt-3 border-t border-line pt-2.5">
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">Allergies</div>
              {(data?.allergies ?? []).length === 0
                ? <div className="text-[10.5px] text-faint">No known allergies.</div>
                : <div className="flex flex-wrap gap-1">
                  {(data?.allergies ?? []).map((a: any) => (
                    <span key={a.id} className={cn('rounded-full border px-1.5 py-0.5 text-[9.5px] font-medium', ['severe', 'life-threatening'].includes(a.severity) ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-900/25 dark:text-amber-200')}>
                      {a.allergen}
                    </span>
                  ))}
                </div>}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink"><Activity size={13} className="text-rose-500" /> Vitals</div>
              {!signed && vitalsDirty && (
                <Button size="sm" variant="subtle" onClick={() => saveVitals()} loading={vitalsSaving}><Save size={11} /> Save</Button>
              )}
            </div>
            <div className="p-3">
              <div className="grid grid-cols-3 gap-2">
                {vitalsFields.map((f) => (
                  <div key={f.key}>
                    <label className="mb-0.5 block text-[9px] font-semibold uppercase tracking-[0.05em] text-faint">{f.label}</label>
                    {signed
                      ? <div className="rounded-md bg-elevated/60 px-2 py-1.5 text-[11.5px] tabular-nums text-ink">{vitals[f.key] || '—'} <span className="text-[8.5px] text-faint">{f.unit}</span></div>
                      : <div className="relative">
                        <input
                          type="number"
                          step={f.step}
                          value={vitals[f.key] ?? ''}
                          onChange={(e) => { setVitals((v) => ({ ...v, [f.key]: e.target.value })); setVitalsDirty(true) }}
                          className="input h-8 px-2 pe-7 text-[11.5px] tabular-nums"
                        />
                        <span className="pointer-events-none absolute end-1.5 top-1/2 -translate-y-1/2 text-[8px] text-faint">{f.unit}</span>
                      </div>}
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[9.5px] text-faint">
                <span>BMI {vitalBMI ? vitalBMI.toFixed(1) : '—'}</span>
                <span>{data?.vitals?.measured_at ? `Recorded ${fmtDate(data.vitals.measured_at, 'd MMM, HH:mm')}` : 'Not yet recorded'}</span>
              </div>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink"><ClipboardList size={13} className="text-sky-600" /> Diagnoses</div>
              {!signed && <button onClick={() => setDxOpen((v) => !v)} className="rounded-md p-1 text-faint hover:bg-elevated hover:text-ink" aria-label="Add diagnosis"><Plus size={13} /></button>}
            </div>
            <div className="p-2">
              {(data?.diagnoses ?? []).length === 0 ? (
                <div className="px-2 py-3 text-center text-[10.5px] text-faint">No diagnoses recorded.</div>
              ) : (data?.diagnoses ?? []).map((d: any) => (
                <div key={d.id} className="group flex items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-elevated">
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', d.kind === 'primary' ? 'bg-sky-500' : 'bg-faint')} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium leading-4 text-ink">{d.description}</div>
                    <div className="text-[9px] text-faint">{d.code || 'No code'} · {titleCase(d.kind)}</div>
                  </div>
                  {!signed && (
                    <button onClick={() => removeDiagnosis(d)} className="rounded p-1 text-faint opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-900/20" aria-label="Remove diagnosis"><Trash2 size={11} /></button>
                  )}
                </div>
              ))}
              {dxOpen && !signed && (
                <form onSubmit={addDiagnosis} className="mt-1 space-y-2 border-t border-line px-1.5 pt-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    <input value={dx.code} onChange={(e) => setDx((d) => ({ ...d, code: e.target.value }))} placeholder="Code" className="input h-7 px-2 text-[10.5px]" />
                    <select value={dx.kind} onChange={(e) => setDx((d) => ({ ...d, kind: e.target.value }))} className="select h-7 px-2 text-[10.5px]">
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                      <option value="differential">Differential</option>
                    </select>
                    <Button size="sm" variant="primary" type="submit" loading={dxSaving} className="h-7 px-2 text-[10px]">Add</Button>
                  </div>
                  <input value={dx.description} onChange={(e) => setDx((d) => ({ ...d, description: e.target.value }))} placeholder="Description" className="input h-7 px-2 text-[10.5px]" autoFocus />
                </form>
              )}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink"><Pill size={13} className="text-brand-600" /> Prescriptions</div>
              <button onClick={() => setRxOpen(true)} className="rounded-md p-1 text-faint hover:bg-elevated hover:text-ink" aria-label="New prescription"><Plus size={13} /></button>
            </div>
            <div className="p-2">
              {(data?.prescriptions ?? []).length === 0 ? (
                <div className="px-2 py-3 text-center text-[10.5px] text-faint">No prescriptions this visit.</div>
              ) : (data?.prescriptions ?? []).map((rx: any) => (
                <button key={rx.id} onClick={() => setRxDetail(rx.id)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-start hover:bg-elevated">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><Pill size={11} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10.5px] font-medium text-ink">{rx.items?.length ?? 0} medication{(rx.items?.length ?? 0) === 1 ? '' : 's'}</span>
                    <span className="block text-[9px] text-faint">{fmtDate(rx.issued_at, 'd MMM yyyy')} · {rx.status}</span>
                  </span>
                  <Printer size={11} className="text-faint" />
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onConfirm={applyTemplate}
        title="Replace the note text with the template?"
        confirmLabel="Use template"
        description={`This will replace the Subjective, Objective, Assessment and Plan text with the ${pack.label} structure. Chief complaint is kept.`}
      />

      <ConfirmDialog
        open={signOpen}
        onClose={() => setSignOpen(false)}
        onConfirm={signEncounter}
        busy={signing}
        title="Sign this clinical visit?"
        confirmLabel="Sign & close"
        description="The clinical note becomes read-only and is attributed to you. Vitals and diagnoses are locked. Use an addendum for later changes."
      />

      <Sheet
        open={addendumOpen}
        onClose={() => setAddendumOpen(false)}
        title="Add an addendum"
        description="Appended to the signed record without changing the original note."
        size="sm"
        footer={(
          <>
            <Button onClick={() => setAddendumOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveAddendum} loading={addendumSaving} disabled={!addendum.trim()}>Add addendum</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-elevated px-3 py-2 text-[10.5px] leading-4 text-muted">
            Signed {fmtDateTime(enc.signed_at)} by {enc.signed_name || enc.provider_name}. Your name and the time are recorded with the addendum.
          </div>
          <Field label="Addendum">
            <Textarea autoFocus value={addendum} onChange={(e) => setAddendum(e.target.value)} className="min-h-[120px]" placeholder="New information, clarification, or a change in plan since the visit was signed…" />
          </Field>
        </div>
      </Sheet>

      <PrescriptionDialog
        open={rxOpen}
        onClose={() => setRxOpen(false)}
        patient={patient}
        encounterID={enc.id}
        onSaved={(rx) => setRxDetail(rx.id)}
      />
      <PrescriptionDetailModal open={Boolean(rxDetail)} onClose={() => setRxDetail(null)} prescriptionId={rxDetail} />
    </div>
  )
}
