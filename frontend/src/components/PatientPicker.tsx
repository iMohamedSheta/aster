import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, UserRound, X } from 'lucide-react'
import { api } from '../lib/api'
import { useDebounced, useClickOutside } from '../lib/hooks'
import { age, cn, patientName, sexLabel } from '../lib/format'
import { translate } from '../lib/i18n'
import { displayPhone } from '../lib/phone'
import type { Patient } from '../lib/types'
import { Avatar, Spinner } from './ui'

export function PatientPicker({
  value, initial, onChange, placeholder = 'Search by name, MRN or phone…', disabled, autoFocus,
}: {
  value?: string
  initial?: Patient | null
  onChange: (id: string, patient: Patient | null) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Patient | null>(initial ?? null)
  const debounced = useDebounced(query, 180)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useClickOutside<HTMLDivElement>(() => setOpen(false))

  useEffect(() => {
    if (initial) {
      setSelected(initial)
    } else if (!value) {
      // The parent cleared the choice (for example when a dialog reopened).
      setSelected(null)
    }
  }, [initial?.id, value])

  useEffect(() => {
    if (value && selected && value !== selected.id) {
      setSelected(null)
    }
  }, [value])

  // Only search once the user has typed: an empty field never lists the register.
  const term = debounced.trim()
  const { data = [], isFetching } = useQuery({
    queryKey: ['patient-picker', term],
    queryFn: () => api.patients(term, 'all', 5) as Promise<Patient[]>,
    enabled: open && !disabled && term.length > 0,
  })

  // Live search keeps the list short: only the five best matches are shown.
  const results = useMemo(
    () => data.filter((p) => p.status !== 'inactive').slice(0, 5),
    [data],
  )

  function choose(p: Patient) {
    setSelected(p)
    onChange(p.id, p)
    setOpen(false)
    setQuery('')
  }

  function clear() {
    setSelected(null)
    onChange('', null)
    setQuery('')
  }

  if (selected && !open) {
    return (
      <div className={cn('flex items-center gap-2.5 rounded-xl border border-line bg-elevated/60 p-2.5', disabled && 'opacity-70')}>
        <Avatar name={patientName(selected)} color={selected.color} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink">{patientName(selected)}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted">
            {selected.mrn} · {age(selected.date_of_birth)} · {sexLabel(selected.sex)}
            {selected.phone ? ` · ${displayPhone(selected.phone)}` : ''}
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={clear}
            className="rounded-md p-1.5 text-faint transition hover:bg-surface hover:text-ink"
            aria-label={translate('Choose another patient')}
          >
            <X size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          disabled={disabled}
          value={query}
          placeholder={translate(placeholder)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          className="input ps-9"
        />
        {isFetching && <Spinner className="absolute end-3 top-1/2 -translate-y-1/2" />}
      </div>
      {open && term.length > 0 && (
        <div className="mt-1.5 max-h-[240px] w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-sm animate-fade-in">
          {results.length === 0 && !isFetching ? (
            <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-muted">
              <UserRound size={15} className="text-faint" />
              No patient matches that search.
            </div>
          ) : results.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => choose(p)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-start transition hover:bg-elevated"
            >
              <Avatar name={patientName(p)} color={p.color} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-ink">{patientName(p)}</span>
                <span className="block truncate text-[10.5px] text-faint">
                  {p.mrn} · {age(p.date_of_birth)} · {sexLabel(p.sex)}{p.phone ? ` · ${displayPhone(p.phone)}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
