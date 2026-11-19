import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Minus, RefreshCw, Square, X } from 'lucide-react'
import { api, appWindow, onEvent } from './lib/api'
import { AppContext } from './lib/AppContext'
import { useLocale } from './lib/LocaleContext'
import { hasStoredLocale, normalizeLocale } from './lib/i18n'
import { applyAppearance, persistAppearance, readAppearance, type AccentId, type Appearance, type ElevationId, type RadiusId, type SidebarId } from './lib/appearance'
import type { BootstrapData } from './lib/types'
import { cn } from './lib/format'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { StatusBar } from './components/StatusBar'
import { CommandPalette } from './components/CommandPalette'
import { AsterMark, Wordmark } from './components/Logo'
import { Button, Spinner } from './components/ui'
import { Onboarding } from './pages/Onboarding'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Patients } from './pages/Patients'
import { PatientDetail } from './pages/PatientDetail'
import { Appointments } from './pages/Appointments'
import { Visits } from './pages/Visits'
import { EncounterEditor } from './pages/Encounter'
import { Prescriptions } from './pages/Prescriptions'
import { Billing } from './pages/Billing'
import { Reports } from './pages/Reports'
import { Network } from './pages/Network'
import { Tasks } from './pages/Tasks'
import { TreatmentPlans } from './pages/TreatmentPlans'
import { Inventory } from './pages/Inventory'
import { Expenses } from './pages/Expenses'
import { Files } from './pages/Files'
import { Settings } from './pages/Settings'
import { PrintPrescription } from './pages/PrintPrescription'
import { PrintInvoice } from './pages/PrintInvoice'

function Splash({ slow }: { slow?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-canvas">
      <div className="flex flex-col items-center animate-fade-in">
        <AsterMark size={46} />
        <div className="mt-3"><Wordmark /></div>
        <div className="mt-6 flex items-center gap-2 text-[11.5px] text-muted">
          <Spinner />
          {slow ? 'Preparing the clinic workspace…' : 'Opening your records…'}
        </div>
      </div>
      <div className="absolute bottom-6 text-[10px] text-faint">Local-first clinic workspace</div>
    </div>
  )
}

function BackendUnavailable({ error }: { error: unknown }) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="wails-drag flex h-9 items-center justify-between border-b border-line bg-surface px-3">
        <div className="flex items-center gap-2"><AsterMark size={20} /><span className="text-[12px] font-semibold text-ink">Aster</span></div>
        <div className="wails-no-drag flex">
          <button onClick={() => appWindow.minimize()} className="flex h-9 w-10 items-center justify-center text-muted hover:bg-elevated"><Minus size={14} /></button>
          <button onClick={() => appWindow.toggleMaximise()} className="flex h-9 w-10 items-center justify-center text-muted hover:bg-elevated"><Square size={11} /></button>
          <button onClick={() => appWindow.close()} className="flex h-9 w-10 items-center justify-center text-muted hover:bg-[#d93a40] hover:text-white"><X size={14} /></button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="card w-full max-w-[520px] p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            <AlertTriangle size={19} />
          </div>
          <h1 className="mt-4 text-[20px] font-semibold text-ink">The clinic backend did not answer.</h1>
          <p className="mt-2 text-[12.5px] leading-6 text-muted">
            Aster’s data service is normally started together with the desktop application. If you opened this page in a browser, the native bridge is unavailable.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-line bg-elevated px-3 py-2 font-mono text-[10.5px] leading-5 text-muted">
            {String((error as any)?.message ?? error ?? 'Unknown error')}
          </pre>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}><RefreshCw size={13} /> Try again</Button>
            <Button onClick={() => appWindow.close()}>Close Aster</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Shell({ onSearch }: { onSearch: () => void }) {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onSearch={onSearch} />
        <main ref={mainRef} id="main-scroll" className="paper-grid min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1480px] px-6 py-6 xl:px-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/appointments" element={<Appointments />} />
              <Route path="/patients" element={<Patients />} />
              <Route path="/patients/:id" element={<PatientDetail />} />
              <Route path="/visits" element={<Visits />} />
              <Route path="/visits/:id" element={<EncounterEditor />} />
              <Route path="/files" element={<Files />} />
              <Route path="/prescriptions" element={<Prescriptions />} />
              <Route path="/treatment-plans" element={<TreatmentPlans />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/network" element={<Network />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Navigate to="/settings/clinic" replace />} />
              <Route path="/settings/:tab" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
        <StatusBar onSearch={onSearch} />
      </div>
    </div>
  )
}

export default function App() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const { locale, setLocale } = useLocale()
  const startApplied = useRef(false)
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system')
  const [appearance, setAppearanceState] = useState<Appearance>(() => readAppearance())
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const [slow, setSlow] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const boot = useQuery<BootstrapData>({
    queryKey: ['bootstrap'],
    queryFn: () => api.bootstrap(),
    staleTime: 30_000,
    retry: 0,
  })

  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 1800)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (boot.data?.theme) setThemeState(boot.data.theme as any)
  }, [boot.data?.theme])

  // A deployment default (--locale) applies only until the person picks a
  // language on this device.
  useEffect(() => {
    if (!boot.data?.locale || hasStoredLocale()) return
    const next = normalizeLocale(boot.data.locale)
    if (next !== locale) setLocale(next)
  }, [boot.data?.locale, locale, setLocale])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    setSystemDark(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  const effectiveTheme: 'light' | 'dark' = theme === 'dark' || (theme === 'system' && systemDark) ? 'dark' : 'light'

  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark')
  }, [effectiveTheme])

  useEffect(() => {
    applyAppearance(appearance)
  }, [appearance])

  const updateAppearance = (next: Partial<Appearance>) => {
    setAppearanceState((prev) => {
      const merged = { ...prev, ...next }
      persistAppearance(merged)
      return merged
    })
  }
  const setAccent = (accent: AccentId) => updateAppearance({ accent })
  const setGrid = (grid: boolean) => updateAppearance({ grid })
  const setRadius = (radius: RadiusId) => updateAppearance({ radius })
  const setElevation = (elevation: ElevationId) => updateAppearance({ elevation })
  const setSidebar = (sidebar: SidebarId) => updateAppearance({ sidebar })

  const setTheme = (next: 'light' | 'dark' | 'system') => {
    setThemeState(next)
    api.setTheme(next).catch(() => {})
    qc.setQueryData<BootstrapData>(['bootstrap'], (old) => (old ? { ...old, theme: next } : old))
  }

  useEffect(() => {
    const offData = onEvent('data:changed', (ev) => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]) !== 'bootstrap' })
      if (ev?.entity === 'clinics' || ev?.entity === 'staff') {
        qc.invalidateQueries({ queryKey: ['bootstrap'] })
      }
    })
    const offSync = onEvent('sync:status', (s) => {
      qc.setQueryData<BootstrapData>(['bootstrap'], (old) => (old ? { ...old, sync: s, conflicts: s?.conflicts ?? old.conflicts } : old))
      qc.invalidateQueries({ queryKey: ['sync-activity'] })
      qc.invalidateQueries({ queryKey: ['conflicts'] })
    })
    return () => {
      offData()
      offSync()
    }
  }, [qc])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!boot.data?.onboarded || startApplied.current) return
    const route = boot.data.startRoute
    if (route && route.startsWith('/')) {
      startApplied.current = true
      navigate(route, { replace: true })
    }
  }, [boot.data?.onboarded, boot.data?.startRoute, navigate])

  const setBootstrap = (d: BootstrapData) => qc.setQueryData(['bootstrap'], d)
  const refresh = async () => {
    const next = await api.bootstrap()
    qc.setQueryData(['bootstrap'], next)
  }

  const value = useMemo(() => ({
    data: boot.data as BootstrapData,
    clinic: (boot.data?.clinic ?? null) as any,
    staff: (boot.data?.staff ?? []) as any[],
    currentStaff: (boot.data?.currentStaff ?? null) as any,
    locations: (boot.data?.locations ?? []) as any[],
    activeLocation: (boot.data?.activeLocation ?? null) as any,
    currency: boot.data?.clinic?.currency_symbol || '$',
    refresh,
    setBootstrap,
    theme,
    setTheme,
    accent: appearance.accent,
    setAccent,
    grid: appearance.grid,
    setGrid,
    radius: appearance.radius,
    setRadius,
    elevation: appearance.elevation,
    setElevation,
    sidebar: appearance.sidebar,
    setSidebar,
  }), [boot.data, theme, appearance])

  if (boot.isPending) return <Splash slow={slow} />
  if (boot.isError || !boot.data) return <BackendUnavailable error={boot.error} />

  const data = boot.data
  const printing = location.pathname.startsWith('/print/')

  return (
    <AppContext.Provider value={value}>
      <div key={locale} className={cn('flex h-full flex-col bg-canvas text-ink', !data.onboarded && 'overflow-hidden')}>
        <TitleBar data={data} theme={effectiveTheme} onToggleTheme={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')} />
        {!data.onboarded ? (
          <Onboarding initial={data} onDone={async (next) => {
            setBootstrap(next)
            await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]) !== 'bootstrap' })
          }} />
        ) : !data.signedIn ? (
          <Login data={data} onSignedIn={async (next) => {
            setBootstrap(next)
            navigate('/', { replace: true })
            await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]) !== 'bootstrap' })
          }} />
        ) : printing ? (
          <main className="min-h-0 flex-1 overflow-y-auto bg-[#f0f0ec]">
            <Routes>
              <Route path="/print/prescriptions/:id" element={<PrintPrescription />} />
              <Route path="/print/invoices/:id" element={<PrintInvoice />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        ) : (
          <>
            <Shell onSearch={() => setPaletteOpen(true)} />
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
          </>
        )}
      </div>
    </AppContext.Provider>
  )
}
