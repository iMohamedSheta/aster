import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { api } from '../lib/api'
import { age, fmtDate, fmtDateTime, patientName, sexLabel, titleCase } from '../lib/format'
import { translate } from '../lib/i18n'
import { displayPhone } from '../lib/phone'
import type { ClinicLocation, Prescription } from '../lib/types'
import { Button, Spinner } from '../components/ui'

export function PrintPrescription() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: rx, isLoading } = useQuery({
    queryKey: ['prescription', id],
    queryFn: () => api.prescription(id!) as Promise<Prescription>,
    enabled: Boolean(id),
  })

  const patient = rx?.patient
  const clinic = rx?.clinic
  const location = rx?.location as ClinicLocation | undefined
  const place = location ?? clinic
  const provider = rx?.provider

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
        <span className="text-[11px] text-muted">Prescription preview · A4</span>
        <div className="flex-1" />
        <Button size="sm" variant="primary" onClick={() => window.print()}><Printer size={13} /> Print prescription</Button>
      </div>

      {isLoading || !rx ? (
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
                <div>
                  {[place?.phone || clinic?.phone, place?.email || clinic?.email, clinic?.website].filter(Boolean).join(' · ')}
                </div>
                {clinic?.license_number && <div>License {clinic.license_number}</div>}
              </div>
            </div>
            <div className="text-end">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a85833]">Prescription</div>
              <div className="mt-1 font-mono text-[10px] text-[#5c6f69]">{rx.id.slice(0, 8).toUpperCase()}</div>
              <div className="mt-2 text-[10.5px] text-[#5c6f69]">{fmtDate(rx.issued_at, 'd MMMM yyyy')}</div>
              <div className="text-[10.5px] text-[#5c6f69]">{fmtDateTime(rx.issued_at).split('·')[1]?.trim()}</div>
            </div>
          </header>

          <section className="mt-5 grid grid-cols-2 gap-6">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a9994]">Patient</div>
              <div className="mt-1 text-[14px] font-semibold">{patientName(patient)}</div>
              <div className="mt-0.5 text-[10.5px] leading-4 text-[#5c6f69]">
                {patient?.mrn && <span className="font-mono">{patient.mrn}</span>}
                {patient?.date_of_birth && <> · {translate('Age')} {age(patient.date_of_birth)}</>}
                {patient?.sex && <> · {sexLabel(patient.sex)}</>}
              </div>
              {patient?.phone && <div className="text-[10.5px] text-[#5c6f69]">{displayPhone(patient.phone)}</div>}
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a9994]">Prescriber</div>
              <div className="mt-1 text-[13px] font-semibold">{provider?.full_name || rx.provider_name || 'Clinic clinician'}</div>
              <div className="mt-0.5 text-[10.5px] leading-4 text-[#5c6f69]">
                {[provider?.title || provider?.specialization, provider?.license_number && `License ${provider.license_number}`].filter(Boolean).join(' · ')}
              </div>
              {provider?.phone && <div className="text-[10.5px] text-[#5c6f69]">{provider.phone}</div>}
            </div>
          </section>

          {patient?.insurance_provider && (
            <div className="mt-4 rounded border border-[#dce3df] bg-[#f7f9f7] px-3 py-2 text-[10px] text-[#5c6f69]">
              Insurance: <span className="font-medium text-[#17211e]">{patient.insurance_provider}</span>
              {patient.insurance_number && <> · {patient.insurance_number}</>}
            </div>
          )}

          <section className="mt-6">
            <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a9994]">Medications</div>
            {(rx.items ?? []).length === 0 ? (
              <div className="border border-dashed border-[#dce3df] px-3 py-6 text-center text-[11px] text-[#8a9994]">No medications on this prescription.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#17211e]">
                    <th className="py-1.5 text-start text-[9.5px] font-semibold uppercase tracking-[0.09em]">Medication</th>
                    <th className="py-1.5 text-start text-[9.5px] font-semibold uppercase tracking-[0.09em]">Directions</th>
                    <th className="w-[52px] py-1.5 text-end text-[9.5px] font-semibold uppercase tracking-[0.09em]">Qty</th>
                    <th className="w-[52px] py-1.5 text-end text-[9.5px] font-semibold uppercase tracking-[0.09em]">Refills</th>
                  </tr>
                </thead>
                <tbody>
                  {(rx.items ?? []).map((item: any, i: number) => (
                    <tr key={item.id ?? i} className="border-b border-[#e5eae6] align-top last:border-0">
                      <td className="py-3 pe-4">
                        <div className="text-[12px] font-semibold">{item.drug_name} {item.strength}</div>
                        <div className="text-[10px] capitalize text-[#5c6f69]">{item.form}</div>
                      </td>
                      <td className="py-3 pe-4 text-[10.5px] leading-4">
                        <div>{item.dose}{item.frequency ? ` · ${item.frequency}` : ''}</div>
                        {item.duration_days ? <div className="text-[10px] text-[#5c6f69]">For {item.duration_days} day{item.duration_days === 1 ? '' : 's'}</div> : null}
                        {item.instructions && <div className="mt-0.5 text-[10px] text-[#5c6f69]">{item.instructions}</div>}
                      </td>
                      <td className="py-3 text-end text-[11px] tabular-nums">{item.quantity}</td>
                      <td className="py-3 text-end text-[11px] tabular-nums">{item.refills}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {rx.notes && (
            <section className="mt-5">
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a9994]">Notes</div>
              <div className="prose-note mt-1 rounded border border-[#e5eae6] bg-[#f7f9f7] px-3 py-2 text-[10.5px] leading-5 text-[#3f4f4a]">{rx.notes}</div>
            </section>
          )}

          <section className="mt-8 flex items-end justify-between gap-8 border-t border-[#dce3df] pt-5">
            <div className="max-w-[360px] text-[9.5px] leading-4 text-[#6b7a75]">
              {clinic?.prescription_footer || 'Keep this prescription with you. Do not share medication prescribed for someone else.'}
            </div>
            <div className="w-[240px] text-end">
              <div className="h-10" />
              <div className="border-t border-[#17211e] pt-1.5 text-[10.5px] font-medium">
                {provider?.full_name || rx.provider_name || 'Prescriber signature'}
              </div>
              <div className="text-[9px] text-[#8a9994]">
                {rx.signed_at ? `Signed ${fmtDate(rx.signed_at)}` : `Issued ${fmtDate(rx.issued_at)}`}
              </div>
            </div>
          </section>

          <footer className="mt-6 flex items-center justify-between border-t border-[#e5eae6] pt-3 text-[8.5px] uppercase tracking-[0.1em] text-[#9aa8a3]">
            <span>{place?.name || 'Clinic'} · Prescription</span>
            <div className="flex items-center gap-3">
              <span>{titleCase(rx.status)}</span>
              <img src="/brand/aster-lockup.svg" alt="Aster Clinic" className="h-6 w-auto opacity-80" />
            </div>
          </footer>
        </div>
      )}
    </div>
  )
}
