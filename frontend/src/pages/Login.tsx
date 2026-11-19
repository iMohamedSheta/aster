import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, ArrowRight, Check, Cloud, Eye, EyeOff, HardDrive, KeyRound,
  Loader2, Network, ShieldCheck, UserRound,
} from 'lucide-react'
import { api } from '../lib/api'
import { roleLabel } from '../lib/AppContext'
import { cn, fullDay } from '../lib/format'
import type { BootstrapData, Staff } from '../lib/types'
import { AsterMark } from '../components/Logo'
import { Avatar } from '../components/ui'

const roleRank: Record<string, number> = {
  owner: 0, doctor: 1, nurse: 2, receptionist: 3, accountant: 4,
}

function modeMeta(mode: string) {
  switch (mode) {
    case 'lan_host':
    case 'lan_client':
      return { label: 'Clinic network · Host', Icon: Network }
    case 'cloud':
      return { label: 'Aster Cloud · Synced', Icon: Cloud }
    default:
      return { label: 'Local workspace', Icon: HardDrive }
  }
}

function isActive(s: Staff) {
  return Number(s.active ?? 1) !== 0
}

function hasPassword(s: Staff | null | undefined) {
  return Boolean(s) && Number(s?.has_password ?? 0) === 1
}

/**
 * Password sign-in. The clinic manager appears first in the account picker,
 * but any active account can be chosen. When the clinic prefers typed
 * usernames, the same credentials are entered without showing the team.
 */
export function Login({ data, onSignedIn }: { data: BootstrapData; onSignedIn: (d: BootstrapData) => void }) {
  const accounts = useMemo(() => {
    return data.staff
      .filter(isActive)
      .slice()
      .sort((a, b) => {
        const rank = (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9)
        return rank || a.full_name.localeCompare(b.full_name)
      })
  }, [data.staff])

  const setup = data.needsAccessSetup
  const byUsername = data.signInMode === 'username' && !setup
  const managerDefault = data.defaultStaffId || accounts.find((s) => s.role === 'owner')?.id || accounts[0]?.id || ''

  const [selected, setSelected] = useState(managerDefault)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!accounts.some((s) => s.id === selected)) setSelected(managerDefault)
  }, [accounts, managerDefault, selected])

  const mode = modeMeta(data.mode)
  const chosen = accounts.find((s) => s.id === selected) ?? null
  const chosenReady = hasPassword(chosen)

  function switchAccount(id: string) {
    if (busy || id === selected) return
    setSelected(id)
    setPassword('')
    setError('')
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (busy) return
    setError('')

    if (setup) {
      if (password.length < 8) {
        setError('Use at least 8 characters for the password.')
        return
      }
      if (password !== confirm) {
        setError('The two passwords do not match.')
        return
      }
    } else if (byUsername) {
      if (!username.trim()) {
        setError('Enter your username.')
        return
      }
      if (!password) {
        setError('Enter your password.')
        return
      }
    } else {
      if (!chosen) {
        setError('Choose an account to continue.')
        return
      }
      if (!chosenReady) {
        setError('This account has no password yet. Ask the clinic manager to set one.')
        return
      }
      if (!password) {
        setError('Enter your password.')
        return
      }
    }

    setBusy(true)
    try {
      let next: BootstrapData
      if (setup) next = await api.setupManagerAccess(username, password)
      else if (byUsername) next = await api.signInWithPassword(username, password)
      else next = await api.signInAccount(selected, password)
      onSignedIn(next)
    } catch (err: any) {
      setError(String(err?.message ?? err))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  const heading = setup ? 'Set up manager access' : 'Welcome back'
  const blurb = setup
    ? 'This database was created before passwords existed. Give the clinic manager a username and password to protect it — this happens once.'
    : byUsername
      ? 'Enter your clinic username and password to open the workspace.'
      : 'Choose your account, then enter its password to open the clinic workspace.'

  return (
    <div className="paper-grid relative min-h-0 flex-1 overflow-y-auto bg-canvas">
      <div className="relative mx-auto flex min-h-full w-full max-w-[1060px] items-center px-5 py-8 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-xl border border-line-strong bg-surface shadow-lift lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <aside className="ink-spine relative hidden flex-col justify-between overflow-hidden p-8 text-white lg:flex">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div
                className="absolute inset-0 opacity-[0.5]"
                style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 55px, rgba(255,255,255,0.045) 55px 56px)' }}
              />
              <AsterMark size={320} inverse className="absolute -bottom-24 -end-24 opacity-[0.035]" />
            </div>

            <div className="relative flex items-center gap-2.5">
              <AsterMark size={34} inverse />
              <span className="flex items-baseline gap-2 leading-none" dir="ltr">
                <span className="text-[19px] font-semibold tracking-[-0.02em] text-white">Aster</span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-accent-300">Clinic</span>
              </span>
            </div>

            <div className="relative mt-10">
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="h-px w-6 bg-accent-500" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-accent-300">Clinic workspace</span>
              </div>
              <h1 className="mt-4 max-w-[300px] text-[31px] font-semibold leading-[1.16] tracking-[-0.035em] text-white">
                Care starts with a calm workspace.
              </h1>
              <p className="mt-3 max-w-[290px] text-[12px] leading-6 text-white/55">
                Patient records, appointments and billing together — quiet, quick and ready when the day begins.
              </p>

              <ul className="mt-8 divide-y divide-white/10 border-y border-white/10">
                {['Patient records and history', 'Appointments and visits', 'Billing, invoices and reports'].map((item, index) => (
                  <li key={item} className="flex items-center gap-3 py-3 text-[11px] text-white/65">
                    <span className="font-mono text-[9px] tabular-nums text-accent-400">{String(index + 1).padStart(2, '0')}</span>
                    <span className="flex-1">{item}</span>
                    <Check size={11} strokeWidth={2.6} className="text-accent-400" />
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mt-10 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/55">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {data.clinic?.name || 'Your clinic'}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10.5px] text-white/45">
                <mode.Icon size={11} className="shrink-0 text-accent-400" />
                <span className="truncate">{mode.label}</span>
              </div>
              <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-white/30">{fullDay()}</div>
            </div>
          </aside>

          <section className="flex min-w-0 flex-col justify-center p-6 sm:p-8 lg:p-10">
            <div className="lg:hidden">
              <div className="mb-7 flex items-center gap-2.5">
                <AsterMark size={30} />
                <span className="flex items-baseline gap-2 leading-none">
                  <span className="text-[16px] font-semibold tracking-[-0.02em] text-ink">Aster</span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-faint">Clinic</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span aria-hidden className="h-px w-5 bg-accent-600" />
              <span className="eyebrow">{setup ? 'First-time access' : 'Sign in'}</span>
            </div>

            <h2 className="mt-3 text-[27px] font-semibold leading-[1.15] tracking-[-0.035em] text-ink">
              {heading}
            </h2>
            <p className="mt-2 max-w-[400px] text-[12px] leading-5 text-muted">
              {blurb}
            </p>

            <form className="mt-6" onSubmit={submit}>
              {setup && (
                <div className="rounded-xl border border-accent-200/70 bg-accent-50/60 p-3 text-[11.5px] leading-5 text-accent-900 dark:border-accent-800/50 dark:bg-accent-900/20 dark:text-accent-200">
                  The manager account is <span className="font-semibold">{chosen?.full_name || 'the clinic owner'}</span>. Choose credentials only you know.
                </div>
              )}

              {!setup && !byUsername && (
                <div className="mt-0">
                  <div className="flex items-end justify-between gap-3">
                    <span className="field-label !mb-2">Account</span>
                    <span className="mb-2 text-[10px] tabular-nums text-faint">
                      {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
                    </span>
                  </div>

                  <div role="radiogroup" aria-label="Team accounts" className="grid gap-1.5 sm:grid-cols-2">
                    {accounts.map((member) => {
                      const isChosen = member.id === selected
                      const isManager = member.role === 'owner'
                      const ready = hasPassword(member)
                      return (
                        <button
                          key={member.id}
                          type="button"
                          role="radio"
                          aria-checked={isChosen}
                          disabled={busy || !ready}
                          onClick={() => switchAccount(member.id)}
                          className={cn(
                            'group relative flex min-w-0 items-center gap-2.5 rounded-md border p-2.5 text-start transition',
                            isChosen
                              ? 'border-accent-400 bg-accent-50/70 dark:border-accent-700 dark:bg-accent-900/20'
                              : 'border-line bg-surface hover:border-line-strong hover:bg-elevated/60',
                            !ready && 'cursor-not-allowed opacity-55 hover:border-line',
                          )}
                        >
                          {isChosen && <span aria-hidden className="absolute inset-y-1.5 start-0 w-[2px] rounded-full bg-accent-600" />}
                          <Avatar name={member.full_name} color={member.color} size={30} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[11.5px] font-semibold text-ink">{member.full_name}</span>
                              {isManager && (
                                <span className="badge shrink-0 rounded-[3px] border border-accent-300/60 bg-accent-100/70 px-1 py-px text-[7.5px] font-semibold uppercase tracking-[0.1em] text-accent-800 dark:border-accent-700/60 dark:bg-accent-900/40 dark:text-accent-200">
                                  Manager
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[9.5px] text-faint">
                              {ready ? roleLabel(member.role) : 'No password yet'}
                              {member.username && ready ? ` · @${member.username}` : ''}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border transition',
                              isChosen
                                ? 'border-accent-600 bg-accent-600 text-white'
                                : 'border-line-strong bg-surface text-transparent group-hover:border-accent-300',
                            )}
                          >
                            <Check size={10} strokeWidth={3.2} />
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {accounts.length === 0 && (
                    <div className="rounded-xl border border-dashed border-line px-4 py-7 text-center text-[11.5px] leading-5 text-faint">
                      No active team accounts are available.
                    </div>
                  )}
                </div>
              )}

              {!setup && byUsername && (
                <div>
                  <label className="field-label !mb-2" htmlFor="signin-username">Username</label>
                  <div className="relative">
                    <UserRound size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
                    <input
                      id="signin-username"
                      autoFocus
                      autoComplete="username"
                      spellCheck={false}
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); setError('') }}
                      placeholder="e.g. maya.chen"
                      disabled={busy}
                      className="dir-ltr h-11 w-full rounded-lg border border-line bg-surface ps-9 pe-3.5 text-[13px] text-ink outline-none transition placeholder:text-faint focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15 disabled:opacity-60"
                    />
                  </div>
                </div>
              )}

              {!setup && (
                <div className={cn(byUsername ? 'mt-3.5' : 'mt-4')}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <label className="field-label !mb-0" htmlFor="signin-password">Password</label>
                    {!byUsername && chosen?.username && (
                      <span className="text-[10px] text-faint">@{chosen.username}</span>
                    )}
                  </div>
                  <div className="relative">
                    <KeyRound size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
                    <input
                      id="signin-password"
                      type={showPassword ? 'text' : 'password'}
                      autoFocus={!byUsername}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError('') }}
                      placeholder="Enter your password"
                      disabled={busy}
                      className="h-11 w-full rounded-lg border border-line bg-surface ps-9 pe-11 text-[13px] text-ink outline-none transition placeholder:text-faint focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-faint transition hover:bg-elevated hover:text-ink"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {setup && (
                <>
                  <div className="mt-4">
                    <label className="field-label !mb-2" htmlFor="setup-username">Username</label>
                    <div className="relative">
                      <UserRound size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
                      <input
                        id="setup-username"
                        autoFocus
                        autoComplete="username"
                        spellCheck={false}
                        value={username}
                        onChange={(e) => { setUsername(e.target.value); setError('') }}
                        placeholder="e.g. manager"
                        disabled={busy}
                        className="dir-ltr h-11 w-full rounded-lg border border-line bg-surface ps-9 pe-3.5 text-[13px] text-ink outline-none transition placeholder:text-faint focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15 disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div className="mt-3.5">
                    <label className="field-label !mb-2" htmlFor="setup-password">Password</label>
                    <div className="relative">
                      <KeyRound size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
                      <input
                        id="setup-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError('') }}
                        placeholder="At least 8 characters"
                        disabled={busy}
                        className="h-11 w-full rounded-lg border border-line bg-surface ps-9 pe-11 text-[13px] text-ink outline-none transition placeholder:text-faint focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15 disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-faint transition hover:bg-elevated hover:text-ink"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3.5">
                    <label className="field-label !mb-2" htmlFor="setup-confirm">Confirm password</label>
                    <div className="relative">
                      <KeyRound size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
                      <input
                        id="setup-confirm"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => { setConfirm(e.target.value); setError('') }}
                        placeholder="Repeat the password"
                        disabled={busy}
                        className="h-11 w-full rounded-lg border border-line bg-surface ps-9 pe-3.5 text-[13px] text-ink outline-none transition placeholder:text-faint focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15 disabled:opacity-60"
                      />
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11.5px] leading-5 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || (!setup && !byUsername && !chosen)}
                className="group mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-accent-700 bg-accent-600 px-4 text-[13px] font-semibold text-white shadow-soft transition hover:bg-accent-500 active:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                {busy ? 'Signing in…' : setup ? 'Save and open clinic' : 'Sign in'}
                {!busy && <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />}
              </button>
            </form>

            <p className="mt-4 flex items-start gap-2 text-[10.5px] leading-5 text-faint">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-accent-600 dark:text-accent-400" />
              <span>
                {byUsername
                  ? 'Ask the clinic manager if you have forgotten your username or password.'
                  : 'Passwords are checked on this device. Sign out at any time to return to this screen.'}
              </span>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
