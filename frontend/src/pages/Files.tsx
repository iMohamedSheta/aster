import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CalendarClock, Download, ExternalLink, FilePlus2, Files as FilesIcon,
  FolderOpen, HardDrive, MoreHorizontal, Pencil, Search, Trash2,
} from 'lucide-react'
import { api } from '../lib/api'
import {
  FILE_CATEGORIES, expiryInfo, formatBytes,
} from '../lib/files'
import { cn, fmtDate, patientName } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { translate } from '../lib/i18n'
import type { PatientFile } from '../lib/types'
import {
  Avatar, Button, ConfirmDialog, Dropdown, EmptyState, IconButton, Input, MenuItem,
  PageHeader, Select,
} from '../components/ui'
import { useToast } from '../components/Toast'
import {
  CategoryBadge, ExpiryBadge, FilePreviewModal, FileTypeTile, usePatientFileActions,
} from '../components/PatientFileBits'
import { PatientFileDialog } from '../components/PatientFileDialog'

const FILE_QUERY_KEYS = ['patient-files', 'files', 'files-overview', 'recent-files', 'patient']

type ExpiryFilter = 'all' | 'soon' | 'expired' | 'valid'

function StatTile({
  label, value, hint, icon, tone, active, onClick,
}: {
  label: string
  value: React.ReactNode
  hint: string
  icon: React.ReactNode
  tone?: 'warning' | 'error'
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'card flex items-start gap-3 p-4 text-start transition hover:border-line-strong',
        active && 'border-accent-500 ring-1 ring-accent-500/30',
      )}
    >
      <span className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
        tone === 'error'
          ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-300'
          : tone === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300'
            : 'border-line bg-elevated text-accent-600 dark:text-accent-300',
      )}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</span>
        <span className="mt-1 block text-[21px] font-semibold leading-none tabular-nums text-ink">{value}</span>
        <span className="mt-1.5 block text-[10px] leading-4 text-muted">{hint}</span>
      </span>
    </button>
  )
}

export function Files() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const toast = useToast()
  const actions = usePatientFileActions()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [expiry, setExpiry] = useState<ExpiryFilter>('all')
  const [uploadOpen, setUploadOpen] = useState(() => searchParams.get('new') === '1')
  const newParam = searchParams.get('new')
  useEffect(() => {
    if (newParam === '1') setUploadOpen(true)
  }, [newParam])
  const [editing, setEditing] = useState<PatientFile | null>(null)
  const [preview, setPreview] = useState<PatientFile | null>(null)
  const [archiving, setArchiving] = useState<PatientFile | null>(null)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const debounced = useDebounced(query, 200)

  const overview = useQuery({
    queryKey: ['files-overview'],
    queryFn: () => api.filesOverview(),
  })

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ['files', debounced.trim(), category],
    queryFn: () => api.patientFiles('', debounced.trim(), category === 'all' ? '' : category),
  })

  const rows = useMemo(() => {
    if (expiry === 'all') return data
    return data.filter((file) => {
      const info = expiryInfo(file.expires_on)
      if (expiry === 'valid') return info?.state === 'valid'
      return info?.state === expiry
    })
  }, [data, expiry])

  const totals = useMemo(() => {
    const bytes = rows.reduce((sum, file) => sum + Number(file.size_bytes ?? 0), 0)
    return { count: rows.length, bytes }
  }, [rows])

  function invalidate() {
    qc.invalidateQueries({
      predicate: (q) => FILE_QUERY_KEYS.includes(String(q.queryKey[0])),
    })
  }

  function openUpload() {
    setUploadOpen(true)
  }

  async function archive() {
    if (!archiving) return
    setArchiveBusy(true)
    try {
      await api.archivePatientFile(archiving.id)
      invalidate()
      toast.success(translate('Document archived'), archiving.title)
      setArchiving(null)
    } catch (e: any) {
      toast.error(translate('Could not archive the document'), String(e?.message ?? e))
    } finally {
      setArchiveBusy(false)
    }
  }

  const filters: { value: ExpiryFilter; label: string }[] = [
    { value: 'all', label: 'All documents' },
    { value: 'soon', label: 'Expiring soon' },
    { value: 'expired', label: 'Expired' },
    { value: 'valid', label: 'In date' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Patient records"
        title="Files"
        description="Every scan, lab result, letter and consent form the clinic keeps — searchable across all patients."
        actions={(
          <Button variant="primary" onClick={openUpload}>
            <FilePlus2 size={14} /> {translate('Add a document')}
          </Button>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={translate('Documents')}
          value={overview.data?.documents ?? 0}
          hint={translate('Stored with patient records')}
          icon={<FilesIcon size={16} />}
        />
        <StatTile
          label={translate('Storage used')}
          value={formatBytes(overview.data?.bytes ?? 0)}
          hint={translate('Included in workspace backups')}
          icon={<HardDrive size={16} />}
        />
        <StatTile
          label={translate('Expiring soon')}
          value={overview.data?.expiring ?? 0}
          hint={translate('Within the next 30 days')}
          icon={<CalendarClock size={16} />}
          tone="warning"
          active={expiry === 'soon'}
          onClick={() => setExpiry(expiry === 'soon' ? 'all' : 'soon')}
        />
        <StatTile
          label={translate('Expired')}
          value={overview.data?.expired ?? 0}
          hint={translate('Replace or archive these')}
          icon={<AlertTriangle size={16} />}
          tone="error"
          active={expiry === 'expired'}
          onClick={() => setExpiry(expiry === 'expired' ? 'all' : 'expired')}
        />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={translate('Search documents, patients or file names…')}
              className="h-9 ps-9 text-[12px]"
            />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-auto min-w-[160px] text-[12px]">
            <option value="all">{translate('All categories')}</option>
            {FILE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{translate(c.label)}</option>
            ))}
          </Select>
          <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-line bg-elevated/40 p-0.5">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setExpiry(f.value)}
                className={cn(
                  'h-8 shrink-0 rounded-md px-2.5 text-[10.5px] font-medium transition',
                  expiry === f.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {translate(f.label)}
              </button>
            ))}
          </div>
          <span className="hidden text-[10px] text-faint sm:inline">
            {isFetching && !isLoading
              ? translate('Updating…')
              : `${totals.count} ${translate(totals.count === 1 ? 'document' : 'documents')} · ${formatBytes(totals.bytes)}`}
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-elevated/70" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<FolderOpen size={18} />}
              title={query || category !== 'all' || expiry !== 'all'
                ? translate('No documents match these filters')
                : translate('The clinic has no documents yet')}
              description={translate('Upload results, scans and signed forms to keep every patient record complete.')}
              action={<Button variant="primary" onClick={openUpload}><FilePlus2 size={14} /> {translate('Add a document')}</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-start">
              <thead>
                <tr className="border-b border-line bg-elevated/30 text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">
                  <th className="px-4 py-2.5 text-start font-semibold">{translate('Document')}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{translate('Patient')}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{translate('Category')}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{translate('Size')}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{translate('Added')}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{translate('Expiry')}</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((file) => (
                  <tr key={file.id} className="group border-b border-line last:border-0 transition hover:bg-elevated/40">
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setPreview(file)}
                        className="flex min-w-0 items-center gap-3 text-start"
                      >
                        <FileTypeTile file={file} size={32} />
                        <span className="min-w-0">
                          <span className="block max-w-[260px] truncate text-[12px] font-semibold text-ink">{file.title}</span>
                          <span className="block max-w-[260px] truncate text-[10px] text-faint">{file.file_name || translate('Document')}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => navigate(`/patients/${file.patient_id}?tab=documents`)}
                        className="flex items-center gap-2 text-start"
                      >
                        <Avatar name={patientName({
                          first_name: file.first_name,
                          last_name: file.last_name,
                          preferred_name: file.preferred_name,
                        })} size={26} />
                        <span className="min-w-0">
                          <span className="block max-w-[180px] truncate text-[11.5px] font-medium text-ink">
                            {patientName({
                              first_name: file.first_name,
                              last_name: file.last_name,
                              preferred_name: file.preferred_name,
                            })}
                          </span>
                          <span className="block font-mono text-[9.5px] text-faint">{file.mrn}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5"><CategoryBadge category={file.category} /></td>
                    <td className="px-3 py-2.5 text-[11px] tabular-nums text-muted">{formatBytes(file.size_bytes)}</td>
                    <td className="px-3 py-2.5">
                      <span className="block text-[11px] text-muted">{fmtDate(file.created_at)}</span>
                      <span className="block max-w-[150px] truncate text-[9.5px] text-faint">{file.uploaded_by_name || translate('Clinic team')}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {file.expires_on ? (
                        <span className="flex flex-col items-start gap-1">
                          <ExpiryBadge date={file.expires_on} />
                          <span className="text-[9.5px] text-faint">{fmtDate(file.expires_on)}</span>
                        </span>
                      ) : <span className="text-[10.5px] text-faint">—</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      <Dropdown
                        trigger={(
                          <IconButton label={translate('Document actions')} className="h-7 w-7">
                            <MoreHorizontal size={14} />
                          </IconButton>
                        )}
                      >
                        <MenuItem icon={<FilesIcon size={13} />} onClick={() => setPreview(file)}>{translate('Preview')}</MenuItem>
                        <MenuItem icon={<ExternalLink size={13} />} onClick={() => actions.open(file)}>{translate('Open document')}</MenuItem>
                        <MenuItem icon={<Download size={13} />} onClick={() => actions.save(file)}>{translate('Save a copy')}</MenuItem>
                        <MenuItem icon={<Pencil size={13} />} onClick={() => setEditing(file)}>{translate('Edit details')}</MenuItem>
                        <MenuItem icon={<FilesIcon size={13} />} onClick={() => navigate(`/patients/${file.patient_id}?tab=documents`)}>{translate('Open patient documents')}</MenuItem>
                        <div className="my-1 h-px bg-line" />
                        <MenuItem icon={<Trash2 size={13} />} danger onClick={() => setArchiving(file)}>{translate('Archive document')}</MenuItem>
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PatientFileDialog
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false)
          if (newParam === '1') navigate('/files', { replace: true })
        }}
        onSaved={invalidate}
      />

      <PatientFileDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        file={editing}
        onSaved={invalidate}
      />

      <FilePreviewModal file={preview} onClose={() => setPreview(null)} />

      <ConfirmDialog
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        onConfirm={archive}
        title={translate('Archive this document?')}
        description={archiving
          ? `${archiving.title} — ${translate('It leaves the patient file, but the clinic keeps it in the audit history.')}`
          : undefined}
        confirmLabel={translate('Archive document')}
        tone="danger"
        busy={archiveBusy}
      />
    </div>
  )
}
