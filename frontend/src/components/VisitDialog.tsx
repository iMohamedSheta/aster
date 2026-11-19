import { useEffect, useMemo, useState } from 'react'
import { Stethoscope } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { roleLabel, useApp } from '../lib/AppContext'
import { isoLocalTime } from '../lib/format'
import type { Appointment, Patient } from '../lib/types'
import { Button, Field, Input, Sheet, Select, Textarea } from './ui'
import { PatientPicker } from './PatientPicker'
import { useToast } from './Toast'

const visitTypes = [
  { value: 'visit', label: 'Office visit' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'annual', label: 'Annual physical' },
  { value: 'urgent', label: 'Urgent / same day' },
  { value: 'telehealth', label: 'Telehealth' },
  { value: 'procedure', label: 'Procedure' },
]

export function VisitDialog({
  open, onClose, patient, appointment,
}: {
  open: boolean
  onClose: () => void
  patient?: Patient | null
  appointment?: Appointment | null
}) {
  const { staff, currentStaff } = useApp()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const defaultProvider = useMemo(() => {
    if (['owner', 'doctor', 'nurse'].includes(currentStaff?.role ?? '')) return currentStaff?.id ?? ''
    return staff.find((s) => s.role === 'doctor' && Number(s.active ?? 1) === 1)?.id ?? ''
  }, [staff, currentStaff?.id])

  const [patientID, setPatientID] = useState('')
  const [initial, setInitial] = useState<Patient | null>(null)
  const [providerID, setProviderID] = useState('')
  const [type, setType] = useState('visit')
  const [complaint, setComplaint] = useState('')
  const [planNote, setPlanNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const p = appointment
      ? ({
        id: appointment.patient_id, first_name: appointment.first_name, last_name: appointment.last_name,
        mrn: appointment.mrn, date_of_birth: appointment.date_of_birth, phone: appointment.phone, status: 'active',
      } as Patient)
      : patient ?? null
    setPatientID(p?.id ?? '')
    setInitial(p)
    setProviderID(appointment?.provider_id || defaultProvider)
    setType('visit')
    setComplaint(appointment?.reason ?? '')
    setPlanNote('')
    setError('')
  }, [open, patient?.id, appointment?.id, defaultProvider])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!patientID) {
      setError('Choose the patient you are seeing.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const enc = await api.saveEncounter({
        patient_id: patientID,
        appointment_id: appointment?.id ?? '',
        provider_id: providerID,
        type,
        chief_complaint: complaint,
        plan: planNote,
        started_at: new Date().toISOString(),
      })
      if (appointment?.id) {
        await api.setAppointmentStatus(appointment.id, 'in_progress')
      }
      await qc.invalidateQueries()
      toast.success('Visit started', `Opened at ${isoLocalTime(new Date())}`)
      onClose()
      navigate(`/visits/${enc.id}`)
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
      title="Start a visit"
      description="Opens a draft encounter. Nothing is signed until you review and close the visit."
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="visit-form" loading={saving}>
            <Stethoscope size={14} /> Start visit
          </Button>
        </>
      )}
    >
      <form id="visit-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">
            {error}
          </div>
        )}
        <Field label="Patient">
          <PatientPicker
            value={patientID}
            initial={initial}
            disabled={Boolean(appointment) || Boolean(patient)}
            onChange={(id, p) => {
              setPatientID(id)
              setInitial(p)
            }}
            autoFocus={!patient && !appointment}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Visit type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {visitTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Clinician">
            <Select value={providerID} onChange={(e) => setProviderID(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.filter((s) => Number(s.active ?? 1) === 1).map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} · {roleLabel(s.role)}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Chief complaint">
          <Input
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder="In the patient's words, e.g. sore throat for three days"
          />
        </Field>
        <Field label="Opening note" hint="Optional. Captured in the plan section of the draft.">
          <Textarea value={planNote} onChange={(e) => setPlanNote(e.target.value)} className="min-h-[64px]" placeholder="Anything to remember before the examination…" />
        </Field>
        <div className="rounded-xl border border-line bg-elevated/60 px-3 py-2.5 text-[11px] leading-5 text-muted">
          The visit opens as a draft, so you can record vitals, diagnoses and prescriptions before signing. Signed visits become read-only and can only receive addenda.
        </div>
      </form>
    </Sheet>
  )
}
