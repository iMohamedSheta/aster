import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { api } from '../lib/api'
import { age, fmtDate, fmtDateTime, money, patientName, titleCase } from '../lib/format'
import { translate } from '../lib/i18n'
import { displayPhone } from '../lib/phone'
import type { ClinicLocation, Invoice } from '../lib/types'
import { Button, Spinner } from '../components/ui'

export function PrintInvoice() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.invoice(id!) as Promise<Invoice>,
    enabled: Boolean(id),
  })

  const clinic = invoice?.clinic
  const location = invoice?.location as ClinicLocation | undefined
  const place = location ?? clinic
  const patient = invoice?.patient
  const symbol = clinic?.currency_symbol || '$'
  const balance = invoice ? Math.max(0, invoice.total_cents - invoice.paid_cents) : 0

  const address = [
    place?.address_line1,
    place?.address_line2,
    [place?.city, place?.state, place?.postal_code].filter(Boolean).join(', '),
    place?.country,
  ].filter(Boolean)

  return (
    <div className="min-h-full pb-10">
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-black/10 bg-[#f0f0ec]/95 px-5 py-2.5 backdrop-blur">
        <Button size="sm" onClick={() => navigate(-1)}><ArrowLeft size={13} /> Back</Button>
        <span className="text-[11px] text-muted">Invoice preview · A4</span>
        <div className="flex-1" />
        <Button size="sm" variant="primary" onClick={() => window.print()}><Printer size={13} /> Print invoice</Button>
      </div>

      {isLoading || !invoice ? (
        <div className="flex h-64 items-center justify-center"><Spinner /></div>
      ) : (
        <div className="print-sheet mx-auto mt-6 w-full max-w-[820px] bg-white px-[54px] py-[48px] text-[#17211e] shadow-[0_12px_40px_rgba(15,30,25,0.12)]">
          <header className="flex items-start justify-between gap-6 border-b-2 border-[#18222d] pb-5">
            <div>
              <div className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">{place?.name || 'Clinic'}</div>
              {clinic?.legal_name && clinic.legal_name !== place?.name && (
                <div className="text-[11px] text-[#5c6f69]">{clinic.legal_name}</div>
              )}
              <div className="mt-2 space-y-0.5 text-[10.5px] leading-4 text-[#5c6f69]">
                {address.map((line) => <div key={line}>{line}</div>)}
                <div>{[place?.phone || clinic?.phone, place?.email || clinic?.email].filter(Boolean).join(' · ')}</div>
                {clinic?.tax_id && <div>Tax ID {clinic.tax_id}</div>}
                {clinic?.license_number && <div>License {clinic.license_number}</div>}
              </div>
            </div>
            <div className="text-end">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a85833]">Invoice</div>
              <div className="mt-1 font-mono text-[15px] font-semibold">{invoice.number}</div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[#8a9994]">{invoice.status}</div>
              <div className="mt-1 text-[10.5px] text-[#5c6f69]">Issued {fmtDate(invoice.issued_at, 'd MMMM yyyy')}</div>
              <div className="text-[10.5px] text-[#5c6f69]">Due {fmtDate(invoice.due_at, 'd MMMM yyyy')}</div>
            </div>
          </header>

          <section className="mt-5 grid grid-cols-2 gap-6">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a9994]">Billed to</div>
              <div className="mt-1 text-[13px] font-semibold">{patientName(patient)}</div>
              <div className="mt-0.5 text-[10.5px] leading-4 text-[#5c6f69]">
                {patient?.mrn && <span className="font-mono">{patient.mrn}</span>}
                {patient?.date_of_birth && <> · {translate('Age')} {age(patient.date_of_birth)}</>}
              </div>
              {patient?.address && <div className="text-[10.5px] text-[#5c6f69]">{patient.address}</div>}
              {patient?.city && <div className="text-[10.5px] text-[#5c6f69]">{patient.city}</div>}
              {patient?.phone && <div className="text-[10.5px] text-[#5c6f69]">{displayPhone(patient.phone)}</div>}
            </div>
            <div className="rounded border border-[#e5eae6] bg-[#f7f9f7] px-3 py-2.5">
              <div className="flex items-baseline justify-between text-[10.5px]">
                <span className="text-[#5c6f69]">Amount due</span>
                <span className="text-[17px] font-semibold tabular-nums">{money(balance, symbol)}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-[10px] text-[#5c6f69]">
                <span>Total</span>
                <span className="tabular-nums">{money(invoice.total_cents, symbol)}</span>
              </div>
              <div className="flex items-baseline justify-between text-[10px] text-[#5c6f69]">
                <span>Paid</span>
                <span className="tabular-nums">{money(invoice.paid_cents, symbol)}</span>
              </div>
              {patient?.insurance_provider && (
                <div className="mt-2 border-t border-[#dce3df] pt-1.5 text-[9.5px] text-[#5c6f69]">
                  Insurance · {patient.insurance_provider} {patient.insurance_number}
                </div>
              )}
            </div>
          </section>

          <section className="mt-6">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#17211e]">
                  <th className="py-1.5 text-start text-[9.5px] font-semibold uppercase tracking-[0.09em]">Description</th>
                  <th className="w-[56px] py-1.5 text-end text-[9.5px] font-semibold uppercase tracking-[0.09em]">Qty</th>
                  <th className="w-[92px] py-1.5 text-end text-[9.5px] font-semibold uppercase tracking-[0.09em]">Unit</th>
                  <th className="w-[100px] py-1.5 text-end text-[9.5px] font-semibold uppercase tracking-[0.09em]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items ?? []).map((item, i) => (
                  <tr key={item.id ?? i} className="border-b border-[#e5eae6] last:border-0">
                    <td className="py-2.5 pe-4 text-[11px]">{item.description}</td>
                    <td className="py-2.5 text-end text-[10.5px] tabular-nums text-[#5c6f69]">{item.quantity}</td>
                    <td className="py-2.5 text-end text-[10.5px] tabular-nums text-[#5c6f69]">{money(item.unit_price_cents, symbol)}</td>
                    <td className="py-2.5 text-end text-[10.5px] font-medium tabular-nums">{money(item.total_cents, symbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-4 flex justify-end">
            <div className="w-[280px] space-y-1 text-[10.5px]">
              <div className="flex justify-between py-0.5"><span className="text-[#5c6f69]">Subtotal</span><span className="tabular-nums">{money(invoice.subtotal_cents, symbol)}</span></div>
              {invoice.discount_cents > 0 && (
                <div className="flex justify-between py-0.5"><span className="text-[#5c6f69]">Discount</span><span className="tabular-nums">−{money(invoice.discount_cents, symbol)}</span></div>
              )}
              {invoice.tax_cents > 0 && (
                <div className="flex justify-between py-0.5"><span className="text-[#5c6f69]">Tax</span><span className="tabular-nums">{money(invoice.tax_cents, symbol)}</span></div>
              )}
              <div className="flex justify-between border-t border-[#17211e] py-1.5 text-[12px] font-semibold"><span>Total</span><span className="tabular-nums">{money(invoice.total_cents, symbol)}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-[#5c6f69]">Paid</span><span className="tabular-nums">{money(invoice.paid_cents, symbol)}</span></div>
              <div className="flex justify-between rounded bg-[#f0f5f2] px-2 py-1.5 text-[11.5px] font-semibold"><span>Balance due</span><span className="tabular-nums">{money(balance, symbol)}</span></div>
            </div>
          </section>

          {(invoice.payments ?? []).length > 0 && (
            <section className="mt-6">
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a9994]">Payments received</div>
              <div className="mt-1.5 space-y-0.5">
                {(invoice.payments ?? []).map((p) => (
                  <div key={p.id} className="flex items-baseline justify-between border-b border-[#eef1ee] py-1 text-[10px] last:border-0">
                    <span className="text-[#5c6f69]">{fmtDate(p.paid_at)} · {titleCase(p.method)}{p.reference ? ` · ${p.reference}` : ''}</span>
                    <span className="tabular-nums">{money(p.amount_cents, symbol)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {invoice.notes && (
            <section className="mt-5">
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a9994]">Note</div>
              <div className="prose-note mt-1 rounded border border-[#e5eae6] bg-[#f7f9f7] px-3 py-2 text-[10.5px] leading-5 text-[#3f4f4a]">{invoice.notes}</div>
            </section>
          )}

          <footer className="mt-8 border-t border-[#dce3df] pt-3">
            <div className="flex items-start justify-between gap-6">
              <div className="max-w-[440px] text-[9.5px] leading-4 text-[#6b7a75]">
                {clinic?.invoice_footer || 'Thank you for choosing our clinic. Please quote the invoice number with your payment.'}
              </div>
              <img src="/brand/aster-lockup.svg" alt="Aster Clinic" className="h-7 w-auto shrink-0 opacity-80" />
            </div>
            <div className="mt-3 flex items-center justify-between text-[8.5px] uppercase tracking-[0.1em] text-[#9aa8a3]">
              <span>{place?.name || 'Clinic'} · Invoice {invoice.number}</span>
              <span>Generated {fmtDateTime(new Date().toISOString())}</span>
            </div>
          </footer>
        </div>
      )}
    </div>
  )
}
