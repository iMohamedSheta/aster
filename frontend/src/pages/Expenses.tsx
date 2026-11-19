import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, Banknote, CalendarDays, Download, Loader2, MoreHorizontal,
  Pencil, Plus, ReceiptText, Trash2, TrendingDown, Wallet,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { cn, fmtDate, fmtMoment, formatNumber, isoLocal, money, titleCase } from '../lib/format'
import type { Expense } from '../lib/types'
import {
  Badge, Button, ConfirmDialog, Dropdown, EmptyState, Field, IconButton, Input, MenuItem,
  PageHeader, SectionCard, Select, Sheet, Textarea,
} from '../components/ui'
import { useToast } from '../components/Toast'

const categories = [
  'rent', 'salaries', 'supplies', 'utilities', 'maintenance', 'marketing',
  'insurance', 'laboratory', 'software', 'equipment', 'training', 'other',
]

const categoryTone: Record<string, string> = {
  rent: '#2a3747', salaries: '#a85833', supplies: '#4f7fab', utilities: '#8d8f8c',
  maintenance: '#9c8455', marketing: '#c4506d', insurance: '#526379', laboratory: '#7d5a78',
  software: '#2f6d9e', equipment: '#6b5a45', training: '#c9885b', other: '#9aa8a3',
}

const emptyForm = {
  category: 'supplies', vendor: '', description: '', amount: '', spent_on: isoLocal(new Date()),
  method: 'bank', reference: '', notes: '',
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function shiftMonth(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

export function Expenses() {
  const { clinic, locations, activeLocation } = useApp()
  const toast = useToast()
  const qc = useQueryClient()
  const [month, setMonth] = useState(() => monthStart(new Date()))
  const [scopeAll, setScopeAll] = useState(false)
  const [open, setOpen] = useState(false)
  const [editID, setEditID] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Expense | null>(null)
  const [exporting, setExporting] = useState(false)
  const symbol = clinic?.currency_symbol

  const from = isoLocal(month)
  const to = isoLocal(monthEnd(month))
  const prev = shiftMonth(month, -1)
  const scope = scopeAll ? '' : (activeLocation?.id ?? '')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['expenses', from, to, scope],
    queryFn: () => api.expenses(from, to, scope),
  })
  const { data: previous = [] } = useQuery({
    queryKey: ['expenses', isoLocal(prev), isoLocal(monthEnd(prev)), scope],
    queryFn: () => api.expenses(isoLocal(prev), isoLocal(monthEnd(prev)), scope),
  })

  const totals = useMemo(() => {
    const total = rows.reduce((sum, r) => sum + Number(r.amount_cents ?? 0), 0)
    const prevTotal = previous.reduce((sum, r) => sum + Number(r.amount_cents ?? 0), 0)
    const byCategory = new Map<string, number>()
    for (const row of rows) {
      byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + Number(row.amount_cents ?? 0))
    }
    const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
    return {
      total, prevTotal, ranked,
      delta: prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0,
      top: ranked[0],
      average: rows.length ? total / rows.length : 0,
    }
  }, [rows, previous])

  function openNew() {
    setEditID('')
    setForm({
      ...emptyForm,
      spent_on: month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth()
        ? isoLocal(new Date())
        : isoLocal(month),
    })
    setOpen(true)
  }

  function openEdit(row: Expense) {
    setEditID(row.id)
    setForm({
      category: row.category, vendor: row.vendor, description: row.description,
      amount: (Number(row.amount_cents) / 100).toFixed(2), spent_on: row.spent_on,
      method: row.method, reference: row.reference, notes: row.notes,
    })
    setOpen(true)
  }

  async function save() {
    if (!form.description.trim()) return toast.error('Describe the expense', 'A short label makes the monthly review easier.')
    if (!(Number(form.amount) > 0)) return toast.error('Enter an amount', 'Expenses must be greater than zero.')
    setSaving(true)
    try {
      const fields: any = {
        category: form.category, vendor: form.vendor, description: form.description,
        amount_cents: Math.round((Number(form.amount) || 0) * 100), spent_on: form.spent_on,
        method: form.method, reference: form.reference, notes: form.notes,
      }
      if (editID) fields.id = editID
      await api.saveExpense(fields)
      await qc.invalidateQueries({ queryKey: ['expenses'] })
      await qc.invalidateQueries({ queryKey: ['reports'] })
      toast.success(editID ? 'Expense updated' : 'Expense recorded', form.description)
      setOpen(false)
      setEditID('')
    } catch (e: any) {
      toast.error('Could not save the expense', String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  async function archive() {
    if (!archiveTarget) return
    try {
      await api.deleteEntity('expenses', archiveTarget.id)
      await qc.invalidateQueries({ queryKey: ['expenses'] })
      await qc.invalidateQueries({ queryKey: ['reports'] })
      toast.success('Expense removed', archiveTarget.description)
      setArchiveTarget(null)
    } catch (e: any) {
      toast.error('Could not remove the expense', String(e?.message ?? e))
    }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      const csv = [
        ['Date', 'Category', 'Vendor', 'Description', 'Clinic', 'Method', 'Reference', 'Amount'],
        ...rows.map((r) => [
          r.spent_on, r.category, r.vendor, r.description, r.location_name || '',
          r.method, r.reference, (Number(r.amount_cents) / 100).toFixed(2),
        ]),
      ].map((line) => line.map((cell) => {
        const text = String(cell ?? '')
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
      }).join(',')).join('\r\n')
      await api.saveExport(`aster-expenses-${from.slice(0, 7)}.csv`, csv)
      toast.success('Expense export ready', `${rows.length} rows`)
    } catch (e: any) {
      toast.error('Could not export expenses', String(e?.message ?? e))
    } finally {
      setExporting(false)
    }
  }

  const monthLabel = fmtMoment(month, 'LLLL yyyy')

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Expenses"
        description="Rent, payroll, supplies and the running costs of the network. Expenses feed the net figures in Reports."
        actions={(
          <>
            <Button onClick={exportCSV} loading={exporting}><Download size={14} /> Export</Button>
            <Button variant="primary" onClick={openNew}><Plus size={14} /> Record expense</Button>
          </>
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
          <IconButton label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="h-7 w-7"><ArrowLeft size={14} className="rtl:rotate-180" /></IconButton>
          <span className="min-w-[132px] px-2 text-center text-[11.5px] font-semibold text-ink">{monthLabel}</span>
          <IconButton label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className="h-7 w-7"><ArrowRight size={14} className="rtl:rotate-180" /></IconButton>
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
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Spent this month</div>
          <div className="stat-value mt-1.5 text-[24px] font-semibold leading-none text-ink">{money(totals.total, symbol)}</div>
          <div className="mt-1.5 text-[10px] text-faint">{formatNumber(rows.length)} record{rows.length === 1 ? '' : 's'}</div>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Versus last month</div>
          <div className={cn('stat-value mt-1.5 text-[24px] font-semibold leading-none', totals.delta > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-300')}>
            {totals.prevTotal ? `${totals.delta > 0 ? '+' : ''}${totals.delta}%` : '—'}
          </div>
          <div className="mt-1.5 text-[10px] text-faint">{money(totals.prevTotal, symbol)} last month</div>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Largest category</div>
          <div className="stat-value mt-1.5 truncate text-[20px] font-semibold leading-none text-ink">{totals.top ? titleCase(totals.top[0]) : '—'}</div>
          <div className="mt-1.5 text-[10px] text-faint">{totals.top ? money(totals.top[1], symbol) : 'No expenses yet'}</div>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Average record</div>
          <div className="stat-value mt-1.5 text-[24px] font-semibold leading-none text-ink">{money(totals.average, symbol)}</div>
          <div className="mt-1.5 text-[10px] text-faint">Across this month</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-accent-600" />
              <h2 className="text-[13px] font-semibold text-ink">Expense register</h2>
              <Badge tone="neutral">{formatNumber(rows.length)}</Badge>
            </div>
            <span className="text-[10px] text-faint">{scopeAll ? 'All clinics' : activeLocation?.name}</span>
          </div>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center"><Loader2 size={20} className="animate-spin text-faint" /></div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<ReceiptText size={18} />}
                title="No expenses recorded"
                description="Record rent, payroll and supplies to see the true cost of running the clinic."
                action={<Button variant="primary" size="sm" onClick={openNew}><Plus size={13} /> Record expense</Button>}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="border-b border-line bg-elevated/50">
                    <th className="table-head px-4 py-2.5">Date</th>
                    <th className="table-head px-3 py-2.5">Expense</th>
                    <th className="table-head px-3 py-2.5">Category</th>
                    {locations.length > 1 && <th className="table-head px-3 py-2.5">Clinic</th>}
                    <th className="table-head px-3 py-2.5">Method</th>
                    <th className="table-head px-3 py-2.5 text-end">Amount</th>
                    <th className="w-10 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-line/70 last:border-0 hover:bg-elevated/30">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[11px] tabular-nums text-muted">{fmtDate(row.spent_on, 'd MMM')}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-[11.5px] font-medium text-ink">{row.description}</div>
                        <div className="truncate text-[9.5px] text-faint">{row.vendor || 'No vendor'}{row.reference ? ` · ${row.reference}` : ''}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: categoryTone[row.category] || '#9aa8a3' }} />
                          {titleCase(row.category)}
                        </span>
                      </td>
                      {locations.length > 1 && (
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: row.location_color || '#2a3747' }} />
                            <span className="max-w-[130px] truncate">{row.location_name}</span>
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-[10.5px] text-muted">{titleCase(row.method)}</td>
                      <td className="px-3 py-2.5 text-end text-[12px] font-semibold tabular-nums text-ink">{money(Number(row.amount_cents), symbol)}</td>
                      <td className="px-2 py-2.5">
                        <Dropdown align="right" trigger={<IconButton label="Expense actions" className="h-7 w-7"><MoreHorizontal size={14} /></IconButton>}>
                          <MenuItem icon={<Pencil size={13} />} onClick={() => openEdit(row)}>Edit expense</MenuItem>
                          <div className="my-1 h-px bg-line" />
                          <MenuItem icon={<Trash2 size={13} />} danger onClick={() => setArchiveTarget(row)}>Delete</MenuItem>
                        </Dropdown>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[10px] text-faint">
            <span>{fmtDate(from, 'd MMM yyyy')} – {fmtDate(to, 'd MMM yyyy')}</span>
            <span className="font-semibold text-ink">{money(totals.total, symbol)}</span>
          </div>
        </section>

        <div className="space-y-4">
          <SectionCard title="Where the money goes" subtitle="This month by category">
            {totals.ranked.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-faint">No category data yet.</div>
            ) : (
              <div className="space-y-3">
                {totals.ranked.map(([category, cents]) => {
                  const share = totals.total ? Math.round((cents / totals.total) * 100) : 0
                  return (
                    <div key={category}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-[10.5px]">
                        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: categoryTone[category] || '#9aa8a3' }} />
                          {titleCase(category)}
                        </span>
                        <span className="tabular-nums text-muted">{money(cents, symbol)} · {share}%</span>
                      </div>
                      <div className="h-[4px] overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, background: categoryTone[category] || '#9aa8a3' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SectionCard>

          <div className="card p-4">
            <div className="flex items-center gap-2 text-[11.5px] font-semibold text-ink"><Banknote size={14} className="text-accent-600" /> Net position</div>
            <p className="mt-2 text-[10.5px] leading-4 text-muted">
              Reports compare collected payments with these expenses. A profitable month is one where collections cover the running costs and still leave a margin.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
              <div>
                <div className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-faint">Expenses</div>
                <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-ink">{money(totals.total, symbol)}</div>
              </div>
              <div>
                <div className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-faint">Change</div>
                <div className={cn('mt-0.5 inline-flex items-center gap-1 text-[14px] font-semibold tabular-nums', totals.delta > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-300')}>
                  {totals.delta > 0 ? <TrendingDown size={13} /> : <Wallet size={13} />}
                  {totals.prevTotal ? `${totals.delta > 0 ? '+' : ''}${totals.delta}%` : '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 text-[11.5px] font-semibold text-ink"><CalendarDays size={14} className="text-faint" /> Fixed costs</div>
            <p className="mt-2 text-[10.5px] leading-4 text-muted">Rent and payroll usually dominate. Compare them with collected revenue in Reports before deciding where to trim.</p>
          </div>
        </div>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editID ? 'Edit expense' : 'Record expense'}
        description="Operating costs reduce the net figure in reports. Attach a reference for the bookkeeper."
        footer={(
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>{editID ? 'Save changes' : 'Record expense'}</Button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Description" className="sm:col-span-2"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Monthly clinic rent" /></Field>
          <Field label={`Amount (${clinic?.currency || 'USD'})`}><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} /></Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
            </Select>
          </Field>
          <Field label="Payment method">
            <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="bank">Bank transfer</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Vendor"><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Optional" /></Field>
          <Field label="Reference"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Invoice or receipt number" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What this covered…" /></Field>
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={archive}
        title="Delete this expense?"
        description={`${archiveTarget?.description ?? 'This record'} will be removed from reports. The audit log keeps the history.`}
        confirmLabel="Delete expense"
        tone="danger"
      />
    </div>
  )
}
