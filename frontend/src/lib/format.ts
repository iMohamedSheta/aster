import {
  differenceInYears, format, formatDistanceToNowStrict, isValid, parseISO,
} from 'date-fns'
import { arSA } from 'date-fns/locale/ar-SA'
import { getLocale, localeTag, translate } from './i18n'

const dfLocale = () => (getLocale() === 'ar' ? { locale: arSA } : undefined)
const isArabic = () => getLocale() === 'ar'

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export function initials(name: string) {
  const parts = (name || '?').trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}

export function patientName(p?: { first_name?: string; last_name?: string; preferred_name?: string } | null) {
  if (!p) return translate('Unknown patient')
  const base = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  if (p.preferred_name) return `${p.preferred_name} (${base})`
  return base || translate('Unnamed patient')
}

export function parseDate(value?: string | null): Date | null {
  if (!value) return null
  const d = parseISO(value)
  return isValid(d) ? d : null
}

export function fmtDate(value?: string | null, pattern = 'd MMM yyyy') {
  const d = parseDate(value)
  return d ? format(d, pattern, dfLocale()) : '—'
}

export function fmtTime(value?: string | null) {
  const d = parseDate(value)
  return d ? format(d, 'h:mm a', dfLocale()) : '—'
}

export function fmtDateTime(value?: string | null) {
  const d = parseDate(value)
  return d ? format(d, 'd MMM yyyy · h:mm a', dfLocale()) : '—'
}

export function fmtDateShort(value?: string | null) {
  const d = parseDate(value)
  return d ? format(d, 'd MMM', dfLocale()) : '—'
}

export function fromNow(value?: string | null) {
  const d = parseDate(value)
  if (!d) return translate('never')
  return formatDistanceToNowStrict(d, { addSuffix: true, ...dfLocale() })
}

/** Distance without "ago"/"from now", used inside labels such as "Waiting …". */
export function elapsed(value?: string | null) {
  const d = parseDate(value)
  if (!d) return translate('just now')
  return formatDistanceToNowStrict(d, dfLocale())
}

export function ageYears(dob?: string | null): number | null {
  const d = parseDate(dob)
  if (!d) return null
  const years = differenceInYears(new Date(), d)
  return years >= 0 ? years : null
}

/** Approximate date of birth for a record where only the age is known. */
export function dobFromAge(years: number, today = new Date()) {
  if (!Number.isFinite(years)) return ''
  const age = Math.max(0, Math.floor(years))
  const d = new Date(today.getFullYear() - age, today.getMonth(), today.getDate())
  return isoLocal(d)
}

export function age(dob?: string | null) {
  const years = ageYears(dob)
  if (years == null) return '—'
  return isArabic() ? `${years} سنة` : `${years}y`
}

/** Locale-aware grouping for plain counts and quantities. */
export function formatNumber(value?: number | string | null, options?: Intl.NumberFormatOptions) {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat(localeTag() ?? 'en-US', options).format(Number.isFinite(n) ? n : 0)
}

/** Fallback glyphs so a currency code can still print the clinic's symbol. */
const SYMBOL_BY_CURRENCY: Record<string, string> = {
  EGP: 'E£', USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$',
  AED: 'د.إ', SAR: 'ر.س', INR: '₹', BRL: 'R$', ZAR: 'R',
}

/**
 * Prices are stored in minor units (piastres/cents). The amount is formatted
 * with Intl.NumberFormat (through formatNumber), and the whole price is kept
 * left-to-right so the glyph and any negative sign stay in the right order
 * inside Arabic text.
 */
export function formatPrice(
  cents?: number | null,
  options?: { symbol?: string; currency?: string },
) {
  const value = (cents ?? 0) / 100
  const symbol = options?.symbol
    ?? (options?.currency ? SYMBOL_BY_CURRENCY[options.currency] : undefined)
    ?? 'E£'
  const amount = formatNumber(Math.abs(value), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `\u2066${value < 0 ? '-' : ''}${symbol}${amount}\u2069`
}

export function money(cents?: number | null, symbol = 'E£') {
  return formatPrice(cents, { symbol })
}

export function bytes(n: number) {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function titleCase(s?: string) {
  if (!s) return ''
  return s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function shortId(id?: string) {
  if (!id) return ''
  return id.slice(0, 8).toUpperCase()
}

export function dayBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0)
  return { start: start.toISOString(), end: end.toISOString(), startDate: start, endDate: end }
}

export function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function isoLocal(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function isoLocalTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function combineLocal(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0)
}

export function bmi(weightKg?: number, heightCm?: number) {
  if (!weightKg || !heightCm) return null
  const m = heightCm / 100
  return weightKg / (m * m)
}

export function listDays(start: Date, end: Date) {
  const out: Date[] = []
  const d = new Date(start)
  while (d <= end) {
    out.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

export const STATUS_TONES: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  scheduled: 'neutral',
  confirmed: 'info',
  arrived: 'warning',
  waiting: 'warning',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'error',
  draft: 'warning',
  signed: 'success',
  active: 'neutral',
  partial: 'warning',
  unpaid: 'neutral',
  paid: 'success',
  void: 'neutral',
  mild: 'neutral',
  moderate: 'warning',
  severe: 'error',
  'life-threatening': 'error',
}

export function statusTone(status?: string) {
  return STATUS_TONES[status ?? ''] ?? 'neutral'
}

export function sexLabel(sex?: string) {
  switch (sex) {
    case 'female': return isArabic() ? 'أنثى' : 'F'
    case 'male': return isArabic() ? 'ذكر' : 'M'
    case 'intersex': return isArabic() ? 'ثنائي الجنس' : 'I'
    case 'other': return translate('Other')
    case 'unknown': return '—'
    default: return '—'
  }
}

export function plural(n: number, singular: string, pluralForm?: string) {
  return `${n} ${n === 1 ? singular : pluralForm ?? `${singular}s`}`
}

export function dollars(cents?: number | null) {
  return ((cents ?? 0) / 100).toFixed(2).replace(/\.00$/, '')
}

export function centsFromInput(value: string | number) {
  const n = typeof value === 'number' ? value : Number.parseFloat(value || '0')
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function weekRange(start: Date) {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return `${format(start, 'd MMM', dfLocale())} – ${format(end, 'd MMM yyyy', dfLocale())}`
}

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return translate('Good morning')
  if (h < 18) return translate('Good afternoon')
  return translate('Good evening')
}

/** Locale-aware formatting for a Date (unlike fmtDate, which takes a stored ISO string). */
export function fmtMoment(date: Date, pattern = 'EEE d MMM') {
  return format(date, pattern, dfLocale())
}

export function fullDay(date = new Date()) {
  return format(date, 'EEEE, d MMMM yyyy', dfLocale())
}

export function shortDay(date = new Date()) {
  return format(date, 'EEE, d MMM', dfLocale())
}

export function sameLocalDay(value: string | Date | null | undefined, day: Date) {
  const d = value instanceof Date ? value : parseDate(value)
  if (!d) return false
  return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate()
}

export function initialsFromName(name?: string) {
  return initials(name ?? '')
}

