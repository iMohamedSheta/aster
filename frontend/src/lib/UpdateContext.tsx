import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, onEvent } from './api'
import type { UpdateState } from './types'
import { useToast } from '../components/Toast'

interface UpdateContextValue {
  state: UpdateState | null
  open: boolean
  busy: boolean
  openDialog: () => void
  closeDialog: () => void
  check: (manual?: boolean) => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
  setAutoCheck: (enabled: boolean) => Promise<void>
  skip: () => Promise<void>
  clearSkip: () => Promise<void>
}

const UpdateContext = createContext<UpdateContextValue | null>(null)

function errorText(err: unknown) {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return ''
}

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast()
  const [state, setState] = useState<UpdateState | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const announced = useRef('')

  useEffect(() => {
    const off = onEvent('update:state', (next: UpdateState) => setState(next))
    api.updateState().then(setState).catch(() => {})
    return off
  }, [])

  // A helper applies the update after the process exits. When the new build
  // opens, say so once instead of on every launch of the same version.
  useEffect(() => {
    if (!state?.justUpdatedFrom || !state.currentVersion) return
    const key = `aster.updateSeen.${state.currentVersion}`
    if (announced.current === key) return
    announced.current = key
    try {
      if (window.localStorage.getItem(key)) return
      window.localStorage.setItem(key, state.justUpdatedFrom)
    } catch {
      // storage can be unavailable; still show the note once per launch
    }
    toast.success('Aster updated', `Now running version ${state.currentVersion}`)
  }, [state?.justUpdatedFrom, state?.currentVersion, toast])

  const check = useCallback(async (manual = true) => {
    setBusy(true)
    try {
      const next = await api.checkForUpdates(manual)
      setState(next)
      if (!manual) return
      if (next.status === 'up-to-date') {
        toast.success('Aster is up to date', `Version ${next.currentVersion}`)
      } else if (next.status === 'available') {
        setOpen(true)
      } else if (next.status === 'unsupported') {
        toast.warning('No update for this computer', next.error)
      } else if (next.status === 'error') {
        toast.error('Could not check for updates', next.error)
      }
    } catch (err) {
      if (manual) toast.error('Could not check for updates', errorText(err))
    } finally {
      setBusy(false)
    }
  }, [toast])

  const download = useCallback(async () => {
    setBusy(true)
    try {
      const next = await api.downloadUpdate()
      setState(next)
      toast.success('Update downloaded', `Version ${next.latestVersion}`)
    } catch (err) {
      toast.error('Could not download the update', errorText(err))
    } finally {
      setBusy(false)
    }
  }, [toast])

  const install = useCallback(async () => {
    setBusy(true)
    try {
      const next = await api.installUpdate()
      setState(next)
      toast.info('Restarting Aster', 'The update will finish after the app closes.')
    } catch (err) {
      toast.error('Could not install the update', errorText(err))
    } finally {
      setBusy(false)
    }
  }, [toast])

  const setAutoCheck = useCallback(async (enabled: boolean) => {
    try {
      const next = await api.setAutoUpdate(enabled)
      setState(next)
    } catch (err) {
      toast.error('Could not change update settings', errorText(err))
    }
  }, [toast])

  const skip = useCallback(async () => {
    if (!state?.latestVersion) return
    try {
      const next = await api.skipUpdate(state.latestVersion)
      setState(next)
      setOpen(false)
      toast.info('Update skipped', `Version ${state.latestVersion}`)
    } catch (err) {
      toast.error('Could not skip this update', errorText(err))
    }
  }, [state?.latestVersion, toast])

  const clearSkip = useCallback(async () => {
    try {
      const next = await api.clearSkippedUpdate()
      setState(next)
    } catch (err) {
      toast.error('Could not change update settings', errorText(err))
    }
  }, [toast])

  const value = useMemo<UpdateContextValue>(() => ({
    state,
    open,
    busy,
    openDialog: () => setOpen(true),
    closeDialog: () => setOpen(false),
    check,
    download,
    install,
    setAutoCheck,
    skip,
    clearSkip,
  }), [state, open, busy, check, download, install, setAutoCheck, skip, clearSkip])

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}

export function useUpdate() {
  const ctx = useContext(UpdateContext)
  if (!ctx) throw new Error('useUpdate must be used inside UpdateProvider')
  return ctx
}
