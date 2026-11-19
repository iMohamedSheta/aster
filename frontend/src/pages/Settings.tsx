import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, Ban, Check, CheckCircle2, Cloud, Copy, Database, FileJson, FolderOpen,
  HardDrive, HeartPulse, Info, KeyRound, Laptop, Lock, Mail, Monitor, Moon, Network, Palette, Pencil, Phone,
  Plus, RefreshCw, Save, Search, Server, ShieldCheck, Sun, Trash2, TriangleAlert,
  Unplug, UserPlus, Users, Wifi,
} from 'lucide-react'
import { api } from '../lib/api'
import { roleLabel, useApp, useIsOwner } from '../lib/AppContext'
import { useLocale } from '../lib/LocaleContext'
import { translate } from '../lib/i18n'
import { ACCENTS, accentSwatch, DEFAULT_APPEARANCE, ELEVATIONS, RADII, SIDEBARS, type AccentId } from '../lib/appearance'
import {
  bytes, cn, fmtDate, fmtDateTime, fromNow, titleCase,
} from '../lib/format'
import type { DataInfo, DeviceRow, Staff, SyncActivityRow } from '../lib/types'
import {
  Avatar, Badge, Button, Checkbox, ConfirmDialog, EmptyState, Field, Input, Sheet, PageHeader,
  SectionCard, Select, Spinner, Tabs, Textarea, Toggle,
} from '../components/ui'
import { StaffDialog } from '../components/StaffDialog'
import { useToast } from '../components/Toast'

type SettingsTab = 'clinic' | 'appearance' | 'team' | 'connectivity' | 'data' | 'audit' | 'about'

const tabs: { value: SettingsTab; label: string }[] = [
  { value: 'clinic', label: 'Clinic profile' },
  { value: 'appearance', label: 'Appearance' },
  { value: 'team', label: 'Team' },
  { value: 'connectivity', label: 'Connectivity' },
  { value: 'data', label: 'Data & backups' },
  { value: 'audit', label: 'Audit trail' },
  { value: 'about', label: 'About' },
]

const currencies = [
  { code: 'EGP', symbol: 'E£' }, { code: 'USD', symbol: '$' }, { code: 'EUR', symbol: '€' }, { code: 'GBP', symbol: '£' },
  { code: 'CAD', symbol: 'C$' }, { code: 'AUD', symbol: 'A$' },
  { code: 'AED', symbol: 'د.إ' }, { code: 'SAR', symbol: 'ر.س' }, { code: 'INR', symbol: '₹' },
  { code: 'BRL', symbol: 'R$' }, { code: 'ZAR', symbol: 'R' },
]

const timezones = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Karachi',
  'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
]

const weekDays = [
  { value: '1', label: 'Mon' }, { value: '2', label: 'Tue' }, { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' }, { value: '5', label: 'Fri' }, { value: '6', label: 'Sat' },
  { value: '7', label: 'Sun' },
]

function modeLabel(mode?: string) {
  switch (mode) {
    case 'lan_host': return 'Clinic network · this computer hosts'
    case 'lan_client': return 'Clinic network · this device is connected'
    case 'cloud': return 'Aster Cloud · synced workspace'
    default: return 'Local workspace · this computer only'
  }
}

function auditTone(action = '') {
  if (/(deleted|void|revoked|failed)/.test(action)) return 'error'
  if (/(conflict|offline|warning)/.test(action)) return 'warning'
  if (/(created|issued|signed|paid)/.test(action)) return 'success'
  if (/(updated|status|backup|sync|host)/.test(action)) return 'info'
  return 'neutral'
}

/* ------------------------------------------------------------------ */
/* Settings shell                                                      */
/* ------------------------------------------------------------------ */

export function Settings() {
  const { tab } = useParams<{ tab: SettingsTab }>()
  const navigate = useNavigate()
  const { data } = useApp()

  const value: SettingsTab = tabs.some((t) => t.value === tab) ? (tab as SettingsTab) : 'clinic'

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={data.clinic?.name || 'Your clinic'}
        title="Settings"
        description="Shape how Aster works for your clinic. Changes to clinical and financial records are written to the audit trail."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs<SettingsTab>
          value={value}
          onChange={(next) => navigate(`/settings/${next}`)}
          tabs={tabs.map((t) => ({ value: t.value, label: t.label }))}
        />
        <span className="ms-auto hidden text-[10.5px] text-faint sm:block">{modeLabel(data.mode)}</span>
      </div>

      {value === 'clinic' && <ClinicTab />}
      {value === 'appearance' && <AppearanceTab />}
      {value === 'team' && <TeamTab />}
      {value === 'connectivity' && <ConnectivityTab />}
      {value === 'data' && <DataTab />}
      {value === 'audit' && <AuditTab />}
      {value === 'about' && <AboutTab />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Appearance                                                          */
/* ------------------------------------------------------------------ */

const themeModes = [
  { value: 'light', label: 'Light', hint: 'Warm paper', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Low light', icon: Moon },
  { value: 'system', label: 'System', hint: 'Follows Windows', icon: Monitor },
] as const

function ThemeSample({ mode, accent }: { mode: 'light' | 'dark' | 'system'; accent: AccentId }) {
  const dark = mode === 'dark'
  return (
    <div className="relative h-[62px] w-full overflow-hidden rounded-[5px] border border-line">
      <div
        className="absolute inset-0"
        style={{
          background: mode === 'system'
            ? 'linear-gradient(135deg, #f4efe6 0 50%, #171b21 50% 100%)'
            : dark ? '#171b21' : '#f4efe6',
        }}
      />
      <div
        className={cn(
          'absolute inset-y-0 start-0 w-[24%] border-e',
          dark ? 'border-white/10 bg-[#20252c]' : 'border-[#e2dbcf] bg-[#eae3d7]/90',
        )}
      />
      <div
        className="absolute start-[32%] top-[20%] h-[4px] w-[34%] rounded-full"
        style={{ background: dark ? 'rgba(255,255,255,.7)' : 'rgba(23,25,30,.62)' }}
      />
      <div
        className="absolute start-[32%] top-[35%] h-[3px] w-[22%] rounded-full"
        style={{ background: dark ? 'rgba(255,255,255,.18)' : 'rgba(23,25,30,.16)' }}
      />
      <div
        className="absolute start-[32%] top-[48%] h-[16px] w-[52%] rounded-[3px] border"
        style={{
          background: dark ? '#232830' : '#fffdf9',
          borderColor: dark ? 'rgba(255,255,255,.08)' : '#e2dbcf',
        }}
      />
      <div
        className="absolute end-[8%] top-[52%] h-[7px] w-[7px] rounded-full"
        style={{ background: accentSwatch(accent) }}
      />
    </div>
  )
}

function AppearanceTab() {
  const { theme, setTheme, accent, setAccent, grid, setGrid, radius, setRadius, elevation, setElevation, sidebar, setSidebar } = useApp()
  const { locale, setLocale } = useLocale()

  function reset() {
    setTheme('system')
    setAccent(DEFAULT_APPEARANCE.accent)
    setGrid(DEFAULT_APPEARANCE.grid)
    setRadius(DEFAULT_APPEARANCE.radius)
    setElevation(DEFAULT_APPEARANCE.elevation)
    setSidebar(DEFAULT_APPEARANCE.sidebar)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="space-y-4">
        <SectionCard title="Theme" subtitle="How the workspace is lit on this device. System follows Windows.">
          <div className="grid gap-2.5 sm:grid-cols-3">
            {themeModes.map((mode) => {
              const Icon = mode.icon
              const active = theme === mode.value
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setTheme(mode.value)}
                  className={cn(
                    'rounded-lg border p-2.5 text-start transition',
                    active
                      ? 'border-accent-500 bg-accent-50/50 ring-2 ring-accent-500/15 dark:bg-accent-900/15'
                      : 'border-line bg-surface hover:border-line-strong hover:bg-elevated/50',
                  )}
                >
                  <ThemeSample mode={mode.value} accent={accent} />
                  <div className="mt-2.5 flex items-center gap-2">
                    <Icon size={13} className={active ? 'text-accent-700 dark:text-accent-300' : 'text-faint'} />
                    <span className="flex-1 text-[12px] font-semibold text-ink">{translate(mode.label)}</span>
                    {active && <Check size={13} className="text-accent-600 dark:text-accent-400" />}
                  </div>
                  <div className="mt-0.5 ps-[21px] text-[10px] text-faint">{translate(mode.hint)}</div>
                </button>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard title="Accent" subtitle="Used for rules, markers, focus and principal actions.">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ACCENTS.map((item) => {
              const active = accent === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAccent(item.id)}
                  className={cn(
                    'rounded-md border p-2 text-start transition',
                    active
                      ? 'border-accent-500 bg-accent-50/50 ring-1 ring-accent-500/20 dark:bg-accent-900/15'
                      : 'border-line hover:border-line-strong hover:bg-elevated/60',
                  )}
                >
                  <span
                    className="block h-7 w-full rounded-[4px] ring-1 ring-inset ring-black/10"
                    style={{ background: item.swatch }}
                  />
                  <span className="mt-1.5 flex items-center justify-between gap-1">
                    <span className="truncate text-[10.5px] font-medium text-ink">{translate(item.label)}</span>
                    {active && <Check size={11} className="shrink-0 text-accent-700 dark:text-accent-300" />}
                  </span>
                </button>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard title="Shape & depth" subtitle="Corners, lift and the navigation rail are part of the look.">
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="quiet-label mb-1.5">Corner radius</div>
              <div className="grid grid-cols-3 gap-1.5">
                {RADII.map((item) => {
                  const active = radius === item.id
                  const preview = { sharp: 2, balanced: 5, round: 9 }[item.id]
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setRadius(item.id)}
                      className={cn(
                        'rounded-md border px-1.5 py-2 transition',
                        active
                          ? 'border-accent-500 bg-accent-50/50 ring-1 ring-accent-500/20 dark:bg-accent-900/15'
                          : 'border-line hover:border-line-strong hover:bg-elevated/60',
                      )}
                    >
                      <span className="flex h-7 items-center justify-center">
                        <span
                          className={cn('block h-5 w-9 border-2', active ? 'border-accent-600 dark:border-accent-300' : 'border-line-strong')}
                          style={{ borderRadius: preview }}
                        />
                      </span>
                      <span className="mt-1 block truncate text-center text-[10.5px] font-medium text-ink">{translate(item.label)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <div className="quiet-label mb-1.5">Elevation</div>
              <div className="grid grid-cols-2 gap-1.5">
                {ELEVATIONS.map((item) => {
                  const active = elevation === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setElevation(item.id)}
                      className={cn(
                        'rounded-md border px-1.5 py-2 transition',
                        active
                          ? 'border-accent-500 bg-accent-50/50 ring-1 ring-accent-500/20 dark:bg-accent-900/15'
                          : 'border-line hover:border-line-strong hover:bg-elevated/60',
                      )}
                    >
                      <span className="flex h-7 items-center justify-center">
                        <span
                          className={cn(
                            'block h-5 w-9 rounded-[4px] border border-line bg-surface',
                            item.id === 'soft' && 'shadow-lift',
                          )}
                        />
                      </span>
                      <span className="mt-1 block truncate text-center text-[10.5px] font-medium text-ink">{translate(item.label)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div>
              <div className="text-[13px] font-medium text-ink">Sidebar</div>
              <div className="mt-0.5 text-[11.5px] text-muted">Expanded shows names and groups. Compact keeps an icon rail.</div>
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-line-strong">
              {SIDEBARS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSidebar(item.id)}
                  title={translate(item.hint)}
                  className={cn(
                    'h-8 px-3 text-[11px] font-semibold transition',
                    sidebar === item.id
                      ? 'bg-brand-900 text-white dark:bg-brand-100 dark:text-brand-950'
                      : 'bg-surface text-muted hover:bg-elevated hover:text-ink',
                  )}
                >
                  {translate(item.label)}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Canvas & language" subtitle="Small choices that change how records feel to read.">
          <Toggle
            checked={grid}
            onChange={setGrid}
            label="Drafting grid"
            description="A faint dot grid behind lists, forms and the dashboard."
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div>
              <div className="text-[13px] font-medium text-ink">Interface language</div>
              <div className="mt-0.5 text-[11.5px] text-muted">Arabic is right-to-left on this device.</div>
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-line-strong">
              {(['en', 'ar'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code)}
                  className={cn(
                    'h-8 px-3 text-[11px] font-semibold transition',
                    locale === code
                      ? 'bg-brand-900 text-white dark:bg-brand-100 dark:text-brand-950'
                      : 'bg-surface text-muted hover:bg-elevated hover:text-ink',
                  )}
                >
                  {code === 'en' ? 'English' : 'العربية'}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[10.5px] leading-5 text-faint">
            Appearance is remembered on this device only. It never changes another computer in the clinic.
          </p>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RefreshCw size={12} /> Reset
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <SectionCard title="Live preview" subtitle="The accent and shape applied to real components">
          <div className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Today</span>
              <Badge tone="info">Booked</Badge>
            </div>
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <Avatar name="Amelia Hart" size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] font-semibold text-ink">Amelia Hart</div>
                <div className="mt-0.5 text-[9.5px] text-faint">09:00 · Room 1</div>
              </div>
              <Button size="sm" variant="copper">Open</Button>
            </div>
            <div className="flex items-center justify-between border-t border-line px-3.5 py-2.5">
              <span className="text-[10px] text-muted">Invoice #1042</span>
              <span className="text-[12px] font-semibold tabular-nums text-ink">$120.00</span>
            </div>
            <div className="flex items-center gap-2 border-t border-line px-3.5 py-2.5">
              <Button size="sm" variant="primary">Save</Button>
              <Button size="sm">Cancel</Button>
            </div>
          </div>
        </SectionCard>

        <div className="rounded-lg border border-line bg-elevated/50 p-3.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-ink">
            <Palette size={13} className="text-accent-600 dark:text-accent-400" />
            Current appearance
          </div>
          <div className="mt-2 space-y-1 text-[10.5px] text-muted">
            <div className="flex items-center justify-between"><span>Theme</span><span className="font-medium text-ink">{translate(themeModes.find((m) => m.value === theme)?.label ?? 'System')}</span></div>
            <div className="flex items-center justify-between"><span>Accent</span><span className="font-medium text-ink">{translate(ACCENTS.find((a) => a.id === accent)?.label ?? 'Copper')}</span></div>
            <div className="flex items-center justify-between"><span>Corners</span><span className="font-medium text-ink">{translate(RADII.find((r) => r.id === radius)?.label ?? 'Balanced')}</span></div>
            <div className="flex items-center justify-between"><span>Sidebar</span><span className="font-medium text-ink">{translate(SIDEBARS.find((s) => s.id === sidebar)?.label ?? 'Expanded')}</span></div>
            <div className="flex items-center justify-between"><span>Grid</span><span className="font-medium text-ink">{translate(grid ? 'On' : 'Off')}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ClinicTab() {
  const { clinic, refresh, data, theme, accent, radius, sidebar } = useApp()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clinic) return
    setForm({ ...clinic })
  }, [clinic?.id, clinic?.updated_at])

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }))
  const workDays = String(form.work_days || '1,2,3,4,5').split(',').filter(Boolean)

  function toggleDay(day: string) {
    const next = workDays.includes(day) ? workDays.filter((d) => d !== day) : [...workDays, day].sort()
    set('work_days', next.join(','))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!String(form.name || '').trim()) {
      setError('The clinic name cannot be empty.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.saveClinic({
        name: form.name,
        legal_name: form.legal_name,
        phone: form.phone,
        email: form.email,
        website: form.website,
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        city: form.city,
        state: form.state,
        country: form.country,
        postal_code: form.postal_code,
        timezone: form.timezone,
        currency: form.currency,
        currency_symbol: form.currency_symbol,
        tax_id: form.tax_id,
        license_number: form.license_number,
        accent_color: form.accent_color,
        opening_time: form.opening_time,
        closing_time: form.closing_time,
        slot_minutes: Number(form.slot_minutes) || 30,
        work_days: form.work_days,
        prescription_footer: form.prescription_footer,
        invoice_footer: form.invoice_footer,
        tax_rate_bp: Math.round(Number(form.tax_rate_bp) || 0),
      })
      toast.success('Clinic profile saved', 'New details appear on future prescriptions and invoices.')
      await refresh()
      await qc.invalidateQueries()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  if (!clinic) return <div className="card p-8 text-center text-[12px] text-muted">No clinic profile is available yet.</div>

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <SectionCard title="Identity" subtitle="How the clinic appears across the workspace and on printed documents">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Clinic name" className="sm:col-span-2">
                <Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Northside Family Clinic" />
              </Field>
              <Field label="Legal name">
                <Input value={form.legal_name || ''} onChange={(e) => set('legal_name', e.target.value)} placeholder="Northside Family Medicine LLC" />
              </Field>
              <Field label="License / registration">
                <Input value={form.license_number || ''} onChange={(e) => set('license_number', e.target.value)} placeholder="CL-2024-0192" />
              </Field>
              <Field label="Phone"><Input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="+1 555 010 2200" /></Field>
              <Field label="Email"><Input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="hello@northside.clinic" /></Field>
              <Field label="Website"><Input value={form.website || ''} onChange={(e) => set('website', e.target.value)} placeholder="https://northside.clinic" /></Field>
              <Field label="Tax ID"><Input value={form.tax_id || ''} onChange={(e) => set('tax_id', e.target.value)} /></Field>
            </div>
          </SectionCard>

          <SectionCard title="Address" subtitle="Printed on invoices and prescriptions">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Address line 1" className="sm:col-span-2"><Input value={form.address_line1 || ''} onChange={(e) => set('address_line1', e.target.value)} placeholder="48 Willow Street" /></Field>
              <Field label="Address line 2" className="sm:col-span-2"><Input value={form.address_line2 || ''} onChange={(e) => set('address_line2', e.target.value)} placeholder="Suite 4" /></Field>
              <Field label="City"><Input value={form.city || ''} onChange={(e) => set('city', e.target.value)} /></Field>
              <Field label="State / region"><Input value={form.state || ''} onChange={(e) => set('state', e.target.value)} /></Field>
              <Field label="Postal code"><Input value={form.postal_code || ''} onChange={(e) => set('postal_code', e.target.value)} /></Field>
              <Field label="Country"><Input value={form.country || ''} onChange={(e) => set('country', e.target.value)} /></Field>
            </div>
          </SectionCard>

          <SectionCard title="Clinical documents" subtitle="Footers are printed below prescriptions and invoices">
            <div className="space-y-3">
              <Field label="Prescription footer" hint="A short line for signatures, disclaimers or contact details.">
                <Textarea value={form.prescription_footer || ''} onChange={(e) => set('prescription_footer', e.target.value)} className="min-h-[68px]" placeholder="This prescription is valid for 30 days. Please bring it to any pharmacy." />
              </Field>
              <Field label="Invoice footer" hint="Payment terms or a thank-you note.">
                <Textarea value={form.invoice_footer || ''} onChange={(e) => set('invoice_footer', e.target.value)} className="min-h-[68px]" placeholder="Thank you for choosing Northside. Please quote the invoice number with your payment." />
              </Field>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Localisation" subtitle="Currency and time zone used for every record">
            <div className="grid gap-3">
              <Field label="Currency">
                <Select
                  value={form.currency || 'EGP'}
                  onChange={(e) => {
                    const found = currencies.find((c) => c.code === e.target.value)
                    setForm((f: any) => ({ ...f, currency: e.target.value, currency_symbol: found?.symbol ?? f.currency_symbol }))
                  }}
                >
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.symbol}</option>)}
                </Select>
              </Field>
              <Field label="Currency symbol" hint="Used on printed prices and summary cards.">
                <Input value={form.currency_symbol || 'E£'} onChange={(e) => set('currency_symbol', e.target.value)} />
              </Field>
              <Field label="Time zone">
                <Select value={form.timezone || 'Africa/Cairo'} onChange={(e) => set('timezone', e.target.value)}>
                  {[form.timezone || 'Africa/Cairo', ...timezones.filter((t) => t !== (form.timezone || 'Africa/Cairo'))].map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Default tax rate %" hint="Pre-filled when creating an invoice. Can be changed per invoice.">
                <Input
                  type="number" min={0} step="0.1"
                  value={Number(form.tax_rate_bp || 0) / 100}
                  onChange={(e) => set('tax_rate_bp', Math.round(Number(e.target.value || 0) * 100))}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Opening hours" subtitle="Used by the appointment calendar">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Opens"><Input type="time" value={form.opening_time || '08:00'} onChange={(e) => set('opening_time', e.target.value)} /></Field>
              <Field label="Closes"><Input type="time" value={form.closing_time || '18:00'} onChange={(e) => set('closing_time', e.target.value)} /></Field>
              <Field label="Slot length" className="sm:col-span-2">
                <Select value={String(form.slot_minutes || 30)} onChange={(e) => set('slot_minutes', Number(e.target.value))}>
                  {[10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} minutes</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-3">
              <span className="field-label">Working days</span>
              <div className="flex flex-wrap gap-1.5">
                {weekDays.map((day) => {
                  const active = workDays.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={cn(
                        'h-8 rounded-lg border px-2.5 text-[11.5px] font-medium transition',
                        active
                          ? 'border-brand-600 bg-brand-700 text-white'
                          : 'border-line bg-surface text-muted hover:border-brand-300 hover:text-ink',
                      )}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Device appearance" subtitle="Theme and accent for this computer">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-elevated text-accent-700 dark:text-accent-300">
                  <Palette size={14} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-ink">
                    {translate(themeModes.find((m) => m.value === theme)?.label ?? 'System')} {translate('theme')}
                  </div>
                  <div className="truncate text-[10.5px] text-faint">
                    {translate(ACCENTS.find((a) => a.id === accent)?.label ?? 'Copper')} · {translate(RADII.find((r) => r.id === radius)?.label ?? 'Balanced')} · {translate(SIDEBARS.find((s) => s.id === sidebar)?.label ?? 'Expanded')}
                  </div>
                </div>
              </div>
              <Button type="button" size="sm" onClick={() => navigate('/settings/appearance')}>Adjust</Button>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-elevated px-3 py-2 text-[10.5px] text-muted">
              <span className="inline-flex items-center gap-1.5"><HeartPulse size={12} /> Live workspace</span>
              <span className="tabular-nums">v{data.version}</span>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="sticky bottom-2 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-line bg-surface/95 px-3 py-2.5 shadow-lift backdrop-blur">
        <span className="me-auto text-[10.5px] text-faint">Last changed {fromNow(clinic.updated_at)}</span>
        <Button type="button" onClick={() => setForm({ ...clinic })}>Discard changes</Button>
        <Button type="submit" variant="primary" loading={saving}><Save size={14} /> Save clinic profile</Button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Team                                                                */
/* ------------------------------------------------------------------ */

function AccessSection() {
  const { data, currentStaff, refresh } = useApp()
  const isOwner = useIsOwner()
  const toast = useToast()
  const [mode, setMode] = useState(data.signInMode === 'username' ? 'username' : 'picker')
  const [savingMode, setSavingMode] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)

  useEffect(() => {
    setMode(data.signInMode === 'username' ? 'username' : 'picker')
  }, [data.signInMode])

  async function chooseMode(next: string) {
    if (!isOwner || next === mode || savingMode) return
    setSavingMode(true)
    try {
      await api.setSignInMode(next)
      setMode(next)
      await refresh()
      toast.success('Sign-in method updated', next === 'username' ? 'People now type a username and password.' : 'People now choose their account, then enter a password.')
    } catch (e: any) {
      toast.error('Could not change sign-in method', String(e?.message ?? e))
    } finally {
      setSavingMode(false)
    }
  }

  const methods = [
    {
      value: 'picker',
      title: 'Account picker',
      body: 'Choose a name from the team, then enter its password. The clinic manager is offered first.',
      icon: Users,
    },
    {
      value: 'username',
      title: 'Username and password',
      body: 'Type a username and password. The team list is never shown on the sign-in screen.',
      icon: KeyRound,
    },
  ]

  const currentUsername = currentStaff?.username || ''
  const hasPassword = Number(currentStaff?.has_password ?? 0) === 1

  return (
    <SectionCard
      title="Sign-in & access"
      subtitle="How this clinic opens on every connected device. Only the clinic manager can change it."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {methods.map((method) => {
          const Icon = method.icon
          const active = mode === method.value
          return (
            <button
              key={method.value}
              type="button"
              disabled={!isOwner || savingMode}
              onClick={() => chooseMode(method.value)}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3.5 text-start transition',
                active
                  ? 'border-brand-500 bg-brand-50/70 shadow-sm dark:border-brand-600 dark:bg-brand-900/25'
                  : 'border-line bg-surface hover:border-brand-200 dark:hover:border-brand-800',
                !isOwner && 'cursor-default opacity-80 hover:border-line',
              )}
            >
              <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', active ? 'bg-brand-700 text-white' : 'bg-elevated text-muted')}>
                <Icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-ink">{method.title}</span>
                  {active && <span className="rounded-full bg-brand-100 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-[0.06em] text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">In use</span>}
                </span>
                <span className="mt-0.5 block text-[10.5px] leading-5 text-muted">{method.body}</span>
              </span>
              <span className={cn('mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line')}>
                {active && <Check size={9} strokeWidth={3.4} />}
              </span>
            </button>
          )
        })}
      </div>

      {!isOwner && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[10.5px] text-faint">
          <Lock size={11} /> Access settings are managed by the clinic manager.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-elevated/40 p-3.5">
        <Avatar name={currentStaff?.full_name || ''} color={currentStaff?.color} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-ink">{currentStaff?.full_name || 'Your account'}</span>
            <Badge tone={hasPassword ? 'success' : 'warning'}>{hasPassword ? 'Password set' : 'No password'}</Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-faint">
            <span className="font-mono text-muted">{currentUsername ? `@${currentUsername}` : 'No username'}</span>
            <span>{roleLabel(currentStaff?.role)}</span>
          </div>
        </div>
        <Button size="sm" onClick={() => setPasswordOpen(true)}><KeyRound size={13} /> Change password</Button>
      </div>

      <PasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </SectionCard>
  )
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setCurrent('')
    setNext('')
    setConfirm('')
    setError('')
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!current) {
      setError('Enter your current password.')
      return
    }
    if (next.length < 8) {
      setError('Use at least 8 characters for the new password.')
      return
    }
    if (next !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.changeOwnPassword(current, next)
      toast.success('Password changed', 'Use the new password next time you sign in.')
      onClose()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Change your password"
      description="Your username stays the same. You remain signed in on this device."
      size="sm"
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="password-form" loading={saving}>Update password</Button>
        </>
      )}
    >
      <form id="password-form" onSubmit={submit} className="space-y-3.5">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">{error}</div>}
        <Field label="Current password">
          <Input type="password" autoFocus autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}

function TeamTab() {
  const { staff, currentStaff, clinic } = useApp()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)

  const sorted = useMemo(() => {
    const rank: Record<string, number> = { owner: 0, doctor: 1, nurse: 2, receptionist: 3, accountant: 4 }
    return [...staff].sort((a, b) => {
      if (Number(a.active ?? 1) !== Number(b.active ?? 1)) return Number(b.active ?? 1) - Number(a.active ?? 1)
      return (rank[a.role] ?? 9) - (rank[b.role] ?? 9) || a.full_name.localeCompare(b.full_name)
    })
  }, [staff])

  const active = staff.filter((s) => Number(s.active ?? 1) !== 0)

  return (
    <div className="space-y-4">
      <AccessSection />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'People with access', value: active.length, hint: `${staff.length} on the register in total`, icon: Users },
          { label: 'Clinicians', value: staff.filter((s) => ['owner', 'doctor', 'nurse'].includes(s.role) && Number(s.active ?? 1) !== 0).length, hint: 'Can open and sign visits', icon: HeartPulse },
          { label: 'Workspace', value: clinic?.name ? 'Active' : '—', hint: currentStaff ? `You are working as ${currentStaff.full_name}` : 'Choose a user in the sidebar', icon: ShieldCheck },
        ].map((card) => (
          <div key={card.label} className="card flex items-start gap-3 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><card.icon size={15} /></span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">{card.label}</div>
              <div className="mt-0.5 text-[21px] font-semibold leading-tight text-ink">{card.value}</div>
              <div className="mt-0.5 text-[10.5px] text-muted">{card.hint}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[13.5px] font-semibold text-ink">Clinic team</h2>
            <p className="mt-0.5 text-[11px] text-muted">Roles determine who can prescribe, take payments and change settings.</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setOpen(true) }}><UserPlus size={13} /> Add member</Button>
        </div>

        {sorted.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Users size={18} />} title="No team members yet" description="Add a clinician so visits can be signed and appointments assigned." action={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={14} /> Add a team member</Button>} />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {sorted.map((member) => (
              <div key={member.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', Number(member.active ?? 1) === 0 && 'opacity-60')}>
                <Avatar name={member.full_name} color={member.color} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[12.5px] font-semibold text-ink">{member.full_name}</span>
                    {member.id === currentStaff?.id && <Badge tone="brand">You</Badge>}
                    {Number(member.active ?? 1) === 0 && <Badge tone="neutral">Inactive</Badge>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-faint">
                    <span className="font-medium text-muted">{roleLabel(member.role)}</span>
                    {member.username && <span className="font-mono">@{member.username}</span>}
                    {member.username && Number(member.has_password ?? 0) !== 1 && (
                      <span className="font-medium text-amber-600 dark:text-amber-300">No password</span>
                    )}
                    {member.specialization && <span>{member.specialization}</span>}
                    {member.license_number && <span className="font-mono">{member.license_number}</span>}
                  </div>
                </div>
                <div className="hidden min-w-[170px] text-end text-[10.5px] text-muted sm:block">
                  {member.phone && <div className="inline-flex items-center gap-1"><Phone size={11} /> {member.phone}</div>}
                  {member.email && <div className="mt-0.5 inline-flex items-center gap-1 truncate"><Mail size={11} /> {member.email}</div>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(member); setOpen(true) }}><Pencil size={13} /> Edit</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line bg-elevated/40 p-4 text-[11px] leading-5 text-muted">
        <span className="font-semibold text-ink">A note on roles.</span> Everyone with access to a device can see the records stored on it. Roles guide the interface and the audit trail, but they are not a substitute for device security. Use separate Windows accounts on shared computers.
      </div>

      <StaffDialog open={open} onClose={() => { setOpen(false); setEditing(null) }} member={editing} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Connectivity                                                        */
/* ------------------------------------------------------------------ */

function ConnectivityTab() {
  const { data, clinic, currentStaff, setBootstrap, refresh } = useApp()
  const qc = useQueryClient()
  const toast = useToast()
  const [port, setPort] = useState(String(data.host?.port || 47821))
  const [hostBusy, setHostBusy] = useState(false)
  const [stopOpen, setStopOpen] = useState(false)
  const [pairRole, setPairRole] = useState('receptionist')
  const [joinKind, setJoinKind] = useState<'network' | 'cloud'>('network')
  const [join, setJoin] = useState({
    url: data.serverUrl || '',
    code: '',
    name: currentStaff?.full_name || '',
    role: 'doctor',
    device: data.deviceName || 'This computer',
    keepLocal: false,
  })
  const [joining, setJoining] = useState(false)
  const [testing, setTesting] = useState(false)
  const [probe, setProbe] = useState<any>(null)
  const [cloud, setCloud] = useState({ url: '', clinic: clinic?.name || '', owner: currentStaff?.full_name || '', device: data.deviceName || 'This computer' })
  const [creating, setCreating] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<DeviceRow | null>(null)
  const [resolving, setResolving] = useState('')

  const host = data.host
  const hosting = Boolean(host?.running)
  const connected = data.mode === 'lan_client' || data.mode === 'cloud'

  const conflicts = useQuery({ queryKey: ['conflicts'], queryFn: () => api.conflicts() })
  const devices = useQuery({ queryKey: ['devices'], queryFn: () => api.devices() as Promise<DeviceRow[]>, enabled: hosting })
  const activity = useQuery({ queryKey: ['sync-activity'], queryFn: () => api.syncActivity(80) as Promise<SyncActivityRow[]> })

  useEffect(() => {
    if (host?.port) setPort(String(host.port))
  }, [host?.port])

  const update = (key: string, value: any) => setJoin((j) => ({ ...j, [key]: value }))

  async function startHosting() {
    setHostBusy(true)
    try {
      const next = await api.startHosting(Number(port) || 47821)
      await refresh()
      await qc.invalidateQueries()
      toast.success('Workspace hosting started', next.urls?.[0] ? `Devices can reach ${next.urls[0]}` : `Listening on port ${next.port}`)
    } catch (e: any) {
      toast.error('Could not start hosting', String(e?.message ?? e))
    } finally {
      setHostBusy(false)
    }
  }

  async function stopHosting() {
    setHostBusy(true)
    try {
      const next = await api.stopHosting()
      setBootstrap(next)
      await qc.invalidateQueries()
      setStopOpen(false)
      toast.success('Hosting stopped', 'This computer is a local workspace again.')
    } catch (e: any) {
      toast.error('Could not stop hosting', String(e?.message ?? e))
    } finally {
      setHostBusy(false)
    }
  }

  async function createCode() {
    try {
      await api.createPairingCode(pairRole)
      await refresh()
      toast.success('Pairing code ready', `Valid for 24 hours · ${roleLabel(pairRole)}`)
    } catch (e: any) {
      toast.error('Could not create a pairing code', String(e?.message ?? e))
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied`, value)
    } catch {
      toast.error('Could not copy', 'Select the value and copy it manually.')
    }
  }

  async function testServer() {
    if (!join.url.trim()) {
      toast.error('Enter a workspace address first')
      return
    }
    setTesting(true)
    setProbe(null)
    try {
      const info = await api.testServer(join.url.trim())
      setProbe(info)
      toast.success('Workspace answered', `${info.clinicName || info.name} · ${info.version || 'Aster'}`)
    } catch (e: any) {
      toast.error('Could not reach the workspace', String(e?.message ?? e))
    } finally {
      setTesting(false)
    }
  }

  async function joinWorkspace() {
    if (!join.url.trim() || !join.code.trim()) {
      toast.error('Address and code are required', 'Ask the owner for a pairing code or workspace code.')
      return
    }
    setJoining(true)
    try {
      const next = await api.joinWorkspace({
        url: join.url.trim(),
        code: join.code.trim().toUpperCase(),
        staffName: join.name.trim() || currentStaff?.full_name || 'Clinic user',
        deviceName: join.device.trim() || 'This computer',
        role: join.role,
        keepLocal: join.keepLocal,
        mode: joinKind === 'cloud' ? 'cloud' : 'lan_client',
      })
      setBootstrap(next)
      await qc.invalidateQueries()
      toast.success('Connected to the workspace', next.workspace || next.clinic?.name)
    } catch (e: any) {
      toast.error('Could not join the workspace', String(e?.message ?? e))
    } finally {
      setJoining(false)
    }
  }

  async function createCloud() {
    if (!cloud.url.trim()) {
      toast.error('Enter the Aster Cloud server address')
      return
    }
    setCreating(true)
    try {
      const next = await api.createCloudWorkspace({
        url: cloud.url.trim(),
        clinicName: cloud.clinic.trim() || clinic?.name || 'My clinic',
        ownerName: cloud.owner.trim() || currentStaff?.full_name || 'Clinic owner',
        deviceName: cloud.device.trim() || 'This computer',
      })
      setBootstrap(next)
      await qc.invalidateQueries()
      toast.success('Cloud workspace created', next.workspace || next.clinic?.name)
    } catch (e: any) {
      toast.error('Could not create the workspace', String(e?.message ?? e))
    } finally {
      setCreating(false)
    }
  }

  async function syncNow() {
    setSyncBusy(true)
    try {
      await api.syncNow()
      await refresh()
      await qc.invalidateQueries()
      toast.success('Sync complete', 'Local changes were sent and remote changes applied.')
    } catch (e: any) {
      toast.error('Sync failed', String(e?.message ?? e))
    } finally {
      setSyncBusy(false)
    }
  }

  async function disconnect() {
    try {
      const next = await api.disconnectSync()
      setBootstrap(next)
      await qc.invalidateQueries()
      setDisconnectOpen(false)
      toast.success('Disconnected', 'Records stay on this computer; cloud changes stop arriving.')
    } catch (e: any) {
      toast.error('Could not disconnect', String(e?.message ?? e))
    }
  }

  async function resolveConflict(id: string, action: 'keep_local' | 'keep_remote') {
    setResolving(id)
    try {
      const next = await api.resolveConflict(id, action)
      setBootstrap(next)
      await conflicts.refetch()
      await qc.invalidateQueries()
      toast.success('Conflict resolved', action === 'keep_local' ? 'This device’s value was kept.' : 'The server value was kept.')
    } catch (e: any) {
      toast.error('Could not resolve the conflict', String(e?.message ?? e))
    } finally {
      setResolving('')
    }
  }

  async function revokeDevice() {
    if (!revokeTarget) return
    try {
      await api.revokeDevice(revokeTarget.id)
      await devices.refetch()
      toast.success('Device revoked', `${revokeTarget.name} must pair again to reconnect.`)
      setRevokeTarget(null)
    } catch (e: any) {
      toast.error('Could not revoke the device', String(e?.message ?? e))
    }
  }

  async function clearActivity() {
    try {
      await api.clearSyncActivity()
      await activity.refetch()
      toast.success('Activity cleared')
    } catch (e: any) {
      toast.error('Could not clear activity', String(e?.message ?? e))
    }
  }

  const sync = data.sync
  const openConflicts = conflicts.data ?? []

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <span className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            connected ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200' : hosting ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200' : 'bg-elevated text-muted',
          )}>
            {connected ? <Cloud size={18} /> : hosting ? <Network size={18} /> : <HardDrive size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-ink">{modeLabel(data.mode)}</div>
            <div className="mt-0.5 text-[11px] text-muted">
              {hosting ? `Serving this clinic on port ${host.port}${host.urls?.[0] ? ` · ${host.urls[0]}` : ''}`
                : connected ? `${data.workspace || clinic?.name || 'Workspace'} · ${data.serverUrl || sync.serverUrl || 'server configured'}`
                  : 'Records live in a private database on this computer. Connect other computers whenever you are ready.'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {connected && (
              <>
                <Button size="sm" onClick={syncNow} loading={syncBusy}><RefreshCw size={13} /> Sync now</Button>
                <Button size="sm" variant="ghost" onClick={() => setDisconnectOpen(true)}><Unplug size={13} /> Disconnect</Button>
              </>
            )}
            {openConflicts.length > 0 && <Badge tone="warning" dot>{openConflicts.length} conflict{openConflicts.length === 1 ? '' : 's'}</Badge>}
          </div>
        </div>
        {connected && (
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
            {[
              ['Sync state', titleCase(sync.state || 'local')],
              ['Pending changes', String(sync.pending ?? 0)],
              ['Last sync', sync.lastSyncAt ? fromNow(sync.lastSyncAt) : 'Never'],
              ['Device', data.deviceName || 'This computer'],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface px-4 py-2.5">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</div>
                <div className="mt-0.5 truncate text-[11.5px] font-medium text-ink">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Host this clinic" subtitle="Turn this computer into the workspace server for the clinic network">
          {hosting ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11.5px] text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/25 dark:text-emerald-200">
                <CheckCircle2 size={14} /> Hosting is running. Other computers can join with a pairing code.
              </div>
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Reachable addresses</div>
                {(host.urls ?? []).length ? host.urls.map((url) => (
                  <div key={url} className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-2.5 py-1.5">
                    <Wifi size={12} className="shrink-0 text-brand-600" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink">{url}</span>
                    <button onClick={() => copy(url, 'Address')} className="rounded p-1 text-faint hover:text-ink" aria-label="Copy address"><Copy size={12} /></button>
                  </div>
                )) : <div className="text-[11px] text-faint">No network address detected yet. Check the Windows firewall.</div>}
              </div>

              <div className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11.5px] font-semibold text-ink">Pairing code</div>
                    <div className="text-[10px] text-faint">One code pairs one device. Share it only with clinic staff.</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Select value={pairRole} onChange={(e) => setPairRole(e.target.value)} className="h-8 w-[122px] text-[11px]">
                      <option value="doctor">Physician</option>
                      <option value="nurse">Nurse</option>
                      <option value="receptionist">Front desk</option>
                      <option value="accountant">Billing</option>
                    </Select>
                    <Button size="sm" onClick={createCode}><KeyRound size={12} /> New code</Button>
                  </div>
                </div>
                {host.pairingCode ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="rounded-lg bg-brand-950 px-3.5 py-2 font-mono text-[19px] font-semibold tracking-[0.16em] text-brand-50">{host.pairingCode}</span>
                    <div className="text-[10.5px] text-muted">
                      <div>{roleLabel(host.pairingRole)} access</div>
                      <div className="text-faint">Expires {host.expiresAt ? fmtDateTime(host.expiresAt) : 'in 24 hours'}</div>
                    </div>
                    <button onClick={() => copy(host.pairingCode, 'Pairing code')} className="ms-auto rounded-lg border border-line p-2 text-faint hover:text-ink" aria-label="Copy pairing code"><Copy size={13} /></button>
                  </div>
                ) : (
                  <div className="mt-3 text-[11px] text-faint">Create a code when a new computer is ready to join.</div>
                )}
              </div>

              {host.fingerprint && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">TLS fingerprint</div>
                  <div className="mt-1 flex items-center gap-2 rounded-lg bg-elevated px-2.5 py-1.5">
                    <Lock size={11} className="shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted">{host.fingerprint}</span>
                    <button onClick={() => copy(host.fingerprint, 'Fingerprint')} className="rounded p-1 text-faint hover:text-ink" aria-label="Copy fingerprint"><Copy size={12} /></button>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-4 text-faint">A joining device pins this certificate. If it ever changes, verify the new fingerprint with the clinic owner.</p>
                </div>
              )}

              <Button variant="ghost" size="sm" onClick={() => setStopOpen(true)} loading={hostBusy}><Unplug size={13} /> Stop hosting</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11.5px] leading-5 text-muted">
                Hosting makes this computer the source of truth for the clinic. Other computers keep a full local copy and continue working if the network drops. Starting a host ends any cloud connection on this computer.
              </p>
              <div className="grid gap-3 sm:grid-cols-[140px_1fr] sm:items-end">
                <Field label="Port"><Input type="number" min={1024} max={65535} value={port} onChange={(e) => setPort(e.target.value)} /></Field>
                <Button variant="primary" onClick={startHosting} loading={hostBusy} disabled={connected}>
                  <Server size={14} /> Start hosting
                </Button>
              </div>
              {connected && <div className="text-[10.5px] text-amber-700 dark:text-amber-300">Disconnect this device from its current workspace before making it a host.</div>}
              <div className="flex items-center gap-1.5 text-[10px] text-faint"><ShieldCheck size={12} /> Devices pair over the local network with a short-lived code.</div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={connected ? 'This device is connected' : 'Connect this device'}
          subtitle={connected ? 'Sync activity and recovery options' : 'Join a clinic network or an Aster Cloud workspace'}
        >
          {connected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                {[
                  ['Workspace', data.workspace || clinic?.name || '—'],
                  ['Server', sync.serverUrl || data.serverUrl || '—'],
                  ['This device', data.deviceName || '—'],
                  ['Cursor', String(sync.cursor ?? 0)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-elevated px-2.5 py-2">
                    <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</div>
                    <div className="mt-0.5 truncate text-[11px] text-ink">{value}</div>
                  </div>
                ))}
              </div>
              {sync.error && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/25 dark:text-amber-200">
                  <TriangleAlert size={12} className="me-1 inline" /> {sync.error}
                </div>
              )}
              <p className="text-[10.5px] leading-4 text-faint">
                Edits are written locally first, then sent in order. If the server is unreachable, work continues and the queue drains on reconnection.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={syncNow} loading={syncBusy}><RefreshCw size={13} /> Sync now</Button>
                <Button size="sm" variant="ghost" onClick={() => setDisconnectOpen(true)}><Unplug size={13} /> Disconnect and keep records</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-1 rounded-lg bg-elevated p-0.5">
                {(['network', 'cloud'] as const).map((kind) => (
                  <button
                    key={kind}
                    onClick={() => setJoinKind(kind)}
                    className={cn('flex-1 rounded-[7px] px-2.5 py-1.5 text-[11px] font-medium transition', joinKind === kind ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
                  >
                    {kind === 'network' ? 'Clinic network' : 'Aster Cloud'}
                  </button>
                ))}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Workspace address" className="sm:col-span-2">
                  <Input value={join.url} onChange={(e) => update('url', e.target.value)} placeholder={joinKind === 'network' ? 'https://192.168.1.20:47821' : 'https://cloud.yourprovider.com'} />
                </Field>
                <Field label={joinKind === 'network' ? 'Pairing code' : 'Workspace code'}>
                  <Input value={join.code} onChange={(e) => update('code', e.target.value.toUpperCase())} placeholder="AB12-CD34" className="font-mono tracking-[0.1em]" />
                </Field>
                <Field label="Your role">
                  <Select value={join.role} onChange={(e) => update('role', e.target.value)}>
                    <option value="doctor">Physician</option>
                    <option value="nurse">Nurse</option>
                    <option value="receptionist">Front desk</option>
                    <option value="accountant">Billing</option>
                  </Select>
                </Field>
                <Field label="Your name"><Input value={join.name} onChange={(e) => update('name', e.target.value)} /></Field>
                <Field label="This computer"><Input value={join.device} onChange={(e) => update('device', e.target.value)} /></Field>
              </div>
              <Checkbox
                checked={join.keepLocal}
                onChange={(v) => update('keepLocal', v)}
                label="Keep records already on this computer"
                description="Merges this device’s local records into the workspace. Leave off to start from the workspace copy."
              />
              {probe && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10.5px] text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/25 dark:text-emerald-200">
                  <CheckCircle2 size={12} className="me-1 inline" /> {probe.clinicName || probe.name} · {probe.version || 'Aster'}{probe.multiTenant ? ' · cloud' : ''}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" onClick={joinWorkspace} loading={joining}><ArrowRightIcon /> Join workspace</Button>
                <Button onClick={testServer} loading={testing}><Search size={13} /> Test</Button>
              </div>
              <p className="text-[10px] leading-4 text-faint">Ask the clinic owner for a pairing code. This device keeps its own database, so the clinic stays usable during a network outage.</p>
            </div>
          )}
        </SectionCard>
      </div>

      {!connected && (
        <SectionCard title="Create an Aster Cloud workspace" subtitle="For a clinic starting on a hosted server or moving from a standalone computer">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Cloud server" className="sm:col-span-2"><Input value={cloud.url} onChange={(e) => setCloud({ ...cloud, url: e.target.value })} placeholder="https://cloud.yourprovider.com" /></Field>
            <Field label="Workspace name"><Input value={cloud.clinic} onChange={(e) => setCloud({ ...cloud, clinic: e.target.value })} /></Field>
            <Field label="Owner name"><Input value={cloud.owner} onChange={(e) => setCloud({ ...cloud, owner: e.target.value })} /></Field>
            <Field label="This computer" className="sm:col-span-2 xl:col-span-1"><Input value={cloud.device} onChange={(e) => setCloud({ ...cloud, device: e.target.value })} /></Field>
            <div className="flex items-end">
              <Button variant="primary" onClick={createCloud} loading={creating}><Cloud size={14} /> Create workspace</Button>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-faint">The clinic profile from this computer is copied to the new workspace. Local records are then merged into it, keeping their identifiers and history.</p>
        </SectionCard>
      )}

      {openConflicts.length > 0 && (
        <SectionCard title="Unresolved conflicts" subtitle="The same field changed on two devices. Choose which value the clinic keeps.">
          <div className="space-y-2">
            {openConflicts.map((c: any) => (
              <div key={c.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800/50 dark:bg-amber-900/15">
                <div className="flex flex-wrap items-center gap-2">
                  <TriangleAlert size={14} className="text-amber-700 dark:text-amber-300" />
                  <span className="text-[12px] font-semibold text-ink">{c.entity_label || `${titleCase(c.entity)} · ${c.entity_id.slice(0, 8)}`}</span>
                  <Badge tone="warning">{c.field}</Badge>
                  <span className="ms-auto text-[10px] text-faint">{fromNow(c.detected_at)}</span>
                </div>
                <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
                  <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
                    <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">This device</div>
                    <div className="mt-0.5 break-words text-ink">{c.local_value || <span className="text-faint">empty</span>}</div>
                  </div>
                  <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
                    <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">Server</div>
                    <div className="mt-0.5 break-words text-ink">{c.remote_value || <span className="text-faint">empty</span>}</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => resolveConflict(c.id, 'keep_local')} loading={resolving === c.id}>Keep this device</Button>
                  <Button size="sm" variant="ghost" onClick={() => resolveConflict(c.id, 'keep_remote')} loading={resolving === c.id}>Keep server value</Button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Paired devices"
          subtitle={hosting ? 'Computers and roles that can reach this workspace' : 'Available when this computer hosts the workspace'}
          actions={hosting ? <Badge tone="neutral">{(devices.data ?? []).length}</Badge> : undefined}
        >
          {!hosting ? (
            <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[11px] text-faint">
              Start hosting to see devices that pair with this workspace.
            </div>
          ) : devices.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Spinner /></div>
          ) : (devices.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[11px] text-faint">
              No devices have paired yet. Create a pairing code above when a computer is ready.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {(devices.data ?? []).map((device) => (
                <div key={device.id} className="flex items-center gap-2.5 py-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-elevated text-faint"><Laptop size={13} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[11.5px] font-medium text-ink">{device.name}</span>
                      {device.revokedAt && <Badge tone="error">Revoked</Badge>}
                    </div>
                    <div className="text-[10px] text-faint">{titleCase(device.role)} · paired {fmtDate(device.createdAt, 'd MMM yyyy')} · {device.lastSeenAt ? `seen ${fromNow(device.lastSeenAt)}` : 'never seen'}</div>
                  </div>
                  {!device.revokedAt && (
                    <Button size="sm" variant="ghost" onClick={() => setRevokeTarget(device)}><Ban size={12} /> Revoke</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Sync journal"
          subtitle="A local record of connections, retries and resolved work"
          actions={<Button size="sm" variant="ghost" onClick={clearActivity}><Trash2 size={12} /> Clear</Button>}
        >
          {activity.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Spinner /></div>
          ) : (activity.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[11px] text-faint">No sync activity yet.</div>
          ) : (
            <div className="max-h-[260px] space-y-1.5 overflow-y-auto pe-1">
              {(activity.data ?? []).slice(0, 30).map((row) => (
                <div key={row.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-elevated/60">
                  <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', row.status === 'error' ? 'bg-rose-500' : row.status === 'warning' ? 'bg-amber-500' : 'bg-brand-500')} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-ink">{row.message}</div>
                    <div className="text-[9.5px] text-faint">{titleCase(row.kind)} · {fromNow(row.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <ConfirmDialog
        open={stopOpen}
        onClose={() => setStopOpen(false)}
        onConfirm={stopHosting}
        busy={hostBusy}
        title="Stop hosting this workspace?"
        confirmLabel="Stop hosting"
        description="Connected computers keep their local records but can no longer sync with this one. You can start hosting again with the same database."
      />
      <ConfirmDialog
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={disconnect}
        title="Disconnect this device?"
        confirmLabel="Disconnect"
        description="This device becomes a standalone workspace with a full copy of its current records. Changes made elsewhere will no longer arrive."
      />
      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={revokeDevice}
        tone="danger"
        title="Revoke this device?"
        confirmLabel="Revoke device"
        description={revokeTarget ? `${revokeTarget.name} will lose access immediately. It keeps records already downloaded, and must pair again to sync.` : undefined}
      />
    </div>
  )
}

function ArrowRightIcon() {
  return <Network size={14} />
}

/* ------------------------------------------------------------------ */
/* Data & backups                                                      */
/* ------------------------------------------------------------------ */

function DataTab() {
  const toast = useToast()
  const [backingUp, setBackingUp] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lastExport, setLastExport] = useState('')

  const info = useQuery({ queryKey: ['data-info'], queryFn: () => api.dataInformation() as Promise<DataInfo> })

  async function backup() {
    setBackingUp(true)
    try {
      const next = await api.backupNow()
      info.refetch()
      toast.success('Backup created', next.lastBackup ? fmtDateTime(next.lastBackup) : 'A copy of the database is safe in the backup folder.')
    } catch (e: any) {
      toast.error('Backup failed', String(e?.message ?? e))
    } finally {
      setBackingUp(false)
    }
  }

  async function exportJSON() {
    setExporting(true)
    try {
      const res = await api.exportJSON()
      setLastExport(res.path)
      toast.success('JSON export ready', res.path)
    } catch (e: any) {
      toast.error('Export failed', String(e?.message ?? e))
    } finally {
      setExporting(false)
    }
  }

  const d = info.data

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="This computer’s data" subtitle="The database is a single SQLite file. It is yours to copy, move and archive.">
          {info.isLoading || !d ? (
            <div className="flex h-32 items-center justify-center"><Spinner /></div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-elevated px-3 py-2.5">
                  <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">Database size</div>
                  <div className="mt-0.5 text-[18px] font-semibold tabular-nums text-ink">{bytes(d.dbSize)}</div>
                </div>
                <div className="rounded-xl bg-elevated px-3 py-2.5">
                  <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">Last backup</div>
                  <div className="mt-0.5 text-[13px] font-semibold text-ink">{d.lastBackup ? fromNow(d.lastBackup) : 'Never'}</div>
                </div>
              </div>
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">Database file</div>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5">
                  <Database size={12} className="shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted">{d.dbPath}</span>
                  <button onClick={() => copyText(d.dbPath, 'Path', toast)} className="rounded p-1 text-faint hover:text-ink" aria-label="Copy database path"><Copy size={12} /></button>
                </div>
              </div>
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">Backup folder</div>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5">
                  <FolderOpen size={12} className="shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted">{d.backupDir}</span>
                  <button onClick={() => copyText(d.backupDir, 'Path', toast)} className="rounded p-1 text-faint hover:text-ink" aria-label="Copy backup folder path"><Copy size={12} /></button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={backup} loading={backingUp}><Database size={14} /> Back up now</Button>
                <Button onClick={exportJSON} loading={exporting}><FileJson size={14} /> Export as JSON</Button>
              </div>
              {lastExport && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10.5px] text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/25 dark:text-emerald-200">
                  <CheckCircle2 size={12} className="me-1 inline" /> Export saved to <span className="font-mono">{lastExport}</span>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Keeping records safe" subtitle="A short backup routine for a clinic">
            <ol className="space-y-2.5 text-[11px] leading-5 text-muted">
              {[
                'A backup is a complete snapshot, not a sync. Keep several days of them.',
                'Copy the backup folder to a USB drive, a network share, or a second computer each week.',
                'Test a restore before you need one: open a copy of the database on a spare machine.',
                'Keep at least one copy off this computer. Ransomware and disk failure are the usual losses.',
              ].map((line, i) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[9px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">{i + 1}</span>
                  {line}
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard title="Move this clinic" subtitle="Take the whole workspace to another computer">
            <div className="space-y-2 text-[11px] leading-5 text-muted">
              <p><span className="font-semibold text-ink">Standalone → another computer.</span> Create a backup, install Aster there, and open the backup on first run. Pairing a network or cloud workspace also brings the full record set to the new device.</p>
              <p><span className="font-semibold text-ink">Standalone → network or cloud.</span> Start hosting on this computer and pair the others, or create a cloud workspace above. Local records are merged, never re-keyed.</p>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-faint"><HardDrive size={12} /> The database folder also contains TLS keys and device identity.</div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

function copyText(value: string, label: string, toast: ReturnType<typeof useToast>) {
  navigator.clipboard.writeText(value)
    .then(() => toast.success(`${label} copied`))
    .catch(() => toast.error('Could not copy', value))
}

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

function AuditTab() {
  const [query, setQuery] = useState('')
  const audit = useQuery({ queryKey: ['audit', 200], queryFn: () => api.audit(200) as Promise<any[]> })

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = audit.data ?? []
    if (!q) return list
    return list.filter((row) => [row.action, row.summary, row.actor_name, row.detail].join(' ').toLowerCase().includes(q))
  }, [audit.data, query])

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="relative min-w-[230px] flex-1 sm:max-w-[360px]">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search action, person or detail…" className="input h-9 ps-9" />
          </div>
          <span className="text-[10.5px] text-faint">{rows.length} entries · newest first</span>
          <Button size="sm" variant="ghost" className="ms-auto" onClick={() => audit.refetch()} loading={audit.isFetching}><RefreshCw size={12} /> Refresh</Button>
        </div>

        {audit.isLoading ? (
          <div className="flex h-40 items-center justify-center"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Activity size={18} />} title={query ? 'No entries match that search' : 'No audit entries yet'} description="Every clinical and financial change is recorded here with the person and time." />
          </div>
        ) : (
          <div className="max-h-[620px] overflow-y-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-line bg-elevated/70">
                  <th className="table-head px-4 py-2.5">When</th>
                  <th className="table-head px-3 py-2.5">Action</th>
                  <th className="table-head px-3 py-2.5">Summary</th>
                  <th className="table-head px-3 py-2.5">By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line/80 align-top last:border-0 hover:bg-elevated/40">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <div className="text-[11px] text-ink">{fmtDate(row.at)}</div>
                      <div className="text-[10px] text-faint">{fmtDateTime(row.at).split('·')[1]?.trim()}</div>
                    </td>
                    <td className="px-3 py-2.5"><Badge tone={auditTone(row.action)}>{row.action}</Badge></td>
                    <td className="px-3 py-2.5">
                      <div className="text-[11.5px] text-ink">{row.summary || '—'}</div>
                      {row.detail && <div className="mt-0.5 max-w-[420px] truncate text-[10px] text-faint">{row.detail}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Avatar name={row.actor_name || 'System'} size={20} />
                        <span className="text-[10.5px] text-muted">{row.actor_name || 'System'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="rounded-xl border border-line bg-elevated/40 px-4 py-3 text-[10.5px] leading-5 text-faint">
        The audit trail is append-only in normal use and travels with the workspace during sync. It answers who changed what, but not why — use visit notes and addenda for clinical reasoning.
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* About                                                               */
/* ------------------------------------------------------------------ */

function AboutTab() {
  const { data, clinic, staff } = useApp()
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="relative overflow-hidden border-b border-line bg-brand-950 p-5 text-white">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-accent-500/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-4">
            <img src="/brand/aster-lockup-light.svg" alt="Aster Clinic" className="h-12 w-auto" />
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] leading-5 text-brand-100/70">
                {data.tagline || 'A calm, local-first clinic workspace'} · v{data.version}
              </div>
            </div>
            <Badge tone="success">{modeLabel(data.mode)}</Badge>
          </div>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Clinic', clinic?.name || '—'],
            ['Team members', String(staff.length)],
            ['Data folder', data.dataDir],
            ['Device', data.deviceName || 'This computer'],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</div>
              <div className="mt-1 truncate text-[11.5px] text-ink" title={value}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <SectionCard title="Brand and identity" subtitle="One mark across the app, printed documents and clinic signage">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-h-[104px] items-center justify-center rounded-xl border border-line bg-[#f7f4ef] p-4">
              <img src="/brand/aster-lockup.svg" alt="Aster Clinic lockup for light backgrounds" className="h-14 w-auto" />
            </div>
            <div className="flex min-h-[104px] items-center justify-center rounded-xl border border-brand-800 bg-brand-950 p-4">
              <img src="/brand/aster-lockup-light.svg" alt="Aster Clinic lockup for dark backgrounds" className="h-14 w-auto" />
            </div>
          </div>
          <div className="rounded-xl border border-line bg-elevated/40 p-4">
            <div className="flex items-center gap-3">
              <img src="/brand/aster-mark-transparent.png" alt="Aster eight-point mark" className="h-12 w-12" />
              <div>
                <div className="text-[11.5px] font-semibold text-ink">The eight-point aster</div>
                <div className="text-[10.5px] leading-4 text-faint">A compass rose for care: four arms for the patient, the clinician, the record and the day; four diagonals for the paths between them. The copper heart marks the centre.</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {[
                ['#0e151d', 'Ink'],
                ['#2a3747', 'Slate'],
                ['#f7f4ef', 'Paper'],
                ['#a85833', 'Copper'],
                ['#d9a06f', 'Sand'],
              ].map(([hex, name]) => (
                <div key={name}>
                  <div className="h-7 rounded-md border border-line" style={{ background: hex }} />
                  <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-faint">{name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-faint">
          <span className="inline-flex items-center gap-1.5"><Info size={11} /> App icon, favicon and print headers are generated from the same source geometry.</span>
          <span className="font-mono">Manrope</span>
          <span>·</span>
          <span>Mark clear space: half the tile width</span>
          <span>·</span>
          <span>Minimum lockup height: 28 px</span>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="What Aster is" subtitle="The product promise">
          <p className="text-[11.5px] leading-5 text-muted">
            Clinic software that works on the computer in front of you. Register a patient, run the visit, prescribe, bill and print without an internet connection. Connect a second room or a cloud workspace when the clinic needs it — not before.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="brand">Local-first</Badge>
            <Badge tone="brand">No account required</Badge>
            <Badge tone="brand">Offline capable</Badge>
            <Badge tone="brand">Auditable</Badge>
          </div>
        </SectionCard>

        <SectionCard title="Free core" subtitle="What every clinic gets">
          <ul className="space-y-1.5 text-[11px] leading-5 text-muted">
            {[
              'Patients, appointments and the daily schedule',
              'SOAP visits, vitals, diagnoses and addenda',
              'Prescriptions and printable documents',
              'Invoices, payments and clinic reports',
              'Local backups and a complete JSON export',
            ].map((line) => (
              <li key={line} className="flex gap-2"><Check size={12} className="mt-1 shrink-0 text-brand-600" /> {line}</li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="What may be paid later" subtitle="Optional services, never data hostage-taking">
          <ul className="space-y-1.5 text-[11px] leading-5 text-muted">
            {[
              'Hosted cloud sync and managed backups',
              'Multi-site administration and central reporting',
              'Insurance and laboratory integrations',
              'Priority support and staff training',
            ].map((line) => (
              <li key={line} className="flex gap-2"><Cloud size={12} className="mt-1 shrink-0 text-sky-600" /> {line}</li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-4 text-faint">Your data is never held behind a subscription. Export and local use remain available.</p>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Privacy and responsibility" subtitle="What Aster does and does not do">
          <div className="space-y-2.5 text-[11px] leading-5 text-muted">
            <p><span className="font-semibold text-ink">Stored here.</span> Clinical records live in a SQLite database in the folder above. Aster does not send them anywhere unless you explicitly connect a workspace.</p>
            <p><span className="font-semibold text-ink">Encryption.</span> Network traffic uses TLS with a pinned certificate. Data at rest is protected by the operating system account and disk encryption you enable on the computer.</p>
            <p><span className="font-semibold text-ink">Clinical judgement.</span> Aster records decisions; it does not diagnose, check interactions or replace professional judgement.</p>
            <p><span className="font-semibold text-ink">Your obligations.</span> Backups, device access, staff accounts and applicable health-data rules remain the clinic’s responsibility.</p>
          </div>
        </SectionCard>

        <SectionCard title="Built with" subtitle="A small, durable stack chosen for offline clinics">
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            {[
              ['Desktop shell', 'Wails v2'],
              ['Backend', 'Go + SQLite'],
              ['Interface', 'React + TypeScript'],
              ['Sync', 'Schema-aware change log'],
              ['Documents', 'Browser print engine'],
              ['Storage', 'Single portable database'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-elevated px-2.5 py-2">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</div>
                <div className="mt-0.5 text-[11px] font-medium text-ink">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-faint">
            <Info size={12} /> Aster Clinic is an independent application. Version {data.version}.
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
