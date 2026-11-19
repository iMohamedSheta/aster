import { createContext, useContext } from 'react'
import type { BootstrapData, Clinic, ClinicLocation, Staff } from './types'
import type { AccentId, ElevationId, RadiusId, SidebarId } from './appearance'

export interface AppContextValue {
  data: BootstrapData
  clinic: Clinic | null
  staff: Staff[]
  currentStaff: Staff | null
  locations: ClinicLocation[]
  activeLocation: ClinicLocation | null
  currency: string
  refresh: () => Promise<void> | void
  setBootstrap: (d: BootstrapData) => void
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  accent: AccentId
  setAccent: (accent: AccentId) => void
  grid: boolean
  setGrid: (grid: boolean) => void
  radius: RadiusId
  setRadius: (radius: RadiusId) => void
  elevation: ElevationId
  setElevation: (elevation: ElevationId) => void
  sidebar: SidebarId
  setSidebar: (sidebar: SidebarId) => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppContext')
  return ctx
}

export function useCurrency() {
  const { clinic } = useApp()
  return clinic?.currency_symbol || '$'
}

export function useIsClinician() {
  const { currentStaff } = useApp()
  return ['owner', 'doctor', 'nurse'].includes(currentStaff?.role ?? '')
}

export function useIsOwner() {
  const { currentStaff } = useApp()
  return currentStaff?.role === 'owner'
}

export function roleLabel(role?: string) {
  switch (role) {
    case 'owner': return 'Clinic manager'
    case 'doctor': return 'Physician'
    case 'nurse': return 'Nurse'
    case 'receptionist': return 'Front desk'
    case 'accountant': return 'Billing'
    default: return role ?? ''
  }
}
