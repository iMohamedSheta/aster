import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Activity } from 'lucide-react'
import { api } from '../lib/api'
import { isoLocal } from '../lib/format'
import { Button, Field, Input, Sheet, Select, Textarea, Toggle } from './ui'
import { useToast } from './Toast'

export function AllergyDialog({
  open, onClose, patientID, allergy, onSaved,
}: {
  open: boolean
  onClose: () => void
  patientID: string
  allergy?: any | null
  onSaved?: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    allergen: '', reaction: '', severity: 'moderate', noted_on: isoLocal(new Date()), active: true, notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      allergen: allergy?.allergen ?? '',
      reaction: allergy?.reaction ?? '',
      severity: allergy?.severity ?? 'moderate',
      noted_on: allergy?.noted_on || isoLocal(new Date()),
      active: allergy ? Number(allergy.active) !== 0 : true,
      notes: allergy?.notes ?? '',
    })
    setError('')
  }, [open, allergy?.id])

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.allergen.trim()) {
      setError('Enter the allergen.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.saveAllergy({
        id: allergy?.id ?? '',
        patient_id: patientID,
        allergen: form.allergen.trim(),
        reaction: form.reaction,
        severity: form.severity,
        noted_on: form.noted_on,
        active: form.active ? 1 : 0,
        notes: form.notes,
      })
      toast.success(allergy ? 'Allergy updated' : 'Allergy recorded', form.allergen)
      await qc.invalidateQueries()
      onSaved?.()
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
      title={allergy ? 'Edit allergy' : 'Record an allergy'}
      description="Serious allergies are highlighted wherever the patient record is opened."
      size="sm"
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="allergy-form" loading={saving}>Save</Button>
        </>
      )}
    >
      <form id="allergy-form" onSubmit={submit} className="space-y-3.5">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">{error}</div>}
        <Field label="Allergen"><Input autoFocus value={form.allergen} onChange={(e) => set('allergen', e.target.value)} placeholder="Penicillin" /></Field>
        <Field label="Reaction"><Input value={form.reaction} onChange={(e) => set('reaction', e.target.value)} placeholder="Hives, swelling, anaphylaxis…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Severity">
            <Select value={form.severity} onChange={(e) => set('severity', e.target.value)}>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
              <option value="life-threatening">Life threatening</option>
            </Select>
          </Field>
          <Field label="Noted on"><Input type="date" value={form.noted_on} onChange={(e) => set('noted_on', e.target.value)} /></Field>
        </div>
        <Toggle checked={form.active} onChange={(v) => set('active', v)} label="Active allergy" description="Inactive allergies remain in history without alerts." />
        <Field label="Notes"><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="min-h-[60px]" /></Field>
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          Document what was observed, not a diagnosis. The care team reviews allergy details at every visit.
        </div>
      </form>
    </Sheet>
  )
}

export function ConditionDialog({
  open, onClose, patientID, condition, onSaved,
}: {
  open: boolean
  onClose: () => void
  patientID: string
  condition?: any | null
  onSaved?: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    name: '', code: '', diagnosed_on: '', status: 'active', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      name: condition?.name ?? '',
      code: condition?.code ?? '',
      diagnosed_on: condition?.diagnosed_on ?? '',
      status: condition?.status ?? 'active',
      notes: condition?.notes ?? '',
    })
    setError('')
  }, [open, condition?.id])

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Enter a condition name.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.saveCondition({
        id: condition?.id ?? '',
        patient_id: patientID,
        name: form.name.trim(),
        code: form.code,
        diagnosed_on: form.diagnosed_on,
        status: form.status,
        notes: form.notes,
      })
      toast.success(condition ? 'Condition updated' : 'Condition added', form.name)
      await qc.invalidateQueries()
      onSaved?.()
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
      title={condition ? 'Edit condition' : 'Add a condition'}
      description="The active problem list is shown in the patient summary and visit editor."
      size="sm"
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="condition-form" loading={saving}>Save</Button>
        </>
      )}
    >
      <form id="condition-form" onSubmit={submit} className="space-y-3.5">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">{error}</div>}
        <Field label="Condition"><Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Essential hypertension" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code"><Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="I10" /></Field>
          <Field label="Diagnosed on"><Input type="date" value={form.diagnosed_on} onChange={(e) => set('diagnosed_on', e.target.value)} /></Field>
        </div>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Notes"><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="min-h-[60px]" /></Field>
        <div className="flex items-center gap-2 text-[10.5px] text-faint">
          <Activity size={12} /> Problem list entries sync with the rest of the record.
        </div>
      </form>
    </Sheet>
  )
}
