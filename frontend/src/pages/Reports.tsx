import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  addDays, eachDayOfInterval, format, startOfMonth, startOfYear, subDays, subMonths,
} from 'date-fns'
import {
  Activity, ArrowDownRight, ArrowUpRight, Banknote, Building2, CalendarDays, CalendarRange,
  ClipboardCheck, ClipboardList, Clock3, Download, FileText, HeartPulse, RefreshCw, Stethoscope,
  TrendingUp, UserPlus, Users, Wallet,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { cn, fmtDate, formatNumber, isoLocal, money, plural } from '../lib/format'
import { BarList, Donut, TrendArea } from '../components/charts'
import { Button, PageHeader, SectionCard, Select, Spinner, Tabs } from '../components/ui'
import { useToast } from '../components/Toast'
import type { ReportData } from '../lib/types'

type Preset = 'today' | '7d' | '30d' | 'month' | 'lastmonth' | 'year' | 'custom'
type ReportTab = 'overview' | 'clinical' | 'finance' | 'patients'

const presets: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'month', label: 'This month' },
  { value: 'lastmonth', label: 'Last month' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
]

const statusColors: Record<string, string> = {
  scheduled: '#9aa8a3',
  confirmed: '#4f7fab',
  arrived: '#c9885b',
  waiting: '#d4a04a',
  in_progress: '#4f6b8a',
  completed: '#4f9a6d',
  cancelled: '#8d8f8c',
  no_show: '#c4506d',
}

const methodColors: Record<string, string> = {
  cash: '#4f9a6d',
  card: '#4f7fab',
  transfer: '#8a6fae',
  insurance: '#c9885b',
  other: '#9aa8a3',
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function localDate(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function customBounds(start: string, end: string) {
  const startDate = localDate(start)
  const endDate = addDays(localDate(end), 1)
  return { start: startDate, end: endDate }
}

function buildRange(preset: Preset, customStart: string, customEnd: string) {
  const now = new Date()
  const tomorrow = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1)
  switch (preset) {
    case 'today':
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: tomorrow }
    case '7d':
      return { start: subDays(tomorrow, 7), end: tomorrow }
    case 'month':
      return { start: startOfMonth(now), end: tomorrow }
    case 'lastmonth':
      return { start: startOfMonth(subMonths(now, 1)), end: startOfMonth(now) }
    case 'year':
      return { start: startOfYear(now), end: tomorrow }
    case 'custom':
      return customBounds(customStart, customEnd)
    case '30d':
    default:
      return { start: subDays(tomorrow, 30), end: tomorrow }
  }
}

function trendPoints(data: ReportData | undefined, key: 'revenue_by_day' | 'invoiced_by_day', start: Date, end: Date) {
  if (!data) return []
  const map = new Map(((data[key] ?? []) as { day: string; cents: number }[]).map((d) => [d.day, Number(d.cents ?? 0)]))
  const last = addDays(end, -1)
  if (last < start) return []
  const days = eachDayOfInterval({ start, end: last })
  return days.map((d) => ({ label: format(d, 'd MMM'), value: map.get(isoLocal(d)) ?? 0 }))
}

function growthPoints(data?: ReportData) {
  const months = [...(data?.patient_growth ?? [])].reverse()
  return months.map((m) => {
    const [y, mo] = m.month.split('-').map(Number)
    const label = y && mo ? format(new Date(y, mo - 1, 1), 'MMM yyyy') : m.month
    return { label, value: Number(m.n ?? 0) }
  })
}

function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

function ReportKpi({
  label, value, hint, icon, tone = 'brand', delta,
}: {
  label: string
  value: string | number
  hint: string
  icon: React.ReactNode
  tone?: 'brand' | 'amber' | 'blue' | 'rose' | 'green'
  delta?: { value: string; positive?: boolean }
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
    blue: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/25 dark:text-rose-200',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-200',
  }
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}>{icon}</span>
        {delta && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium', delta.positive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-200' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/25 dark:text-rose-200')}>
            {delta.positive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {delta.value}
          </span>
        )}
      </div>
      <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">{label}</div>
      <div className="mt-0.5 text-[23px] font-semibold leading-tight tabular-nums tracking-[-0.02em] text-ink">{value}</div>
      <div className="mt-1 text-[10.5px] leading-4 text-muted">{hint}</div>
    </div>
  )
}

function MetricRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2 last:border-0 last:pb-0">
      <span className="text-muted">{label}{hint && <span className="ms-1 text-[10px] text-faint">{hint}</span>}</span>
      <span className="font-semibold tabular-nums text-ink">{value}</span>
    </div>
  )
}

export function Reports() {
  const { clinic, locations, activeLocation } = useApp()
  const toast = useToast()
  const now = new Date()
  const [preset, setPreset] = useState<Preset>('30d')
  const [customStart, setCustomStart] = useState(isoLocal(subDays(now, 14)))
  const [customEnd, setCustomEnd] = useState(isoLocal(now))
  const [scope, setScope] = useState<string>('active')
  const [tab, setTab] = useState<ReportTab>('overview')
  const [exporting, setExporting] = useState(false)

  const locationId = scope === 'all' ? '' : scope === 'active' ? (activeLocation?.id ?? '') : scope

  const range = useMemo(() => buildRange(preset, customStart, customEnd), [preset, customStart, customEnd])
  const startISO = range.start.toISOString()
  const endISO = range.end.toISOString()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['reports', startISO, endISO, locationId],
    queryFn: () => api.reports(startISO, endISO, locationId),
  })

  const collected = Number(data?.revenue_cents ?? 0)
  const invoiced = Number(data?.invoiced_cents ?? 0)
  const outstanding = Number(data?.outstanding_cents ?? 0)
  const visits = Number(data?.visits ?? 0)
  const appointments = Number(data?.appointments ?? 0)
  const completed = Number(data?.completed ?? 0)
  const noShows = Number(data?.no_shows ?? 0)
  const cancelled = Number(data?.cancelled ?? 0)
  const newPatients = Number(data?.new_patients ?? 0)
  const uniquePatients = Number(data?.unique_patients ?? 0)
  const returning = Number(data?.returning_patients ?? 0)
  const unsigned = Number(data?.unsigned_notes ?? 0)
  const prescriptions = Number(data?.prescriptions ?? 0)
  const followUps = Number(data?.follow_ups_due ?? 0)
  const avgWait = Number(data?.avg_wait_minutes ?? 0)
  const avgVisit = Number(data?.avg_visit_minutes ?? 0)
  const expenses = Number(data?.expenses_cents ?? 0)
  const net = Number(data?.net_cents ?? (collected - expenses))
  const netMargin = collected > 0 ? Math.round((net / collected) * 100) : 0
  const collectionRate = pct(collected, invoiced)
  const completedRate = pct(completed, appointments)
  const noShowRate = pct(noShows, appointments)
  const cancelRate = pct(cancelled, appointments)
  const averageCollected = visits > 0 ? Math.round(collected / visits) : 0
  const series = useMemo(() => trendPoints(data, 'revenue_by_day', range.start, range.end), [data, range.start, range.end])
  const invoicedSeries = useMemo(() => trendPoints(data, 'invoiced_by_day', range.start, range.end), [data, range.start, range.end])
  const growth = useMemo(() => growthPoints(data), [data])
  const peak = useMemo(() => series.reduce((best, p) => (p.value > best.value ? p : best), { label: '—', value: 0 }), [series])
  const symbol = clinic?.currency_symbol || data?.currency_symbol

  const statusSegments = (data?.status_counts ?? [])
    .filter((s) => Number(s.n) > 0)
    .sort((a, b) => Number(b.n) - Number(a.n))
    .map((s) => ({ label: s.status.replace(/_/g, ' '), value: Number(s.n), color: statusColors[s.status] ?? '#9aa8a3' }))

  const weekdayRows = useMemo(() => {
    const map = new Map((data?.visits_by_weekday ?? []).map((d) => [Number(d.weekday), Number(d.n)]))
    return weekdayLabels.map((label, index) => ({ label, value: map.get(index) ?? 0 }))
  }, [data])

  const hourRows = useMemo(() => {
    const map = new Map((data?.visits_by_hour ?? []).map((d) => [Number(d.hour), Number(d.n)]))
    const hours: { label: string; value: number }[] = []
    for (let hour = 6; hour <= 21; hour++) {
      hours.push({ label: `${String(hour).padStart(2, '0')}:00`, value: map.get(hour) ?? 0 })
    }
    return hours
  }, [data])

  const methodSegments = (data?.revenue_by_method ?? [])
    .filter((m) => Number(m.cents) > 0)
    .map((m) => ({ label: m.method || 'other', value: Number(m.cents), color: methodColors[m.method] ?? '#9aa8a3' }))

  const serviceRows = (data?.revenue_by_service ?? []).map((s) => ({ label: s.label, value: Number(s.cents) }))
  const expenseRows = (data?.expenses_by_category ?? []).map((c) => ({ label: c.label.replace(/_/g, ' '), value: Number(c.cents) }))
  const locationRows = (data?.revenue_by_location ?? []).map((l) => ({ label: l.name, value: Number(l.cents), tone: l.color }))
  const ageRows = (data?.age_bands ?? []).filter((b) => Number(b.n) > 0).map((b) => ({ label: `${b.band} years`, value: Number(b.n) }))
  const sexRows = (data?.sex_mix ?? []).filter((s) => Number(s.n) > 0)
  const payerRows = (data?.payer_mix ?? []).map((p) => ({ label: p.label, value: Number(p.n) }))
  const agingRows = (data?.outstanding_aging ?? []).sort((a, b) => a.bucket.localeCompare(b.bucket))
  const maxHour = hourRows.reduce((best, row) => (row.value > best.value ? row : best), { label: '—', value: 0 })

  async function exportCSV() {
    if (!data) return
    setExporting(true)
    try {
      const scopeName = scope === 'all' ? 'network' : (data.location_name || activeLocation?.name || 'clinic')
      const rows: (string | number)[][] = [
        ['Aster clinic report'],
        ['Clinic', data.clinic_name || clinic?.name || ''],
        ['Scope', scope === 'all' ? 'All clinics' : scopeName],
        ['Period', `${fmtDate(startISO, 'd MMM yyyy')} – ${fmtDate(new Date(endISO).toISOString(), 'd MMM yyyy')}`],
        ['Generated', new Date().toISOString()],
        [],
        ['Metric', 'Value'],
        ['Collected', (collected / 100).toFixed(2)],
        ['Invoiced', (invoiced / 100).toFixed(2)],
        ['Outstanding in period', (outstanding / 100).toFixed(2)],
        ['Expenses', (expenses / 100).toFixed(2)],
        ['Net collected minus expenses', (net / 100).toFixed(2)],
        ['Net margin %', netMargin],
        ['Collection rate %', collectionRate],
        ['Appointments', appointments],
        ['Completed', completed],
        ['Cancelled', cancelled],
        ['No-shows', noShows],
        ['Visits', visits],
        ['Unique patients', uniquePatients],
        ['New patients', newPatients],
        ['Returning patients', returning],
        ['Unsigned visits', unsigned],
        ['Prescriptions', prescriptions],
        ['Follow-ups due', followUps],
        ['Average wait (minutes)', avgWait],
        ['Average visit (minutes)', avgVisit],
        [],
        ['Collected by day'],
        ['Day', 'Amount'],
        ...series.map((p) => [p.label, (p.value / 100).toFixed(2)]),
        [],
        ['Revenue by method'],
        ['Method', 'Amount'],
        ...methodSegments.map((m) => [m.label, (m.value / 100).toFixed(2)]),
        [],
        ['Revenue by service'],
        ['Service', 'Amount'],
        ...serviceRows.map((s) => [s.label, (s.value / 100).toFixed(2)]),
        [],
        ['Expenses by category'],
        ['Category', 'Amount'],
        ...expenseRows.map((c) => [c.label, (c.value / 100).toFixed(2)]),
        [],
        ['Revenue by clinic'],
        ['Clinic', 'Amount'],
        ...locationRows.map((l) => [l.label, (l.value / 100).toFixed(2)]),
        [],
        ['Clinician performance'],
        ['Clinician', 'Visits', 'Unique patients', 'Signed', 'Average minutes', 'Invoiced'],
        ...(data.provider_load ?? []).map((p) => [p.full_name, p.visits ?? 0, p.unique_patients ?? 0, p.signed ?? 0, Math.round(Number(p.avg_minutes ?? 0)), ((Number(p.revenue_cents ?? 0)) / 100).toFixed(2)]),
        [],
        ['Appointment outcomes'],
        ['Status', 'Count'],
        ...statusSegments.map((s) => [s.label, s.value]),
        [],
        ['Age bands'],
        ['Band', 'Patients'],
        ...ageRows.map((a) => [a.label, a.value]),
        [],
        ['Outstanding aging'],
        ['Bucket', 'Balance', 'Invoices'],
        ...agingRows.map((a) => [a.bucket, (Number(a.cents) / 100).toFixed(2), a.n]),
      ]
      const csv = rows.map((row) => row.map((cell) => {
        const text = String(cell ?? '')
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
      }).join(',')).join('\r\n')
      const filename = `aster-report-${scopeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${isoLocal(range.start)}.csv`
      const saved = await api.saveExport(filename, '\uFEFF' + csv)
      toast.success('Report exported', saved.name)
    } catch (e: any) {
      toast.error('Could not export report', String(e?.message ?? e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Clinic intelligence"
        title="Reports"
        description="A measured view of activity, income and follow-through. Choose one clinic or the whole network, then read the period at a glance."
        actions={(
          <>
            <Button onClick={exportCSV} loading={exporting} disabled={!data}><Download size={14} /> Export CSV</Button>
            <Button onClick={() => refetch()} loading={isFetching && !isLoading}><RefreshCw size={14} /> Refresh</Button>
          </>
        )}
      />

      <div className="card flex flex-wrap items-center gap-2 p-2.5">
        <div className="flex flex-wrap items-center gap-0.5">
          {presets.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={cn(
                'h-7 rounded-[7px] px-2.5 text-[11.5px] font-medium transition',
                preset === p.value ? 'bg-brand-700 text-white shadow-sm' : 'text-muted hover:bg-elevated hover:text-ink',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-line" />
        <Select value={scope} onChange={(e) => setScope(e.target.value)} className="h-8 w-[210px] text-[11.5px]">
          <option value="active">Active clinic · {activeLocation?.name ?? 'Primary'}</option>
          <option value="all">All clinics · network total</option>
          {locations.filter((l) => l.id !== activeLocation?.id).map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </Select>
        {preset === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="input h-8 w-[146px] text-[11.5px]" />
            <span className="text-[11px] text-faint">to</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="input h-8 w-[146px] text-[11.5px]" />
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-faint">
            <CalendarRange size={13} />
            {fmtDate(startISO, 'd MMM yyyy')} – {fmtDate(new Date(endISO).toISOString(), 'd MMM yyyy')}
          </span>
        )}
        <span className="ms-auto inline-flex items-center gap-1.5 text-[10px] text-faint">
          {scope === 'all' ? <Building2 size={12} /> : <Stethoscope size={12} />}
          {scope === 'all' ? `${locations.length} clinics aggregated` : data?.location_name || activeLocation?.name || 'Active clinic'}
        </span>
      </div>

      {isLoading ? (
        <div className="flex h-56 items-center justify-center rounded-2xl border border-line bg-surface"><Spinner /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ReportKpi label="Collected" value={money(collected, symbol)} hint={`${collectionRate}% of ${money(invoiced, symbol)} invoiced`} icon={<Banknote size={16} />} tone="brand" />
            <ReportKpi label="Outstanding invoiced" value={money(Math.max(0, invoiced - collected), symbol)} hint={invoiced > 0 ? `${100 - collectionRate}% still to collect` : 'No invoices in this period'} icon={<FileText size={16} />} tone={invoiced - collected > 0 ? 'rose' : 'blue'} />
            <ReportKpi label="Clinical visits" value={formatNumber(visits)} hint={visits > 0 ? `${money(averageCollected, symbol)} average collected per visit` : 'No visits recorded'} icon={<Stethoscope size={16} />} tone="blue" />
            <ReportKpi label="Patients seen" value={formatNumber(uniquePatients)} hint={`${newPatients} new · ${returning} returning`} icon={<UserPlus size={16} />} tone="amber" />
          </div>

          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'clinical', label: 'Clinical' },
              { value: 'finance', label: 'Financial' },
              { value: 'patients', label: 'Patients' },
            ]}
          />

          {tab === 'overview' && (
            <>
              <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                <SectionCard
                  title="Collected revenue"
                  subtitle={`Peak ${peak.label} · ${money(peak.value, symbol)} · ${money(invoiced, symbol)} invoiced in the period`}
                  actions={<span className="inline-flex items-center gap-1 text-[10.5px] text-faint"><TrendingUp size={12} /> daily receipts</span>}
                >
                  <TrendArea points={series} format={(n) => money(n, symbol)} emptyLabel="No payments recorded in this period" />
                  {invoicedSeries.some((p) => p.value > 0) && (
                    <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-[10px] text-faint">
                      <span>Invoiced over the same days</span>
                      <span className="font-medium tabular-nums text-muted">{money(invoicedSeries.reduce((sum, p) => sum + p.value, 0), symbol)}</span>
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Appointment outcomes" subtitle={`${appointments} booked · ${completed} completed · ${noShows} missed`}>
                  {statusSegments.length ? (
                    <div className="space-y-4">
                      <Donut segments={statusSegments} centerLabel="appointments" centerValue={appointments} />
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                          ['Completed', `${completedRate}%`, 'text-emerald-600 dark:text-emerald-300'],
                          ['No-show', `${noShowRate}%`, 'text-rose-600 dark:text-rose-300'],
                          ['Cancelled', `${cancelRate}%`, 'text-muted'],
                        ].map(([label, value, tone]) => (
                          <div key={label} className="rounded-lg bg-elevated/60 px-2 py-2">
                            <div className={cn('text-[15px] font-semibold tabular-nums', tone)}>{value}</div>
                            <div className="text-[8.5px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[190px] flex-col items-center justify-center gap-2 text-center">
                      <CalendarDays size={22} className="text-faint" />
                      <div className="text-[12px] font-medium text-ink">No appointments in this period</div>
                      <div className="max-w-[240px] text-[10.5px] leading-4 text-faint">Try a wider date range to see how the schedule is being used.</div>
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard title="Clinician load" subtitle="Visits by provider in this period">
                  <BarList
                    items={(data?.provider_load ?? []).map((p) => ({ label: p.full_name, value: Number(p.visits ?? 0), tone: p.color || undefined }))}
                    format={(n) => plural(n, 'visit')}
                    emptyLabel="No provider activity recorded"
                  />
                </SectionCard>
                <SectionCard title="Top diagnoses" subtitle="Most recorded in this period">
                  <BarList
                    items={(data?.top_diagnoses ?? []).map((d) => ({ label: d.description, value: Number(d.n ?? 0) }))}
                    format={(n) => `${n} case${n === 1 ? '' : 's'}`}
                    emptyLabel="No diagnoses recorded yet"
                  />
                </SectionCard>
                <SectionCard title="Patient growth" subtitle="New registrations by month">
                  {growth.length ? (
                    <div className="space-y-3">
                      <BarList items={growth.map((g) => ({ label: g.label, value: g.value }))} format={(n) => `${n} new`} />
                      <div className="rounded-lg bg-elevated/60 px-2.5 py-2 text-[10px] leading-4 text-faint">The most recent six months, drawn from patient registration dates.</div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-[11.5px] text-faint">No registrations recorded yet.</div>
                  )}
                </SectionCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="card p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><Activity size={15} /></span>
                    <div>
                      <div className="text-[12.5px] font-semibold text-ink">Period at a glance</div>
                      <div className="text-[10.5px] text-faint">How the numbers fit together</div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-0.5 text-[11.5px]">
                    <MetricRow label="Payments received" value={money(collected, symbol)} />
                    <MetricRow label="Expenses recorded" value={money(expenses, symbol)} />
                    <MetricRow label="Net after expenses" value={money(net, symbol)} />
                    <MetricRow label="Invoices issued" value={money(invoiced, symbol)} />
                    <MetricRow label="Awaiting collection" value={money(Math.max(0, invoiced - collected), symbol)} />
                    <MetricRow label="Collection rate" value={`${collectionRate}%`} />
                    <MetricRow label="Visits completed" value={visits} />
                    <MetricRow label="Unsigned visits" value={unsigned} hint={unsigned > 0 ? 'need a signature' : undefined} />
                    <MetricRow label="Prescriptions issued" value={prescriptions} />
                    <MetricRow label="Follow-ups due" value={followUps} />
                    <MetricRow label="Average wait" value={`${avgWait} min`} />
                    <MetricRow label="Average visit" value={`${avgVisit} min`} />
                  </div>
                </div>

                <SectionCard title="How to read this" subtitle="A short, practical guide for the clinic owner">
                  <div className="space-y-3 text-[11px] leading-5 text-muted">
                    <p><span className="font-semibold text-ink">Collected</span> counts payments recorded against invoices, not amounts billed. A busy clinic can invoice heavily and still collect slowly.</p>
                    <p><span className="font-semibold text-ink">Collection rate</span> compares the two. A persistent gap usually means unpaid balances need a follow-up call, not that clinical work is down.</p>
                    <p><span className="font-semibold text-ink">Network scope</span> sums each clinic's records. Use it to compare locations, then switch back to a single clinic to see its patient detail.</p>
                    <p><span className="font-semibold text-ink">Clinical time</span> uses recorded starts and ends. Missed check-in times naturally lower the wait figure.</p>
                    <div className="flex items-center gap-1.5 pt-1 text-[10px] text-faint"><Users size={12} /> Figures respect archived and void records.</div>
                  </div>
                </SectionCard>
              </div>
            </>
          )}

          {tab === 'clinical' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ReportKpi label="Completed rate" value={`${completedRate}%`} hint={`${completed} of ${appointments} appointments`} icon={<ClipboardCheck size={16} />} tone="green" />
                <ReportKpi label="No-show rate" value={`${noShowRate}%`} hint={`${noShows} missed · ${cancelled} cancelled`} icon={<CalendarDays size={16} />} tone="rose" />
                <ReportKpi label="Average wait" value={`${avgWait} min`} hint="Check-in to scheduled start" icon={<Clock3 size={16} />} tone="amber" />
                <ReportKpi label="Average visit" value={`${avgVisit} min`} hint={`${visits} visits recorded`} icon={<HeartPulse size={16} />} tone="blue" />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Visits by weekday" subtitle="Where the clinical load actually lands">
                  <BarList items={weekdayRows} format={(n) => `${n} visit${n === 1 ? '' : 's'}`} emptyLabel="No visits in this period" />
                </SectionCard>
                <SectionCard title="Appointments by hour" subtitle={maxHour.value ? `Busiest slot ${maxHour.label} · ${maxHour.value} booked` : 'No appointments in this period'}>
                  <BarList items={hourRows.filter((h) => h.value > 0)} format={(n) => `${n} booked`} emptyLabel="No appointment times recorded" />
                </SectionCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                <SectionCard title="Clinician performance" subtitle="Visits, signatures and average consultation time" bodyClassName="p-0">
                  {(data?.provider_load ?? []).length === 0 ? (
                    <div className="px-4 py-8 text-center text-[11.5px] text-faint">No clinician activity in this period.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-[11.5px]">
                        <thead>
                          <tr className="border-b border-line bg-elevated/50 text-[9px] uppercase tracking-[0.1em] text-faint">
                            <th className="px-4 py-2 text-start font-semibold">Clinician</th>
                            <th className="px-3 py-2 text-end font-semibold">Visits</th>
                            <th className="px-3 py-2 text-end font-semibold">Patients</th>
                            <th className="px-3 py-2 text-end font-semibold">Signed</th>
                            <th className="px-3 py-2 text-end font-semibold">Avg time</th>
                            <th className="px-4 py-2 text-end font-semibold">Invoiced</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data?.provider_load ?? []).map((p) => (
                            <tr key={p.id} className="border-b border-line/70 last:border-0">
                              <td className="px-4 py-2.5">
                                <span className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full" style={{ background: p.color || '#2a3747' }} />
                                  <span className="font-medium text-ink">{p.full_name}</span>
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-end tabular-nums text-muted">{p.visits ?? 0}</td>
                              <td className="px-3 py-2.5 text-end tabular-nums text-muted">{p.unique_patients ?? 0}</td>
                              <td className="px-3 py-2.5 text-end tabular-nums text-muted">{p.signed ?? 0}</td>
                              <td className="px-3 py-2.5 text-end tabular-nums text-muted">{Math.round(Number(p.avg_minutes ?? 0))} min</td>
                              <td className="px-4 py-2.5 text-end font-medium tabular-nums text-ink">{money(p.revenue_cents, symbol)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>

                <div className="space-y-4">
                  <SectionCard title="Documentation" subtitle="What still needs attention">
                    <div className="space-y-0.5 text-[11.5px]">
                      <MetricRow label="Unsigned visits" value={unsigned} hint={unsigned ? 'need a signature' : undefined} />
                      <MetricRow label="Prescriptions" value={prescriptions} />
                      <MetricRow label="Follow-ups due" value={followUps} />
                      <MetricRow label="Unique patients" value={uniquePatients} />
                      <MetricRow label="Visits per patient" value={uniquePatients ? (visits / uniquePatients).toFixed(1) : '0.0'} />
                    </div>
                  </SectionCard>
                  <div className="card p-4">
                    <div className="flex items-center gap-2 text-[11.5px] font-semibold text-ink"><ClipboardList size={14} className="text-faint" /> Clinical caution</div>
                    <p className="mt-2 text-[10.5px] leading-4 text-muted">Averages describe the period, not an individual clinician's performance. Pair them with the notes, case mix and appointment length before drawing conclusions.</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'finance' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <ReportKpi label="Invoiced" value={money(invoiced, symbol)} hint={`${new Set(series.map((s) => s.label)).size} days in view`} icon={<FileText size={16} />} tone="brand" />
                <ReportKpi label="Collected" value={money(collected, symbol)} hint={`${collectionRate}% collection rate`} icon={<Banknote size={16} />} tone="green" />
                <ReportKpi label="Outstanding" value={money(outstanding, symbol)} hint="From open and partly paid invoices" icon={<Wallet size={16} />} tone="rose" />
                <ReportKpi label="Expenses" value={money(expenses, symbol)} hint="Operating costs recorded in the period" icon={<ArrowDownRight size={16} />} tone="amber" />
                <ReportKpi label="Net" value={money(net, symbol)} hint={net >= 0 ? `${formatNumber(netMargin)}% margin on collections` : 'Expenses exceed collections'} icon={<TrendingUp size={16} />} tone={net >= 0 ? 'green' : 'rose'} />
                <ReportKpi label="Average per visit" value={money(averageCollected, symbol)} hint={`${visits} visits in the period`} icon={<Stethoscope size={16} />} tone="blue" />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                <SectionCard title="Collected revenue" subtitle={`Peak ${peak.label} · ${money(peak.value, symbol)}`}>
                  <TrendArea points={series} format={(n) => money(n, symbol)} emptyLabel="No payments recorded in this period" />
                </SectionCard>
                <SectionCard title="Payment methods" subtitle="How the money arrived">
                  {methodSegments.length ? (
                    <Donut segments={methodSegments} centerLabel="collected" centerValue={money(collected, symbol)} />
                  ) : (
                    <div className="py-10 text-center text-[11.5px] text-faint">No payments recorded in this period.</div>
                  )}
                </SectionCard>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SectionCard title="Revenue by service" subtitle="Top billed lines by value">
                  <BarList items={serviceRows} format={(n) => money(n, symbol)} emptyLabel="No invoiced services in this period" />
                </SectionCard>
                <SectionCard title="Revenue by clinic" subtitle="Collected per location">
                  <BarList items={locationRows} format={(n) => money(n, symbol)} emptyLabel="No payments to allocate" />
                </SectionCard>
                <SectionCard title="Expenses by category" subtitle="Where the running costs went">
                  <BarList items={expenseRows} format={(n) => money(n, symbol)} emptyLabel="No expenses recorded in this period" />
                </SectionCard>
                <SectionCard title="Outstanding aging" subtitle="Open balances by invoice age">
                  {agingRows.length ? (
                    <div className="space-y-0.5 text-[11.5px]">
                      {agingRows.map((a) => (
                        <MetricRow key={a.bucket} label={`${a.bucket} days`} value={money(Number(a.cents), symbol)} hint={`${a.n} invoice${Number(a.n) === 1 ? '' : 's'}`} />
                      ))}
                      <div className="pt-2 text-[10px] leading-4 text-faint">Aging is measured from the invoice issue date, across all open invoices, not only the selected period.</div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-[11.5px] text-faint">Every invoice in scope is settled.</div>
                  )}
                </SectionCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Billing summary" subtitle="The period in figures">
                  <div className="space-y-0.5 text-[11.5px]">
                    <MetricRow label="Invoices issued" value={money(invoiced, symbol)} />
                    <MetricRow label="Payments received" value={money(collected, symbol)} />
                    <MetricRow label="Collection rate" value={`${collectionRate}%`} />
                    <MetricRow label="Outstanding in period" value={money(Math.max(0, invoiced - collected), symbol)} />
                    <MetricRow label="All open balances" value={money(outstanding, symbol)} />
                    <MetricRow label="Operating expenses" value={money(expenses, symbol)} />
                    <MetricRow label="Net after expenses" value={money(net, symbol)} hint={net >= 0 ? `${formatNumber(netMargin)}% of collections` : 'Expenses exceed collections'} />
                    <MetricRow label="Average collected per visit" value={money(averageCollected, symbol)} />
                  </div>
                </SectionCard>
                <SectionCard title="Cash flow note" subtitle="Reading the collections figure">
                  <div className="space-y-3 text-[11px] leading-5 text-muted">
                    <p>An invoice raises the amount owed; only a payment becomes collected revenue. The gap between the two is what the front desk should chase.</p>
                    <p>Outstanding balances include everything still open, even invoices raised before the selected period, so they can be larger than the period's gap.</p>
                    <p>Use the aging buckets to decide who to call first: 61 days and older is usually the point where a polite reminder stops working.</p>
                    <div className="flex items-center gap-1.5 pt-1 text-[10px] text-faint"><Wallet size={12} /> Void invoices are excluded throughout.</div>
                  </div>
                </SectionCard>
              </div>
            </>
          )}

          {tab === 'patients' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ReportKpi label="Unique patients" value={formatNumber(uniquePatients)} hint={`${visits} visits across the period`} icon={<Users size={16} />} tone="brand" />
                <ReportKpi label="New patients" value={formatNumber(newPatients)} hint={`${pct(newPatients, Math.max(1, uniquePatients))}% of people seen`} icon={<UserPlus size={16} />} tone="amber" />
                <ReportKpi label="Returning patients" value={formatNumber(returning)} hint="Seen before this period" icon={<Stethoscope size={16} />} tone="blue" />
                <ReportKpi label="Visits per patient" value={uniquePatients ? (visits / uniquePatients).toFixed(1) : '0.0'} hint="A measure of continuity" icon={<Activity size={16} />} tone="green" />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Age distribution" subtitle="Patients seen in the period">
                  <BarList items={ageRows} format={(n) => `${n} patient${n === 1 ? '' : 's'}`} emptyLabel="No patient ages recorded" />
                </SectionCard>
                <SectionCard title="Sex distribution" subtitle="Recorded at registration">
                  {sexRows.length ? (
                    <Donut
                      segments={sexRows.map((s, i) => ({
                        label: s.sex,
                        value: Number(s.n),
                        color: ['#4f7fab', '#c9885b', '#8d8f8c'][i % 3],
                      }))}
                      centerLabel="patients"
                      centerValue={uniquePatients}
                    />
                  ) : (
                    <div className="py-10 text-center text-[11.5px] text-faint">No patient demographics recorded.</div>
                  )}
                </SectionCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Payer mix" subtitle="Insurance provider for patients seen">
                  <BarList items={payerRows} format={(n) => `${n} patient${n === 1 ? '' : 's'}`} emptyLabel="No insurer information recorded" />
                </SectionCard>
                <SectionCard title="New registrations" subtitle="Monthly growth">
                  {growth.length ? <BarList items={growth.map((g) => ({ label: g.label, value: g.value }))} format={(n) => `${n} new`} /> : <div className="py-8 text-center text-[11.5px] text-faint">No registrations recorded yet.</div>}
                </SectionCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <SectionCard title="Patient care summary" subtitle="Continuity in the period">
                  <div className="space-y-0.5 text-[11.5px]">
                    <MetricRow label="Unique patients" value={uniquePatients} />
                    <MetricRow label="New patients" value={newPatients} />
                    <MetricRow label="Returning patients" value={returning} />
                    <MetricRow label="Visits" value={visits} />
                    <MetricRow label="Follow-ups due" value={followUps} />
                    <MetricRow label="Prescriptions" value={prescriptions} />
                  </div>
                </SectionCard>
                <SectionCard title="Reading patient growth" subtitle="What the numbers mean">
                  <div className="space-y-3 text-[11px] leading-5 text-muted">
                    <p>A new patient is one whose record was created inside the period. A returning patient is someone seen now who had a record before it.</p>
                    <p>Growth counts registrations by month, regardless of whether the patient has been seen yet. Pair it with visits to see whether the list is active.</p>
                    <p>Age and sex mixes are drawn from the records of patients seen in the period, not the entire patient list.</p>
                  </div>
                </SectionCard>
              </div>
            </>
          )}

          <p className="flex items-center gap-1.5 border-t border-line pt-3 text-[9.5px] uppercase tracking-[0.1em] text-faint">
            <ClipboardList size={11} /> {scope === 'all' ? 'Network total' : (data?.location_name || activeLocation?.name)} · {fmtDate(startISO, 'd MMM yyyy')} – {fmtDate(new Date(endISO).toISOString(), 'd MMM yyyy')} · generated {fmtDate(new Date().toISOString(), 'd MMM yyyy')}
          </p>
        </>
      )}
    </div>
  )
}
