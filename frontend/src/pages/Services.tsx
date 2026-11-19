import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Banknote, Clock, Layers, Pencil, Plus, Search, Stethoscope, Tag, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { cn, formatNumber, money } from '../lib/format'
import type { Service } from '../lib/types'
import {
  Badge, Button, EmptyState, IconButton, Input, PageHeader, Select,
} from '../components/ui'
import { ServiceDialog } from '../components/BillingDialogs'

export function Services() {
  const { clinic } = useApp()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [serviceOpen, setServiceOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.services() as Promise<Service[]>,
  })

  const categories = useMemo(
    () => [...new Set(services.map((svc) => svc.category?.trim() || 'Uncategorised'))].sort((a, b) => a.localeCompare(b)),
    [services],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return services.filter((svc) => {
      if (category !== 'all' && (svc.category?.trim() || 'Uncategorised') !== category) return false
      if (status === 'active' && Number(svc.active) === 0) return false
      if (status === 'inactive' && Number(svc.active) !== 0) return false
      if (!q) return true
      return [svc.name, svc.code, svc.category, svc.description].join(' ').toLowerCase().includes(q)
    })
  }, [services, category, status, query])

  const summary = useMemo(() => {
    const active = services.filter((svc) => Number(svc.active) !== 0)
    const total = active.reduce((sum, svc) => sum + Number(svc.price_cents ?? 0), 0)
    return {
      active: active.length,
      average: active.length ? Math.round(total / active.length) : 0,
      categories: categories.length,
      inactive: services.length - active.length,
    }
  }, [services, categories.length])

  function openNew() {
    setEditing(null)
    setServiceOpen(true)
  }

  function openEdit(service: Service) {
    setEditing(service)
    setServiceOpen(true)
  }

  function clearFilters() {
    setQuery('')
    setCategory('all')
    setStatus('all')
  }

  const filtered = query.trim() !== '' || category !== 'all' || status !== 'all'

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Clinic finances"
        title="Services"
        description="The price list behind invoices. Add consultations, procedures and laboratory tests once, then pick them while billing."
        actions={(
          <Button variant="primary" onClick={openNew}><Plus size={14} /> Add service</Button>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Active services', value: formatNumber(summary.active), hint: 'Available in the invoice builder', icon: Stethoscope, tone: 'amber' },
          { label: 'Categories', value: formatNumber(summary.categories), hint: 'How the catalogue is grouped', icon: Layers, tone: 'blue' },
          { label: 'Average price', value: money(summary.average, clinic?.currency_symbol), hint: 'Across active services', icon: Banknote, tone: 'brand' },
          { label: 'Not offered', value: formatNumber(summary.inactive), hint: 'Kept for historical invoices', icon: Tag, tone: 'rose' },
        ].map((card) => (
          <div key={card.label} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">{card.label}</div>
                <div className="mt-1 truncate text-[22px] font-semibold leading-tight tabular-nums tracking-[-0.02em] text-ink">{card.value}</div>
                <div className="mt-1 text-[10.5px] leading-4 text-muted">{card.hint}</div>
              </div>
              <span className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                card.tone === 'rose' && 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200',
                card.tone === 'blue' && 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200',
                card.tone === 'brand' && 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
                card.tone === 'amber' && 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
              )}>
                <card.icon size={15} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative w-full min-w-[220px] sm:w-[300px]">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services…"
              className="h-9 ps-9 pe-8"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink" aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-[180px] text-[11.5px]">
            <option value="all">All categories</option>
            {categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-elevated p-0.5">
            {[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setStatus(option.value)}
                className={cn(
                  'inline-flex h-7 items-center rounded-[7px] px-2.5 text-[11.5px] font-medium transition',
                  status === option.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="ms-auto text-[10.5px] text-faint">
            {formatNumber(rows.length)} of {formatNumber(services.length)} services
          </span>
        </div>

        {isLoading ? (
          <div className="divide-y divide-line">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-3.5">
                <div className="h-8 w-8 rounded-lg bg-elevated" />
                <div className="flex-1 space-y-1.5"><div className="h-3 w-44 rounded bg-elevated" /><div className="h-2.5 w-28 rounded bg-elevated" /></div>
                <div className="h-3 w-20 rounded bg-elevated" />
              </div>
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Tag size={18} />}
              title="No services yet"
              description="Add consultations, procedures and laboratory tests once, then pick them while invoicing."
              action={<Button variant="primary" onClick={openNew}><Plus size={14} /> Add a service</Button>}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Search size={18} />}
              title="No services match this view"
              description="Try another search term, category or status."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-elevated/50">
                  <th className="table-head px-4 py-2.5">Service</th>
                  <th className="table-head px-3 py-2.5">Category</th>
                  <th className="table-head px-3 py-2.5">Duration</th>
                  <th className="table-head px-3 py-2.5 text-end">Price</th>
                  <th className="table-head px-3 py-2.5">Status</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((svc) => {
                  const active = Number(svc.active) !== 0
                  return (
                    <tr key={svc.id} className="border-b border-line/80 transition last:border-0 hover:bg-elevated/60">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                            <Stethoscope size={14} />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-medium text-ink">{svc.name}</div>
                            <div className="truncate text-[10px] text-faint">
                              {svc.code || 'No code'}{svc.description ? ` · ${svc.description}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone="neutral">{svc.category?.trim() || 'Uncategorised'}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
                          <Clock size={12} className="text-faint" /> {formatNumber(svc.duration_min)} min
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-end text-[12px] font-semibold tabular-nums text-ink">
                        {money(svc.price_cents, clinic?.currency_symbol)}
                      </td>
                      <td className="px-3 py-2.5">
                        {active ? <Badge tone="success" dot>Active</Badge> : <Badge tone="neutral" dot>Inactive</Badge>}
                      </td>
                      <td className="px-2 py-2.5">
                        <IconButton label={`Edit ${svc.name}`} className="h-7 w-7" onClick={() => openEdit(svc)}>
                          <Pencil size={13} />
                        </IconButton>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && services.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[10.5px] text-faint">
            <span>
              {filtered ? `Filtered to ${formatNumber(rows.length)} service${rows.length === 1 ? '' : 's'}` : `${formatNumber(services.length)} services in the catalogue`}
            </span>
            <span>Prices are captured on each invoice line, so changes never rewrite issued invoices.</span>
          </div>
        )}
      </div>

      <ServiceDialog
        open={serviceOpen}
        onClose={() => { setServiceOpen(false); setEditing(null) }}
        service={editing}
      />
    </div>
  )
}
