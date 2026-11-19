import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banknote, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { centsFromInput, dollars, money, isoLocal } from '../lib/format'
import { clinicPack, type ServicePreset } from '../lib/clinicPacks'
import type { Invoice, Patient, Service } from '../lib/types'
import { Button, Field, Input, Sheet, Select, Textarea, Toggle } from './ui'
import { PatientPicker } from './PatientPicker'
import { useToast } from './Toast'

interface Line {
  service_id: string
  description: string
  quantity: number
  price: string
}

const blankLine = (): Line => ({ service_id: '', description: '', quantity: 1, price: '' })

export function InvoiceDialog({
  open, onClose, patient: presetPatient, encounterID, onSaved,
}: {
  open: boolean
  onClose: () => void
  patient?: Patient | null
  encounterID?: string
  onSaved?: (invoice: Invoice) => void
}) {
  const { clinic, activeLocation } = useApp()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: services = [] } = useQuery({ queryKey: ['services'], queryFn: () => api.services() as Promise<Service[]> })
  const pack = clinicPack(activeLocation?.type || clinic?.clinic_type)

  const [patientID, setPatientID] = useState('')
  const [initial, setInitial] = useState<Patient | null>(null)
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [discount, setDiscount] = useState('0')
  const [taxRate, setTaxRate] = useState('0')
  const [due, setDue] = useState(isoLocal(addDays(new Date(), 14)))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPatientID(presetPatient?.id ?? '')
    setInitial(presetPatient ?? null)
    setLines([blankLine()])
    setDiscount('0')
    setTaxRate(String((clinic?.tax_rate_bp ?? 0) / 100))
    setDue(isoLocal(addDays(new Date(), 14)))
    setNotes('')
    setError('')
  }, [open, presetPatient?.id, clinic?.tax_rate_bp])

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + Math.round(line.quantity * centsFromInput(line.price)), 0),
    [lines],
  )
  const discountCents = Math.min(subtotal, Math.max(0, centsFromInput(discount)))
  const taxCents = Math.round((subtotal - discountCents) * (Number(taxRate || 0) * 100) / 10000)
  const total = subtotal - discountCents + taxCents

  function patch(i: number, key: keyof Line, value: any) {
    setLines((prev) => prev.map((line, idx) => (idx === i ? { ...line, [key]: value } : line)))
  }

  function pickService(i: number, serviceID: string) {
    const svc = services.find((s) => s.id === serviceID)
    setLines((prev) => prev.map((line, idx) => idx === i
      ? {
        ...line,
        service_id: serviceID,
        description: svc?.name ?? line.description,
        price: svc ? dollars(svc.price_cents) : line.price,
      }
      : line))
  }

  // Specialty packs suggest the services this clinic type bills most often.
  // A matching catalogue entry keeps its catalogue id and current price.
  function addPreset(preset: ServicePreset) {
    const svc = services.find((s) => (s.code && s.code === preset.code) || s.name === preset.name)
    const line: Line = {
      service_id: svc?.id ?? '',
      description: svc?.name ?? preset.name,
      quantity: 1,
      price: dollars(svc?.price_cents ?? preset.price_cents),
    }
    setLines((prev) => {
      const empty = prev.findIndex((l) => !l.description.trim() && !l.service_id)
      if (empty >= 0) return prev.map((l, i) => (i === empty ? line : l))
      return [...prev, line]
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!patientID) {
      setError('Choose a patient.')
      return
    }
    const cleaned = lines.filter((l) => l.description.trim() && Number(l.quantity) > 0)
    if (!cleaned.length) {
      setError('Add at least one billed service.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const invoice = await api.createInvoice({
        patient_id: patientID,
        encounter_id: encounterID ?? '',
        issued_at: new Date().toISOString(),
        due_at: new Date(`${due}T23:59:59`).toISOString(),
        discount_cents: discountCents,
        tax_rate_bp: Math.round(Number(taxRate || 0) * 100),
        notes,
        items: cleaned.map((line) => ({
          service_id: line.service_id,
          description: line.description,
          quantity: Number(line.quantity),
          unit_price_cents: centsFromInput(line.price),
        })),
      })
      toast.success('Invoice created', `${invoice.number} · ${money(invoice.total_cents, clinic?.currency_symbol)}`)
      await qc.invalidateQueries()
      onSaved?.(invoice as Invoice)
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
      title="New invoice"
      description="Invoices are permanent once issued. Record a void if a correction is needed."
      size="xl"
      footer={(
        <>
          <div className="me-auto text-[12px]">
            <span className="text-faint">Total </span>
            <span className="text-[15px] font-semibold tabular-nums text-ink">{money(total, clinic?.currency_symbol)}</span>
          </div>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="invoice-form" loading={saving}>
            <ReceiptText size={14} /> Create invoice
          </Button>
        </>
      )}
    >
      <form id="invoice-form" onSubmit={submit} className="space-y-4">
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
              disabled={Boolean(presetPatient)}
              onChange={(id, p) => { setPatientID(id); setInitial(p) }}
              autoFocus={!presetPatient}
            />
          </Field>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="field-label mb-0">Services & items</span>
            <button type="button" onClick={() => setLines((prev) => [...prev, blankLine()])} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline dark:text-brand-300">
              <Plus size={12} /> Add line
            </button>
          </div>
          {pack.servicePresets.length > 0 && (
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">{pack.short}</span>
              {pack.servicePresets.map((preset) => (
                <button
                  key={preset.code}
                  type="button"
                  onClick={() => addPreset(preset)}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-muted transition hover:border-accent-300 hover:text-ink"
                  title={`${preset.category} · ${money(preset.price_cents, clinic?.currency_symbol)}`}
                >
                  <Plus size={9} /> {preset.name}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-xl border border-line bg-elevated/40 p-2.5">
                <div className="col-span-4">
                  <Field label="Service">
                    <Select value={line.service_id} onChange={(e) => pickService(i, e.target.value)}>
                      <option value="">Custom item</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} · {money(s.price_cents, clinic?.currency_symbol)}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="col-span-4">
                  <Field label="Description">
                    <Input value={line.description} onChange={(e) => patch(i, 'description', e.target.value)} placeholder="Consultation" />
                  </Field>
                </div>
                <div className="col-span-1">
                  <Field label="Qty">
                    <Input type="number" min={1} step="0.5" value={line.quantity} onChange={(e) => patch(i, 'quantity', Number(e.target.value))} />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label={`Unit (${clinic?.currency_symbol ?? '$'})`}>
                    <Input type="number" min={0} step="0.01" value={line.price} onChange={(e) => patch(i, 'price', e.target.value)} placeholder="0.00" />
                  </Field>
                </div>
                <div className="col-span-1 flex justify-end pb-0.5">
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} className="rounded-md p-1.5 text-faint transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <Field label="Discount" hint={`Applied before tax. Subtotal ${money(subtotal, clinic?.currency_symbol)}.`}>
              <Input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </Field>
            <Field label="Tax rate %">
              <Input type="number" min={0} step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
          </div>
          <div className="rounded-xl border border-line bg-elevated/50 p-3.5">
            <div className="flex items-center justify-between py-1 text-[12px]">
              <span className="text-muted">Subtotal</span>
              <span className="tabular-nums text-ink">{money(subtotal, clinic?.currency_symbol)}</span>
            </div>
            <div className="flex items-center justify-between py-1 text-[12px]">
              <span className="text-muted">Discount</span>
              <span className="tabular-nums text-ink">−{money(discountCents, clinic?.currency_symbol)}</span>
            </div>
            <div className="flex items-center justify-between py-1 text-[12px]">
              <span className="text-muted">Tax</span>
              <span className="tabular-nums text-ink">{money(taxCents, clinic?.currency_symbol)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2.5">
              <span className="text-[12px] font-semibold text-ink">Total due</span>
              <span className="text-[16px] font-semibold tabular-nums text-ink">{money(total, clinic?.currency_symbol)}</span>
            </div>
          </div>
        </div>

        <Field label="Note on invoice">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[58px]" placeholder="Optional message for the patient." />
        </Field>
      </form>
    </Sheet>
  )
}

export function PaymentDialog({
  open, onClose, invoice, onSaved,
}: {
  open: boolean
  onClose: () => void
  invoice?: Invoice | null
  onSaved?: (invoice: Invoice) => void
}) {
  const { clinic } = useApp()
  const qc = useQueryClient()
  const toast = useToast()
  const balance = Math.max(0, (invoice?.total_cents ?? 0) - (invoice?.paid_cents ?? 0))
  const [amount, setAmount] = useState(dollars(balance))
  const [method, setMethod] = useState('card')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setAmount(dollars(balance))
    setMethod('card')
    setReference('')
    setNotes('')
    setError('')
  }, [open, invoice?.id, balance])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!invoice) return
    const cents = centsFromInput(amount)
    if (cents <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await api.addPayment({
        invoice_id: invoice.id,
        amount_cents: cents,
        method,
        reference,
        notes,
      })
      toast.success('Payment recorded', `${money(cents, clinic?.currency_symbol)} · ${invoice.number}`)
      await qc.invalidateQueries()
      onSaved?.(saved as Invoice)
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
      title="Record a payment"
      description={invoice ? `${invoice.number} · balance ${money(balance, clinic?.currency_symbol)}` : undefined}
      size="sm"
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="payment-form" loading={saving}>
            <Banknote size={14} /> Record payment
          </Button>
        </>
      )}
    >
      <form id="payment-form" onSubmit={submit} className="space-y-3.5">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">{error}</div>}
        <Field label={`Amount (${clinic?.currency_symbol ?? '$'})`}>
          <Input autoFocus type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[balance, Math.round(balance / 2), 5000].filter((c, i, arr) => c > 0 && arr.indexOf(c) === i).map((c) => (
            <button key={c} type="button" onClick={() => setAmount(dollars(c))} className="rounded-full border border-line px-2.5 py-1 text-[10.5px] text-muted hover:border-brand-300 hover:text-brand-800">
              {money(c, clinic?.currency_symbol)}
            </button>
          ))}
        </div>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank">Bank transfer</option>
            <option value="insurance">Insurance</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt or card reference" /></Field>
        <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[54px]" /></Field>
      </form>
    </Sheet>
  )
}

export function ServiceDialog({
  open, onClose, service,
}: {
  open: boolean
  onClose: () => void
  service?: Service | null
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({ name: '', code: '', category: '', price: '', duration_min: 30, active: true, description: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      name: service?.name ?? '',
      code: service?.code ?? '',
      category: service?.category ?? '',
      price: service ? dollars(service.price_cents) : '',
      duration_min: service?.duration_min ?? 30,
      active: service ? Number(service.active) !== 0 : true,
      description: service?.description ?? '',
    })
    setError('')
  }, [open, service?.id])

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('A service name is required.')
      return
    }
    setSaving(true)
    try {
      await api.saveService({
        id: service?.id ?? '',
        name: form.name.trim(),
        code: form.code,
        category: form.category,
        price_cents: centsFromInput(form.price),
        duration_min: Number(form.duration_min) || 30,
        active: form.active ? 1 : 0,
        description: form.description,
      })
      toast.success(service ? 'Service updated' : 'Service added', form.name)
      await qc.invalidateQueries()
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
      title={service ? 'Edit service' : 'Add a service'}
      description="Services appear in the invoice builder and can be filtered by category."
      size="sm"
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="service-form" loading={saving}>Save</Button>
        </>
      )}
    >
      <form id="service-form" onSubmit={submit} className="space-y-3.5">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">{error}</div>}
        <Field label="Name"><Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Follow-up visit" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code"><Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="CONS-FU" /></Field>
          <Field label="Category"><Input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Consultations" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price"><Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} /></Field>
          <Field label="Minutes"><Input type="number" min={5} step={5} value={form.duration_min} onChange={(e) => set('duration_min', Number(e.target.value))} /></Field>
        </div>
        <Field label="Description"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} className="min-h-[58px]" /></Field>
        <Toggle checked={form.active} onChange={(v) => set('active', v)} label="Active" description="Inactive services stay on historical invoices but cannot be selected." />
      </form>
    </Sheet>
  )
}
