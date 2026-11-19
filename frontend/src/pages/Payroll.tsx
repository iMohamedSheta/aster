import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, Banknote, CalendarDays, CheckCircle2, HandCoins, Lock, Pencil,
  Plus, Trash2, Undo2, Users,
} from 'lucide-react'
import { api } from '../lib/api'
import { roleLabel, useApp } from '../lib/AppContext'
import { cn, fmtDate, formatNumber, isoLocal, money } from '../lib/format'
import { translate } from '../lib/i18n'
import type { PayrollRow } from '../lib/types'
import {
  Avatar, Badge, Button, Checkbox, ConfirmDialog, EmptyState, Field, IconButton, Input,
  PageHeader, Select, Sheet, Spinner, Textarea,
} from '../components/ui'
import { useToast } from '../components/Toast'

function currentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function shiftPeriod(period: string, delta: number) {
  const [year, month] = period.split('-').map(Number)
  const next = new Date(year, (month || 1) - 1 + delta, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

function centsInput(cents?: number) {
  return ((cents ?? 0) / 100).toFixed(2)
}

function inputCents(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0
}

const emptySalary = { base: '0.00', allowances: '0.00', deductions: '0.00', notes: '', keepDefault: true }

export function Payroll() {
  const { clinic, locations, activeLocation, currentStaff } = useApp()
  const toast = useToast()
  const qc = useQueryClient()
  const isOwner = currentStaff?.role === 'owner'
  const symbol = clinic?.currency_symbol

  const [period, setPeriod] = useState(currentPeriod)
  const [scopeAll, setScopeAll] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)

  const [salaryRow, setSalaryRow] = useState<PayrollRow | null>(null)
  const [salaryForm, setSalaryForm] = useState(emptySalary)

  const [payRow, setPayRow] = useState<PayrollRow | null>(null)
  const [payForm, setPayForm] = useState({ method: 'bank', reference: '', paid_on: isoLocal(new Date()) })

  const [deleteRow, setDeleteRow] = useState<PayrollRow | null>(null)
  const [unpayRow, setUnpayRow] = useState<PayrollRow | null>(null)

  const scope = scopeAll ? '' : (activeLocation?.id ?? '')
  const { data, isLoading } = useQuery({
    queryKey: ['payroll', period, scope],
    queryFn: () => api.payroll(period, scope),
    enabled: isOwner,
  })

  const rows = data?.rows ?? []
  const totals = data?.totals
  const monthLabel = fmtDate(`${period}-01`, 'LLLL yyyy')

  const summary = useMemo(() => rows.reduce((acc, row) => {
    if (row.status === 'paid') acc.paid += Number(row.net_cents ?? 0)
    else acc.pending += Number(row.net_cents ?? 0)
    return acc
  }, { paid: 0, pending: 0 }), [rows])

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['payroll'] })
    await qc.invalidateQueries({ queryKey: ['expenses'] })
    await qc.invalidateQueries({ queryKey: ['reports'] })
    await qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  function openSalary(row: PayrollRow) {
    setSalaryRow(row)
    setSalaryForm({
      base: centsInput(row.base_cents),
      allowances: centsInput(row.allowances_cents),
      deductions: centsInput(row.deductions_cents),
      notes: row.status === 'draft' || row.status === 'paid' ? row.notes : row.profile_notes,
      keepDefault: row.status === 'not_generated',
    })
  }

  async function saveSalary() {
    if (!salaryRow) return
    const base = inputCents(salaryForm.base)
    const allowances = inputCents(salaryForm.allowances)
    const deductions = inputCents(salaryForm.deductions)
    if (base + allowances - deductions < 0) {
      toast.error('Check the deductions', 'Deductions cannot be more than the salary and allowances.')
      return
    }
    setSaving(true)
    try {
      if (salaryForm.keepDefault) {
        await api.saveStaffPay(salaryRow.staff_id, base, allowances, deductions, salaryForm.notes)
      }
      if (salaryRow.status === 'draft') {
        await api.savePayrollEntry({
          id: salaryRow.entry_id, base_cents: base, allowances_cents: allowances,
          deductions_cents: deductions, notes: salaryForm.notes,
        })
      } else if (salaryRow.status === 'not_generated') {
        await api.savePayrollEntry({
          staff_id: salaryRow.staff_id, period, base_cents: base, allowances_cents: allowances,
          deductions_cents: deductions, notes: salaryForm.notes,
        })
      }
      await refresh()
      toast.success(
        salaryRow.status === 'draft' ? 'Salary line updated' : 'Salary saved',
        salaryRow.full_name,
      )
      setSalaryRow(null)
    } catch (e: any) {
      toast.error('Could not save the salary', String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  async function addToMonth(row: PayrollRow) {
    try {
      await api.savePayrollEntry({ staff_id: row.staff_id, period })
      await refresh()
      toast.success('Added to this month', row.full_name)
    } catch (e: any) {
      toast.error('Could not add the salary', String(e?.message ?? e))
    }
  }

  function openPay(row: PayrollRow) {
    setPayRow(row)
    setPayForm({ method: 'bank', reference: '', paid_on: isoLocal(new Date()) })
  }

  async function paySalary() {
    if (!payRow) return
    setPaying(true)
    try {
      await api.payPayrollEntry(payRow.entry_id, payForm.method, payForm.reference, payForm.paid_on)
      await refresh()
      toast.success('Salary paid', `${payRow.full_name} · ${money(payRow.net_cents, symbol)}`)
      setPayRow(null)
    } catch (e: any) {
      toast.error('Could not record the payment', String(e?.message ?? e))
    } finally {
      setPaying(false)
    }
  }

  async function unpay() {
    if (!unpayRow) return
    try {
      await api.unpayPayrollEntry(unpayRow.entry_id)
      await refresh()
      toast.success('Payment reversed', 'The salary expense was removed too.')
    } catch (e: any) {
      toast.error('Could not reverse the payment', String(e?.message ?? e))
    } finally {
      setUnpayRow(null)
    }
  }

  async function removeEntry() {
    if (!deleteRow) return
    try {
      await api.deletePayrollEntry(deleteRow.entry_id)
      await refresh()
      toast.success('Salary line removed', deleteRow.full_name)
    } catch (e: any) {
      toast.error('Could not remove the salary line', String(e?.message ?? e))
    } finally {
      setDeleteRow(null)
    }
  }

  async function generate() {
    setGenerating(true)
    try {
      const next = await api.generatePayroll(period, scope)
      await refresh()
      if (next.generated > 0) {
        toast.success('Payroll generated', `${next.generated} salary lines added.`)
      } else {
        toast.info('No new salary lines', 'Every salaried team member already has a line for this month.')
      }
    } catch (e: any) {
      toast.error('Could not generate payroll', String(e?.message ?? e))
    } finally {
      setGenerating(false)
    }
  }

  if (!isOwner) {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Finance"
          title="Payroll"
          description="Monthly salaries for the clinic team, kept separate from clinical records."
        />
        <EmptyState
          icon={<Lock size={18} />}
          title="Only the clinic manager can see salaries."
          description="Sign in with the clinic manager account to review, pay and correct the salary register."
        />
      </div>
    )
  }

  const salaryNet = inputCents(salaryForm.base) + inputCents(salaryForm.allowances) - inputCents(salaryForm.deductions)
  const paidRow = salaryRow?.status === 'paid'

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Payroll"
        description="Monthly salaries for the clinic team. Paying a line records the matching expense in Finance."
        actions={(
          <Button variant="copper" onClick={generate} loading={generating}>
            <Plus size={14} /> Generate payroll
          </Button>
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
          <IconButton label="Previous month" onClick={() => setPeriod(shiftPeriod(period, -1))} className="h-7 w-7">
            <ArrowLeft size={14} className="rtl:rotate-180" />
          </IconButton>
          <span className="min-w-[140px] px-2 text-center text-[11.5px] font-semibold text-ink">{monthLabel}</span>
          <IconButton label="Next month" onClick={() => setPeriod(shiftPeriod(period, 1))} className="h-7 w-7">
            <ArrowRight size={14} className="rtl:rotate-180" />
          </IconButton>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Scope</span>
          <Select value={scopeAll ? 'all' : 'active'} onChange={(e) => setScopeAll(e.target.value === 'all')} className="h-8 w-[170px] text-[11.5px]">
            <option value="active">{activeLocation?.name ?? 'Active clinic'}</option>
            {locations.length > 1 && <option value="all">All clinics</option>}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        <div className="bg-surface px-4 py-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Net payroll</div>
          <div className="stat-value mt-1.5 text-[23px] font-semibold leading-none text-ink">{money(totals?.net_cents ?? 0, symbol)}</div>
          <div className="mt-1.5 text-[10px] text-faint">{formatNumber(totals?.entry_count ?? 0)} lines on the register</div>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Paid this month</div>
          <div className="stat-value mt-1.5 text-[23px] font-semibold leading-none text-emerald-600 dark:text-emerald-300">{money(summary.paid, symbol)}</div>
          <div className="mt-1.5 text-[10px] text-faint">{formatNumber(totals?.paid_count ?? 0)} salaries settled</div>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Still to pay</div>
          <div className={cn('stat-value mt-1.5 text-[23px] font-semibold leading-none', summary.pending > 0 ? 'text-accent-700 dark:text-accent-300' : 'text-ink')}>{money(summary.pending, symbol)}</div>
          <div className="mt-1.5 text-[10px] text-faint">{formatNumber(totals?.draft_count ?? 0)} drafts waiting</div>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Salaried team</div>
          <div className="stat-value mt-1.5 text-[23px] font-semibold leading-none text-ink">{formatNumber(totals?.salaried_count ?? 0)}</div>
          <div className="mt-1.5 text-[10px] text-faint">of {formatNumber(totals?.staff_count ?? 0)} active people</div>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-accent-600" />
            <h2 className="text-[13px] font-semibold text-ink">Salary register</h2>
            <Badge tone="neutral">{formatNumber(rows.length)}</Badge>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-faint">
            <CalendarDays size={12} /> {monthLabel}
            <span>·</span>
            <span>{scopeAll ? 'All clinics' : activeLocation?.name}</span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Users size={18} />}
              title="No active team members"
              description="Add team members in Settings → Team, then set a salary for each person."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-elevated/50">
                  <th className="table-head px-4 py-2.5">Team member</th>
                  <th className="table-head px-3 py-2.5 text-end">Base</th>
                  <th className="table-head px-3 py-2.5 text-end">Allowances</th>
                  <th className="table-head px-3 py-2.5 text-end">Deductions</th>
                  <th className="table-head px-3 py-2.5 text-end">Net</th>
                  <th className="table-head px-3 py-2.5">Status</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const generated = row.status === 'draft' || row.status === 'paid'
                  return (
                    <tr key={row.staff_id} className="border-b border-line/70 last:border-0 hover:bg-elevated/30">
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={row.full_name} size={30} />
                          <div className="min-w-0">
                            <div className="truncate text-[11.5px] font-semibold text-ink">{row.full_name}</div>
                            <div className="truncate text-[9.5px] text-faint">
                              {translate(roleLabel(row.role))}{row.title ? ` · ${row.title}` : ''}
                              {scopeAll && row.location_name ? ` · ${row.location_name}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-end font-mono text-[11px] tabular-nums text-muted">{money(row.base_cents, symbol)}</td>
                      <td className="px-3 py-3 text-end font-mono text-[11px] tabular-nums text-muted">{money(row.allowances_cents, symbol)}</td>
                      <td className="px-3 py-3 text-end font-mono text-[11px] tabular-nums text-muted">{money(row.deductions_cents, symbol)}</td>
                      <td className={cn('px-3 py-3 text-end font-mono text-[12px] font-semibold tabular-nums', generated ? 'text-ink' : 'text-muted')}>{money(row.net_cents, symbol)}</td>
                      <td className="px-3 py-3">
                        {row.status === 'paid' ? (
                          <div className="flex flex-col gap-1">
                            <Badge tone="success" dot>Paid</Badge>
                            <span className="text-[9px] text-faint">{fmtDate(row.paid_on)}</span>
                          </div>
                        ) : row.status === 'draft' ? (
                          <Badge tone="warning" dot>Draft</Badge>
                        ) : (
                          <Badge tone="neutral" dot>Not added</Badge>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {row.status === 'not_generated' && (
                            row.has_salary ? (
                              <Button size="sm" onClick={() => addToMonth(row)}>
                                <Plus size={12} /> Add to month
                              </Button>
                            ) : (
                              <Button size="sm" variant="copper" onClick={() => openSalary(row)}>
                                <HandCoins size={12} /> Set salary
                              </Button>
                            )
                          )}
                          {row.status === 'draft' && (
                            <>
                              <IconButton label="Edit this month's salary" onClick={() => openSalary(row)}><Pencil size={14} /></IconButton>
                              <Button size="sm" variant="copper" onClick={() => openPay(row)}><Banknote size={12} /> Pay</Button>
                              <IconButton label="Remove salary line" onClick={() => setDeleteRow(row)}><Trash2 size={14} /></IconButton>
                            </>
                          )}
                          {row.status === 'paid' && (
                            <Button size="sm" variant="ghost" onClick={() => setUnpayRow(row)}>
                              <Undo2 size={12} /> Undo payment
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Sheet
        open={Boolean(salaryRow)}
        onClose={() => setSalaryRow(null)}
        title={salaryRow ? `${translate(paidRow ? 'Salary details' : 'Salary')} · ${salaryRow.full_name}` : translate('Salary')}
        description={paidRow
          ? translate('This salary is paid. Undo the payment before changing it.')
          : translate('Set the base salary, allowances and deductions for this month.')}
        footer={salaryRow ? (
          paidRow ? (
            <Button onClick={() => setSalaryRow(null)}>{translate('Close')}</Button>
          ) : (
            <>
              <Button onClick={() => setSalaryRow(null)}>{translate('Cancel')}</Button>
              <Button variant="copper" onClick={saveSalary} loading={saving}>
                <CheckCircle2 size={14} /> {translate('Save salary')}
              </Button>
            </>
          )
        ) : null}
      >
        {salaryRow && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-elevated/40 px-3.5 py-3">
              <Avatar name={salaryRow.full_name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{salaryRow.full_name}</div>
                <div className="text-[10.5px] text-muted">
                  {translate(roleLabel(salaryRow.role))} · {monthLabel}
                </div>
              </div>
              {salaryRow.status === 'paid'
                ? <Badge tone="success">Paid</Badge>
                : salaryRow.status === 'draft'
                  ? <Badge tone="warning">Draft</Badge>
                  : <Badge tone="neutral">Not added</Badge>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Base salary">
                <Input type="number" min="0" step="0.01" inputMode="decimal" disabled={paidRow}
                  value={salaryForm.base}
                  onChange={(e) => setSalaryForm({ ...salaryForm, base: e.target.value })} />
              </Field>
              <Field label="Allowances">
                <Input type="number" min="0" step="0.01" inputMode="decimal" disabled={paidRow}
                  value={salaryForm.allowances}
                  onChange={(e) => setSalaryForm({ ...salaryForm, allowances: e.target.value })} />
              </Field>
              <Field label="Deductions">
                <Input type="number" min="0" step="0.01" inputMode="decimal" disabled={paidRow}
                  value={salaryForm.deductions}
                  onChange={(e) => setSalaryForm({ ...salaryForm, deductions: e.target.value })} />
              </Field>
              <div className="rounded-lg border border-line bg-elevated/40 px-3 py-2.5">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">Net pay</div>
                <div className="mt-1 font-mono text-[16px] font-semibold text-ink">{money(salaryNet, symbol)}</div>
              </div>
            </div>

            <Field label="Notes" hint={translate('Visible only to the clinic manager.')}>
              <Textarea rows={2} disabled={paidRow} value={salaryForm.notes}
                onChange={(e) => setSalaryForm({ ...salaryForm, notes: e.target.value })} />
            </Field>

            {!paidRow && (
              <Checkbox
                checked={salaryForm.keepDefault}
                onChange={(value) => setSalaryForm({ ...salaryForm, keepDefault: value })}
                label={translate('Use as the default salary for future months')}
                description={translate('The current month keeps its own figures. Future months start from these amounts.')}
              />
            )}

            {paidRow && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-[11.5px] leading-5 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
                <div className="font-semibold">{translate('Paid')} {fmtDate(salaryRow.paid_on)}</div>
                <div className="mt-1">
                  {translate('Method')}: {translate(salaryRow.method === 'bank' ? 'Bank transfer' : salaryRow.method === 'card' ? 'Card' : 'Cash')}
                  {salaryRow.reference ? ` · ${salaryRow.reference}` : ''}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <Sheet
        open={Boolean(payRow)}
        onClose={() => setPayRow(null)}
        title={payRow ? `${translate('Pay salary')} · ${payRow.full_name}` : translate('Pay salary')}
        description={translate('Recording the payment also posts a salary expense to Finance.')}
        footer={payRow ? (
          <>
            <Button onClick={() => setPayRow(null)}>{translate('Cancel')}</Button>
            <Button variant="copper" onClick={paySalary} loading={paying}>
              <Banknote size={14} /> {translate('Record payment')}
            </Button>
          </>
        ) : null}
      >
        {payRow && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-elevated/40 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] text-muted">{monthLabel}</span>
                <span className="font-mono text-[18px] font-semibold text-ink">{money(payRow.net_cents, symbol)}</span>
              </div>
              <div className="mt-1 text-[10.5px] text-faint">
                {translate('Base')} {money(payRow.base_cents, symbol)} · {translate('Allowances')} {money(payRow.allowances_cents, symbol)} · {translate('Deductions')} {money(payRow.deductions_cents, symbol)}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Payment method">
                <Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                  <option value="bank">{translate('Bank transfer')}</option>
                  <option value="cash">{translate('Cash')}</option>
                  <option value="card">{translate('Card')}</option>
                </Select>
              </Field>
              <Field label="Payment date">
                <Input type="date" value={payForm.paid_on} onChange={(e) => setPayForm({ ...payForm, paid_on: e.target.value })} />
              </Field>
            </div>
            <Field label="Reference">
              <Input value={payForm.reference} placeholder={translate('Transfer or receipt number')}
                onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
            </Field>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteRow)}
        onClose={() => setDeleteRow(null)}
        onConfirm={removeEntry}
        title={translate('Remove this salary line?')}
        description={translate('The draft line is removed from this month. The saved salary default is kept.')}
        confirmLabel={translate('Remove')}
        tone="danger"
      />
      <ConfirmDialog
        open={Boolean(unpayRow)}
        onClose={() => setUnpayRow(null)}
        onConfirm={unpay}
        title={translate('Undo this salary payment?')}
        description={translate('The salary returns to draft and the linked expense is removed from Finance.')}
        confirmLabel={translate('Undo payment')}
        tone="danger"
      />
    </div>
  )
}
