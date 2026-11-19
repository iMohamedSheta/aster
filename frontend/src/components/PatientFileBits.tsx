import { useQuery } from '@tanstack/react-query'
import {
  Download, ExternalLink, FileArchive, FileImage, FileSpreadsheet, FileText,
  File as FileIcon, Loader2,
} from 'lucide-react'
import { api } from '../lib/api'
import {
  categoryLabel, categoryMeta, dataUrl, expiryInfo, fileKind, formatBytes, isImageFile,
  type FileKind,
} from '../lib/files'
import { cn, fmtDate, fmtDateTime } from '../lib/format'
import { translate } from '../lib/i18n'
import type { PatientFile } from '../lib/types'
import { Badge, Button, Modal } from './ui'
import { useToast } from './Toast'

const KIND_STYLE: Record<FileKind, { icon: any; className: string }> = {
  image: { icon: FileImage, className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-900/25 dark:text-sky-200' },
  pdf: { icon: FileText, className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/25 dark:text-rose-200' },
  document: { icon: FileText, className: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-900/25 dark:text-indigo-200' },
  sheet: { icon: FileSpreadsheet, className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/25 dark:text-emerald-200' },
  archive: { icon: FileArchive, className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/25 dark:text-amber-200' },
  text: { icon: FileText, className: 'border-line bg-elevated text-muted' },
  other: { icon: FileIcon, className: 'border-line bg-elevated text-muted' },
}

export function FileTypeTile({
  file, size = 36, className,
}: { file: Pick<PatientFile, 'file_name' | 'mime'>; size?: number; className?: string }) {
  const style = KIND_STYLE[fileKind(file)]
  const Icon = style.icon
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-lg border', style.className, className)}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.44)} />
    </span>
  )
}

export function CategoryBadge({ category }: { category?: string | null }) {
  const meta = categoryMeta(category)
  return <Badge tone={meta.tone}>{translate(meta.label)}</Badge>
}

export function ExpiryBadge({ date, showValid }: { date?: string | null; showValid?: boolean }) {
  const info = expiryInfo(date)
  if (!info) return null
  if (info.state === 'expired') return <Badge tone="error">{translate('Expired')}</Badge>
  if (info.state === 'soon') {
    if (info.days === 0) return <Badge tone="warning">{translate('Expires today')}</Badge>
    return (
      <Badge tone="warning">
        {`${translate('Expires in')} ${info.days} ${translate(info.days === 1 ? 'day' : 'days')}`}
      </Badge>
    )
  }
  if (showValid && date) return <span className="text-[10.5px] text-faint">{fmtDate(date)}</span>
  return null
}

/** Shared open/save behaviour for document menus. */
export function usePatientFileActions() {
  const toast = useToast()
  return {
    async open(file: PatientFile) {
      try {
        await api.openPatientFile(file.id)
      } catch (e: any) {
        toast.error(translate('Could not open document'), String(e?.message ?? e))
      }
    },
    async save(file: PatientFile) {
      try {
        const result = await api.savePatientFileAs(file.id)
        if (result.saved) {
          toast.success(translate('Document saved'), result.name || '')
        }
      } catch (e: any) {
        toast.error(translate('Could not save a copy'), String(e?.message ?? e))
      }
    },
  }
}

export function FilePreviewModal({
  file, onClose,
}: { file: PatientFile | null; onClose: () => void }) {
  const actions = usePatientFileActions()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['patient-file-content', file?.id],
    queryFn: () => api.patientFileContent(file!.id),
    enabled: Boolean(file?.id),
  })

  const image = file ? isImageFile(file) : false
  const meta = categoryMeta(file?.category)

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      title={file?.title || translate('Document')}
      description={file ? `${translate(meta.label)} · ${formatBytes(file.size_bytes)}` : undefined}
      size="lg"
      footer={file ? (
        <>
          <Button onClick={() => actions.save(file)}><Download size={14} /> {translate('Save a copy')}</Button>
          <Button variant="primary" onClick={() => actions.open(file)}><ExternalLink size={14} /> {translate('Open document')}</Button>
        </>
      ) : undefined}
    >
      {file && (
        <div className="space-y-4">
          {isLoading && (
            <div className="flex h-44 items-center justify-center text-faint"><Loader2 size={20} className="animate-spin" /></div>
          )}
          {isError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">
              {String((error as any)?.message ?? translate('The document could not be loaded.'))}
            </div>
          )}
          {!isLoading && !isError && data && (
            data.too_large ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-elevated/40 px-6 py-10 text-center">
                <FileTypeTile file={file} size={52} />
                <div>
                  <div className="text-[13px] font-semibold text-ink">{file.file_name || file.title}</div>
                  <div className="mt-1 text-[11.5px] text-muted">
                    {translate('This file is too large to preview here. Open it to view or print it.')}
                  </div>
                </div>
                <Button onClick={() => actions.open(file)}><ExternalLink size={14} /> {translate('Open document')}</Button>
              </div>
            ) : image ? (
              <div className="rounded-xl border border-line bg-elevated/40 p-2">
                <img
                  src={dataUrl(data.mime, data.content)}
                  alt={file.title}
                  className="mx-auto max-h-[56vh] rounded-lg object-contain"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-elevated/40 px-6 py-10 text-center">
                <FileTypeTile file={file} size={52} />
                <div>
                  <div className="text-[13px] font-semibold text-ink">{file.file_name || file.title}</div>
                  <div className="mt-1 text-[11.5px] text-muted">
                    {translate('Open the document in its default application to read or print it.')}
                  </div>
                </div>
                <Button onClick={() => actions.open(file)}><ExternalLink size={14} /> {translate('Open document')}</Button>
              </div>
            )
          )}

          <div className="grid gap-3 rounded-xl border border-line bg-surface p-3.5 text-[11.5px] sm:grid-cols-2">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">{translate('File name')}</div>
              <div className="mt-0.5 break-all text-ink">{file.file_name || '—'}</div>
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">{translate('Category')}</div>
              <div className="mt-0.5 text-ink">{translate(meta.label)}</div>
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">{translate('Uploaded by')}</div>
              <div className="mt-0.5 text-ink">{file.uploaded_by_name || translate('Clinic team')}</div>
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">{translate('Uploaded')}</div>
              <div className="mt-0.5 text-ink">{fmtDateTime(file.created_at)}</div>
            </div>
            {file.expires_on && (
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">{translate('Expiry date')}</div>
                <div className="mt-0.5 flex items-center gap-2 text-ink">
                  {fmtDate(file.expires_on)} <ExpiryBadge date={file.expires_on} />
                </div>
              </div>
            )}
            {file.notes && (
              <div className="sm:col-span-2">
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">{translate('Notes')}</div>
                <div className="mt-0.5 whitespace-pre-wrap leading-5 text-muted">{file.notes}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
