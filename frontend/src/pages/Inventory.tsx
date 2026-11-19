import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowDownUp, Boxes, CalendarClock, Loader2, MoreHorizontal, PackagePlus,
  Pencil, Search, Trash2,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { cn, fmtDate, formatNumber, money, titleCase } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import type { InventoryItem } from '../lib/types'
import {
  Badge, Button, ConfirmDialog, Dropdown, EmptyState, Field, IconButton, Input, MenuItem,
  PageHeader, Select, Sheet, Tabs, Textarea,
} from '../components/ui'
import { useToast } from '../components/Toast'

type Filter = 'all' | 'low' | 'out' | 'expiring'

const categories = ['supplies', 'vaccines', 'dental', 'medication', 'equipment', 'other']

const emptyItem = {
  name: '', sku: '', category: 'supplies', unit: 'unit', quantity: '0',
  reorder_level: '0', unit_cost: '0', supplier: '', expiry_on: '', notes: '',
}

const emptyAdjust = { kind: 'received', quantity: '0', reason: '' }

export function Inventory() {
  const { clinic, locations, activeLocation } = useApp()
  const toast = useToast()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const initialFilter = (['all', 'low', 'out', 'expiring'] as Filter[]).includes(params.get('filter') as Filter)
    ? (params.get('filter') as Filter)
    : 'all'
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search, 200)
  const [itemOpen, setItemOpen] = useState(false)
  const [editID, setEditID] = useState('')
  const [form, setForm] = useState(emptyItem)
  const [saving, setSaving] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null)
  const [adjust, setAdjust] = useState(emptyAdjust)
  const [adjusting, setAdjusting] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<InventoryItem | null>(null)
  const symbol = clinic?.currency_symbol

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory', filter, activeLocation?.id],
    queryFn: () => api.inventory(filter),
  })

  const visible = useMemo(() => {
    const term = debounced.trim().toLowerCase()
    if (!term) return items
    return items.filter((i) => `${i.name} ${i.sku} ${i.category} ${i.supplier}`.toLowerCase().includes(term))
  }, [items, debounced])

  const stats = useMemo(() => {
    const all = items
    const value = all.reduce((sum, i) => sum + Number(i.quantity ?? 0) * Number(i.unit_cost_cents ?? 0), 0)
    return {
      items: all.length,
      low: all.filter((i) => i.stock_state === 'low').length,
      out: all.filter((i) => i.stock_state === 'out').length,
      expiring: all.filter((i) => i.expiring).length,
      value,
    }
  }, [items])

  function openNew() {
    setEditID('')
    setForm(emptyItem)
    setItemOpen(true)
  }

  function openEdit(item: InventoryItem) {
    setEditID(item.id)
    setForm({
      name: item.name, sku: item.sku, category: item.category, unit: item.unit,
      quantity: String(item.quantity ?? 0), reorder_level: String(item.reorder_level ?? 0),
      unit_cost: (Number(item.unit_cost_cents ?? 0) / 100).toFixed(2),
      supplier: item.supplier, expiry_on: item.expiry_on, notes: item.notes,
    })
    setItemOpen(true)
  }

  async function saveItem() {
    if (!form.name.trim()) return toast.error('Name the stock item', 'Use the label your team knows it by.')
    setSaving(true)
    try {
      const fields: any = {
        name: form.name, sku: form.sku, category: form.category, unit: form.unit,
        reorder_level: Number(form.reorder_level) || 0,
        unit_cost_cents: Math.round((Number(form.unit_cost) || 0) * 100),
        supplier: form.supplier, expiry_on: form.expiry_on, notes: form.notes,
      }
      if (editID) fields.id = editID
      else fields.quantity = Number(form.quantity) || 0
      await api.saveInventoryItem(fields)
      await qc.invalidateQueries({ queryKey: ['inventory'] })
      toast.success(editID ? 'Stock item updated' : 'Stock item added', form.name)
      setItemOpen(false)
      setEditID('')
    } catch (e: any) {
      toast.error('Could not save the stock item', String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  function openAdjust(item: InventoryItem, kind = 'received') {
    setAdjustTarget(item)
    setAdjust({ ...emptyAdjust, kind })
  }

  async function saveAdjust() {
    if (!adjustTarget) return
    const qty = Number(adjust.quantity)
    if (!Number.isFinite(qty) || qty < 0 || (adjust.kind !== 'count' && qty === 0)) {
      return toast.error('Enter a quantity', 'Use a number greater than zero.')
    }
    setAdjusting(true)
    try {
      await api.adjustStock(adjustTarget.id, adjust.kind, qty, adjust.reason)
      await qc.invalidateQueries({ queryKey: ['inventory'] })
      toast.success('Stock updated', `${adjustTarget.name} · ${titleCase(adjust.kind)}`)
      setAdjustTarget(null)
      setAdjust(emptyAdjust)
    } catch (e: any) {
      toast.error('Could not update stock', String(e?.message ?? e))
    } finally {
      setAdjusting(false)
    }
  }

  async function archiveItem() {
    if (!archiveTarget) return
    try {
      await api.deleteEntity('inventory_items', archiveTarget.id)
      await qc.invalidateQueries({ queryKey: ['inventory'] })
      toast.success('Stock item archived', archiveTarget.name)
      setArchiveTarget(null)
    } catch (e: any) {
      toast.error('Could not archive the item', String(e?.message ?? e))
    }
  }

  const adjustPreview = adjustTarget ? (() => {
    const current = Number(adjustTarget.quantity ?? 0)
    const qty = Number(adjust.quantity) || 0
    if (adjust.kind === 'received') return current + qty
    if (adjust.kind === 'used' || adjust.kind === 'wasted') return Math.max(0, current - qty)
    return qty
  })() : 0

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Inventory"
        description="Stock levels, reorder thresholds and expiry dates for the active clinic. Adjustments are kept in the audit trail."
        actions={<Button variant="primary" onClick={openNew}><PackagePlus size={14} /> Add stock item</Button>}
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        {[
          ['Tracked items', formatNumber(stats.items), <Boxes key="i" size={15} />, 'neutral'],
          ['Low stock', formatNumber(stats.low + stats.out), <AlertTriangle key="l" size={15} />, stats.low + stats.out ? 'warning' : 'neutral'],
          ['Stock value', money(stats.value, symbol), <ArrowDownUp key="v" size={15} />, 'neutral'],
          ['Expiring soon', formatNumber(stats.expiring), <CalendarClock key="e" size={15} />, stats.expiring ? 'warning' : 'neutral'],
        ].map(([label, value, icon, tone]) => (
          <div key={String(label)} className="bg-surface px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</div>
              <span className={cn('text-faint', tone === 'warning' && 'text-amber-600')}>{icon as any}</span>
            </div>
            <div className={cn('stat-value mt-1.5 text-[24px] font-semibold leading-none text-ink', tone === 'warning' && 'text-amber-700 dark:text-amber-300')}>{value as any}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: 'all', label: 'All stock' },
            { value: 'low', label: 'Low stock' },
            { value: 'out', label: 'Out of stock' },
            { value: 'expiring', label: 'Expiring' },
          ]}
        />
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items" className="h-8 w-[220px] ps-8 text-[11.5px]" />
        </div>
      </div>

      {filter !== 'all' && !isLoading && visible.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] leading-5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>These items need attention. Receive stock or record a corrected count to clear the alert.</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-line bg-surface"><Loader2 className="animate-spin text-faint" size={20} /></div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Boxes size={18} />}
          title={filter === 'all' ? 'No stock items yet' : 'Nothing matches this filter'}
          description={filter === 'all' ? 'Add the supplies your team uses so reorder alerts start working.' : 'Try another filter or clear the search.'}
          action={filter === 'all' ? <Button variant="primary" onClick={openNew}><PackagePlus size={14} /> Add stock item</Button> : undefined}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-elevated/50">
                  <th className="table-head px-4 py-2.5">Item</th>
                  <th className="table-head px-3 py-2.5">Category</th>
                  {locations.length > 1 && <th className="table-head px-3 py-2.5">Clinic</th>}
                  <th className="table-head px-3 py-2.5 text-end">On hand</th>
                  <th className="table-head px-3 py-2.5 text-end">Reorder at</th>
                  <th className="table-head px-3 py-2.5 text-end">Unit cost</th>
                  <th className="table-head px-3 py-2.5 text-end">Value</th>
                  <th className="table-head px-3 py-2.5">Expiry</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const low = item.stock_state === 'low'
                  const out = item.stock_state === 'out'
                  return (
                    <tr key={item.id} className="border-b border-line/70 last:border-0 hover:bg-elevated/30">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                            out ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300'
                              : low ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300'
                                : 'border-line bg-elevated text-faint',
                          )}>
                            <Boxes size={13} />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-medium text-ink">{item.name}</div>
                            <div className="truncate font-mono text-[9px] text-faint">{item.sku || 'No SKU'}{item.supplier ? ` · ${item.supplier}` : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-muted">{titleCase(item.category)}</td>
                      {locations.length > 1 && (
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.location_color || '#2a3747' }} />
                            <span className="max-w-[130px] truncate">{item.location_name}</span>
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-end">
                        <span className={cn('text-[12px] font-semibold tabular-nums', out ? 'text-rose-600 dark:text-rose-300' : low ? 'text-amber-700 dark:text-amber-300' : 'text-ink')}>
                          {formatNumber(Number(item.quantity))} {item.unit}
                        </span>
                        {out ? <Badge tone="error" className="ms-2">Out</Badge> : low ? <Badge tone="warning" className="ms-2">Low</Badge> : null}
                      </td>
                      <td className="px-3 py-2.5 text-end text-[11px] tabular-nums text-muted">{formatNumber(Number(item.reorder_level))}</td>
                      <td className="px-3 py-2.5 text-end text-[11px] tabular-nums text-muted">{money(Number(item.unit_cost_cents), symbol)}</td>
                      <td className="px-3 py-2.5 text-end text-[11.5px] font-medium tabular-nums text-ink">{money(Number(item.quantity) * Number(item.unit_cost_cents), symbol)}</td>
                      <td className="px-3 py-2.5">
                        {item.expiry_on ? (
                          <span className={cn('inline-flex items-center gap-1 text-[10.5px]', item.expiring ? 'text-amber-700 dark:text-amber-300' : 'text-muted')}>
                            {item.expiring && <CalendarClock size={11} />}{fmtDate(item.expiry_on, 'd MMM yyyy')}
                          </span>
                        ) : <span className="text-[10.5px] text-faint">—</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        <Dropdown
                          align="right"
                          trigger={<IconButton label="Stock item actions" className="h-7 w-7"><MoreHorizontal size={14} /></IconButton>}
                        >
                          <MenuItem icon={<ArrowDownUp size={13} />} onClick={() => openAdjust(item)}>Adjust stock</MenuItem>
                          <MenuItem icon={<Pencil size={13} />} onClick={() => openEdit(item)}>Edit item</MenuItem>
                          <div className="my-1 h-px bg-line" />
                          <MenuItem icon={<Trash2 size={13} />} danger onClick={() => setArchiveTarget(item)}>Archive</MenuItem>
                        </Dropdown>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[10px] text-faint">
            <span>{formatNumber(visible.length)} item{visible.length === 1 ? '' : 's'} in view</span>
            <span>{activeLocation?.name ?? 'All clinics'}</span>
          </div>
        </div>
      )}

      <Sheet
        open={itemOpen}
        onClose={() => setItemOpen(false)}
        title={editID ? 'Edit stock item' : 'Add stock item'}
        description={editID ? 'Quantity changes should be recorded as an adjustment so the audit trail explains them.' : 'Track the consumables and clinical stock the team counts.'}
        footer={(
          <>
            <Button onClick={() => setItemOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveItem}>{editID ? 'Save changes' : 'Add item'}</Button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Item name" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Nitrile gloves · medium" /></Field>
          <Field label="SKU"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Optional" /></Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
            </Select>
          </Field>
          <Field label="Unit"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="box, dose, pack…" /></Field>
          {!editID && <Field label="Opening quantity"><Input type="number" min="0" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>}
          <Field label="Reorder level"><Input type="number" min="0" step="0.01" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></Field>
          <Field label={`Unit cost (${clinic?.currency || 'USD'})`}><Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /></Field>
          <Field label="Supplier"><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Optional" /></Field>
          <Field label="Expiry"><Input type="date" value={form.expiry_on} onChange={(e) => setForm({ ...form, expiry_on: e.target.value })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Storage, ordering notes…" /></Field>
        </div>
      </Sheet>

      <Sheet
        open={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        title="Adjust stock"
        description={adjustTarget ? `${adjustTarget.name} · currently ${Number(adjustTarget.quantity)} ${adjustTarget.unit}` : undefined}
        footer={(
          <>
            <Button onClick={() => setAdjustTarget(null)}>Cancel</Button>
            <Button variant="primary" loading={adjusting} onClick={saveAdjust}>Record adjustment</Button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Movement" className="sm:col-span-2">
            <Select value={adjust.kind} onChange={(e) => setAdjust({ ...adjust, kind: e.target.value })}>
              <option value="received">Received — add to stock</option>
              <option value="used">Used — remove from stock</option>
              <option value="wasted">Wasted or expired — remove</option>
              <option value="count">Physical count — set exact quantity</option>
            </Select>
          </Field>
          <Field label={adjust.kind === 'count' ? 'Counted quantity' : 'Quantity'}>
            <Input type="number" min="0" step="0.01" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })} />
          </Field>
          <div className="flex flex-col justify-end">
            <div className="rounded-lg border border-line bg-elevated/60 px-3 py-2.5">
              <div className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-faint">New level</div>
              <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-ink">{Number.isFinite(adjustPreview) ? Number(adjustPreview.toFixed(2)) : 0} {adjustTarget?.unit}</div>
            </div>
          </div>
          <Field label="Reason" className="sm:col-span-2"><Input value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} placeholder="Delivery note, spillage, monthly count…" /></Field>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-elevated/60 px-3 py-2.5 text-[10.5px] leading-4 text-faint">
          <ArrowDownUp size={14} className="mt-0.5 shrink-0 text-accent-600" />
          Every adjustment is written to the audit log with the previous and new quantity.
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={archiveItem}
        title="Archive stock item?"
        description={`${archiveTarget?.name ?? 'This item'} will disappear from stock lists and alerts. Past adjustments remain in the audit log.`}
        confirmLabel="Archive item"
        tone="danger"
      />
    </div>
  )
}
