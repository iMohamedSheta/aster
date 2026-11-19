import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Banknote, Printer, ReceiptText } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { fmtDate, fmtDateTime, money, statusTone } from '../lib/format'
import { displayPhone } from '../lib/phone'
import type { Invoice } from '../lib/types'
import { Badge, Button, ConfirmDialog, Sheet, Spinner } from './ui'
import { PaymentDialog } from './BillingDialogs'
import { useToast } from './Toast'

export function InvoiceDetailModal({
  open, onClose, invoiceId,
}: {
  open: boolean
  onClose: () => void
  invoiceId?: string | null
}) {
  const { clinic } = useApp()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [payOpen, setPayOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => api.invoice(invoiceId!) as Promise<Invoice>,
    enabled: open && Boolean(invoiceId),
  })

  async function voidInvoice() {
    if (!invoice) return
    setVoiding(true)
    try {
      await api.voidInvoice(invoice.id)
      toast.success('Invoice voided', invoice.number)
      await qc.invalidateQueries()
      setVoidOpen(false)
    } catch (e: any) {
      toast.error('Could not void invoice', String(e?.message ?? e))
    } finally {
      setVoiding(false)
    }
  }

  const balance = invoice ? Math.max(0, invoice.total_cents - invoice.paid_cents) : 0

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={invoice ? invoice.number : 'Invoice'}
        description={invoice ? `${invoice.first_name} ${invoice.last_name} · ${invoice.mrn}` : undefined}
        size="lg"
        footer={invoice ? (
          <>
            <Button variant="ghost" onClick={() => { onClose(); navigate(`/print/invoices/${invoice.id}`) }}>
              <Printer size={14} /> Print
            </Button>
            {invoice.status !== 'void' && (
              <Button variant="ghost" onClick={() => setVoidOpen(true)}><Ban size={14} /> Void</Button>
            )}
            <div className="flex-1" />
            <Button onClick={onClose}>Close</Button>
            {balance > 0 && invoice.status !== 'void' && (
              <Button variant="primary" onClick={() => setPayOpen(true)}><Banknote size={14} /> Record payment</Button>
            )}
          </>
        ) : undefined}
      >
        {isLoading || !invoice ? (
          <div className="flex h-40 items-center justify-center"><Spinner /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-elevated/50 p-3.5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Billed to</div>
                <div className="mt-1 text-[13px] font-semibold text-ink">{invoice.patient?.first_name} {invoice.patient?.last_name}</div>
                <div className="text-[11px] text-muted">{invoice.patient?.phone ? displayPhone(invoice.patient.phone) : ''} · {invoice.patient?.email}</div>
              </div>
              <div className="text-end">
                <Badge tone={statusTone(invoice.status)} dot>{invoice.status}</Badge>
                <div className="mt-2 text-[10px] text-faint">Issued {fmtDate(invoice.issued_at)}</div>
                <div className="text-[10px] text-faint">Due {fmtDate(invoice.due_at)}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full border-collapse">
                <thead className="bg-elevated/60">
                  <tr>
                    <th className="table-head px-3 py-2">Description</th>
                    <th className="table-head px-3 py-2 text-end">Qty</th>
                    <th className="table-head px-3 py-2 text-end">Unit</th>
                    <th className="table-head px-3 py-2 text-end">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.items ?? []).map((item) => (
                    <tr key={item.id} className="border-t border-line">
                      <td className="px-3 py-2 text-[12px] text-ink">{item.description}</td>
                      <td className="px-3 py-2 text-end text-[11.5px] tabular-nums text-muted">{item.quantity}</td>
                      <td className="px-3 py-2 text-end text-[11.5px] tabular-nums text-muted">{money(item.unit_price_cents, clinic?.currency_symbol)}</td>
                      <td className="px-3 py-2 text-end text-[11.5px] font-medium tabular-nums text-ink">{money(item.total_cents, clinic?.currency_symbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ms-auto w-full max-w-[300px] space-y-1 text-[12px]">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{money(invoice.subtotal_cents, clinic?.currency_symbol)}</span></div>
              {invoice.discount_cents > 0 && <div className="flex justify-between"><span className="text-muted">Discount</span><span className="tabular-nums">−{money(invoice.discount_cents, clinic?.currency_symbol)}</span></div>}
              {invoice.tax_cents > 0 && <div className="flex justify-between"><span className="text-muted">Tax</span><span className="tabular-nums">{money(invoice.tax_cents, clinic?.currency_symbol)}</span></div>}
              <div className="flex justify-between border-t border-line pt-1.5 text-[13px] font-semibold"><span>Total</span><span className="tabular-nums">{money(invoice.total_cents, clinic?.currency_symbol)}</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-muted">Paid</span><span className="tabular-nums text-emerald-700 dark:text-emerald-300">{money(invoice.paid_cents, clinic?.currency_symbol)}</span></div>
              <div className="flex justify-between rounded-lg bg-elevated px-2 py-1.5 text-[13px] font-semibold"><span>Balance due</span><span className={balance > 0 ? 'tabular-nums text-rose-600 dark:text-rose-300' : 'tabular-nums'}>{money(balance, clinic?.currency_symbol)}</span></div>
            </div>

            {(invoice.payments ?? []).length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Payments</div>
                <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {(invoice.payments ?? []).map((p) => (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2 text-[11.5px]">
                      <ReceiptText size={12} className="text-faint" />
                      <span className="font-medium capitalize text-ink">{p.method}</span>
                      <span className="text-faint">{fmtDateTime(p.paid_at)}</span>
                      {p.reference && <span className="truncate text-[10px] text-faint">{p.reference}</span>}
                      <span className="ms-auto font-semibold tabular-nums text-ink">{money(p.amount_cents, clinic?.currency_symbol)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {invoice.notes && (
              <div className="rounded-xl bg-elevated px-3 py-2.5 text-[11.5px] leading-5 text-muted">{invoice.notes}</div>
            )}
          </div>
        )}
      </Sheet>

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        invoice={invoice}
        onSaved={() => qc.invalidateQueries({ queryKey: ['invoice', invoiceId] })}
      />
      <ConfirmDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onConfirm={voidInvoice}
        busy={voiding}
        tone="danger"
        title="Void this invoice?"
        confirmLabel="Void invoice"
        description="The invoice remains in the audit trail with its amount, but it can no longer be paid. This cannot be undone."
      />
    </>
  )
}
