import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Printer, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { fmtDate, fmtDateTime } from '../lib/format'
import type { Prescription } from '../lib/types'
import { Badge, Button, Sheet, Spinner } from './ui'
import { useToast } from './Toast'

export function PrescriptionDetailModal({
  open, onClose, prescriptionId,
}: {
  open: boolean
  onClose: () => void
  prescriptionId?: string | null
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  const { data: rx, isLoading } = useQuery({
    queryKey: ['prescription', prescriptionId],
    queryFn: () => api.prescription(prescriptionId!) as Promise<Prescription>,
    enabled: open && Boolean(prescriptionId),
  })

  async function setStatus(status: string) {
    if (!rx) return
    try {
      await api.updatePrescriptionStatus(rx.id, status)
      toast.success(`Prescription ${status}`, rx.first_name ? `${rx.first_name} ${rx.last_name}` : undefined)
      await qc.invalidateQueries()
    } catch (e: any) {
      toast.error('Could not update prescription', String(e?.message ?? e))
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={rx ? `Prescription · ${rx.first_name} ${rx.last_name}` : 'Prescription'}
      description={rx ? `Issued ${fmtDateTime(rx.issued_at)} by ${rx.provider_name || 'the care team'}` : undefined}
      size="lg"
      footer={rx ? (
        <>
          {rx.status === 'active' && (
            <>
              <Button variant="ghost" onClick={() => setStatus('completed')}><CheckCircle2 size={14} /> Mark completed</Button>
              <Button variant="ghost" onClick={() => setStatus('cancelled')}><XCircle size={14} /> Cancel</Button>
            </>
          )}
          <div className="flex-1" />
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={() => { onClose(); navigate(`/print/prescriptions/${rx.id}`) }}>
            <Printer size={14} /> Print prescription
          </Button>
        </>
      ) : undefined}
    >
      {isLoading || !rx ? (
        <div className="flex h-40 items-center justify-center"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-elevated/50 px-3.5 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Patient</div>
              <div className="mt-0.5 text-[12.5px] font-semibold text-ink">{rx.first_name} {rx.last_name}</div>
              <div className="font-mono text-[10px] text-faint">{rx.mrn}</div>
            </div>
            <div className="ms-auto text-end">
              <Badge tone={rx.status === 'active' ? 'success' : rx.status === 'completed' ? 'info' : 'neutral'} dot>{rx.status}</Badge>
              <div className="mt-1 text-[10px] text-faint">{fmtDate(rx.issued_at)}</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full border-collapse">
              <thead className="bg-elevated/60">
                <tr>
                  <th className="table-head px-3 py-2">Medication</th>
                  <th className="table-head px-3 py-2">Directions</th>
                  <th className="table-head px-3 py-2 text-end">Qty</th>
                  <th className="table-head px-3 py-2 text-end">Refills</th>
                </tr>
              </thead>
              <tbody>
                {(rx.items ?? []).map((item: any) => (
                  <tr key={item.id} className="border-t border-line align-top">
                    <td className="px-3 py-2.5">
                      <div className="text-[12px] font-semibold text-ink">{item.drug_name} {item.strength}</div>
                      <div className="text-[10.5px] text-faint">{item.form}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[11.5px] text-ink">{item.dose} · {item.frequency}</div>
                      <div className="text-[10.5px] text-muted">{item.duration_days ? `${item.duration_days} days` : ''} {item.instructions ? `· ${item.instructions}` : ''}</div>
                    </td>
                    <td className="px-3 py-2.5 text-end text-[11.5px] tabular-nums text-muted">{item.quantity}</td>
                    <td className="px-3 py-2.5 text-end text-[11.5px] tabular-nums text-muted">{item.refills}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rx.notes && (
            <div className="rounded-xl bg-elevated px-3 py-2.5 text-[11.5px] leading-5 text-muted">{rx.notes}</div>
          )}
        </div>
      )}
    </Sheet>
  )
}
