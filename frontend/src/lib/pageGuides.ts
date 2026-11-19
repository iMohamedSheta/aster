/**
 * The in-app page guide. Every workspace page has a short explanation, a
 * typical workflow and an illustrated wireframe so a new team member can
 * understand the screen without leaving it.
 */

export type GuideFigureKind = 'workspace' | 'calendar' | 'record' | 'documents' | 'settings'

export interface GuideContent {
  key: string
  eyebrow: string
  title: string
  summary: string
  figure: GuideFigureKind
  legend: string[]
  canDo: string[]
  steps: string[]
  tip: string
}

const GUIDES: Record<string, GuideContent> = {
  dashboard: {
    key: 'dashboard',
    eyebrow: 'Workspace',
    title: 'Dashboard',
    summary: 'The first screen of the day: today’s schedule, who is waiting, the money collected and everything that needs a decision.',
    figure: 'workspace',
    legend: ['Today’s numbers at the top', 'Schedule and waiting room', 'Quick actions and alerts'],
    canDo: [
      'Check patients in, start visits and open records without leaving the page.',
      'Watch unpaid invoices, low stock and due follow-ups in one place.',
      'Use the quick actions to register a patient or book an appointment.',
    ],
    steps: [
      'Scan the waiting room and today’s schedule first.',
      'Clear overdue tasks and follow-ups before the afternoon.',
      'Open any unfinished visit and finish the clinical note.',
    ],
    tip: 'Press Ctrl K to jump to a patient, page or action from anywhere.',
  },
  appointments: {
    key: 'appointments',
    eyebrow: 'Workspace',
    title: 'Appointments',
    summary: 'The clinic calendar: book visits, move them, check patients in and keep the day’s flow visible.',
    figure: 'calendar',
    legend: ['Day and week views', 'Appointment status', 'Provider and room'],
    canDo: [
      'Book a new appointment for a new or existing patient.',
      'Move between day and week views and filter by provider.',
      'Check patients in, mark no-shows and open the visit.',
    ],
    steps: [
      'Pick the day and confirm the provider’s availability.',
      'Check in arrivals as they reach the front desk.',
      'Start the visit directly from the appointment row.',
    ],
    tip: 'Checked-in patients appear in the waiting room on the dashboard.',
  },
  patients: {
    key: 'patients',
    eyebrow: 'Patient records',
    title: 'Patients',
    summary: 'The patient register — every record, contact detail and balance in one searchable list.',
    figure: 'workspace',
    legend: ['Search and filters', 'Patient list and balances', 'Row actions'],
    canDo: [
      'Search by name, MRN, phone or national ID.',
      'See age, last visit and outstanding balance at a glance.',
      'Register, edit, book or archive a record from its row.',
    ],
    steps: [
      'Search before registering to avoid duplicate files.',
      'Open the record to review the clinical history.',
      'Archive only when the patient has truly left the clinic.',
    ],
    tip: 'A phone search ignores the country code, so local numbers still match.',
  },
  patient: {
    key: 'patient',
    eyebrow: 'Patient records',
    title: 'Patient record',
    summary: 'One patient’s complete story: visits, prescriptions, plans, billing and documents in a single file.',
    figure: 'record',
    legend: ['Identity and allergy alerts', 'Care tabs and history', 'Documents and side summaries'],
    canDo: [
      'Read the allergy alert and active conditions before prescribing.',
      'Move between visits, prescriptions, plans, billing and documents.',
      'Book the next appointment or start a visit from the header.',
    ],
    steps: [
      'Confirm identity and contact details.',
      'Review the latest visit and vitals.',
      'Add a document or start the next visit.',
    ],
    tip: 'Use the Documents tab to keep scans, letters and consent forms with the record.',
  },
  visits: {
    key: 'visits',
    eyebrow: 'Care',
    title: 'Visits',
    summary: 'Clinical documentation: vitals, complaint, assessment, plan and follow-up for each encounter.',
    figure: 'workspace',
    legend: ['Draft and signed visits', 'Visit list by date', 'Open or start a visit'],
    canDo: [
      'Record vitals, complaint, examination, assessment and plan.',
      'Sign the note to lock it and make it part of the record.',
      'Print the summary or schedule a follow-up.',
    ],
    steps: [
      'Start from an appointment or from this page.',
      'Document the encounter and add a prescription if needed.',
      'Sign the note, then create the invoice.',
    ],
    tip: 'Draft visits stay visible on the dashboard until they are signed.',
  },
  prescriptions: {
    key: 'prescriptions',
    eyebrow: 'Care',
    title: 'Prescriptions',
    summary: 'Medication issued to patients, ready to review, print and repeat.',
    figure: 'workspace',
    legend: ['Status and search', 'Prescription list', 'Open, print or repeat'],
    canDo: [
      'Review active and past prescriptions.',
      'Open a prescription to print it or check the medication lines.',
      'Issue a new prescription from a visit or the patient record.',
    ],
    steps: [
      'Choose the patient and add each medication.',
      'Check dose, frequency and duration.',
      'Save, print and hand the copy to the patient.',
    ],
    tip: 'Prescriptions are linked to the allergy record — check the alert before issuing.',
  },
  plans: {
    key: 'plans',
    eyebrow: 'Care',
    title: 'Treatment plans',
    summary: 'Staged treatment that shows the team what comes next and how far the patient has progressed.',
    figure: 'workspace',
    legend: ['Plan status and value', 'Procedures and progress', 'Open or add a plan'],
    canDo: [
      'Break treatment into priced, schedulable procedures.',
      'Track completed items and the remaining value.',
      'Open a plan to add stages or record progress.',
    ],
    steps: [
      'Agree the plan with the patient.',
      'Schedule the first procedure.',
      'Complete items as they are done and bill them.',
    ],
    tip: 'A plan keeps the team aligned even when treatment spans months.',
  },
  billing: {
    key: 'billing',
    eyebrow: 'Finance',
    title: 'Billing',
    summary: 'Invoices, payments and balances for the clinic.',
    figure: 'workspace',
    legend: ['Invoice filters and totals', 'Invoice list and balances', 'Open, print or take payment'],
    canDo: [
      'Create invoices with services, discounts and tax.',
      'Record payments and see the remaining balance.',
      'Print a receipt or review open invoices.',
    ],
    steps: [
      'Open an invoice from a visit or create one at the desk.',
      'Add items and confirm the total.',
      'Take payment and print the receipt.',
    ],
    tip: 'The dashboard shows unpaid invoices that need attention.',
  },
  expenses: {
    key: 'expenses',
    eyebrow: 'Finance',
    title: 'Expenses',
    summary: 'Clinic spending by category and vendor, kept beside revenue so the month stays honest.',
    figure: 'workspace',
    legend: ['Month and category filters', 'Expense ledger', 'Add or edit an expense'],
    canDo: [
      'Record spending by category, vendor and payment method.',
      'Filter by month to compare against revenue.',
      'Correct an entry while keeping the audit trail.',
    ],
    steps: [
      'Log the expense on the day it happens.',
      'Add the reference or receipt number.',
      'Review the month before closing the books.',
    ],
    tip: 'Expenses reduce the net figure shown on the dashboard.',
  },
  inventory: {
    key: 'inventory',
    eyebrow: 'Administration',
    title: 'Inventory',
    summary: 'Stock on hand, reorder levels and expiry dates for supplies and medication.',
    figure: 'workspace',
    legend: ['Stock alerts', 'Item list and quantities', 'Receive, use or adjust'],
    canDo: [
      'See stock on hand, reorder levels and expiry dates.',
      'Receive, use or physically count an item.',
      'Filter to low-stock and out-of-stock items.',
    ],
    steps: [
      'Review the low-stock list first.',
      'Receive a delivery and update the quantity.',
      'Adjust expired or wasted stock with a reason.',
    ],
    tip: 'Every stock adjustment is written to the audit log.',
  },
  files: {
    key: 'files',
    eyebrow: 'Patient records',
    title: 'Files',
    summary: 'Every patient document in one searchable workspace: scans, lab results, letters, consent forms and IDs.',
    figure: 'documents',
    legend: ['Search and category filters', 'Documents across patients', 'Upload, preview or archive'],
    canDo: [
      'Search every document by title, file name or patient.',
      'Preview images, open files and save a copy.',
      'Track expiry dates for insurance cards and IDs.',
    ],
    steps: [
      'Upload from this page or from a patient’s record.',
      'Choose a category and add an expiry date when relevant.',
      'Preview the file, then archive it if it is no longer needed.',
    ],
    tip: 'Documents sync to connected devices and are included in workspace backups.',
  },
  tasks: {
    key: 'tasks',
    eyebrow: 'Care',
    title: 'Tasks',
    summary: 'The clinic’s shared to-do list, with priority, owner and due dates.',
    figure: 'workspace',
    legend: ['Open and overdue counts', 'Task list by priority', 'Add, assign or complete'],
    canDo: [
      'Add a task with priority, owner and due date.',
      'See what is overdue or due today.',
      'Mark a task complete directly from the list.',
    ],
    steps: [
      'Capture the task while it is fresh.',
      'Assign an owner and a realistic due date.',
      'Review open tasks at the end of the day.',
    ],
    tip: 'Tasks are shared with the whole clinic team.',
  },
  reports: {
    key: 'reports',
    eyebrow: 'Finance',
    title: 'Reports',
    summary: 'Revenue, visits, patients and stock trends over a chosen period.',
    figure: 'workspace',
    legend: ['Date range and location', 'Charts and totals', 'Read the trend'],
    canDo: [
      'Choose a date range and compare clinic locations.',
      'See revenue, visits, patients and stock trends.',
      'Use the numbers to plan staffing and supplies.',
    ],
    steps: [
      'Pick the period you want to review.',
      'Read the totals before the detail.',
      'Share the figures with the team.',
    ],
    tip: 'Short ranges show detail; longer ranges show direction.',
  },
  network: {
    key: 'network',
    eyebrow: 'Administration',
    title: 'Network',
    summary: 'How this device connects to the clinic: LAN host, paired devices and cloud sync.',
    figure: 'workspace',
    legend: ['Connection mode', 'Devices and invites', 'Sync health'],
    canDo: [
      'See whether this device is the host, a paired device or on cloud.',
      'Pair a new device with a fresh code.',
      'Review sync health and resolve conflicts.',
    ],
    steps: [
      'Start the host on the main clinic computer.',
      'Pair each device with a fresh code.',
      'Check sync after entering records.',
    ],
    tip: 'Work continues offline; changes sync when the network returns.',
  },
  settings: {
    key: 'settings',
    eyebrow: 'Administration',
    title: 'Settings',
    summary: 'Clinic identity, team access, appearance and data — the place to shape the workspace.',
    figure: 'settings',
    legend: ['Settings sections', 'The form for this section', 'Save changes'],
    canDo: [
      'Update the clinic profile, logo and contact details.',
      'Manage team accounts, roles and passwords.',
      'Change appearance, language, data and backup settings.',
    ],
    steps: [
      'Set the clinic profile before inviting the team.',
      'Give each person their own account and role.',
      'Back up before major changes.',
    ],
    tip: 'Appearance and language are saved per device.',
  },
}

const EXACT: Record<string, string> = {
  '/': 'dashboard',
  '/appointments': 'appointments',
  '/patients': 'patients',
  '/visits': 'visits',
  '/prescriptions': 'prescriptions',
  '/treatment-plans': 'plans',
  '/billing': 'billing',
  '/expenses': 'expenses',
  '/inventory': 'inventory',
  '/files': 'files',
  '/tasks': 'tasks',
  '/reports': 'reports',
  '/network': 'network',
}

export function pageGuideFor(pathname: string): GuideContent {
  if (pathname.startsWith('/patients/')) return GUIDES.patient
  if (pathname.startsWith('/visits/')) return GUIDES.visits
  if (pathname.startsWith('/settings')) return GUIDES.settings
  if (pathname.startsWith('/print/')) return GUIDES.prescriptions
  return GUIDES[EXACT[pathname] ?? 'dashboard']
}
