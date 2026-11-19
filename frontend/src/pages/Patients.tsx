import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarPlus, FolderOpen, MoreHorizontal, Pencil, Search, Stethoscope, Trash2, UserPlus, Users, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import {
  age, fmtDate, fmtTime, fromNow, money, patientName, sexLabel, titleCase,
} from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { displayPhone } from '../lib/phone'
import type { Patient } from '../lib/types'
import {
  Avatar, Badge, Button, ConfirmDialog, Dropdown, EmptyState, IconButton, MenuItem,
  PageHeader, StatusBadge,
} from '../components/ui'
import { useToast } from '../components/Toast'
import { PatientDialog } from '../components/PatientDialog'
import { AppointmentDialog } from '../components/AppointmentDialog'
import { VisitDialog } from '../components/VisitDialog'

type Status = 'all' | 'active' | 'inactive'

export function Patients() {
  const { clinic, locations } = useApp()
  const showClinic = locations.length > 1
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const debounced = useDebounced(query, 220)
  const [status, setStatus] = useState<Status>('all')
  const [patientOpen, setPatientOpen] = useState(false)
  const [editing, setEditing] = useState<Patient | null>(null)
  const [archive, setArchive] = useState<Patient | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [bookFor, setBookFor] = useState<Patient | null>(null)
  const [visitFor, setVisitFor] = useState<Patient | null>(null)

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients', debounced, status],
    queryFn: () => api.patients(debounced, status, 200) as Promise<Patient[]>,
  })

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(null)
      setPatientOpen(true)
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  async function doArchive() {
    if (!archive) return
    setArchiving(true)
    try {
      await api.archivePatient(archive.id)
      toast.success('Patient archived', `${archive.first_name} ${archive.last_name} remains in history but is hidden from lists.`)
      await qc.invalidateQueries()
      setArchive(null)
    } catch (e: any) {
      toast.error('Could not archive patient', String(e?.message ?? e))
    } finally {
      setArchiving(false)
    }
  }

  const activeCount = patients.filter((p) => p.status !== 'inactive').length
  const withBalance = patients.filter((p) => (p.balance_cents ?? 0) > 0).length

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Patient register"
        title="Patients"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span><b className="font-semibold tabular-nums text-ink">{patients.length}</b> {patients.length === 1 ? 'record' : 'records'}</span>
            <span aria-hidden className="text-line-strong">·</span>
            <span><b className="font-semibold tabular-nums text-ink">{activeCount}</b> active</span>
            {withBalance > 0 && (
              <>
                <span aria-hidden className="text-line-strong">·</span>
                <span><b className="font-semibold tabular-nums text-ink">{withBalance}</b> with an open balance</span>
              </>
            )}
          </span>
        }
        actions={<Button variant="primary" onClick={() => { setEditing(null); setPatientOpen(true) }}><UserPlus size={14} /> Register patient</Button>}
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="relative min-w-[260px] flex-1 sm:max-w-[360px]">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-accent-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, MRN, phone, national ID…"
              className="input h-9 ps-9 pe-8"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink" aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="inline-flex items-center overflow-hidden rounded-md border border-line-strong">
            {(['all', 'active', 'inactive'] as Status[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`inline-flex h-8 items-center px-3 text-[11px] font-semibold uppercase tracking-[0.06em] transition ${
                  status === s
                    ? 'bg-brand-900 text-white dark:bg-brand-100 dark:text-brand-950'
                    : 'bg-surface text-muted hover:bg-elevated hover:text-ink'
                }`}
              >
                {s === 'all' ? 'All patients' : titleCase(s)}
              </button>
            ))}
          </div>
          <span className="ms-auto hidden text-[10px] font-medium uppercase tracking-[0.1em] text-faint sm:block">Sorted by family name</span>
        </div>

        {isLoading ? (
          <div className="divide-y divide-line">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-3.5">
                <div className="h-8 w-8 rounded-full bg-elevated" />
                <div className="flex-1 space-y-1.5"><div className="h-3 w-40 rounded bg-elevated" /><div className="h-2.5 w-24 rounded bg-elevated" /></div>
                <div className="h-3 w-24 rounded bg-elevated" />
              </div>
            ))}
          </div>
        ) : patients.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Users size={18} />}
              title={query || status !== 'all' ? 'No patients match this view' : 'Your patient register is empty'}
              description={query || status !== 'all'
                ? 'Try a different spelling, phone number, or clear the status filter.'
                : 'Register the first patient to start building a clinical history. Only a name is required.'}
              action={query || status !== 'all'
                ? <Button onClick={() => { setQuery(''); setStatus('all') }}>Clear filters</Button>
                : <Button variant="primary" onClick={() => setPatientOpen(true)}><UserPlus size={14} /> Register patient</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={showClinic ? 'w-full min-w-[1060px] border-collapse' : 'w-full min-w-[940px] border-collapse'}>
              <thead>
                <tr className="border-b border-line bg-elevated/50">
                  <th className="table-head px-4 py-2.5">Patient</th>
                  {showClinic && <th className="table-head px-3 py-2.5">Home clinic</th>}
                  <th className="table-head px-3 py-2.5">Contact</th>
                  <th className="table-head px-3 py-2.5">Age / sex</th>
                  <th className="table-head px-3 py-2.5">Last visit</th>
                  <th className="table-head px-3 py-2.5">Next appointment</th>
                  <th className="table-head px-3 py-2.5 text-end">Balance</th>
                  <th className="table-head px-3 py-2.5">Status</th>
                  <th className="table-head w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const balance = p.balance_cents ?? 0
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/patients/${p.id}`)}
                      className="cursor-pointer border-b border-line/80 transition last:border-0 hover:bg-elevated/60"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={patientName(p)} size={32} />
                          <div className="min-w-0">
                            <div className="truncate text-[12.5px] font-semibold text-ink">{patientName(p)}</div>
                            <div className="font-mono text-[10px] tracking-wide text-faint">{p.mrn}</div>
                          </div>
                        </div>
                      </td>
                      {showClinic && (
                        <td className="px-3 py-2.5">
                          {p.location_name ? (
                            <span className="inline-flex max-w-[170px] items-center gap-1.5 text-[10.5px] text-muted">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.location_color || '#2a3747' }} />
                              <span className="truncate">{p.location_name}</span>
                            </span>
                          ) : <span className="text-[11px] text-faint">—</span>}
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <div className="text-[11.5px] text-ink">{p.phone ? displayPhone(p.phone) : '—'}</div>
                        <div className="max-w-[190px] truncate text-[10.5px] text-faint">{p.email || p.city || 'No contact recorded'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-muted">
                        {age(p.date_of_birth)} <span className="text-faint">·</span> {sexLabel(p.sex)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-[11.5px] text-ink">{p.last_visit_at ? fmtDate(p.last_visit_at, 'd MMM yyyy') : 'Never'}</div>
                        {p.last_visit_at && <div className="text-[10px] text-faint">{fromNow(p.last_visit_at)}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.next_appointment_at ? (
                          <>
                            <div className="text-[11.5px] text-ink">{fmtDate(p.next_appointment_at, 'd MMM yyyy')}</div>
                            <div className="text-[10px] text-faint">{fmtTime(p.next_appointment_at)}</div>
                          </>
                        ) : <span className="text-[11px] text-faint">Not booked</span>}
                      </td>
                      <td className="px-3 py-2.5 text-end">
                        {balance > 0
                          ? <span className="text-[11.5px] font-semibold tabular-nums text-rose-600 dark:text-rose-300">{money(balance, clinic?.currency_symbol)}</span>
                          : <span className="text-[11px] tabular-nums text-faint">—</span>}
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={p.status || 'active'} /></td>
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Dropdown
                          trigger={(
                            <IconButton label="Patient actions" className="h-7 w-7">
                              <MoreHorizontal size={15} />
                            </IconButton>
                          )}
                        >
                          <MenuItem icon={<CalendarPlus size={13} />} onClick={() => setBookFor(p)}>Book appointment</MenuItem>
                          <MenuItem icon={<Stethoscope size={13} />} onClick={() => setVisitFor(p)}>Start a visit</MenuItem>
                          <MenuItem icon={<FolderOpen size={13} />} onClick={() => navigate(`/patients/${p.id}?tab=documents`)}>Documents</MenuItem>
                          <MenuItem icon={<Pencil size={13} />} onClick={() => { setEditing(p); setPatientOpen(true) }}>Edit record</MenuItem>
                          <div className="my-1 h-px bg-line" />
                          <MenuItem icon={<Trash2 size={13} />} danger onClick={() => setArchive(p)}>Archive patient</MenuItem>
                        </Dropdown>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[10.5px] text-faint">
              <span>Showing {patients.length} record{patients.length === 1 ? '' : 's'}</span>
              <span className="inline-flex items-center gap-1"><Badge tone="neutral">{withBalance} with balances</Badge> Updated live across devices</span>
            </div>
          </div>
        )}
      </div>

      <PatientDialog
        open={patientOpen}
        onClose={() => { setPatientOpen(false); setEditing(null) }}
        patient={editing}
        onSaved={(p) => { if (!editing) navigate(`/patients/${p.id}`) }}
      />
      <AppointmentDialog open={Boolean(bookFor)} onClose={() => setBookFor(null)} defaultPatient={bookFor} />
      <VisitDialog open={Boolean(visitFor)} onClose={() => setVisitFor(null)} patient={visitFor} />
      <ConfirmDialog
        open={Boolean(archive)}
        onClose={() => setArchive(null)}
        onConfirm={doArchive}
        busy={archiving}
        title="Archive this patient?"
        confirmLabel="Archive patient"
        tone="danger"
        description={archive
          ? `${patientName(archive)} will be removed from the active register. Their visits, prescriptions and invoices remain in the database for audit and reporting.`
          : undefined}
      />
    </div>
  )
}
