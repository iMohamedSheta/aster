import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Clock3 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { compareAsc, parseISO } from 'date-fns'
import { api } from '../lib/api'
import { useApp, roleLabel } from '../lib/AppContext'
import { combineLocal, fmtDate, isoLocal, isoLocalTime } from '../lib/format'
import type { Appointment, Patient } from '../lib/types'
import { Button, Field, Input, Sheet, Select, Textarea } from './ui'
import { PatientPicker } from './PatientPicker'
import { useToast } from './Toast'

const durations = [10, 15, 20, 30, 45, 60, 90]

export function AppointmentDialog({
  open, onClose, appointment, defaultDate, defaultTime, defaultPatient, onSaved,
}: {
  open: boolean
  onClose: () => void
  appointment?: Appointment | null
  defaultDate?: Date
  defaultTime?: string
  defaultPatient?: Patient | null
  onSaved?: (a: Appointment) => void
}) {
  const { staff, clinic, currentStaff } = useApp()
  const qc = useQueryClient()
  const toast = useToast()
  const editing = Boolean(appointment?.id)
  const defaultProvider = useMemo(() => {
    const canSeePatients = ['owner', 'doctor', 'nurse'].includes(currentStaff?.role ?? '')
    if (canSeePatients) return currentStaff?.id ?? ''
    return staff.find((s) => s.role === 'doctor' && Number(s.active ?? 1) === 1)?.id ?? staff[0]?.id ?? ''
  }, [staff, currentStaff?.id])

  const [patientID, setPatientID] = useState('')
  const [patientInitial, setPatientInitial] = useState<Patient | null>(null)
  const [providerID, setProviderID] = useState('')
  const [date, setDate] = useState(isoLocal(new Date()))
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState(clinic?.slot_minutes ?? 30)
  const [status, setStatus] = useState('scheduled')
  const [reason, setReason] = useState('')
  const [room, setRoom] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (appointment) {
      const start = parseISO(appointment.start_at)
      const end = parseISO(appointment.end_at)
      setPatientID(appointment.patient_id)
      setPatientInitial({
        id: appointment.patient_id,
        first_name: appointment.first_name,
        last_name: appointment.last_name,
        mrn: appointment.mrn,
        date_of_birth: appointment.date_of_birth,
        phone: appointment.phone,
        status: 'active',
      } as Patient)
      setProviderID(appointment.provider_id)
      setDate(Number.isNaN(start.getTime()) ? isoLocal(new Date()) : isoLocal(start))
      setTime(Number.isNaN(start.getTime()) ? '09:00' : isoLocalTime(start))
      const mins = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
        ? Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000))
        : 30
      setDuration(durations.includes(mins) ? mins : mins)
      setStatus(appointment.status || 'scheduled')
      setReason(appointment.reason ?? '')
      setRoom(appointment.room ?? '')
      setNotes(appointment.notes ?? '')
    } else {
      setPatientID(defaultPatient?.id ?? '')
      setPatientInitial(defaultPatient ?? null)
      setProviderID(defaultProvider)
      setDate(isoLocal(defaultDate ?? new Date()))
      setTime(defaultTime ?? clinic?.opening_time ?? '09:00')
      setDuration(clinic?.slot_minutes ?? 30)
      setStatus('scheduled')
      setReason('')
      setRoom('')
      setNotes('')
    }
  }, [open, appointment?.id, defaultDate?.toDateString(), defaultTime, defaultPatient?.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!patientID) {
      setError('Choose a patient for this appointment.')
      return
    }
    if (!date || !time) {
      setError('Choose a date and time.')
      return
    }
    const start = combineLocal(date, time)
    const end = new Date(start.getTime() + duration * 60_000)
    if (end <= start) {
      setError('The appointment must end after it starts.')
      return
    }
    setSaving(true)
    setError('')
    try {
      let saved: Appointment
      if (editing && appointment) {
        saved = await api.updateAppointment(appointment.id, {
          provider_id: providerID,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          status,
          reason,
          room,
          notes,
        }) as Appointment
      } else {
        saved = await api.createAppointment({
          patient_id: patientID,
          provider_id: providerID,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          status,
          reason,
          room,
          notes,
        }) as Appointment
      }
      toast.success(editing ? 'Appointment updated' : 'Appointment booked', `${fmtDate(saved.start_at, 'EEE d MMM')} · ${isoLocalTime(parseISO(saved.start_at))}`)
      await qc.invalidateQueries()
      onSaved?.(saved)
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
      title={editing ? 'Edit appointment' : 'Book an appointment'}
      description={editing ? 'Reschedule, reassign or update the visit.' : 'Reserve time in the clinic calendar.'}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="appointment-form" loading={saving}>
            {editing ? 'Save changes' : 'Book appointment'}
          </Button>
        </>
      )}
    >
      <form id="appointment-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">
            {error}
          </div>
        )}
        <Field label="Patient">
          <PatientPicker
            value={patientID}
            initial={patientInitial}
            disabled={editing}
            onChange={(id, p) => {
              setPatientID(id)
              setPatientInitial(p)
            }}
            autoFocus={!editing}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} step={300} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration">
            <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[...new Set([...durations, duration])].sort((a, b) => a - b).map((d) => (
                <option key={d} value={d}>{d} minutes</option>
              ))}
            </Select>
          </Field>
          <Field label="Provider">
            <Select value={providerID} onChange={(e) => setProviderID(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.filter((s) => Number(s.active ?? 1) === 1).map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} · {roleLabel(s.role)}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Reason for visit">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Follow-up: blood pressure review" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Room">
            <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room 2" />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="arrived">Arrived</option>
              <option value="waiting">Waiting</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No show</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[70px]" placeholder="Preparation, interpreter, or scheduling notes." />
        </Field>
        <div className="flex items-center gap-2 text-[10.5px] text-faint">
          <Clock3 size={12} />
          Ends at {isoLocalTime(new Date(combineLocal(date || isoLocal(new Date()), time || '09:00').getTime() + duration * 60_000))}
          <span className="mx-1">·</span>
          <CalendarPlus size={12} />
          The calendar updates on every connected device.
        </div>
      </form>
    </Sheet>
  )
}
