import { useEffect, useState } from 'react'
import { ChevronDown, Loader2, UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { ageYears, cn, dobFromAge } from '../lib/format'
import { translate } from '../lib/i18n'
import {
  canonicalPhone, parsePhone, phoneDefaultHint, resolveDefaultCountry,
} from '../lib/phone'
import type { Patient } from '../lib/types'
import { Button, Field, Input, Sheet, Select, Textarea } from './ui'
import { PhoneInput } from './PhoneInput'
import { useToast } from './Toast'

const empty = {
  first_name: '', last_name: '', preferred_name: '', age: '', sex: '',
  blood_type: '', status: 'active', phone: '', alt_phone: '', email: '', address: '',
  city: '', national_id: '', occupation: '', emergency_contact_name: '',
  emergency_contact_phone: '', insurance_provider: '', insurance_number: '',
  marital_status: '', notes: '', mrn: '',
}

const bloodTypes = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const sexOptions = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
]

const rareSexes = [
  { value: 'intersex', label: 'Intersex' },
  { value: 'unknown', label: 'Prefer not to say' },
]

/** Fields that mean an existing record has more than the quick intake. */
const detailKeys = [
  'preferred_name', 'blood_type', 'alt_phone', 'email', 'address', 'city',
  'national_id', 'occupation', 'emergency_contact_name', 'emergency_contact_phone',
  'insurance_provider', 'insurance_number', 'marital_status', 'notes',
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-line pb-4 last:border-0 last:pb-0 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-brand-700 dark:text-brand-300">{title}</div>
      </div>
      {children}
    </section>
  )
}

export function PatientDialog({
  open, onClose, patient, onSaved, initialName,
}: {
  open: boolean
  onClose: () => void
  patient?: Patient | null
  onSaved?: (p: Patient) => void
  initialName?: string
}) {
  const { clinic, activeLocation } = useApp()
  const defaultCountry = resolveDefaultCountry(clinic, activeLocation)
  const [form, setForm] = useState<Record<string, any>>(empty)
  const [baseline, setBaseline] = useState({ age: '', dob: '' })
  const [showMore, setShowMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    if (patient) {
      const next: Record<string, any> = { ...empty }
      const years = ageYears(patient.date_of_birth)
      for (const key of Object.keys(empty)) {
        if (key === 'age') continue
        next[key] = (patient as any)[key] ?? (empty as any)[key]
      }
      next.age = years == null ? '' : String(years)
      setForm(next)
      setBaseline({ age: next.age, dob: patient.date_of_birth ?? '' })
      setShowMore(detailKeys.some((key) => String((patient as any)[key] ?? '').trim() !== ''))
    } else {
      const parts = (initialName ?? '').trim().split(/\s+/)
      setForm({
        ...empty,
        first_name: parts.length > 1 ? parts[0] : initialName ?? '',
        last_name: parts.length > 1 ? parts.slice(1).join(' ') : '',
      })
      setBaseline({ age: '', dob: '' })
      setShowMore(false)
    }
    setError('')
  }, [open, patient?.id, initialName])

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }))
  const editing = Boolean(patient?.id)
  const ages = [...sexOptions, ...rareSexes.filter((s) => form.sex === s.value)]
  const ageNumber = Number(form.age)
  const validAge = form.age !== '' && Number.isFinite(ageNumber) && ageNumber >= 0 && ageNumber <= 130
  const ageHint = validAge
    ? `${translate('Estimated birth year')}: ${new Date().getFullYear() - Math.floor(ageNumber)}`
    : translate('Approximate is fine.')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError(translate('First and last name are required.'))
      return
    }

    const ageText = String(form.age ?? '').trim()
    let years: number | null = null
    if (ageText) {
      const parsedAge = Number(ageText)
      if (!Number.isFinite(parsedAge) || parsedAge < 0 || parsedAge > 130) {
        setError(translate('Enter an age between 0 and 130.'))
        return
      }
      years = Math.floor(parsedAge)
    }

    const phone = canonicalPhone(form.phone, defaultCountry)
    const parsedPhone = parsePhone(form.phone, defaultCountry)
    if (form.phone.trim() && (parsedPhone.national.length < 6 || phone.replace(/\D/g, '').length > 15)) {
      setError(translate('Enter a valid mobile number.'))
      return
    }

    const ageUnchanged = editing && (
      ageText === baseline.age
      || (ageText !== '' && baseline.age !== '' && Number(ageText) === Number(baseline.age))
    )
    const dateOfBirth = ageUnchanged
      ? baseline.dob
      : years == null ? '' : dobFromAge(years)

    setSaving(true)
    setError('')
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        preferred_name: form.preferred_name,
        date_of_birth: dateOfBirth,
        sex: form.sex,
        blood_type: form.blood_type,
        status: form.status || 'active',
        phone,
        alt_phone: canonicalPhone(form.alt_phone, defaultCountry),
        email: form.email,
        address: form.address,
        city: form.city,
        national_id: form.national_id,
        occupation: form.occupation,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: canonicalPhone(form.emergency_contact_phone, defaultCountry),
        insurance_provider: form.insurance_provider,
        insurance_number: form.insurance_number,
        marital_status: form.marital_status,
        notes: form.notes,
        mrn: form.mrn ?? '',
      }
      const saved = editing
        ? await api.updatePatient(patient!.id, payload)
        : await api.createPatient(payload)
      toast.success(editing ? 'Patient record updated' : 'Patient registered', `${saved.first_name} ${saved.last_name} · ${saved.mrn}`)
      onSaved?.(saved as Patient)
      onClose()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit patient record' : 'Register a patient'}
      description={editing
        ? 'Changes are saved to this clinic and to connected devices.'
        : 'Start with a name, age and mobile number. Everything else can wait until the first visit.'}
      size="lg"
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="patient-form" loading={saving}>
            {editing ? 'Save changes' : 'Register patient'}
          </Button>
        </>
      )}
    >
      <form id="patient-form" onSubmit={submit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">
            {error}
          </div>
        )}

        <Section title="Patient basics">
          <Field label="First name *">
            <Input autoFocus value={form.first_name} onChange={(e) => set('first_name', e.target.value)} placeholder="Amelia" />
          </Field>
          <Field label="Last name *">
            <Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} placeholder="Hart" />
          </Field>
          <Field label="Age" hint={ageHint}>
            <div className="relative">
              <Input
                inputMode="numeric"
                autoComplete="off"
                value={form.age}
                onChange={(e) => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="34"
                className="pe-14 tabular-nums"
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[10.5px] font-medium text-faint">years</span>
            </div>
          </Field>
          <Field label="Sex">
            <div className="flex flex-wrap gap-1.5">
              {ages.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={form.sex === s.value}
                  onClick={() => set('sex', form.sex === s.value ? '' : s.value)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[12px] font-medium transition',
                    form.sex === s.value
                      ? 'border-brand-900 bg-brand-900 text-white dark:border-brand-100 dark:bg-brand-100 dark:text-brand-950'
                      : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Mobile phone" hint={phoneDefaultHint(defaultCountry)} className="sm:col-span-2">
            <PhoneInput
              value={form.phone}
              onChange={(value) => set('phone', value)}
              defaultCountry={defaultCountry}
            />
          </Field>
        </Section>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-elevated/40 px-3.5 py-3 text-start transition hover:border-line-strong hover:bg-elevated"
        >
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-ink">
              {showMore ? 'Fewer details' : 'More details'}
            </span>
            <span className="mt-0.5 block text-[10.5px] text-faint">
              Contact, emergency, insurance and notes
            </span>
          </span>
          <ChevronDown size={15} className={cn('shrink-0 text-faint transition-transform', showMore && 'rotate-180')} />
        </button>

        {showMore && (
          <div className="space-y-5 animate-fade-in">
            <Section title="Identity">
              <Field label="Preferred name">
                <Input value={form.preferred_name} onChange={(e) => set('preferred_name', e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Blood type">
                <Select value={form.blood_type} onChange={(e) => set('blood_type', e.target.value)}>
                  {bloodTypes.map((b) => <option key={b || 'none'} value={b}>{b || 'Unknown'}</option>)}
                </Select>
              </Field>
              <Field label="Record number" hint={editing ? undefined : 'Generated automatically when left blank.'}>
                <Input value={editing ? patient?.mrn ?? '' : form.mrn ?? ''} disabled={editing} onChange={(e) => set('mrn', e.target.value)} placeholder="Auto" />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
            </Section>

            <Section title="Contact">
              <Field label="Alternate phone">
                <PhoneInput
                  value={form.alt_phone}
                  onChange={(value) => set('alt_phone', value)}
                  defaultCountry={defaultCountry}
                />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" />
              </Field>
              <Field label="National ID">
                <Input value={form.national_id} onChange={(e) => set('national_id', e.target.value)} />
              </Field>
              <Field label="Occupation">
                <Input value={form.occupation} onChange={(e) => set('occupation', e.target.value)} />
              </Field>
              <Field label="Street address" className="sm:col-span-1">
                <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="Marital status">
                <Select value={form.marital_status} onChange={(e) => set('marital_status', e.target.value)}>
                  <option value="">Not recorded</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
            </Section>

            <Section title="Emergency & insurance">
              <Field label="Emergency contact">
                <Input value={form.emergency_contact_name} onChange={(e) => set('emergency_contact_name', e.target.value)} placeholder="Name and relationship" />
              </Field>
              <Field label="Emergency phone">
                <PhoneInput
                  value={form.emergency_contact_phone}
                  onChange={(value) => set('emergency_contact_phone', value)}
                  defaultCountry={defaultCountry}
                />
              </Field>
              <Field label="Insurance provider">
                <Input value={form.insurance_provider} onChange={(e) => set('insurance_provider', e.target.value)} placeholder="e.g. Blue Shield" />
              </Field>
              <Field label="Policy / member number">
                <Input value={form.insurance_number} onChange={(e) => set('insurance_number', e.target.value)} />
              </Field>
            </Section>

            <section>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-brand-700 dark:text-brand-300">Notes</div>
              <Textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Accessibility needs, communication preferences, or context for the care team."
                className="min-h-[76px]"
              />
            </section>
          </div>
        )}

        <div className={cn('flex items-center gap-2 text-[10.5px] text-faint', saving && 'opacity-60')}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
          {editing
            ? 'Changes are attributed to the current user in the audit trail.'
            : 'Only the name is required. A record number is issued on save.'}
        </div>
      </form>
    </Sheet>
  )
}
