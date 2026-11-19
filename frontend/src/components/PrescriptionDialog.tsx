import { useEffect, useState } from 'react'
import { Pill, Plus, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import type { Patient } from '../lib/types'
import { Button, Field, Input, Sheet, Textarea } from './ui'
import { PatientPicker } from './PatientPicker'
import { useToast } from './Toast'

interface Item {
  drug_name: string
  strength: string
  form: string
  dose: string
  frequency: string
  duration_days: number
  quantity: number
  refills: number
  instructions: string
}

const blankItem = (): Item => ({
  drug_name: '', strength: '', form: 'tablet', dose: '1 tablet', frequency: 'Once daily',
  duration_days: 30, quantity: 30, refills: 0, instructions: '',
})

const quickMeds = [
  { drug_name: 'Amoxicillin', strength: '500 mg', form: 'capsule', dose: '1 capsule', frequency: 'Three times daily', duration_days: 7, quantity: 21, instructions: 'Take with food. Complete the full course.' },
  { drug_name: 'Ibuprofen', strength: '400 mg', form: 'tablet', dose: '1 tablet', frequency: 'Every 8 hours as needed', duration_days: 5, quantity: 15, instructions: 'Take with food. Do not exceed 3 tablets in 24 hours.' },
  { drug_name: 'Lisinopril', strength: '10 mg', form: 'tablet', dose: '1 tablet', frequency: 'Once daily', duration_days: 30, quantity: 30, instructions: 'Take in the morning.' },
  { drug_name: 'Metformin', strength: '500 mg', form: 'tablet', dose: '1 tablet', frequency: 'Twice daily', duration_days: 30, quantity: 60, instructions: 'Take with meals.' },
  { drug_name: 'Albuterol HFA', strength: '90 mcg', form: 'inhaler', dose: '2 puffs', frequency: 'Every 4–6 hours as needed', duration_days: 30, quantity: 1, instructions: 'Shake well before use. Rinse mouth after use.' },
]

export function PrescriptionDialog({
  open, onClose, patient, encounterID, onSaved,
}: {
  open: boolean
  onClose: () => void
  patient?: Patient | null
  encounterID?: string
  onSaved?: (rx: any) => void
}) {
  const { currentStaff } = useApp()
  const qc = useQueryClient()
  const toast = useToast()
  const [patientID, setPatientID] = useState('')
  const [initial, setInitial] = useState<Patient | null>(null)
  const [items, setItems] = useState<Item[]>([blankItem()])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPatientID(patient?.id ?? '')
    setInitial(patient ?? null)
    setItems([blankItem()])
    setNotes('')
    setError('')
  }, [open, patient?.id])

  function patch(index: number, key: keyof Item, value: any) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)))
  }

  function addQuick(med: typeof quickMeds[number]) {
    setItems((prev) => {
      const clean = prev.filter((i) => i.drug_name.trim() || i.strength.trim())
      return [...clean, { ...blankItem(), ...med }]
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!patientID) {
      setError('Choose a patient.')
      return
    }
    const cleaned = items.filter((i) => i.drug_name.trim())
    if (!cleaned.length) {
      setError('Add at least one medication.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const rx = await api.createPrescription({
        patient_id: patientID,
        encounter_id: encounterID ?? '',
        provider_id: currentStaff?.id ?? '',
        notes,
        items: cleaned,
      })
      toast.success('Prescription issued', `${cleaned.length} medication${cleaned.length === 1 ? '' : 's'} · ready to print`)
      await qc.invalidateQueries()
      onSaved?.(rx)
      onClose()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  const totalItems = items.filter((i) => i.drug_name.trim()).length

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New prescription"
      description="Each medication is recorded as a separate line on the printed prescription."
      size="xl"
      footer={(
        <>
          <div className="me-auto text-[11px] text-faint">{totalItems} medication{totalItems === 1 ? '' : 's'}</div>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="rx-form" loading={saving}>
            <Pill size={14} /> Issue prescription
          </Button>
        </>
      )}
    >
      <form id="rx-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">
            {error}
          </div>
        )}
        {!encounterID && (
          <Field label="Patient">
            <PatientPicker
              value={patientID}
              initial={initial}
              disabled={Boolean(patient)}
              onChange={(id, p) => {
                setPatientID(id)
                setInitial(p)
              }}
              autoFocus={!patient}
            />
          </Field>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="field-label mb-0">Common medications</span>
            <span className="text-[10px] text-faint">Click to add a pre-filled line</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickMeds.map((m) => (
              <button
                key={m.drug_name}
                type="button"
                onClick={() => addQuick(m)}
                className="rounded-full border border-line bg-elevated px-2.5 py-1 text-[11px] font-medium text-muted transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 dark:hover:bg-brand-900/30 dark:hover:text-brand-100"
              >
                {m.drug_name} <span className="text-faint">{m.strength}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="rounded-xl border border-line bg-elevated/40 p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">Medication {i + 1}</span>
                {items.length > 1 && (
                  <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} className="rounded-md p-1 text-faint transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-5">
                  <Field label="Drug name"><Input value={item.drug_name} onChange={(e) => patch(i, 'drug_name', e.target.value)} placeholder="e.g. Amoxicillin" /></Field>
                </div>
                <div className="col-span-3">
                  <Field label="Strength"><Input value={item.strength} onChange={(e) => patch(i, 'strength', e.target.value)} placeholder="500 mg" /></Field>
                </div>
                <div className="col-span-4">
                  <Field label="Form"><Input value={item.form} onChange={(e) => patch(i, 'form', e.target.value)} placeholder="tablet" /></Field>
                </div>
                <div className="col-span-4">
                  <Field label="Dose"><Input value={item.dose} onChange={(e) => patch(i, 'dose', e.target.value)} placeholder="1 tablet" /></Field>
                </div>
                <div className="col-span-8">
                  <Field label="Frequency"><Input value={item.frequency} onChange={(e) => patch(i, 'frequency', e.target.value)} placeholder="Twice daily" /></Field>
                </div>
                <div className="col-span-3">
                  <Field label="Days"><Input type="number" min={0} value={item.duration_days} onChange={(e) => patch(i, 'duration_days', Number(e.target.value))} /></Field>
                </div>
                <div className="col-span-2">
                  <Field label="Qty"><Input type="number" min={0} value={item.quantity} onChange={(e) => patch(i, 'quantity', Number(e.target.value))} /></Field>
                </div>
                <div className="col-span-2">
                  <Field label="Refills"><Input type="number" min={0} value={item.refills} onChange={(e) => patch(i, 'refills', Number(e.target.value))} /></Field>
                </div>
                <div className="col-span-5" />
                <div className="col-span-12">
                  <Field label="Instructions">
                    <Input value={item.instructions} onChange={(e) => patch(i, 'instructions', e.target.value)} placeholder="Take with food. Avoid alcohol." />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => setItems((prev) => [...prev, blankItem()])}>
            <Plus size={13} /> Add another medication
          </Button>
        </div>

        <Field label="Prescriber notes" hint="Printed below the medication table.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[64px]" placeholder="Review at follow-up. Encourage hydration." />
        </Field>
      </form>
    </Sheet>
  )
}
