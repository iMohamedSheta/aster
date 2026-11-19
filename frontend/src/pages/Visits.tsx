import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, CalendarDays, ChevronRight, FileText, Search, Stethoscope, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { age, cn, fmtDate, fmtTime, fromNow, patientName, sexLabel, titleCase } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import type { Encounter } from '../lib/types'
import {
  Avatar, Badge, Button, EmptyState, PageHeader, Select, StatusBadge, Tabs,
} from '../components/ui'
import { VisitDialog } from '../components/VisitDialog'

type StatusTab = 'all' | 'draft' | 'signed'

export function Visits() {
  const { staff } = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<StatusTab>('all')
  const [providerID, setProviderID] = useState('')
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const debounced = useDebounced(query, 200)

  const { data: encounters = [], isLoading } = useQuery({
    queryKey: ['encounters', providerID],
    queryFn: () => api.encounters('', providerID, 200) as Promise<Encounter[]>,
  })

  useEffect(() => {
    if (params.get('new') === '1') {
      setDialogOpen(true)
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const filtered = useMemo(() => encounters.filter((e) => {
    if (status !== 'all' && e.status !== status) return false
    if (!debounced.trim()) return true
    const q = debounced.toLowerCase()
    return `${e.first_name} ${e.last_name} ${e.mrn} ${e.chief_complaint} ${e.assessment} ${e.provider_name}`.toLowerCase().includes(q)
  }), [encounters, status, debounced])

  const drafts = encounters.filter((e) => e.status === 'draft')
  const signed = encounters.filter((e) => e.status === 'signed')
  const activeDoctors = staff.filter((s) => Number(s.active ?? 1) === 1)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Clinical records"
        title="Visits"
        description={`${encounters.length} visit${encounters.length === 1 ? '' : 's'} on this device · ${drafts.length} draft${drafts.length === 1 ? '' : 's'} waiting to be signed`}
        actions={<Button variant="primary" onClick={() => setDialogOpen(true)}><Stethoscope size={14} /> Start a visit</Button>}
      />

      {drafts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-900/20">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"><FileText size={15} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-amber-900 dark:text-amber-100">{drafts.length} unfinished clinical record{drafts.length === 1 ? '' : 's'}</div>
            <div className="text-[10.5px] text-amber-700/80 dark:text-amber-200/70">Drafts are private working notes until signed. Complete the assessment before closing.</div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => { setStatus('draft'); setQuery('') }}>
            Review drafts <ArrowRight size={12} />
          </Button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="relative min-w-[250px] flex-1 sm:max-w-[380px]">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patient, complaint or assessment…" className="input h-9 ps-9 pe-8" />
            {query && <button onClick={() => setQuery('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-ink" aria-label="Clear search"><X size={13} /></button>}
          </div>
          <Tabs
            value={status}
            onChange={setStatus}
            tabs={[
              { value: 'all', label: 'All', count: encounters.length },
              { value: 'draft', label: 'Drafts', count: drafts.length },
              { value: 'signed', label: 'Signed', count: signed.length },
            ]}
          />
          <Select value={providerID} onChange={(e) => setProviderID(e.target.value)} className="ms-auto h-8 w-auto min-w-[170px] py-0 text-[11.5px]">
            <option value="">All clinicians</option>
            {activeDoctors.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
        </div>

        {isLoading ? (
          <div className="divide-y divide-line">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-4">
                <div className="h-9 w-10 rounded-lg bg-elevated" />
                <div className="flex-1 space-y-1.5"><div className="h-3 w-44 rounded bg-elevated" /><div className="h-2.5 w-64 rounded bg-elevated" /></div>
                <div className="h-5 w-16 rounded-full bg-elevated" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Stethoscope size={18} />}
              title={encounters.length ? 'No visits match this view' : 'No clinical visits recorded'}
              description={encounters.length
                ? 'Try clearing the status or clinician filter, or search a different term.'
                : 'Start a visit when a patient is in the room. Vitals, diagnoses and prescriptions attach to the encounter.'}
              action={encounters.length
                ? <Button onClick={() => { setStatus('all'); setProviderID(''); setQuery('') }}>Clear filters</Button>
                : <Button variant="primary" onClick={() => setDialogOpen(true)}><Stethoscope size={14} /> Start a visit</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-elevated/50">
                  <th className="table-head w-[86px] px-4 py-2.5">Date</th>
                  <th className="table-head px-3 py-2.5">Patient</th>
                  <th className="table-head px-3 py-2.5">Visit</th>
                  <th className="table-head px-3 py-2.5">Clinician</th>
                  <th className="table-head px-3 py-2.5 text-center">Dx</th>
                  <th className="table-head px-3 py-2.5">Status</th>
                  <th className="table-head w-16 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} onClick={() => navigate(`/visits/${e.id}`)} className="cursor-pointer border-b border-line/80 transition last:border-0 hover:bg-elevated/60">
                    <td className="px-4 py-2.5">
                      <div className="text-[11.5px] font-semibold text-ink">{fmtDate(e.started_at, 'd MMM')}</div>
                      <div className="text-[9.5px] text-faint">{fmtDate(e.started_at, 'yyyy')} · {fmtTime(e.started_at)}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={patientName(e as any)} size={28} />
                        <div className="min-w-0">
                          <div className="truncate text-[11.5px] font-semibold text-ink">{e.first_name} {e.last_name}</div>
                          <div className="text-[9.5px] text-faint">{e.mrn} · {age(e.date_of_birth)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="max-w-[290px] truncate text-[11.5px] font-medium text-ink">{e.chief_complaint || 'Clinical visit'}</div>
                      <div className="max-w-[290px] truncate text-[10px] text-muted">{e.assessment || e.plan || 'Not documented yet'}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[10.5px] text-muted">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.provider_color || '#2a3747' }} />
                        {e.provider_name}
                      </div>
                      <div className="mt-0.5 text-[9.5px] text-faint">{titleCase(e.type)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-[11px] tabular-nums text-muted">{e.diagnosis_count ?? 0}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={e.status} />
                        <span className="text-[9px] text-faint">{e.status === 'signed' ? `Signed ${fromNow(e.signed_at)}` : `Updated ${fromNow(e.updated_at ?? e.started_at)}`}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Button size="sm" variant={e.status === 'draft' ? 'subtle' : 'ghost'} onClick={(ev) => { ev.stopPropagation(); navigate(`/visits/${e.id}`) }}>
                        {e.status === 'draft' ? 'Resume' : 'Open'} <ChevronRight size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <VisitDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
