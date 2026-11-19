import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileUp, Loader2, UploadCloud, X } from 'lucide-react'
import { api } from '../lib/api'
import {
  FILE_ACCEPT, FILE_CATEGORIES, MAX_FILE_BYTES, UPLOAD_CHUNK_BYTES, formatBytes,
  isBlockedFile, readFileSliceBase64, stripExtension,
} from '../lib/files'
import { cn, patientName } from '../lib/format'
import { translate } from '../lib/i18n'
import type { Patient, PatientFile } from '../lib/types'
import { Avatar, Button, Field, Input, Modal, Select, Textarea } from './ui'
import { PatientPicker } from './PatientPicker'
import { useToast } from './Toast'

export function PatientFileDialog({
  open, onClose, patient, file, initialFiles, onSaved,
}: {
  open: boolean
  onClose: () => void
  patient?: Patient | null
  file?: PatientFile | null
  initialFiles?: File[] | null
  onSaved?: (files: PatientFile[]) => void
}) {
  const editing = Boolean(file?.id)
  const qc = useQueryClient()
  const toast = useToast()
  const [patientId, setPatientId] = useState('')
  const [pickedPatient, setPickedPatient] = useState<Patient | null>(null)
  const [selected, setSelected] = useState<File[]>([])
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('other')
  const [notes, setNotes] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(0)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setSaving(false)
    setDone(0)
    setProgress(0)
    setDragging(false)
    setSelected(initialFiles ? [...initialFiles] : [])
    setPatientId(patient?.id ?? file?.patient_id ?? '')
    setPickedPatient(patient ?? null)
    if (file) {
      setTitle(file.title || '')
      setCategory(file.category || 'other')
      setNotes(file.notes || '')
      setExpiresOn((file.expires_on || '').slice(0, 10))
    } else {
      setTitle(initialFiles?.length === 1 ? stripExtension(initialFiles[0].name) : '')
      setCategory('other')
      setNotes('')
      setExpiresOn('')
    }
  }, [open, file?.id, patient?.id, initialFiles])

  const shownPatient: Patient | null = patient ?? pickedPatient ?? (file ? {
    id: file.patient_id,
    first_name: file.first_name ?? '',
    last_name: file.last_name ?? '',
    preferred_name: file.preferred_name ?? '',
    mrn: file.mrn ?? '',
  } as Patient : null)

  function addFiles(incoming: FileList | File[]) {
    const files = Array.from(incoming)
    if (!files.length) return
    const tooLarge = files.filter((f) => f.size > MAX_FILE_BYTES)
    const blocked = files.filter((f) => isBlockedFile(f))
    const accepted = files.filter((f) => f.size > 0 && f.size <= MAX_FILE_BYTES && !isBlockedFile(f))
    if (tooLarge.length) {
      setError(translate('Files must be 200 MB or smaller.'))
      return
    }
    if (blocked.length) {
      setError(translate('This file type cannot be stored as a patient document.'))
      return
    }
    if (!accepted.length) {
      setError(translate('The selected files are empty.'))
      return
    }
    setError('')
    setSelected(accepted)
    if (accepted.length === 1) setTitle(stripExtension(accepted[0].name))
    else setTitle('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (editing && file) {
      if (!title.trim()) {
        setError(translate('A document title is required.'))
        return
      }
      setSaving(true)
      try {
        const saved = await api.updatePatientFile(file.id, {
          title: title.trim(), category, notes, expires_on: expiresOn,
        })
        await qc.invalidateQueries({ predicate: (q) => ['patient-files', 'files', 'files-overview', 'recent-files'].includes(String(q.queryKey[0])) })
        toast.success(translate('Document updated'), saved.title || '')
        onSaved?.([saved])
        onClose()
      } catch (err: any) {
        setError(String(err?.message ?? err))
      } finally {
        setSaving(false)
      }
      return
    }

    if (!patientId) {
      setError(translate('Choose a patient for this document.'))
      return
    }
    if (!selected.length) {
      setError(translate('Choose at least one file to upload.'))
      return
    }
    const only = selected.length === 1 ? selected[0] : null
    if (only && !title.trim()) {
      setError(translate('A document title is required.'))
      return
    }

    setSaving(true)
    setDone(0)
    setProgress(0)
    const saved: PatientFile[] = []
    const totalBytes = selected.reduce((sum, current) => sum + current.size, 0) || 1
    let uploadedBytes = 0
    try {
      for (let i = 0; i < selected.length; i += 1) {
        const current = selected[i]
        const row = await api.beginPatientFileUpload({
          patient_id: patientId,
          category,
          title: only ? title.trim() : '',
          file_name: current.name,
          mime: current.type,
          notes,
          expires_on: expiresOn,
        })
        try {
          let index = 0
          for (let offset = 0; offset < current.size; offset += UPLOAD_CHUNK_BYTES) {
            const end = Math.min(offset + UPLOAD_CHUNK_BYTES, current.size)
            const data = await readFileSliceBase64(current, offset, end)
            await api.appendPatientFileChunk(row.id, index, data)
            uploadedBytes += end - offset
            setProgress(uploadedBytes / totalBytes)
            index += 1
          }
          const finished = await api.finishPatientFileUpload(row.id)
          saved.push(finished)
        } catch (err) {
          await api.abortPatientFileUpload(row.id).catch(() => undefined)
          throw err
        }
        setDone(i + 1)
      }
      await qc.invalidateQueries({ predicate: (q) => ['patient-files', 'files', 'files-overview', 'recent-files', 'patient'].includes(String(q.queryKey[0])) })
      toast.success(
        translate(saved.length === 1 ? 'Document uploaded' : 'Documents uploaded'),
        saved.length === 1 ? saved[0].title : `${saved.length} ${translate('documents')}`,
      )
      onSaved?.(saved)
      onClose()
    } catch (err: any) {
      setError(String(err?.message ?? err))
      if (saved.length) {
        await qc.invalidateQueries({ predicate: (q) => ['patient-files', 'files', 'files-overview', 'recent-files', 'patient'].includes(String(q.queryKey[0])) })
        onSaved?.(saved)
      }
    } finally {
      setSaving(false)
      setProgress(0)
    }
  }

  const primaryLabel = editing
    ? translate('Save changes')
    : saving
      ? progress > 0
        ? `${translate('Uploading')} ${Math.round(progress * 100)}%`
        : `${translate('Uploading')} ${done}/${selected.length}`
      : translate(selected.length > 1 ? 'Upload documents' : 'Upload document')

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={editing ? translate('Edit document') : translate('Add a document')}
      description={editing
        ? translate('Update how this document is filed. The file itself stays unchanged.')
        : translate('Keep results, letters, scans and consent forms with the patient record.')}
      size="md"
      footer={(
        <>
          <Button onClick={onClose} disabled={saving}>{translate('Cancel')}</Button>
          <Button variant="primary" type="submit" form="patient-file-form" loading={saving}>
            {primaryLabel}
          </Button>
        </>
      )}
    >
      <form id="patient-file-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">
            {error}
          </div>
        )}

        {!patient && !file ? (
          <Field label={translate('Patient *')}>
            <PatientPicker
              value={patientId}
              initial={pickedPatient}
              onChange={(id, next) => { setPatientId(id); setPickedPatient(next) }}
            />
          </Field>
        ) : shownPatient && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-elevated/50 px-3 py-2.5">
            <Avatar name={patientName(shownPatient)} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-ink">{patientName(shownPatient)}</div>
              <div className="font-mono text-[10px] text-faint">{shownPatient.mrn}</div>
            </div>
          </div>
        )}

        {!editing && (
          <>
            <label
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition',
                dragging
                  ? 'border-accent-500 bg-accent-500/5'
                  : 'border-line-strong bg-elevated/35 hover:border-accent-400 hover:bg-elevated',
              )}
            >
              <input
                type="file"
                multiple
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
              />
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-accent-600">
                <UploadCloud size={19} />
              </span>
              <span className="text-[12.5px] font-semibold text-ink">{translate('Drop files here or browse')}</span>
              <span className="text-[10.5px] text-faint">{translate('PDF, images and Office documents · up to 200 MB each')}</span>
            </label>

            {selected.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">
                  {translate('Selected files')} · {selected.length}
                </div>
                {selected.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2">
                    <FileUp size={14} className="shrink-0 text-accent-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-medium text-ink">{f.name}</span>
                      <span className="block text-[9.5px] text-faint">{formatBytes(f.size)}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={translate('Remove')}
                      onClick={() => setSelected((list) => list.filter((_, index) => index !== i))}
                      className="rounded p-1 text-faint transition hover:bg-elevated hover:text-ink"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {saving && progress > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-faint">
                  <span>{translate('Uploading document…')}</span>
                  <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full rounded-full bg-accent-600 transition-[width] duration-200"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={translate('Category')}>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {FILE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{translate(c.label)}</option>
              ))}
            </Select>
          </Field>
          <Field label={translate('Expiry date')} hint={translate('Optional · insurance cards and IDs')}>
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </Field>
          {(editing || selected.length <= 1) && (
            <Field
              label={translate('Document title')}
              className="sm:col-span-2"
              hint={editing ? translate('Shown in the patient file and document search.') : translate('Defaults to the file name.')}
            >
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={translate('e.g. Complete blood count — March')}
              />
            </Field>
          )}
          <Field label={translate('Notes')} className="sm:col-span-2" hint={translate('Optional context for the care team.')}>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={translate('What should the team know about this document?')}
              className="min-h-[72px]"
            />
          </Field>
        </div>

        <div className="flex items-start gap-2 text-[10px] leading-4 text-faint">
          {saving ? <Loader2 size={12} className="mt-0.5 animate-spin" /> : <UploadCloud size={12} className="mt-0.5" />}
          <span>{translate('Documents are stored in the workspace and sync to connected devices. Up to 200 MB each.')}</span>
        </div>
      </form>
    </Modal>
  )
}
