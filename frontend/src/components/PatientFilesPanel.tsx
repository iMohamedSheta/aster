import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download, ExternalLink, FilePlus2, FileText, FolderOpen, MoreHorizontal, Pencil,
  Search, Trash2, UploadCloud,
} from 'lucide-react'
import { api } from '../lib/api'
import { FILE_CATEGORIES, formatBytes, isBlockedFile, MAX_FILE_BYTES } from '../lib/files'
import { cn, fmtDate } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { translate } from '../lib/i18n'
import type { Patient, PatientFile } from '../lib/types'
import {
  Button, ConfirmDialog, Dropdown, EmptyState, IconButton, Input, MenuItem, Select,
} from '../components/ui'
import { useToast } from '../components/Toast'
import {
  CategoryBadge, ExpiryBadge, FilePreviewModal, FileTypeTile, usePatientFileActions,
} from './PatientFileBits'
import { PatientFileDialog } from './PatientFileDialog'

const FILE_QUERY_KEYS = ['patient-files', 'files', 'files-overview', 'recent-files', 'patient']

export function PatientFilesPanel({ patient, className }: { patient: Patient; className?: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const actions = usePatientFileActions()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [initialFiles, setInitialFiles] = useState<File[] | null>(null)
  const [editing, setEditing] = useState<PatientFile | null>(null)
  const [preview, setPreview] = useState<PatientFile | null>(null)
  const [archiving, setArchiving] = useState<PatientFile | null>(null)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const debounced = useDebounced(query, 200)

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ['patient-files', patient.id, debounced.trim(), category],
    queryFn: () => api.patientFiles(patient.id, debounced.trim(), category === 'all' ? '' : category),
    enabled: Boolean(patient.id),
  })

  const totals = useMemo(() => {
    const bytes = data.reduce((sum, file) => sum + Number(file.size_bytes ?? 0), 0)
    return { count: data.length, bytes }
  }, [data])

  function invalidate() {
    qc.invalidateQueries({
      predicate: (q) => FILE_QUERY_KEYS.includes(String(q.queryKey[0])),
    })
  }

  function openPicker(files?: FileList | File[] | null) {
    const list = files ? Array.from(files) : []
    if (list.length) {
      const blocked = list.some((f) => isBlockedFile(f))
      const tooLarge = list.some((f) => f.size > MAX_FILE_BYTES)
      if (blocked) {
        toast.error(translate('This file type cannot be stored as a patient document.'))
        return
      }
      if (tooLarge) {
        toast.error(translate('Files must be 200 MB or smaller.'))
        return
      }
      setInitialFiles(list)
    } else {
      setInitialFiles(null)
    }
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

  return (
    <div className={cn('space-y-3', className)}>
      <section
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          openPicker(e.dataTransfer.files)
        }}
        className={cn(
          'card overflow-hidden transition',
          dragging && 'border-accent-500 ring-2 ring-accent-500/25',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-full bg-accent-600" />
            <div className="min-w-0">
              <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{translate('Documents')}</h2>
              <p className="mt-0.5 text-[10.5px] text-faint">
                {isLoading
                  ? translate('Loading documents…')
                  : `${totals.count} ${translate(totals.count === 1 ? 'document' : 'documents')} · ${formatBytes(totals.bytes)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openPicker()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[11.5px] font-medium text-muted transition hover:border-accent-400 hover:text-ink"
            >
              <UploadCloud size={13} /> {translate('Drop files here or browse')}
            </button>
            <Button variant="primary" size="sm" onClick={() => openPicker()}>
              <FilePlus2 size={14} /> {translate('Add document')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-elevated/25 px-4 py-2.5">
          <div className="relative min-w-[180px] flex-1">
            <Search size={13} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={translate('Search this patient’s documents…')}
              className="h-8 ps-8 text-[11.5px]"
            />
          </div>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 w-auto min-w-[150px] text-[11.5px]"
          >
            <option value="all">{translate('All categories')}</option>
            {FILE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{translate(c.label)}</option>
            ))}
          </Select>
          {isFetching && !isLoading && (
            <span className="text-[10px] text-faint">{translate('Updating…')}</span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-elevated/70" />)}
          </div>
        ) : data.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<FolderOpen size={18} />}
              title={query || category !== 'all'
                ? translate('No documents match this search')
                : translate('No documents yet')}
              description={query || category !== 'all'
                ? translate('Try a different word or category.')
                : translate('Drop lab results, scans, letters or consent forms here and they stay with the patient record.')}
              action={!query && category === 'all' ? (
                <Button variant="primary" onClick={() => openPicker()}>
                  <FilePlus2 size={14} /> {translate('Upload the first document')}
                </Button>
              ) : undefined}
            />
          </div>
        ) : (
          <div>
            {data.map((file) => (
              <div
                key={file.id}
                className="group flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0 transition hover:bg-elevated/40"
              >
                <button
                  type="button"
                  onClick={() => setPreview(file)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-start"
                  title={translate('Preview document')}
                >
                  <FileTypeTile file={file} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-ink">{file.title}</span>
                      <CategoryBadge category={file.category} />
                      <ExpiryBadge date={file.expires_on} />
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-faint">
                      <span className="truncate">{file.file_name || translate('Document')}</span>
                      <span>·</span>
                      <span>{formatBytes(file.size_bytes)}</span>
                      <span>·</span>
                      <span>{fmtDate(file.created_at)}</span>
                      {file.uploaded_by_name && <><span>·</span><span className="truncate">{file.uploaded_by_name}</span></>}
                    </span>
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="hidden sm:inline-flex"
                    onClick={() => actions.open(file)}
                  >
                    <ExternalLink size={12} /> {translate('Open')}
                  </Button>
                  <Dropdown
                    trigger={(
                      <IconButton label={translate('Document actions')} className="h-7 w-7">
                        <MoreHorizontal size={14} />
                      </IconButton>
                    )}
                  >
                    <MenuItem icon={<FileText size={13} />} onClick={() => setPreview(file)}>{translate('Preview')}</MenuItem>
                    <MenuItem icon={<ExternalLink size={13} />} onClick={() => actions.open(file)}>{translate('Open document')}</MenuItem>
                    <MenuItem icon={<Download size={13} />} onClick={() => actions.save(file)}>{translate('Save a copy')}</MenuItem>
                    <MenuItem icon={<Pencil size={13} />} onClick={() => setEditing(file)}>{translate('Edit details')}</MenuItem>
                    <div className="my-1 h-px bg-line" />
                    <MenuItem icon={<Trash2 size={13} />} danger onClick={() => setArchiving(file)}>{translate('Archive document')}</MenuItem>
                  </Dropdown>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line bg-elevated/25 px-4 py-2 text-[10px] text-faint">
          <span>{translate('Documents sync with the workspace and its connected devices.')}</span>
          <span className="hidden items-center gap-1 sm:inline-flex"><UploadCloud size={11} /> {translate('Up to 200 MB per file')}</span>
        </div>
      </section>

      <PatientFileDialog
        open={uploadOpen}
        onClose={() => { setUploadOpen(false); setInitialFiles(null) }}
        patient={patient}
        initialFiles={initialFiles}
        onSaved={invalidate}
      />

      <PatientFileDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        patient={patient}
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
