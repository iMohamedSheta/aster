import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '../lib/format'
import { getLocale, translate } from '../lib/i18n'
import {
  COUNTRIES, DEFAULT_COUNTRY, countryName, formatNational, normalizeNational,
  parsePhone, type Country,
} from '../lib/phone'

/**
 * Phone entry with a searchable country selector.
 *
 * The national part is what people type; the control emits a compact
 * international value such as `+201012345678`, so records stay dialable even
 * when the patient moves between clinics.
 */
export function PhoneInput({
  value, onChange, defaultCountry = DEFAULT_COUNTRY, placeholder, autoFocus, id,
  invalid, className,
}: {
  value: string
  onChange: (value: string) => void
  defaultCountry?: Country
  placeholder?: string
  autoFocus?: boolean
  id?: string
  invalid?: boolean
  className?: string
}) {
  const initial = parsePhone(value, defaultCountry)
  const [country, setCountry] = useState<Country>(initial.country)
  const [national, setNational] = useState(initial.national)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [anchor, setAnchor] = useState({ left: 0, top: 0, width: 330 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Keep the control in step when the form loads or changes a patient.
  useEffect(() => {
    const raw = (value ?? '').trim()
    if (!raw) return
    const parsed = parsePhone(raw, defaultCountry)
    setCountry(parsed.country)
    setNational(parsed.national)
  }, [value, defaultCountry.iso])

  // A clinic profile can arrive after the dialog opened; adopt its country
  // while the field is still empty.
  useEffect(() => {
    if (!(value ?? '').trim()) setCountry(defaultCountry)
  }, [defaultCountry.iso])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onResize = () => setOpen(false)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const ordered = useMemo(() => {
    const locale = getLocale() === 'ar' ? 'ar' : 'en'
    return [...COUNTRIES].sort((a, b) => {
      if (a.iso === defaultCountry.iso) return -1
      if (b.iso === defaultCountry.iso) return 1
      return countryName(a).localeCompare(countryName(b), locale)
    })
  }, [defaultCountry.iso])

  const term = query.trim().toLowerCase()
  const matches = term
    ? ordered.filter((c) => {
      const haystack = `${c.name} ${c.ar ?? ''} ${c.iso} ${c.dial}`.toLowerCase()
      return haystack.includes(term) || c.dial.slice(1).startsWith(term.replace(/^\+/, ''))
    })
    : ordered

  function togglePicker() {
    if (open) {
      setOpen(false)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(340, window.innerWidth - 16)
    let left = getLocale() === 'ar' ? rect.right - width : rect.left
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    const height = 330
    let top = rect.bottom + 6
    if (top + height > window.innerHeight - 8 && rect.top - height - 6 > 8) {
      top = rect.top - height - 6
    }
    setAnchor({ left, top, width })
    setQuery('')
    setOpen(true)
  }

  function choose(next: Country) {
    setCountry(next)
    setOpen(false)
    setQuery('')
    onChange(national ? `${next.dial}${national}` : '')
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const typed = e.target.value
    // Pasting a full international number works without choosing the country first.
    if (/^\s*(?:\+|00)/.test(typed)) {
      const parsed = parsePhone(typed, country)
      setCountry(parsed.country)
      setNational(parsed.national)
      onChange(parsed.national ? `${parsed.country.dial}${parsed.national}` : '')
      return
    }
    const digits = normalizeNational(typed, country)
    setNational(digits)
    onChange(digits ? `${country.dial}${digits}` : '')
  }

  return (
    <>
      <div
        className={cn(
          'flex h-10 w-full overflow-hidden rounded-lg border border-line bg-surface transition focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/15',
          invalid && 'border-rose-400 focus-within:border-rose-500 focus-within:ring-rose-500/15',
          className,
        )}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-label={translate('Country code')}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={togglePicker}
          className="flex h-full shrink-0 items-center gap-1.5 border-e border-line bg-elevated/60 px-2.5 text-[12px] font-medium text-ink transition hover:bg-elevated"
        >
          <span className="inline-flex h-5 min-w-[28px] items-center justify-center rounded-[5px] border border-line bg-surface px-1 text-[9px] font-semibold tracking-[0.08em] text-muted">
            {country.iso}
          </span>
          <span dir="ltr" className="tabular-nums">{country.dial}</span>
          <ChevronDown size={11} className="text-faint" />
        </button>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          value={formatNational(country, national)}
          onChange={handleInput}
          placeholder={placeholder ?? country.example ?? translate('Phone number')}
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-[13px] text-ink outline-none placeholder:text-faint"
        />
      </div>

      {open && createPortal(
        <div className="fixed inset-0 z-[70]" onMouseDown={() => setOpen(false)}>
          <div
            ref={panelRef}
            role="dialog"
            aria-label={translate('Country code')}
            style={{ left: anchor.left, top: anchor.top, width: anchor.width }}
            className="fixed overflow-hidden rounded-xl border border-line bg-surface shadow-lift animate-fade-in"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line p-2">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matches[0]) {
                      e.preventDefault()
                      choose(matches[0])
                    }
                  }}
                  placeholder={translate('Search countries')}
                  className="input h-9 ps-8"
                />
              </div>
            </div>
            <div role="listbox" className="max-h-[240px] overflow-y-auto overscroll-contain p-1">
              {matches.map((c) => (
                <button
                  key={c.iso}
                  type="button"
                  role="option"
                  aria-selected={c.iso === country.iso}
                  onClick={() => choose(c)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start transition hover:bg-elevated',
                    c.iso === country.iso && 'bg-elevated/70',
                  )}
                >
                  <span className="inline-flex h-5 min-w-[30px] items-center justify-center rounded-[5px] border border-line bg-surface px-1 text-[9px] font-semibold tracking-[0.08em] text-muted">
                    {c.iso}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-ink">{countryName(c)}</span>
                    <span className="block text-[9.5px] text-faint">
                      {c.name !== countryName(c) ? `${c.name} · ` : ''}
                      <span dir="ltr" className="tabular-nums">{c.dial}</span>
                    </span>
                  </span>
                  {c.iso === country.iso && <Check size={13} className="shrink-0 text-accent-600" />}
                </button>
              ))}
              {matches.length === 0 && (
                <div className="px-3 py-6 text-center text-[11px] text-faint">{translate('No countries match')}</div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
