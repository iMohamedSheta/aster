import { translate } from './i18n'

/** Document categories shared by the patient file and the Files page. */
export interface FileCategory {
  value: string
  label: string
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'brand'
  hint: string
}

export const FILE_CATEGORIES: FileCategory[] = [
  { value: 'lab', label: 'Lab result', tone: 'info', hint: 'Blood work, cultures, pathology' },
  { value: 'imaging', label: 'Imaging', tone: 'brand', hint: 'X-ray, ultrasound, MRI, CT' },
  { value: 'consent', label: 'Consent form', tone: 'success', hint: 'Signed procedures and releases' },
  { value: 'insurance', label: 'Insurance', tone: 'warning', hint: 'Cards, approvals and claims' },
  { value: 'referral', label: 'Referral', tone: 'neutral', hint: 'Letters to and from specialists' },
  { value: 'identity', label: 'ID document', tone: 'neutral', hint: 'National ID, passport, licence' },
  { value: 'prescription', label: 'Scanned prescription', tone: 'neutral', hint: 'External or paper prescriptions' },
  { value: 'other', label: 'Other', tone: 'neutral', hint: 'Anything else worth keeping' },
]

export const MAX_FILE_BYTES = 200 * 1024 * 1024

/** Raw bytes sent per bridge call while uploading a document. */
export const UPLOAD_CHUNK_BYTES = 1024 * 1024

export const FILE_ACCEPT = [
  '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic',
  '.doc', '.docx', '.odt', '.rtf', '.txt', '.xls', '.xlsx', '.ods', '.csv',
  '.ppt', '.pptx', '.zip', '.rar', '.7z', '.dcm',
].join(',')

const BLOCKED = new Set([
  'bat', 'cmd', 'com', 'cpl', 'dll', 'exe', 'hta', 'htm', 'html', 'jar', 'js',
  'jse', 'lnk', 'msc', 'msi', 'ps1', 'psm1', 'reg', 'scr', 'shtml', 'svg',
  'vbe', 'vbs', 'wsf', 'wsh', 'xhtml', 'xml',
])

export function extensionOf(name?: string | null) {
  const value = (name ?? '').trim().toLowerCase()
  const dot = value.lastIndexOf('.')
  return dot >= 0 ? value.slice(dot + 1) : ''
}

export function isBlockedFile(file: { name: string }) {
  return BLOCKED.has(extensionOf(file.name))
}

export function categoryMeta(value?: string | null) {
  return FILE_CATEGORIES.find((c) => c.value === value) ?? FILE_CATEGORIES[FILE_CATEGORIES.length - 1]
}

export function categoryLabel(value?: string | null) {
  return translate(categoryMeta(value).label)
}

export type FileKind = 'image' | 'pdf' | 'document' | 'sheet' | 'archive' | 'text' | 'other'

export function fileKind(file: { file_name?: string; mime?: string }): FileKind {
  const ext = extensionOf(file.file_name)
  const mime = (file.mime ?? '').toLowerCase()
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic'].includes(ext)) return 'image'
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'document'
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'sheet'
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return 'archive'
  if (['txt', 'md'].includes(ext) || mime.startsWith('text/')) return 'text'
  return 'other'
}

export function isImageFile(file: { file_name?: string; mime?: string }) {
  return fileKind(file) === 'image'
}

export function formatBytes(bytes?: number | null) {
  const value = Number(bytes ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '0 KB'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export function stripExtension(name?: string | null) {
  const value = (name ?? '').trim()
  if (!value) return ''
  const dot = value.lastIndexOf('.')
  return dot > 0 ? value.slice(0, dot) : value
}

export function formatFileDate(date?: string | null) {
  const value = (date ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

export function expiryInfo(date?: string | null) {
  const value = formatFileDate(date)
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  const expires = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((expires.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return { state: 'expired' as const, days }
  if (days <= 30) return { state: 'soon' as const, days }
  return { state: 'valid' as const, days }
}

/** Reads a Blob as raw base64, without the data: URL prefix. */
export function readBlobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? '')
      const comma = value.indexOf(',')
      resolve(comma >= 0 ? value.slice(comma + 1) : value)
    }
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read'))
    reader.readAsDataURL(blob)
  })
}

/** Reads one part of a file, so large documents never fill browser memory. */
export function readFileSliceBase64(file: File, start: number, end: number): Promise<string> {
  return readBlobBase64(file.slice(start, end))
}

export function dataUrl(mime: string | undefined, content: string) {
  return `data:${mime || 'application/octet-stream'};base64,${content}`
}
