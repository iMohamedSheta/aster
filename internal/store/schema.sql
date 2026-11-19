-- Aster Clinic — schema v1
-- Every syncable table carries the same replication metadata:
--   clinic_id  tenant / workspace scope
--   created_at, updated_at  RFC3339 UTC
--   rev        hybrid logical clock of the newest accepted write
--   field_revs JSON map of column -> HLC, used for column-level merge
--   deleted_at soft-delete tombstone
--   origin_node device that produced the newest change
-- IDs are UUIDv7 generated on the device (time ordered, no coordination).

CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  legal_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  address_line1 TEXT NOT NULL DEFAULT '',
  address_line2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  currency TEXT NOT NULL DEFAULT 'USD',
  currency_symbol TEXT NOT NULL DEFAULT '$',
  tax_id TEXT NOT NULL DEFAULT '',
  license_number TEXT NOT NULL DEFAULT '',
  logo_data TEXT NOT NULL DEFAULT '',
  accent_color TEXT NOT NULL DEFAULT '#2a3747',
  opening_time TEXT NOT NULL DEFAULT '08:00',
  closing_time TEXT NOT NULL DEFAULT '18:00',
  slot_minutes INTEGER NOT NULL DEFAULT 30,
  work_days TEXT NOT NULL DEFAULT '1,2,3,4,5',
  prescription_footer TEXT NOT NULL DEFAULT '',
  invoice_footer TEXT NOT NULL DEFAULT '',
  tax_rate_bp INTEGER NOT NULL DEFAULT 0,
  clinic_type TEXT NOT NULL DEFAULT 'general',
  signin_mode TEXT NOT NULL DEFAULT 'picker',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'general',
  specialty TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address_line1 TEXT NOT NULL DEFAULT '',
  address_line2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  manager_id TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#2a3747',
  opening_time TEXT NOT NULL DEFAULT '08:00',
  closing_time TEXT NOT NULL DEFAULT '18:00',
  slot_minutes INTEGER NOT NULL DEFAULT 30,
  work_days TEXT NOT NULL DEFAULT '1,2,3,4,5',
  rooms INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_locations_clinic ON locations(clinic_id, deleted_at, active);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'doctor',
  title TEXT NOT NULL DEFAULT '',
  specialization TEXT NOT NULL DEFAULT '',
  license_number TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#2a3747',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  password_updated_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_staff_clinic ON staff(clinic_id, deleted_at);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  mrn TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  preferred_name TEXT NOT NULL DEFAULT '',
  sex TEXT NOT NULL DEFAULT '',
  date_of_birth TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  alt_phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  national_id TEXT NOT NULL DEFAULT '',
  blood_type TEXT NOT NULL DEFAULT '',
  marital_status TEXT NOT NULL DEFAULT '',
  occupation TEXT NOT NULL DEFAULT '',
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  insurance_provider TEXT NOT NULL DEFAULT '',
  insurance_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_mrn ON patients(clinic_id, mrn);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(clinic_id, deleted_at, last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(clinic_id, phone);
CREATE INDEX IF NOT EXISTS idx_patients_updated ON patients(clinic_id, updated_at);

CREATE TABLE IF NOT EXISTS allergies (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  patient_id TEXT NOT NULL DEFAULT '',
  allergen TEXT NOT NULL DEFAULT '',
  reaction TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'moderate',
  noted_on TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_allergies_patient ON allergies(clinic_id, patient_id, deleted_at);

CREATE TABLE IF NOT EXISTS conditions (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  patient_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  diagnosed_on TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_conditions_patient ON conditions(clinic_id, patient_id, deleted_at);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL DEFAULT '',
  start_at TEXT NOT NULL DEFAULT '',
  end_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  reason TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  checked_in_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(clinic_id, start_at, deleted_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(clinic_id, patient_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(clinic_id, provider_id, start_at);

CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL DEFAULT '',
  appointment_id TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'visit',
  status TEXT NOT NULL DEFAULT 'draft',
  chief_complaint TEXT NOT NULL DEFAULT '',
  subjective TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT '',
  assessment TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT '',
  follow_up_on TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT '',
  ended_at TEXT NOT NULL DEFAULT '',
  signed_at TEXT NOT NULL DEFAULT '',
  signed_by TEXT NOT NULL DEFAULT '',
  signed_name TEXT NOT NULL DEFAULT '',
  specialty_data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(clinic_id, patient_id, started_at);
CREATE INDEX IF NOT EXISTS idx_encounters_provider ON encounters(clinic_id, provider_id, started_at);
CREATE INDEX IF NOT EXISTS idx_encounters_updated ON encounters(clinic_id, updated_at);

CREATE TABLE IF NOT EXISTS encounter_addenda (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  encounter_id TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_addenda_encounter ON encounter_addenda(clinic_id, encounter_id, created_at);

CREATE TABLE IF NOT EXISTS vitals (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  encounter_id TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL DEFAULT '',
  measured_at TEXT NOT NULL DEFAULT '',
  systolic INTEGER NOT NULL DEFAULT 0,
  diastolic INTEGER NOT NULL DEFAULT 0,
  pulse INTEGER NOT NULL DEFAULT 0,
  temperature_c REAL NOT NULL DEFAULT 0,
  resp_rate INTEGER NOT NULL DEFAULT 0,
  spo2 INTEGER NOT NULL DEFAULT 0,
  weight_kg REAL NOT NULL DEFAULT 0,
  height_cm REAL NOT NULL DEFAULT 0,
  glucose REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vitals_encounter ON vitals(clinic_id, encounter_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_vitals_patient ON vitals(clinic_id, patient_id, measured_at);

CREATE TABLE IF NOT EXISTS diagnoses (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  encounter_id TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'primary',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_diagnoses_encounter ON diagnoses(clinic_id, encounter_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_diagnoses_patient ON diagnoses(clinic_id, patient_id, deleted_at);

CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL DEFAULT '',
  encounter_id TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  issued_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(clinic_id, patient_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter ON prescriptions(clinic_id, encounter_id);

CREATE TABLE IF NOT EXISTS prescription_items (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  prescription_id TEXT NOT NULL DEFAULT '',
  drug_name TEXT NOT NULL DEFAULT '',
  strength TEXT NOT NULL DEFAULT '',
  form TEXT NOT NULL DEFAULT '',
  dose TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT '',
  duration_days INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  instructions TEXT NOT NULL DEFAULT '',
  refills INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_rx_items ON prescription_items(clinic_id, prescription_id, deleted_at, position);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  duration_min INTEGER NOT NULL DEFAULT 30,
  active INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_services_clinic ON services(clinic_id, deleted_at, name);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL DEFAULT '',
  encounter_id TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unpaid',
  issued_at TEXT NOT NULL DEFAULT '',
  due_at TEXT NOT NULL DEFAULT '',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number ON invoices(clinic_id, number);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(clinic_id, patient_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(clinic_id, status, issued_at);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  invoice_id TEXT NOT NULL DEFAULT '',
  service_id TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_invoice_items ON invoice_items(clinic_id, invoice_id, deleted_at, position);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  invoice_id TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'cash',
  paid_at TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(clinic_id, invoice_id, deleted_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL DEFAULT '',
  assignee_id TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'clinical',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  due_on TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_tasks_open ON tasks(clinic_id, status, due_on);
CREATE INDEX IF NOT EXISTS idx_tasks_patient ON tasks(clinic_id, patient_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(clinic_id, assignee_id, status);

CREATE TABLE IF NOT EXISTS treatment_plans (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  started_on TEXT NOT NULL DEFAULT '',
  target_on TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient ON treatment_plans(clinic_id, patient_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_status ON treatment_plans(clinic_id, status, deleted_at);

CREATE TABLE IF NOT EXISTS treatment_plan_items (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  plan_id TEXT NOT NULL DEFAULT '',
  service_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  tooth TEXT NOT NULL DEFAULT '',
  phase TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned',
  completed_at TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON treatment_plan_items(clinic_id, plan_id, deleted_at, position);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'supplies',
  unit TEXT NOT NULL DEFAULT 'unit',
  quantity REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  expiry_on TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory_items(clinic_id, location_id, deleted_at, name);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory_items(clinic_id, deleted_at, name);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  vendor TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  spent_on TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'bank',
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(clinic_id, spent_on, deleted_at);
CREATE INDEX IF NOT EXISTS idx_expenses_location ON expenses(clinic_id, location_id, spent_on);

CREATE TABLE IF NOT EXISTS patient_files (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  expires_on TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT NOT NULL DEFAULT '',
  uploaded_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_patient_files_patient ON patient_files(clinic_id, patient_id, deleted_at, created_at);
CREATE INDEX IF NOT EXISTS idx_patient_files_category ON patient_files(clinic_id, category, deleted_at);
CREATE INDEX IF NOT EXISTS idx_patient_files_expiry ON patient_files(clinic_id, expires_on, deleted_at);
CREATE INDEX IF NOT EXISTS idx_patient_files_created ON patient_files(clinic_id, created_at);

-- Large documents are split into independent rows so each replication change
-- stays well below the transport limits. The patient_files row is the header;
-- it stays hidden while checksum is empty and becomes visible when the upload
-- is finished.
CREATE TABLE IF NOT EXISTS patient_file_chunks (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  location_id TEXT NOT NULL DEFAULT '',
  file_id TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL DEFAULT '',
  chunk_index INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_patient_file_chunks_file ON patient_file_chunks(file_id, deleted_at, chunk_index);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  rev TEXT NOT NULL DEFAULT '',
  field_revs TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  origin_node TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(clinic_id, at DESC);

-- Local-only tables -------------------------------------------------------

CREATE TABLE IF NOT EXISTS sync_outbox (
  change_id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  fields TEXT NOT NULL DEFAULT '{}',
  deleted INTEGER NOT NULL DEFAULT 0,
  hlc TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_outbox_created ON sync_outbox(created_at);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_label TEXT NOT NULL DEFAULT '',
  field TEXT NOT NULL,
  local_value TEXT NOT NULL DEFAULT '',
  remote_value TEXT NOT NULL DEFAULT '',
  remote_hlc TEXT NOT NULL DEFAULT '',
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_conflicts_open ON sync_conflicts(resolved_at);

CREATE TABLE IF NOT EXISTS sync_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);

-- Server-side tables (present in every install, used only when hosting) ----

CREATE TABLE IF NOT EXISTS _server_devices (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'receptionist',
  staff_id TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT '',
  revoked_at TEXT,
  cert_fingerprint TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_devices_clinic ON _server_devices(clinic_id, revoked_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_token ON _server_devices(token_hash);

CREATE TABLE IF NOT EXISTS _server_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  rev TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_changes_clinic ON _server_changes(clinic_id, seq);

CREATE TABLE IF NOT EXISTS _server_applied (
  change_id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS _server_invites (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'receptionist',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_clinic ON _server_invites(clinic_id);

CREATE TABLE IF NOT EXISTS _server_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
