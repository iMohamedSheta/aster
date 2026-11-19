import { useState } from 'react'
import {
  ArrowLeft, ArrowRight, Check, Cloud, Cpu, Eye, EyeOff, HardDrive, KeyRound, Loader2, Lock, Network,
  Search, UserRound, Wifi,
} from 'lucide-react'
import { api } from '../lib/api'
import type { BootstrapData } from '../lib/types'
import { clinicPack, clinicPacks } from '../lib/clinicPacks'
import { cn } from '../lib/format'
import { AsterMark } from '../components/Logo'
import { Button, Field, Input, Select } from '../components/ui'
import { useToast } from '../components/Toast'

const currencies = [
  { code: 'EGP', symbol: 'E£', label: 'Egyptian pound' },
  { code: 'USD', symbol: '$', label: 'US dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'Pound sterling' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian dollar' },
  { code: 'AUD', symbol: 'A$', label: 'Australian dollar' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE dirham' },
  { code: 'SAR', symbol: 'ر.س', label: 'Saudi riyal' },
  { code: 'INR', symbol: '₹', label: 'Indian rupee' },
  { code: 'BRL', symbol: 'R$', label: 'Brazilian real' },
  { code: 'ZAR', symbol: 'R', label: 'South African rand' },
]

const timezones = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Karachi',
  'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
]

type Mode = 'local' | 'network' | 'cloud'

const modeCards: { value: Mode; title: string; badge?: string; body: string; icon: any }[] = [
  {
    value: 'local',
    title: 'Just this computer',
    badge: 'Recommended',
    body: 'No account and no network. Every record stays in a private database on this machine.',
    icon: HardDrive,
  },
  {
    value: 'network',
    title: 'Join a clinic network',
    body: 'Connect to a workspace hosted on another computer in your clinic. You keep working if the network drops.',
    icon: Network,
  },
  {
    value: 'cloud',
    title: 'Aster Cloud',
    body: 'Sync between locations through a server you or your provider run. Offline edits catch up automatically.',
    icon: Cloud,
  },
]

export function Onboarding({ initial, onDone }: { initial: BootstrapData; onDone: (d: BootstrapData) => void }) {
  const toast = useToast()
  const [step, setStep] = useState(1)
  const [clinicName, setClinicName] = useState('')
  const [clinicType, setClinicType] = useState('family')
  const [ownerName, setOwnerName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [currency, setCurrency] = useState('EGP')
  const [timezone, setTimezone] = useState('Africa/Cairo')
  const [mode, setMode] = useState<Mode>('local')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [serverURL, setServerURL] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joinRole, setJoinRole] = useState('doctor')
  const [deviceName, setDeviceName] = useState(initial.deviceName || 'This computer')
  const [cloudTab, setCloudTab] = useState<'create' | 'join'>('create')
  const [cloudClinic, setCloudClinic] = useState('')
  const [cloudOwner, setCloudOwner] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<any[]>([])

  const symbol = currencies.find((c) => c.code === currency)?.symbol ?? '$'
  const usernameOK = /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username.trim().toLowerCase())
  const passwordOK = password.length >= 8
  const localReady = clinicName.trim().length > 0 && ownerName.trim().length > 0
    && usernameOK && passwordOK && password === confirm

  async function discover() {
    setDiscovering(true)
    setError('')
    try {
      const found = await api.discoverHosts()
      setDiscovered(found ?? [])
      if (!found?.length) setError('No Aster workspace answered on this network. Check that hosting is started on the other computer.')
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setDiscovering(false)
    }
  }

  async function finishLocal() {
    if (!localReady) {
      setError('Enter the clinic name, your name, and manager credentials of at least 8 characters.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const next = await api.completeOnboarding({
        clinicName: clinicName.trim(),
        clinicType,
        ownerName: ownerName.trim(),
        username: username.trim().toLowerCase(),
        password,
        currency,
        currencySymbol: symbol,
        timezone,
      })
      toast.success('Manager account created', 'Sign in with your new username and password to open the clinic.')
      onDone(next)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function finishNetwork() {
    if (!serverURL.trim() || !joinCode.trim()) {
      setError('Enter the workspace address and pairing code.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const next = await api.joinWorkspace({
        url: serverURL.trim(),
        code: joinCode.trim().toUpperCase(),
        staffName: joinName.trim() || ownerName.trim() || 'Clinic user',
        deviceName,
        role: joinRole,
        keepLocal: false,
        mode: 'lan_client',
      })
      toast.success('Connected to the clinic', next.workspace || next.clinic?.name)
      onDone(next)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function finishCloud() {
    if (!serverURL.trim()) {
      setError('Enter the Aster Cloud server address.')
      return
    }
    setBusy(true)
    setError('')
    try {
      let next: BootstrapData
      if (cloudTab === 'join') {
        if (!joinCode.trim()) {
          setError('Enter the workspace code.')
          setBusy(false)
          return
        }
        next = await api.joinWorkspace({
          url: serverURL.trim(),
          code: joinCode.trim().toUpperCase(),
          staffName: joinName.trim() || ownerName.trim() || 'Clinic user',
          deviceName,
          role: joinRole,
          keepLocal: false,
          mode: 'cloud',
        })
      } else {
        next = await api.createCloudWorkspace({
          url: serverURL.trim(),
          clinicName: cloudClinic.trim() || clinicName.trim() || 'My clinic',
          ownerName: cloudOwner.trim() || ownerName.trim() || 'Clinic owner',
          deviceName,
        })
      }
      toast.success('Cloud workspace connected', next.workspace || next.clinic?.name)
      onDone(next)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const primary = () => {
    if (mode === 'local') finishLocal()
    else if (mode === 'network') finishNetwork()
    else finishCloud()
  }

  return (
    <div className="flex min-h-0 flex-1 bg-canvas">
      <div className="relative hidden w-[42%] min-w-[380px] flex-col justify-between overflow-hidden bg-brand-950 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-[0.09]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="pointer-events-none absolute -end-32 -top-32 h-[420px] w-[420px] rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -start-24 h-[380px] w-[380px] rounded-full bg-accent-500/20 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <AsterMark size={38} />
            <div>
              <div className="text-[19px] font-semibold leading-none">Aster</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-200/70">Clinic</div>
            </div>
          </div>
        </div>

        <div className="relative max-w-[420px]">
          <h1 className="text-[38px] font-semibold leading-[1.12] tracking-[-0.03em]">
            The calm centre<br />of your clinic day.
          </h1>
          <p className="mt-4 max-w-[360px] text-[14px] leading-6 text-brand-100/75">
            Patients, appointments, visits and billing in one private workspace — built to keep working when the internet does not.
          </p>
          <div className="mt-9 space-y-3.5">
            {[
              ['One record, end to end', 'From the first phone call to the paid invoice.'],
              ['Local-first by design', 'Your database lives on your computers, not someone else’s.'],
              ['Grow when you are ready', 'Add a second room, a second site, or cloud sync.'],
            ].map(([title, body]) => (
              <div key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/25 text-brand-100">
                  <Check size={12} strokeWidth={2.5} />
                </span>
                <div>
                  <div className="text-[12.5px] font-semibold text-white">{title}</div>
                  <div className="mt-0.5 text-[11.5px] leading-5 text-brand-100/60">{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-[10.5px] text-brand-100/45">
          <Lock size={12} /> No account required. No patient data leaves this computer unless you connect a workspace.
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[620px] flex-1 flex-col px-8 py-9 sm:px-12">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-semibold', step === 1 ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200')}>
                {step > 1 ? <Check size={11} /> : '1'} <span>Your clinic</span>
              </div>
              <div className="h-px w-6 bg-line" />
              <div className={cn('flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-semibold', step === 2 ? 'bg-brand-700 text-white' : 'bg-elevated text-faint')}>
                2 <span>How you work</span>
              </div>
            </div>
            <span className="text-[10.5px] text-faint">Step {step} of 2</span>
          </div>

          {step === 1 ? (
            <div className="animate-fade-in">
              <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.025em] text-ink">Let’s set up your clinic.</h2>
              <p className="mt-2 max-w-[460px] text-[13px] leading-6 text-muted">
                Two details are enough to begin. You can refine the address, hours and branding later in settings.
              </p>

              <div className="mt-7 space-y-4">
                <Field label="Clinic name">
                  <Input autoFocus value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="Northside Family Clinic" className="h-11 text-[14px]" />
                </Field>
                <Field label="Clinic type" hint="Sets the note template, service list and specialty fields. You can change it later.">
                  <Select value={clinicType} onChange={(e) => setClinicType(e.target.value)} className="h-11 text-[13px]">
                    {clinicPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.label}</option>)}
                  </Select>
                </Field>
                <div className="-mt-1 flex items-start gap-2 rounded-lg bg-elevated/60 px-3 py-2 text-[10.5px] leading-4 text-muted">
                  <span className="mt-0.5 block h-2 w-2 shrink-0 rounded-full" style={{ background: clinicPack(clinicType).color }} />
                  <span><span className="font-semibold text-ink">{clinicPack(clinicType).label}</span> — {clinicPack(clinicType).description}</span>
                </div>
                <Field label="Your name" hint="You will be recorded as the clinic owner and first clinician.">
                  <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Dr. Maya Chen" className="h-11 text-[14px]" />
                </Field>

                <div className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-ink">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                      <KeyRound size={13} />
                    </span>
                    Manager sign-in
                    <span className="ml-auto flex items-center gap-1 text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint">
                      <UserRound size={10} /> Clinic manager
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10.5px] leading-5 text-muted">
                    This creates the clinic manager account. You will use these credentials on the sign-in screen next. Other team members get their own accounts later.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Username" className="col-span-2" hint="3–32 characters: letters, numbers, dots, dashes or underscores.">
                      <Input
                        autoComplete="username"
                        spellCheck={false}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="manager"
                        className="dir-ltr h-10"
                      />
                    </Field>
                    <Field label="Password">
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="8+ characters"
                          className="h-10 pe-9"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute end-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:bg-elevated hover:text-ink"
                        >
                          {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </Field>
                    <Field label="Confirm password">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Repeat the password"
                        className="h-10"
                      />
                    </Field>
                  </div>
                  {confirm.length > 0 && password !== confirm && (
                    <p className="mt-2 text-[10.5px] text-rose-600 dark:text-rose-300">The two passwords do not match.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Currency">
                    <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      {currencies.map((c) => <option key={c.code} value={c.code}>{c.label} ({c.symbol})</option>)}
                    </Select>
                  </Field>
                  <Field label="Time zone">
                    <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      {[timezone, ...timezones.filter((t) => t !== timezone)].map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </Select>
                  </Field>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between gap-4 pt-8">
                <span className="flex items-center gap-1.5 text-[10.5px] text-faint">
                  <Cpu size={12} /> Runs entirely on this computer
                </span>
                <Button variant="primary" size="lg" disabled={!localReady} onClick={() => { setError(''); setStep(2) }}>
                  Continue <ArrowRight size={15} />
                </Button>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in">
              <button onClick={() => { setStep(1); setError('') }} className="mb-4 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted transition hover:text-ink">
                <ArrowLeft size={13} /> Back to clinic details
              </button>
              <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.025em] text-ink">How will you work?</h2>
              <p className="mt-2 max-w-[480px] text-[13px] leading-6 text-muted">
                Start alone and connect later without moving your records. The same application works in every mode.
              </p>

              <div className="mt-6 space-y-2">
                {modeCards.map((card) => {
                  const Icon = card.icon
                  const active = mode === card.value
                  return (
                    <button
                      key={card.value}
                      onClick={() => { setMode(card.value); setError('') }}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl border p-3.5 text-start transition',
                        active
                          ? 'border-brand-500 bg-brand-50/70 shadow-sm dark:border-brand-600 dark:bg-brand-900/25'
                          : 'border-line bg-surface hover:border-brand-200 dark:hover:border-brand-800',
                      )}
                    >
                      <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', active ? 'bg-brand-700 text-white' : 'bg-elevated text-muted')}>
                        <Icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-ink">{card.title}</span>
                          {card.badge && <span className="rounded-full bg-brand-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.07em] text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">{card.badge}</span>}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] leading-5 text-muted">{card.body}</span>
                      </span>
                      <span className={cn('mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line')}>
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                    </button>
                  )
                })}
              </div>

              {mode === 'network' && (
                <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-ink">Connect to the clinic workspace</span>
                    <button onClick={discover} disabled={discovering} className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-brand-700 hover:underline disabled:opacity-50 dark:text-brand-300">
                      {discovering ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />} Find nearby
                    </button>
                  </div>
                  {discovered.length > 0 && (
                    <div className="space-y-1">
                      {discovered.map((h) => (
                        <button
                          key={`${h.address}-${h.port}`}
                          onClick={() => setServerURL(`${h.secure ? 'https' : 'http'}://${h.address}:${h.port}`)}
                          className="flex w-full items-center gap-2 rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-start text-[11px] hover:border-brand-300"
                        >
                          <Wifi size={12} className="text-brand-600" />
                          <span className="flex-1 truncate font-medium text-ink">{h.name}</span>
                          <span className="text-[10px] text-faint">{h.address}:{h.port}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Workspace address" className="col-span-2">
                      <Input value={serverURL} onChange={(e) => setServerURL(e.target.value)} placeholder="https://192.168.1.20:47821" />
                    </Field>
                    <Field label="Pairing code">
                      <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="AB12-CD34" className="font-mono tracking-[0.12em]" />
                    </Field>
                    <Field label="Your role">
                      <Select value={joinRole} onChange={(e) => setJoinRole(e.target.value)}>
                        <option value="doctor">Physician</option>
                        <option value="nurse">Nurse</option>
                        <option value="receptionist">Front desk</option>
                        <option value="accountant">Billing</option>
                      </Select>
                    </Field>
                    <Field label="Your name on this device">
                      <Input value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="Your name" />
                    </Field>
                    <Field label="This computer’s name">
                      <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
                    </Field>
                  </div>
                  <p className="text-[10px] leading-4 text-faint">Ask the clinic owner to open Settings → Connectivity → Create pairing code.</p>
                </div>
              )}

              {mode === 'cloud' && (
                <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4 animate-fade-in">
                  <div className="flex items-center gap-1 rounded-lg bg-elevated p-0.5">
                    {(['create', 'join'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setCloudTab(tab)}
                        className={cn('flex-1 rounded-[7px] px-3 py-1.5 text-[11px] font-medium transition', cloudTab === tab ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
                      >
                        {tab === 'create' ? 'Create a workspace' : 'Join with a code'}
                      </button>
                    ))}
                  </div>
                  <Field label="Aster Cloud server">
                    <Input value={serverURL} onChange={(e) => setServerURL(e.target.value)} placeholder="https://cloud.yourprovider.com" />
                  </Field>
                  {cloudTab === 'create' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Workspace name">
                        <Input value={cloudClinic} onChange={(e) => setCloudClinic(e.target.value)} placeholder={clinicName || 'Northside Family Clinic'} />
                      </Field>
                      <Field label="Owner name">
                        <Input value={cloudOwner} onChange={(e) => setCloudOwner(e.target.value)} placeholder={ownerName || 'Dr. Maya Chen'} />
                      </Field>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Workspace code">
                        <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="AB12-CD34" className="font-mono tracking-[0.12em]" />
                      </Field>
                      <Field label="Your name">
                        <Input value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="Your name" />
                      </Field>
                    </div>
                  )}
                  <Field label="This computer’s name">
                    <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
                  </Field>
                  <p className="text-[10px] leading-4 text-faint">Aster Cloud uses the same encrypted sync protocol as a local clinic network. Your data also stays on this device.</p>
                </div>
              )}

              <div className="mt-auto flex items-center justify-between gap-4 pt-7">
                <span className="flex items-center gap-1.5 text-[10.5px] text-faint">
                  {mode === 'local' ? <HardDrive size={12} /> : <Network size={12} />}
                  {mode === 'local' ? 'You will sign in as the clinic manager next' : 'Your records stay available offline'}
                </span>
                <Button variant="primary" size="lg" onClick={primary} loading={busy}>
                  {mode === 'local' ? 'Create my clinic' : mode === 'network' ? 'Join workspace' : cloudTab === 'create' ? 'Create workspace' : 'Join workspace'}
                  {!busy && <ArrowRight size={15} />}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[11.5px] leading-5 text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">
              {error}
            </div>
          )}

          <div className="mt-8 border-t border-line pt-4 text-[10px] leading-4 text-faint">
            Aster stores clinical data in an encrypted-at-rest-capable SQLite file on this computer. You are responsible for backups and access to the device.
          </div>
        </div>
      </div>
    </div>
  )
}
