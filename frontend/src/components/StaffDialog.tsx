import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import { roleLabel, useIsOwner } from '../lib/AppContext'
import type { Staff } from '../lib/types'
import { Button, Field, Input, Sheet, Select, Textarea, Toggle } from './ui'
import { useToast } from './Toast'

const colors = ['#2a3747', '#526379', '#a85833', '#7d5a78', '#c4506d', '#9c8455', '#6b5a45', '#2f6d9e']

export function StaffDialog({
  open, onClose, member, onSaved,
}: {
  open: boolean
  onClose: () => void
  member?: Staff | null
  onSaved?: (staff: Staff) => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const isOwner = useIsOwner()
  const [form, setForm] = useState<any>({
    full_name: '', role: 'doctor', title: '', specialization: '', license_number: '',
    phone: '', email: '', color: colors[0], active: true, notes: '',
  })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      full_name: member?.full_name ?? '',
      role: member?.role ?? 'doctor',
      title: member?.title ?? '',
      specialization: member?.specialization ?? '',
      license_number: member?.license_number ?? '',
      phone: member?.phone ?? '',
      email: member?.email ?? '',
      color: member?.color || colors[0],
      active: member ? Number(member.active ?? 1) !== 0 : true,
      notes: member?.notes ?? '',
    })
    setUsername(member?.username ?? '')
    setPassword('')
    setConfirm('')
    setShowPassword(false)
    setError('')
  }, [open, member?.id])

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) {
      setError('A name is required.')
      return
    }
    if (isOwner && password && password.length < 8) {
      setError('Use at least 8 characters for the password.')
      return
    }
    if (isOwner && password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload: any = {
        id: member?.id ?? '',
        full_name: form.full_name.trim(),
        role: form.role,
        title: form.title,
        specialization: form.specialization,
        license_number: form.license_number,
        phone: form.phone,
        email: form.email,
        color: form.color,
        active: form.active ? 1 : 0,
        notes: form.notes,
      }
      if (isOwner) {
        payload.username = username.trim()
        if (password) payload.password = password
      }
      const saved = await api.saveStaff(payload)
      toast.success(member ? 'Team member updated' : 'Team member added', form.full_name)
      await qc.invalidateQueries()
      onSaved?.(saved as Staff)
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
      title={member ? 'Edit team member' : 'Add a team member'}
      description="Roles determine what each person can do in the clinic workspace."
      size="md"
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="staff-form" loading={saving}>Save</Button>
        </>
      )}
    >
      <form id="staff-form" onSubmit={submit} className="space-y-3.5">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name"><Input autoFocus value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Dr. Maya Chen" /></Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => set('role', e.target.value)}>
              <option value="owner">Clinic manager</option>
              <option value="doctor">Physician</option>
              <option value="nurse">Nurse</option>
              <option value="receptionist">Front desk</option>
              <option value="accountant">Billing</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title"><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Family medicine" /></Field>
          <Field label="Specialization"><Input value={form.specialization} onChange={(e) => set('specialization', e.target.value)} placeholder="Family Medicine" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        </div>
        <Field label="License / registration"><Input value={form.license_number} onChange={(e) => set('license_number', e.target.value)} /></Field>

        {isOwner && (
          <div className="rounded-xl border border-line bg-elevated/50 p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                <KeyRound size={13} />
              </span>
              <span className="text-[11.5px] font-semibold text-ink">Sign-in access</span>
              <span className="ms-auto rounded-full border border-line bg-surface px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.07em] text-faint">
                Manager only
              </span>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-5 text-muted">
              A username and password let this person sign in on a clinic computer.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Username" className="col-span-2" hint="Letters, numbers, dots, dashes or underscores.">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="e.g. maya.chen"
                  spellCheck={false}
                  autoComplete="off"
                  className="dir-ltr"
                />
              </Field>
              <Field label="New password" hint={member?.has_password ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={member?.has_password ? 'Unchanged' : 'Set a password'}
                    autoComplete="new-password"
                    className="pe-9"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute end-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:bg-surface hover:text-ink"
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm password">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat the password"
                  autoComplete="new-password"
                />
              </Field>
            </div>
          </div>
        )}
        <Field label="Calendar colour">
          <div className="flex flex-wrap items-center gap-2">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set('color', c)}
                className={`h-6 w-6 rounded-full border-2 transition ${form.color === c ? 'border-ink' : 'border-transparent'}`}
                style={{ background: c }}
                aria-label={`Use colour ${c}`}
              />
            ))}
            <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
          </div>
        </Field>
        <Field label="Notes"><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="min-h-[56px]" /></Field>
        <Toggle checked={form.active} onChange={(v) => set('active', v)} label="Active" description={`${roleLabel(form.role)} can be selected for appointments and visits.`} />
      </form>
    </Sheet>
  )
}
