import type {
  Appointment, BootstrapData, Clinic, ClinicLocation, ClinicTask, DashboardData, DataInfo, DeviceRow,
  Encounter, EncounterDetailData, Expense, HostStatus, InventoryItem, Invoice, NetworkOverview, Patient,
  PatientDetailData, PatientFile, Prescription, ReportData, Service, Staff, SyncActivityRow, SyncStatus,
  TreatmentPlan, TreatmentPlanDetailData,
} from './types'

declare global {
  interface Window {
    go?: any
    runtime?: any
  }
}

function bridge(): any {
  const app = window.go?.main?.App
  if (!app) {
    throw new Error('Aster backend is not available. Run the desktop app with `wails dev`.')
  }
  return app
}

async function call<T>(method: string, ...args: any[]): Promise<T> {
  const app = bridge()
  const fn = app[method]
  if (typeof fn !== 'function') throw new Error(`Missing backend method: ${method}`)
  return fn(...args) as Promise<T>
}

export const api = {
  bootstrap: () => call<BootstrapData>('Bootstrap'),
  completeOnboarding: (input: any) => call<BootstrapData>('CompleteOnboarding', input),
  signInAccount: (id: string, password: string) => call<BootstrapData>('SignInAccount', id, password),
  signInWithPassword: (username: string, password: string) => call<BootstrapData>('SignInWithPassword', username, password),
  setupManagerAccess: (username: string, password: string) => call<BootstrapData>('SetupManagerAccess', username, password),
  signOut: () => call<BootstrapData>('SignOut'),
  setSignInMode: (mode: string) => call<void>('SetSignInMode', mode),
  setStaffCredentials: (id: string, username: string, password: string) => call<Staff>('SetStaffCredentials', id, username, password),
  changeOwnPassword: (current: string, next: string) => call<void>('ChangeOwnPassword', current, next),
  setTheme: (theme: string) => call<void>('SetTheme', theme),
  openExternal: (url: string) => call<void>('OpenExternal', url),

  clinic: () => call<Clinic>('Clinic'),
  saveClinic: (fields: any) => call<Clinic>('SaveClinic', fields),
  dashboard: (start: string, end: string) => call<DashboardData>('Dashboard', start, end),
  reports: (start: string, end: string, locationId = '') => call<ReportData>('Reports', start, end, locationId),
  audit: (limit = 150) => call<any[]>('Audit', limit),

  locations: () => call<ClinicLocation[]>('Locations'),
  location: (id: string) => call<ClinicLocation>('Location', id),
  saveLocation: (fields: any) => call<ClinicLocation>('SaveLocation', fields),
  archiveLocation: (id: string) => call<void>('ArchiveLocation', id),
  setActiveLocation: (id: string) => call<BootstrapData>('SetActiveLocation', id),
  networkOverview: (start: string, end: string) => call<NetworkOverview>('NetworkOverview', start, end),
  tasks: (filter = 'open') => call<ClinicTask[]>('Tasks', filter),
  task: (id: string) => call<ClinicTask>('Task', id),
  saveTask: (fields: any) => call<ClinicTask>('SaveTask', fields),
  setTaskStatus: (id: string, status: string) => call<ClinicTask>('SetTaskStatus', id, status),
  saveExport: (filename: string, content: string) => call<{ path: string; name: string }>('SaveExport', filename, content),
  treatmentPlans: (patientId = '', status = '') => call<TreatmentPlan[]>('TreatmentPlans', patientId, status),
  treatmentPlan: (id: string) => call<TreatmentPlanDetailData>('TreatmentPlan', id),
  saveTreatmentPlan: (fields: any) => call<TreatmentPlan>('SaveTreatmentPlan', fields),
  saveTreatmentPlanItem: (fields: any) => call<any>('SaveTreatmentPlanItem', fields),
  setTreatmentPlanItemStatus: (id: string, status: string) => call<any>('SetTreatmentPlanItemStatus', id, status),
  inventory: (filter = 'all') => call<InventoryItem[]>('Inventory', filter),
  inventorySummary: (locationId = '') => call<any>('InventorySummary', locationId),
  saveInventoryItem: (fields: any) => call<InventoryItem>('SaveInventoryItem', fields),
  adjustStock: (itemId: string, kind: string, quantity: number, reason = '') => call<InventoryItem>('AdjustStock', itemId, kind, quantity, reason),
  expenses: (from: string, to: string, locationId = '') => call<Expense[]>('Expenses', from, to, locationId),
  saveExpense: (fields: any) => call<Expense>('SaveExpense', fields),

  patients: (query = '', status = 'all', limit = 200) => call<Patient[]>('Patients', query, status, limit),
  patient: (id: string) => call<PatientDetailData>('Patient', id),
  createPatient: (input: any) => call<Patient>('CreatePatient', input),
  updatePatient: (id: string, input: any) => call<Patient>('UpdatePatient', id, input),
  archivePatient: (id: string) => call<void>('ArchivePatient', id),
  patientFiles: (patientID = '', query = '', category = '') =>
    call<PatientFile[]>('PatientFiles', patientID, query, category),
  recentPatientFiles: (limit = 6) => call<PatientFile[]>('RecentPatientFiles', limit),
  filesOverview: () => call<{ documents: number; bytes: number; expiring: number; expired: number }>('FilesOverview'),
  uploadPatientFile: (input: any) => call<PatientFile>('UploadPatientFile', input),
  beginPatientFileUpload: (input: any) => call<PatientFile>('BeginPatientFileUpload', input),
  appendPatientFileChunk: (id: string, index: number, dataBase64: string) =>
    call<void>('AppendPatientFileChunk', id, index, dataBase64),
  finishPatientFileUpload: (id: string) => call<PatientFile>('FinishPatientFileUpload', id),
  abortPatientFileUpload: (id: string) => call<void>('AbortPatientFileUpload', id),
  updatePatientFile: (id: string, fields: any) => call<PatientFile>('UpdatePatientFile', id, fields),
  archivePatientFile: (id: string) => call<void>('ArchivePatientFile', id),
  patientFileContent: (id: string) => call<{ id: string; content: string; file_name: string; mime: string; title: string; size_bytes: number; too_large?: boolean }>('PatientFileContent', id),
  openPatientFile: (id: string) => call<void>('OpenPatientFile', id),
  savePatientFileAs: (id: string) => call<{ saved: boolean; path?: string; name?: string }>('SavePatientFileAs', id),
  saveAllergy: (fields: any) => call<any>('SaveAllergy', fields),
  saveCondition: (fields: any) => call<any>('SaveCondition', fields),
  deleteEntity: (entity: string, id: string) => call<void>('DeleteEntity', entity, id),

  appointments: (start: string, end: string, providerId = '') => call<Appointment[]>('Appointments', start, end, providerId),
  createAppointment: (input: any) => call<Appointment>('CreateAppointment', input),
  updateAppointment: (id: string, patch: any) => call<Appointment>('UpdateAppointment', id, patch),
  setAppointmentStatus: (id: string, status: string) => call<Appointment>('SetAppointmentStatus', id, status),

  encounters: (patientId = '', providerId = '', limit = 100) => call<Encounter[]>('Encounters', patientId, providerId, limit),
  encounter: (id: string) => call<EncounterDetailData>('Encounter', id),
  saveEncounter: (input: any) => call<Encounter>('SaveEncounter', input),
  signEncounter: (id: string) => call<Encounter>('SignEncounter', id),
  addAddendum: (id: string, body: string) => call<any>('AddAddendum', id, body),
  saveVitals: (encounterId: string, fields: any) => call<any>('SaveVitals', encounterId, fields),
  saveDiagnosis: (encounterId: string, fields: any) => call<any>('SaveDiagnosis', encounterId, fields),

  prescriptions: (patientId = '') => call<Prescription[]>('Prescriptions', patientId),
  prescription: (id: string) => call<Prescription>('Prescription', id),
  createPrescription: (input: any) => call<Prescription>('CreatePrescription', input),
  updatePrescriptionStatus: (id: string, status: string) => call<Prescription>('UpdatePrescriptionStatus', id, status),

  services: () => call<Service[]>('Services'),
  saveService: (fields: any) => call<Service>('SaveService', fields),
  invoices: (filter = 'all') => call<Invoice[]>('Invoices', filter),
  invoice: (id: string) => call<Invoice>('Invoice', id),
  createInvoice: (input: any) => call<Invoice>('CreateInvoice', input),
  addPayment: (input: any) => call<Invoice>('AddPayment', input),
  voidInvoice: (id: string) => call<Invoice>('VoidInvoice', id),

  staff: () => call<Staff[]>('Staff'),
  saveStaff: (fields: any) => call<Staff>('SaveStaff', fields),

  hostStatus: () => call<HostStatus>('HostStatus'),
  startHosting: (port: number) => call<HostStatus>('StartHosting', port),
  stopHosting: () => call<BootstrapData>('StopHosting'),
  createPairingCode: (role: string) => call<HostStatus>('CreatePairingCode', role),
  discoverHosts: () => call<any[]>('DiscoverHosts'),
  testServer: (url: string) => call<any>('TestServer', url),
  joinWorkspace: (input: any) => call<BootstrapData>('JoinWorkspace', input),
  createCloudWorkspace: (input: any) => call<BootstrapData>('CreateCloudWorkspace', input),
  disconnectSync: () => call<BootstrapData>('DisconnectSync'),
  syncStatus: () => call<SyncStatus>('SyncStatus'),
  syncNow: () => call<any>('SyncNow'),
  syncActivity: (limit = 60) => call<SyncActivityRow[]>('SyncActivity', limit),
  clearSyncActivity: () => call<void>('ClearSyncActivity'),
  conflicts: () => call<any[]>('Conflicts'),
  resolveConflict: (id: string, action: 'keep_local' | 'keep_remote') => call<BootstrapData>('ResolveConflict', id, action),
  devices: () => call<DeviceRow[]>('Devices'),
  revokeDevice: (id: string) => call<void>('RevokeDevice', id),

  dataInformation: () => call<DataInfo>('DataInformation'),
  backupNow: () => call<DataInfo>('BackupNow'),
  exportJSON: () => call<{ path: string }>('ExportJSON'),
}

export function onEvent(name: string, cb: (data: any) => void): () => void {
  const rt = window.runtime
  if (!rt?.EventsOn) return () => {}
  const cancel = rt.EventsOn(name, cb)
  return () => {
    if (typeof cancel === 'function') cancel()
    else if (rt.EventsOff) rt.EventsOff(name)
  }
}

export const appWindow = {
  minimize: () => window.runtime?.WindowMinimise?.(),
  toggleMaximise: () => window.runtime?.WindowToggleMaximise?.(),
  close: () => window.runtime?.Quit?.(),
}
