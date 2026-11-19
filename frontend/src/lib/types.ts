export type ID = string

export interface Clinic {
  id: string
  clinic_id: string
  name: string
  legal_name: string
  phone: string
  email: string
  website: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  country: string
  postal_code: string
  timezone: string
  currency: string
  currency_symbol: string
  tax_id: string
  license_number: string
  logo_data: string
  accent_color: string
  opening_time: string
  closing_time: string
  slot_minutes: number
  work_days: string
  prescription_footer: string
  invoice_footer: string
  tax_rate_bp: number
  clinic_type?: string
  [key: string]: any
}

export interface ClinicLocation {
  id: string
  clinic_id: string
  name: string
  code: string
  type: string
  specialty: string
  phone: string
  email: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  country: string
  postal_code: string
  timezone: string
  manager_id: string
  manager_name?: string
  color: string
  opening_time: string
  closing_time: string
  slot_minutes: number
  work_days: string
  rooms: number
  active: number | boolean
  notes: string
  patient_count?: number
  staff_count?: number
  visit_count?: number
  outstanding_cents?: number
  [key: string]: any
}

export interface ClinicTask {
  id: string
  location_id: string
  patient_id: string
  assignee_id: string
  created_by: string
  title: string
  notes: string
  category: string
  priority: 'urgent' | 'high' | 'normal' | 'low' | string
  status: 'open' | 'in_progress' | 'done' | 'cancelled' | string
  due_on: string
  completed_at: string
  location_name?: string
  location_color?: string
  first_name?: string
  last_name?: string
  mrn?: string
  assignee_name?: string
  created_by_name?: string
  [key: string]: any
}

export interface TreatmentPlan {
  id: string
  patient_id: string
  provider_id: string
  title: string
  status: 'draft' | 'active' | 'completed' | 'cancelled' | string
  started_on: string
  target_on: string
  completed_at: string
  notes: string
  location_id: string
  location_name?: string
  location_color?: string
  first_name?: string
  last_name?: string
  mrn?: string
  provider_name?: string
  provider_color?: string
  item_count?: number
  completed_count?: number
  total_cents?: number
  completed_cents?: number
  [key: string]: any
}

export interface TreatmentPlanItem {
  id: string
  plan_id: string
  service_id: string
  name: string
  tooth: string
  phase: string
  quantity: number
  unit_price_cents: number
  total_cents: number
  status: 'planned' | 'scheduled' | 'completed' | 'cancelled' | string
  completed_at: string
  position: number
  notes: string
  [key: string]: any
}

export interface TreatmentPlanDetailData {
  plan: TreatmentPlan
  items: TreatmentPlanItem[]
}

export interface InventoryItem {
  id: string
  location_id: string
  name: string
  sku: string
  category: string
  unit: string
  quantity: number
  reorder_level: number
  unit_cost_cents: number
  supplier: string
  expiry_on: string
  active: number | boolean
  notes: string
  location_name?: string
  location_color?: string
  stock_state?: 'ok' | 'low' | 'out' | string
  expiring?: number
  [key: string]: any
}

export interface Expense {
  id: string
  location_id: string
  category: string
  vendor: string
  description: string
  amount_cents: number
  spent_on: string
  method: string
  reference: string
  notes: string
  location_name?: string
  location_color?: string
  created_by_name?: string
  [key: string]: any
}

export interface Staff {
  id: string
  full_name: string
  role: 'owner' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | string
  title: string
  specialization: string
  license_number: string
  phone: string
  email: string
  color: string
  active: number
  notes?: string
  username?: string
  has_password?: number | boolean
  [key: string]: any
}

export interface Patient {
  id: string
  mrn: string
  first_name: string
  last_name: string
  preferred_name: string
  sex: string
  date_of_birth: string
  phone: string
  alt_phone: string
  email: string
  address: string
  city: string
  national_id: string
  blood_type: string
  marital_status: string
  occupation: string
  emergency_contact_name: string
  emergency_contact_phone: string
  insurance_provider: string
  insurance_number: string
  notes: string
  status: string
  created_at: string
  location_id?: string
  location_name?: string
  location_color?: string
  last_visit_at?: string
  next_appointment_at?: string
  balance_cents?: number
  [key: string]: any
}

export interface PatientFile {
  id: string
  patient_id: string
  encounter_id: string
  category: string
  title: string
  file_name: string
  mime: string
  size_bytes: number
  checksum: string
  notes: string
  expires_on: string
  uploaded_by: string
  uploaded_by_name: string
  location_id: string
  created_at: string
  updated_at: string
  first_name?: string
  last_name?: string
  preferred_name?: string
  mrn?: string
  sex?: string
  date_of_birth?: string
  phone?: string
  [key: string]: any
}

export interface Appointment {
  id: string
  patient_id: string
  provider_id: string
  start_at: string
  end_at: string
  status: string
  reason: string
  room: string
  notes: string
  checked_in_at: string
  first_name?: string
  last_name?: string
  mrn?: string
  date_of_birth?: string
  phone?: string
  provider_name?: string
  provider_color?: string
  encounter_id?: string
  [key: string]: any
}

export interface Encounter {
  id: string
  patient_id: string
  appointment_id: string
  provider_id: string
  type: string
  status: 'draft' | 'signed' | string
  chief_complaint: string
  subjective: string
  objective: string
  assessment: string
  plan: string
  follow_up_on: string
  started_at: string
  ended_at: string
  signed_at: string
  signed_by: string
  signed_name: string
  first_name?: string
  last_name?: string
  mrn?: string
  date_of_birth?: string
  provider_name?: string
  provider_color?: string
  diagnosis_count?: number
  [key: string]: any
}

export interface Prescription {
  id: string
  patient_id: string
  encounter_id: string
  provider_id: string
  status: string
  issued_at: string
  notes: string
  first_name?: string
  last_name?: string
  mrn?: string
  provider_name?: string
  item_count?: number
  items?: PrescriptionItem[]
  patient?: Patient
  provider?: Staff
  clinic?: Clinic
  [key: string]: any
}

export interface PrescriptionItem {
  id?: string
  drug_name: string
  strength: string
  form: string
  dose: string
  frequency: string
  duration_days: number
  quantity: number
  instructions: string
  refills: number
  position?: number
}

export interface Invoice {
  id: string
  patient_id: string
  encounter_id: string
  number: string
  status: string
  issued_at: string
  due_at: string
  subtotal_cents: number
  discount_cents: number
  tax_cents: number
  total_cents: number
  paid_cents: number
  notes: string
  first_name?: string
  last_name?: string
  mrn?: string
  item_count?: number
  items?: InvoiceItem[]
  payments?: Payment[]
  patient?: Patient
  clinic?: Clinic
  [key: string]: any
}

export interface InvoiceItem {
  id?: string
  service_id?: string
  description: string
  quantity: number
  unit_price_cents: number
  total_cents?: number
}

export interface Payment {
  id: string
  invoice_id: string
  amount_cents: number
  method: string
  paid_at: string
  reference: string
  notes: string
  [key: string]: any
}

export interface Service {
  id: string
  name: string
  code: string
  category: string
  price_cents: number
  duration_min: number
  active: number
  description: string
  [key: string]: any
}

export interface SyncStatus {
  mode: string
  state: 'local' | 'offline' | 'syncing' | 'synced' | 'error' | string
  serverUrl: string
  workspace: string
  deviceName: string
  lastSyncAt: string
  pending: number
  cursor: number
  conflicts: number
  error: string
  serverLabel: string
}

export interface HostStatus {
  running: boolean
  urls: string[]
  pairingCode: string
  pairingRole: string
  expiresAt: string
  fingerprint: string
  port: number
  error: string
}

export interface BootstrapData {
  version: string
  appName: string
  tagline?: string
  onboarded: boolean
  signedIn: boolean
  signInMode: 'picker' | 'username' | string
  needsAccessSetup: boolean
  defaultStaffId: string
  clinic: Clinic | null
  staff: Staff[]
  currentStaff: Staff | null
  locations?: ClinicLocation[]
  activeLocationId?: string
  activeLocation?: ClinicLocation | null
  clinicType?: string
  mode: string
  sync: SyncStatus
  host: HostStatus
  conflicts: number
  startRoute: string
  theme: string
  locale?: string
  serverUrl: string
  workspace: string
  deviceName: string
  dataDir: string
  serverInfo?: any
}

export interface PatientDetailData {
  patient: Patient
  allergies: any[]
  conditions: any[]
  encounters: Encounter[]
  appointments: Appointment[]
  prescriptions: Prescription[]
  invoices: Invoice[]
  vitals: any[]
  stats: {
    visits: number
    active_prescriptions: number
    outstanding_cents: number
    last_visit_at: string
    [key: string]: any
  }
}

export interface EncounterDetailData {
  encounter: Encounter
  patient: Patient
  vitals: any
  diagnoses: any[]
  prescriptions: Prescription[]
  addenda: any[]
  allergies: any[]
}

export interface DashboardData {
  appointments_today: number
  waiting: number
  completed: number
  new_patients_month: number
  outstanding_cents: number
  month_revenue_cents: number
  month_expenses_cents?: number
  low_stock?: number
  out_of_stock?: number
  stock_value_cents?: number
  today: Appointment[]
  followups: any[]
  unpaid: Invoice[]
  recent_patients: Patient[]
  draft_visits: any[]
  tasks?: ClinicTask[]
  tasks_open?: number
  tasks_due?: number
  tasks_overdue?: number
}

export interface DashboardStats {
  [key: string]: any
}

export interface SyncActivityRow {
  id: number
  at: string
  kind: string
  status: string
  message: string
  detail: string
}

export interface DeviceRow {
  id: string
  clinicId: string
  name: string
  role: string
  staffId: string
  createdAt: string
  lastSeenAt: string
  revokedAt: string
  certFingerprint: string
}

export interface DataInfo {
  dbPath: string
  dbSize: number
  backupDir: string
  lastBackup: string
  dataDir: string
}

export interface ReportData {
  clinic_name: string
  clinic_type: string
  currency: string
  currency_symbol: string
  location_name: string
  location_id: string
  revenue_cents: number
  invoiced_cents: number
  outstanding_cents: number
  expenses_cents: number
  net_cents: number
  visits: number
  appointments: number
  completed: number
  cancelled: number
  no_shows: number
  new_patients: number
  unique_patients: number
  returning_patients: number
  unsigned_notes: number
  prescriptions: number
  follow_ups_due: number
  avg_wait_minutes: number
  avg_visit_minutes: number
  revenue_by_day: { day: string; cents: number }[]
  invoiced_by_day: { day: string; cents: number }[]
  status_counts: { status: string; n: number }[]
  top_diagnoses: { description: string; n: number }[]
  provider_load: {
    id: string; full_name: string; color: string; visits: number;
    unique_patients?: number; signed?: number; avg_minutes?: number; revenue_cents?: number;
  }[]
  patient_growth: { month: string; n: number }[]
  revenue_by_method: { method: string; cents: number; n: number }[]
  revenue_by_service: { label: string; cents: number; n: number }[]
  expenses_by_category: { label: string; cents: number; n: number }[]
  revenue_by_location: { id: string; name: string; color: string; cents: number }[]
  visits_by_weekday: { weekday: number; n: number }[]
  visits_by_hour: { hour: number; n: number }[]
  payer_mix: { label: string; n: number }[]
  age_bands: { band: string; n: number }[]
  sex_mix: { sex: string; n: number }[]
  outstanding_aging: { bucket: string; cents: number; n: number }[]
}

export interface NetworkOverview {
  network_name: string
  clinic_type: string
  locations: (ClinicLocation & Partial<ReportData>)[]
  totals: ReportData
  inventory?: { items: number; low_stock: number; out_of_stock: number; expiring: number; stock_value_cents: number }
  alerts: { tone: string; location: string; title: string; detail: string }[]
  trend: { day: string; cents: number }[]
  range_start: string
  range_end: string
}
