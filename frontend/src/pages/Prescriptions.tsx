import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Eye, MoreHorizontal, Pill, Plus, Printer, Search, X, XCircle,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { cn, fmtDate, fromNow, titleCase } from '../lib/format'
import type { Prescription } from '../lib/types'
import {
  Badge, Button, Dropdown, EmptyState, IconButton, MenuItem, PageHeader, StatusBadge,
} from '../components/ui'
import { PrescriptionDetailModal } from '../components/PrescriptionDetailModal'
import { PrescriptionDialog } from '../components/PrescriptionDialog'
import { useToast } from '../components/Toast'

type Filter = 'all' | 'active' | 'completed' | 'cancelled'

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

function medicationLabel(rx: Prescription) {
  const n = rx.item_count ?? 0
  return `${n} medication${n === 1 ? '' : 's'}`
}

export function Prescriptions() {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { clinic } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [newOpen, setNewOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const { data: prescriptions = [], isLoading } = useQuery({
    queryKey: ['prescriptions', ''],
    queryFn: () => api.prescriptions('') as Promise<Prescription[]>,
  })

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: prescriptions.length, active: 0, completed: 0, cancelled: 0 }
    for (const rx of prescriptions) out[rx.status] = (out[rx.status] ?? 0) + 1
    return out
  }, [prescriptions])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return prescriptions.filter((rx) => {
      if (filter !== 'all' && rx.status !== filter) return false
      if (!q) return true
      const hay = [
        rx.first_name, rx.last_name, rx.mrn, rx.provider_name,
        titleCase(rx.status), fmtDate(rx.issued_at, 'd MMM yyyy'),
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [prescriptions, filter, query])

  const activeCount = counts.active ?? 0
  const thisMonth = useMemo(() => {
    const now = new Date()
    return prescriptions.filter((rx) => {
      const d = new Date(rx.issued_at)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }).length
  }, [prescriptions])

  async function setStatus(rx: Prescription, status: string) {
    try {
      await api.updatePrescriptionStatus(rx.id, status)
      toast.success(`Prescription ${status}`, `${rx.first_name} ${rx.last_name} · ${medicationLabel(rx)}`)
      await qc.invalidateQueries()
    } catch (e: any) {
      toast.error('Could not update prescription', String(e?.message ?? e))
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Medication register"
        title="Prescriptions"
        description={`${prescriptions.length} issued · ${activeCount} active · ${thisMonth} this month. Every prescription is printable and stays attached to the patient record.`}
        actions={<Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={14} /> New prescription</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Active prescriptions', value: counts.active ?? 0, hint: 'Currently being taken', icon: Pill, tone: 'brand' },
          { label: 'Issued this month', value: thisMonth, hint: 'Including repeats and new courses', icon: CheckCircle2, tone: 'blue' },
          { label: 'Completed courses', value: counts.completed ?? 0, hint: 'Finished or stopped as planned', icon: CheckCircle2, tone: 'emerald' },
          { label: 'Cancelled', value: counts.cancelled ?? 0, hint: 'Withdrawn before completion', icon: XCircle, tone: 'rose' },
        ].map((card) => (
          <div key={card.label} className="card flex items-start gap-3 p-4">
            <span className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              card.tone === 'brand' && 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
              card.tone === 'blue' && 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200',
              card.tone === 'emerald' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
              card.tone === 'rose' && 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200',
            )}>
              <card.icon size={15} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">{card.label}</div>
              <div className="mt-0.5 text-[21px] font-semibold leading-tight tabular-nums text-ink">{card.value}</div>
              <div className="mt-0.5 text-[10.5px] leading-4 text-muted">{card.hint}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="relative min-w-[250px] flex-1 sm:max-w-[380px]">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient, MRN or prescriber…"
              className="input h-9 ps-9 pe-8"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink" aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-elevated p-0.5">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[11.5px] font-medium transition',
                  filter === f.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {f.label}
                <span className={cn('rounded-full px-1.5 py-px text-[9.5px]', filter === f.value ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200' : 'bg-line/70 text-faint')}>
                  {counts[f.value] ?? 0}
                </span>
              </button>
            ))}
          </div>
          <span className="ms-auto text-[10.5px] text-faint">Newest first</span>
        </div>

        {isLoading ? (
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
              icon={<Pill size={18} />}
              title={query || filter !== 'all' ? 'No prescriptions match this view' : 'No prescriptions yet'}
              description={query || filter !== 'all'
                ? 'Try a different name or clear the status filter.'
                : 'Prescriptions are created during a visit or from this page. They print on the clinic letterhead with dosage instructions.'}
              action={query || filter !== 'all'
                ? <Button onClick={() => { setQuery(''); setFilter('all') }}>Clear filters</Button>
                : <Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={14} /> New prescription</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-elevated/50">
                  <th className="table-head px-4 py-2.5">Patient</th>
                  <th className="table-head px-3 py-2.5">Issued</th>
                  <th className="table-head px-3 py-2.5">Medications</th>
                  <th className="table-head px-3 py-2.5">Prescriber</th>
                  <th className="table-head px-3 py-2.5">Status</th>
                  <th className="table-head w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((rx) => (
                  <tr
                    key={rx.id}
                    onClick={() => setDetailId(rx.id)}
                    className="cursor-pointer border-b border-line/80 transition last:border-0 hover:bg-elevated/60"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                          <Pill size={14} />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-semibold text-ink">{rx.first_name} {rx.last_name}</div>
                          <div className="font-mono text-[10px] tracking-wide text-faint">{rx.mrn}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[11.5px] text-ink">{fmtDate(rx.issued_at)}</div>
                      <div className="text-[10px] text-faint">{fromNow(rx.issued_at)}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone="neutral">{medicationLabel(rx)}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-[11.5px] text-muted">{rx.provider_name || '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={rx.status} /></td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Dropdown
                        trigger={(
                          <IconButton label="Prescription actions" className="h-7 w-7">
                            <MoreHorizontal size={15} />
                          </IconButton>
                        )}
                      >
                        <MenuItem icon={<Eye size={13} />} onClick={() => setDetailId(rx.id)}>View details</MenuItem>
                        <MenuItem icon={<Printer size={13} />} onClick={() => navigate(`/print/prescriptions/${rx.id}`)}>Print prescription</MenuItem>
                        {rx.status === 'active' && (
                          <>
                            <div className="my-1 h-px bg-line" />
                            <MenuItem icon={<CheckCircle2 size={13} />} onClick={() => setStatus(rx, 'completed')}>Mark completed</MenuItem>
                            <MenuItem icon={<XCircle size={13} />} danger onClick={() => setStatus(rx, 'cancelled')}>Cancel prescription</MenuItem>
                          </>
                        )}
                        {rx.status !== 'active' && (
                          <>
                            <div className="my-1 h-px bg-line" />
                            <MenuItem icon={<Pill size={13} />} onClick={() => setStatus(rx, 'active')}>Reactivate</MenuItem>
                          </>
                        )}
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[10.5px] text-faint">
              <span>{rows.length} of {prescriptions.length} prescription{prescriptions.length === 1 ? '' : 's'}</span>
              <span>{clinic?.name} · printed with prescriber details and clinic footer</span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-line px-4 py-3 text-[11px] leading-5 text-faint">
        <span className="font-semibold text-muted">A note on safety:</span> Aster records what the prescriber entered. It does not check interactions, allergies or dosing. Always review the printed prescription against the patient’s chart before signing.
      </div>

      <PrescriptionDialog open={newOpen} onClose={() => setNewOpen(false)} onSaved={(rx: any) => { if (rx?.id) setDetailId(rx.id) }} />
      <PrescriptionDetailModal open={Boolean(detailId)} onClose={() => setDetailId(null)} prescriptionId={detailId} />
    </div>
  )
}
