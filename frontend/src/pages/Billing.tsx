import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote, Eye, MoreHorizontal, Percent, Plus, Printer, ReceiptText, Search, Wallet, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { cn, fmtDate, money, plural } from '../lib/format'
import type { Invoice } from '../lib/types'
import {
  Badge, Button, Dropdown, EmptyState, IconButton, MenuItem, PageHeader, StatusBadge,
} from '../components/ui'
import { InvoiceDetailModal } from '../components/InvoiceDetailModal'
import { InvoiceDialog, PaymentDialog } from '../components/BillingDialogs'

type Filter = 'all' | 'open' | 'paid' | 'void'

const filterTabs: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All invoices' },
  { value: 'open', label: 'Open' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
]

function balanceOf(inv: Invoice) {
  return Math.max(0, (inv.total_cents ?? 0) - (inv.paid_cents ?? 0))
}

export function Billing() {
  const { clinic } = useApp()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>((params.get('filter') as Filter) || 'all')
  const [query, setQuery] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [paymentFor, setPaymentFor] = useState<Invoice | null>(null)

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices', 'all'],
    queryFn: () => api.invoices('all') as Promise<Invoice[]>,
  })

  useEffect(() => {
    if (params.get('new') === '1') {
      setInvoiceOpen(true)
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  useEffect(() => {
    const next = params.get('filter')
    if (next && ['all', 'open', 'paid', 'void'].includes(next)) setFilter(next as Filter)
  }, [params])

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: invoices.length, open: 0, paid: 0, void: 0 }
    for (const inv of invoices) {
      if (inv.status === 'void') out.void += 1
      else if (inv.status === 'paid') out.paid += 1
      else out.open += 1
    }
    return out
  }, [invoices])

  const totals = useMemo(() => {
    let outstanding = 0
    let billed = 0
    let collected = 0
    for (const inv of invoices) {
      if (inv.status === 'void') continue
      billed += inv.total_cents ?? 0
      collected += inv.paid_cents ?? 0
      outstanding += balanceOf(inv)
    }
    return { outstanding, billed, collected, rate: billed > 0 ? Math.round((collected / billed) * 100) : 0 }
  }, [invoices])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return invoices.filter((inv) => {
      if (filter === 'open' && !['unpaid', 'partial'].includes(inv.status)) return false
      if (filter === 'paid' && inv.status !== 'paid') return false
      if (filter === 'void' && inv.status !== 'void') return false
      if (!q) return true
      return [inv.number, inv.first_name, inv.last_name, inv.mrn, inv.status]
        .join(' ').toLowerCase().includes(q)
    })
  }, [invoices, filter, query])

  function changeFilter(next: Filter) {
    setFilter(next)
    const p = new URLSearchParams(params)
    if (next === 'all') p.delete('filter')
    else p.set('filter', next)
    setParams(p, { replace: true })
  }

  async function recordPayment(inv: Invoice) {
    setPaymentFor(inv)
  }
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Clinic finances"
        title="Billing"
        description={`${plural(counts.open, 'open invoice')} · ${money(totals.outstanding, clinic?.currency_symbol)} outstanding. Invoices are permanent; void one to correct a mistake.`}
        actions={(
          <Button variant="primary" onClick={() => setInvoiceOpen(true)}><Plus size={14} /> New invoice</Button>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Outstanding balance', value: money(totals.outstanding, clinic?.currency_symbol), hint: `${counts.open} invoice${counts.open === 1 ? '' : 's'} awaiting payment`, icon: Wallet, tone: 'rose' },
          { label: 'Billed to date', value: money(totals.billed, clinic?.currency_symbol), hint: 'All non-void invoices', icon: ReceiptText, tone: 'blue' },
          { label: 'Collected', value: money(totals.collected, clinic?.currency_symbol), hint: 'Payments recorded against invoices', icon: Banknote, tone: 'brand' },
          { label: 'Collection rate', value: totals.billed > 0 ? `${totals.rate}%` : '—', hint: 'Collected against billed value', icon: Percent, tone: 'amber' },
        ].map((card) => (
          <div key={card.label} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">{card.label}</div>
                <div className="mt-1 truncate text-[22px] font-semibold leading-tight tabular-nums tracking-[-0.02em] text-ink">{card.value}</div>
                <div className="mt-1 text-[10.5px] leading-4 text-muted">{card.hint}</div>
              </div>
              <span className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                card.tone === 'rose' && 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200',
                card.tone === 'blue' && 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200',
                card.tone === 'brand' && 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
                card.tone === 'amber' && 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
              )}>
                <card.icon size={15} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="relative w-full min-w-[230px] sm:w-[300px]">
          <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search invoice or patient…"
            className="input h-9 ps-9 pe-8"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink" aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-elevated p-0.5">
              {filterTabs.map((f) => (
                <button
                  key={f.value}
                  onClick={() => changeFilter(f.value)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[11.5px] font-medium transition',
                    filter === f.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                  )}
                >
                  {f.label}
                  <span className={cn('rounded-full px-1.5 py-px text-[9.5px]', filter === f.value ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200' : 'bg-line/70 text-faint')}>
                    {counts[f.value]}
                  </span>
                </button>
              ))}
            </div>
            <span className="ms-auto text-[10.5px] text-faint">Newest issued first</span>
          </div>

          {loadingInvoices ? (
            <div className="divide-y divide-line">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-3.5">
                  <div className="h-8 w-8 rounded-lg bg-elevated" />
                  <div className="flex-1 space-y-1.5"><div className="h-3 w-44 rounded bg-elevated" /><div className="h-2.5 w-28 rounded bg-elevated" /></div>
                  <div className="h-3 w-20 rounded bg-elevated" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<ReceiptText size={18} />}
                title={query || filter !== 'all' ? 'No invoices match this view' : 'No invoices yet'}
                description={query || filter !== 'all'
                  ? 'Try a different invoice number or clear the status filter.'
                  : 'Create an invoice from a visit, or start one here for a walk-in service.'}
                action={query || filter !== 'all'
                  ? <Button onClick={() => { setQuery(''); changeFilter('all') }}>Clear filters</Button>
                  : <Button variant="primary" onClick={() => setInvoiceOpen(true)}><Plus size={14} /> New invoice</Button>}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse">
                <thead>
                  <tr className="border-b border-line bg-elevated/50">
                    <th className="table-head px-4 py-2.5">Invoice</th>
                    <th className="table-head px-3 py-2.5">Patient</th>
                    <th className="table-head px-3 py-2.5">Issued / due</th>
                    <th className="table-head px-3 py-2.5 text-end">Total</th>
                    <th className="table-head px-3 py-2.5 text-end">Balance</th>
                    <th className="table-head px-3 py-2.5">Status</th>
                    <th className="table-head w-10 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv) => {
                    const balance = balanceOf(inv)
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => setDetailId(inv.id)}
                        className="cursor-pointer border-b border-line/80 transition last:border-0 hover:bg-elevated/60"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-faint">
                              <ReceiptText size={14} />
                            </span>
                            <div className="min-w-0">
                              <div className="font-mono text-[11.5px] font-semibold tracking-wide text-ink">{inv.number}</div>
                              <div className="text-[10px] text-faint">{inv.item_count ?? 0} line{(inv.item_count ?? 0) === 1 ? '' : 's'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-[12px] font-medium text-ink">{inv.first_name} {inv.last_name}</div>
                          <div className="font-mono text-[10px] text-faint">{inv.mrn}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-[11.5px] text-ink">{fmtDate(inv.issued_at, 'd MMM yyyy')}</div>
                          <div className={cn('text-[10px]', balance > 0 && inv.due_at && new Date(inv.due_at) < new Date() ? 'text-rose-600 dark:text-rose-300' : 'text-faint')}>
                            Due {fmtDate(inv.due_at, 'd MMM')}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-end text-[12px] tabular-nums text-ink">{money(inv.total_cents, clinic?.currency_symbol)}</td>
                        <td className="px-3 py-2.5 text-end">
                          {balance > 0
                            ? <span className="text-[12px] font-semibold tabular-nums text-rose-600 dark:text-rose-300">{money(balance, clinic?.currency_symbol)}</span>
                            : <span className="text-[11px] tabular-nums text-emerald-700 dark:text-emerald-300">Settled</span>}
                        </td>
                        <td className="px-3 py-2.5"><StatusBadge status={inv.status} /></td>
                        <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <Dropdown
                            trigger={(
                              <IconButton label="Invoice actions" className="h-7 w-7">
                                <MoreHorizontal size={15} />
                              </IconButton>
                            )}
                          >
                            <MenuItem icon={<Eye size={13} />} onClick={() => setDetailId(inv.id)}>View invoice</MenuItem>
                            <MenuItem icon={<Printer size={13} />} onClick={() => navigate(`/print/invoices/${inv.id}`)}>Print invoice</MenuItem>
                            {balance > 0 && inv.status !== 'void' && (
                              <>
                                <div className="my-1 h-px bg-line" />
                                <MenuItem icon={<Banknote size={13} />} onClick={() => recordPayment(inv)}>Record payment</MenuItem>
                              </>
                            )}
                          </Dropdown>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[10.5px] text-faint">
                <span>{rows.length} of {invoices.length} invoice{invoices.length === 1 ? '' : 's'}</span>
                <span>Outstanding {money(totals.outstanding, clinic?.currency_symbol)} · collected {money(totals.collected, clinic?.currency_symbol)}</span>
              </div>
            </div>
          )}
        </div>

      <InvoiceDetailModal open={Boolean(detailId)} onClose={() => setDetailId(null)} invoiceId={detailId} />
      <InvoiceDialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} onSaved={(inv) => { if (inv?.id) setDetailId(inv.id) }} />
      <PaymentDialog
        open={Boolean(paymentFor)}
        onClose={() => setPaymentFor(null)}
        invoice={paymentFor}
        onSaved={() => qc.invalidateQueries()}
      />
    </div>
  )
}
