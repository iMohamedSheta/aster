/**
 * Clinic type packs.
 *
 * Every clinic shares the same record structure and reports. A pack only
 * changes what the team sees by default: the wording of the note template,
 * the extra specialty fields recorded with a visit, and the services offered
 * at the front desk. New types can be added here without touching the store.
 */

export type ClinicTypeId =
  | 'family'
  | 'general'
  | 'dental'
  | 'pediatric'
  | 'dermatology'
  | 'ophthalmology'
  | 'gynecology'
  | 'physiotherapy'
  | 'psychology'
  | 'cardiology'

export interface SpecialtyField {
  key: string
  label: string
  kind: 'text' | 'number' | 'select' | 'checkbox' | 'textarea'
  options?: string[]
  unit?: string
  placeholder?: string
}

export interface ServicePreset {
  name: string
  code: string
  category: string
  price_cents: number
  duration_min: number
}

export interface NoteTemplate {
  chief_complaint: string
  subjective: string
  objective: string
  assessment: string
  plan: string
}

export interface ClinicPack {
  id: ClinicTypeId
  label: string
  short: string
  description: string
  color: string
  noteTemplate: NoteTemplate
  specialtyFields: SpecialtyField[]
  servicePresets: ServicePreset[]
}

export const clinicPacks: ClinicPack[] = [
  {
    id: 'family',
    label: 'Family medicine',
    short: 'Family',
    description: 'Whole-family primary care with prevention, chronic disease review and referrals.',
    color: '#2a3747',
    specialtyFields: [
      { key: 'smoking_status', label: 'Smoking status', kind: 'select', options: ['Never', 'Former', 'Current'] },
      { key: 'alcohol_units', label: 'Alcohol', kind: 'select', options: ['None', 'Occasional', 'Weekly', 'Daily'] },
      { key: 'screening_due', label: 'Screening due', kind: 'text', placeholder: 'e.g. cervical screening, colorectal' },
    ],
    servicePresets: [
      { name: 'New patient consultation', code: 'CONS-NEW', category: 'Consultations', price_cents: 14000, duration_min: 45 },
      { name: 'Follow-up visit', code: 'CONS-FU', category: 'Consultations', price_cents: 8500, duration_min: 20 },
      { name: 'Annual physical', code: 'PHYS-ANN', category: 'Preventive care', price_cents: 20000, duration_min: 45 },
      { name: 'Vaccination', code: 'VAC-STD', category: 'Preventive care', price_cents: 4500, duration_min: 15 },
      { name: 'Basic blood panel', code: 'LAB-BASIC', category: 'Laboratory', price_cents: 6000, duration_min: 10 },
    ],
    noteTemplate: {
      chief_complaint: '',
      subjective: 'Reports:\n- Onset and duration:\n- Severity and pattern:\n- Relevant history and medication adherence:\n- Social context:',
      objective: 'Vitals: BP __/__, HR __, temp __, SpO2 __.\nExamination:\nInvestigations reviewed:',
      assessment: 'Working diagnosis:\nDifferential considered:\nControl of existing conditions:',
      plan: 'Investigations ordered:\nMedication changes:\nPatient education:\nFollow-up:',
    },
  },
  {
    id: 'general',
    label: 'General practice',
    short: 'General',
    description: 'Walk-in and appointment general practice for everyday illness and injury.',
    color: '#44607a',
    specialtyFields: [
      { key: 'triage_note', label: 'Triage note', kind: 'textarea' },
      { key: 'work_note_days', label: 'Work note', kind: 'number', unit: 'days' },
    ],
    servicePresets: [
      { name: 'Walk-in consultation', code: 'WALK-IN', category: 'Consultations', price_cents: 7000, duration_min: 15 },
      { name: 'Wound dressing', code: 'PROC-WND', category: 'Procedures', price_cents: 5500, duration_min: 20 },
      { name: 'ECG (12-lead)', code: 'DIAG-ECG', category: 'Diagnostics', price_cents: 7500, duration_min: 20 },
    ],
    noteTemplate: {
      chief_complaint: '',
      subjective: 'Presenting concern:\nOnset:\nAssociated symptoms:\nPatient expectations:',
      objective: 'Observations:\nFocused examination:\nPoint-of-care tests:',
      assessment: 'Impression:\nRed flags considered:',
      plan: 'Treatment:\nSafety advice:\nFollow-up or referral:',
    },
  },
  {
    id: 'dental',
    label: 'Dental clinic',
    short: 'Dental',
    description: 'Charting, hygiene, restorative work and recall for general dentistry.',
    color: '#a8632f',
    specialtyFields: [
      { key: 'teeth_charted', label: 'Teeth charted', kind: 'number' },
      { key: 'bleeding_sites', label: 'Bleeding sites', kind: 'number' },
      { key: 'caries', label: 'Active caries', kind: 'number' },
      { key: 'fluoride', label: 'Fluoride applied', kind: 'checkbox' },
      { key: 'quadrant', label: 'Quadrant treated', kind: 'select', options: ['None', 'UR', 'UL', 'LR', 'LL'] },
      { key: 'recall_months', label: 'Recall', kind: 'select', options: ['3 months', '6 months', '12 months'] },
    ],
    servicePresets: [
      { name: 'Dental examination', code: 'DEN-EXAM', category: 'Examinations', price_cents: 9500, duration_min: 30 },
      { name: 'Dental cleaning', code: 'DEN-CLEAN', category: 'Hygiene', price_cents: 14500, duration_min: 45 },
      { name: 'Composite filling', code: 'DEN-FILL', category: 'Restorative', price_cents: 22000, duration_min: 45 },
      { name: 'Crown preparation', code: 'DEN-CROWN', category: 'Restorative', price_cents: 89000, duration_min: 60 },
      { name: 'Dental X-rays', code: 'DEN-XRAY', category: 'Imaging', price_cents: 6500, duration_min: 15 },
      { name: 'Root canal (anterior)', code: 'DEN-RCT', category: 'Endodontics', price_cents: 65000, duration_min: 90 },
    ],
    noteTemplate: {
      chief_complaint: 'Reason for visit and dental concern:',
      subjective: 'Pain history and triggers:\nHome care routine:\nMedical history and medications:\nBleeding or swelling:',
      objective: 'Extraoral examination:\nIntraoral examination:\nPeriodontal charting:\nRadiographs:',
      assessment: 'Dental diagnosis:\nTooth and surface:\nPrognosis:',
      plan: 'Treatment completed today:\nAnaesthetic used:\nHome care advice:\nNext recall:',
    },
  },
  {
    id: 'pediatric',
    label: 'Pediatrics',
    short: 'Pediatric',
    description: 'Growth, development, vaccination and acute childhood illness.',
    color: '#4f7f8a',
    specialtyFields: [
      { key: 'weight_kg', label: 'Weight', kind: 'number', unit: 'kg' },
      { key: 'height_cm', label: 'Height', kind: 'number', unit: 'cm' },
      { key: 'head_cm', label: 'Head circumference', kind: 'number', unit: 'cm' },
      { key: 'feeding', label: 'Feeding', kind: 'select', options: ['Breastfed', 'Formula', 'Mixed', 'Solids', 'Not applicable'] },
      { key: 'milestones', label: 'Development', kind: 'textarea', placeholder: 'Milestones met, concerns raised' },
    ],
    servicePresets: [
      { name: 'Well-child visit', code: 'PED-WELL', category: 'Preventive care', price_cents: 15000, duration_min: 40 },
      { name: 'Sick child visit', code: 'PED-SICK', category: 'Consultations', price_cents: 9500, duration_min: 20 },
      { name: 'Childhood vaccination', code: 'PED-VAC', category: 'Preventive care', price_cents: 5000, duration_min: 15 },
      { name: 'Growth and development review', code: 'PED-GROW', category: 'Reviews', price_cents: 12000, duration_min: 30 },
    ],
    noteTemplate: {
      chief_complaint: 'Parent or carer reports:',
      subjective: 'Feeding and appetite:\nSleep:\nBowel and urine:\nImmunisations up to date:\nExposure to illness:',
      objective: 'Growth measurements:\nGeneral appearance and interaction:\nSystem examination:',
      assessment: 'Diagnosis:\nHydration and red flags:',
      plan: 'Treatment and dosing:\nSafety-net advice for carers:\nFollow-up:',
    },
  },
  {
    id: 'dermatology',
    label: 'Dermatology',
    short: 'Dermatology',
    description: 'Skin, hair and nail assessment with lesion documentation and follow-up.',
    color: '#9a5f5f',
    specialtyFields: [
      { key: 'lesion_site', label: 'Lesion site', kind: 'text' },
      { key: 'lesion_size_mm', label: 'Lesion size', kind: 'number', unit: 'mm' },
      { key: 'lesion_type', label: 'Lesion type', kind: 'select', options: ['Macule', 'Papule', 'Plaque', 'Nodule', 'Vesicle', 'Ulcer'] },
      { key: 'dermoscopy', label: 'Dermoscopy findings', kind: 'textarea' },
      { key: 'photo_consent', label: 'Photo consent', kind: 'checkbox' },
    ],
    servicePresets: [
      { name: 'Dermatology consultation', code: 'DERM-CONS', category: 'Consultations', price_cents: 18000, duration_min: 30 },
      { name: 'Lesion review', code: 'DERM-LESION', category: 'Reviews', price_cents: 9000, duration_min: 20 },
      { name: 'Cryotherapy', code: 'DERM-CRYO', category: 'Procedures', price_cents: 12000, duration_min: 20 },
      { name: 'Skin biopsy', code: 'DERM-BIO', category: 'Procedures', price_cents: 26000, duration_min: 30 },
    ],
    noteTemplate: {
      chief_complaint: 'Skin concern and duration:',
      subjective: 'Itch, pain or bleeding:\nTriggers and treatments tried:\nPersonal or family history of skin cancer:',
      objective: 'Distribution and morphology:\nDermoscopy:\nMucosal and nail involvement:',
      assessment: 'Dermatological diagnosis:\nDifferential:',
      plan: 'Topical and systemic treatment:\nSun protection advice:\nBiopsy or referral:\nReview interval:',
    },
  },
  {
    id: 'ophthalmology',
    label: 'Eye clinic',
    short: 'Eye care',
    description: 'Vision, refraction, anterior segment and screening for eye disease.',
    color: '#3f6f7d',
    specialtyFields: [
      { key: 'va_right', label: 'Visual acuity right', kind: 'text', placeholder: '6/6 or 20/20' },
      { key: 'va_left', label: 'Visual acuity left', kind: 'text' },
      { key: 'iop_right', label: 'IOP right', kind: 'number', unit: 'mmHg' },
      { key: 'iop_left', label: 'IOP left', kind: 'number', unit: 'mmHg' },
      { key: 'refraction', label: 'Refraction', kind: 'text' },
      { key: 'dilated', label: 'Dilated exam', kind: 'checkbox' },
    ],
    servicePresets: [
      { name: 'Comprehensive eye exam', code: 'EYE-EXAM', category: 'Examinations', price_cents: 16000, duration_min: 35 },
      { name: 'Refraction and glasses prescription', code: 'EYE-REF', category: 'Optometry', price_cents: 8000, duration_min: 20 },
      { name: 'Glaucoma screening', code: 'EYE-GLAU', category: 'Screening', price_cents: 11000, duration_min: 25 },
      { name: 'Foreign body removal', code: 'EYE-FB', category: 'Procedures', price_cents: 14000, duration_min: 20 },
    ],
    noteTemplate: {
      chief_complaint: 'Visual concern:',
      subjective: 'Blurring, pain, floaters or flashes:\nContact lens use:\nOcular history and family history:',
      objective: 'Visual acuity and refraction:\nPupils and motility:\nSlit lamp anterior segment:\nFundoscopy:',
      assessment: 'Ocular diagnosis:\nDifferential:',
      plan: 'Treatment and drops:\nDriving and work advice:\nReview or referral:',
    },
  },
  {
    id: 'gynecology',
    label: "Women's health",
    short: "Women's health",
    description: 'Well-woman care, contraception, pregnancy planning and gynecological review.',
    color: '#8a5f7d',
    specialtyFields: [
      { key: 'lmp', label: 'Last menstrual period', kind: 'text', placeholder: 'YYYY-MM-DD' },
      { key: 'cycle_length', label: 'Cycle length', kind: 'number', unit: 'days' },
      { key: 'contraception', label: 'Contraception', kind: 'select', options: ['None', 'Combined pill', 'Progestogen only', 'IUD', 'Implant', 'Barrier', 'Sterilised'] },
      { key: 'pregnancy_test', label: 'Pregnancy test', kind: 'select', options: ['Not done', 'Negative', 'Positive'] },
      { key: 'gravida', label: 'Gravida', kind: 'number' },
      { key: 'para', label: 'Para', kind: 'number' },
    ],
    servicePresets: [
      { name: "Well-woman examination", code: 'GYN-WELL', category: 'Preventive care', price_cents: 17000, duration_min: 40 },
      { name: 'Contraception review', code: 'GYN-CONT', category: 'Reviews', price_cents: 9500, duration_min: 20 },
      { name: 'Cervical screening', code: 'GYN-SCREEN', category: 'Screening', price_cents: 12000, duration_min: 25 },
      { name: 'Antenatal booking visit', code: 'GYN-ANTE', category: 'Maternity', price_cents: 21000, duration_min: 45 },
    ],
    noteTemplate: {
      chief_complaint: '',
      subjective: 'Menstrual history:\nContraception and sexual history:\nObstetric history:\nSymptoms and concerns:',
      objective: 'Abdominal examination:\nPelvic examination:\nSpeculum and swabs:\nInvestigations:',
      assessment: 'Diagnosis:\nDifferential:',
      plan: 'Treatment:\nContraception plan:\nScreening and follow-up:\nSafety advice:',
    },
  },
  {
    id: 'physiotherapy',
    label: 'Physiotherapy',
    short: 'Physio',
    description: 'Musculoskeletal assessment, rehabilitation plans and progress tracking.',
    color: '#5f7a55',
    specialtyFields: [
      { key: 'pain_score', label: 'Pain score', kind: 'number', unit: '/10' },
      { key: 'rom', label: 'Range of motion', kind: 'text' },
      { key: 'strength', label: 'Strength', kind: 'text' },
      { key: 'region', label: 'Region', kind: 'select', options: ['Neck', 'Shoulder', 'Elbow', 'Wrist', 'Back', 'Hip', 'Knee', 'Ankle', 'Other'] },
      { key: 'exercises', label: 'Exercises prescribed', kind: 'textarea' },
    ],
    servicePresets: [
      { name: 'Initial physiotherapy assessment', code: 'PHY-ASSESS', category: 'Assessments', price_cents: 15000, duration_min: 45 },
      { name: 'Follow-up treatment', code: 'PHY-FU', category: 'Treatment', price_cents: 9000, duration_min: 30 },
      { name: 'Sports rehabilitation session', code: 'PHY-SPORT', category: 'Rehabilitation', price_cents: 11000, duration_min: 40 },
    ],
    noteTemplate: {
      chief_complaint: 'Movement problem and functional limitation:',
      subjective: 'Pain behaviour and irritability:\nAggravating and easing factors:\nGoals:',
      objective: 'Observation:\nActive and passive range:\nStrength and special tests:\nGait:',
      assessment: 'Clinical impression:\nContributing factors:',
      plan: 'Treatment today:\nHome exercise programme:\nLoad and activity advice:\nReview:',
    },
  },
  {
    id: 'psychology',
    label: 'Mental health',
    short: 'Psychology',
    description: 'Assessment, therapy notes and safety planning with a protected record.',
    color: '#6a5f8a',
    specialtyFields: [
      { key: 'session_type', label: 'Session type', kind: 'select', options: ['Initial assessment', 'Individual therapy', 'Couples therapy', 'Group therapy', 'Review'] },
      { key: 'risk', label: 'Risk assessment', kind: 'select', options: ['No current risk', 'Low', 'Moderate', 'High'] },
      { key: 'phq9', label: 'PHQ-9', kind: 'number', unit: '/27' },
      { key: 'gad7', label: 'GAD-7', kind: 'number', unit: '/21' },
      { key: 'safety_plan', label: 'Safety plan discussed', kind: 'checkbox' },
    ],
    servicePresets: [
      { name: 'Initial psychological assessment', code: 'PSY-ASSESS', category: 'Assessments', price_cents: 18000, duration_min: 60 },
      { name: 'Therapy session', code: 'PSY-SESSION', category: 'Therapy', price_cents: 11000, duration_min: 50 },
      { name: 'Couples session', code: 'PSY-COUPLE', category: 'Therapy', price_cents: 14000, duration_min: 60 },
    ],
    noteTemplate: {
      chief_complaint: 'Presenting concern:',
      subjective: 'Mood and sleep:\nFunction and supports:\nMedication adherence:\nRisk screen:',
      objective: 'Mental state examination:\nAppearance and behaviour:\nSpeech and thought:\nInsight and judgement:',
      assessment: 'Formulation:\nProgress against goals:\nRisk formulation:',
      plan: 'Therapeutic approach:\nHomework or coping plan:\nSafety plan:\nNext session:',
    },
  },
  {
    id: 'cardiology',
    label: 'Cardiology',
    short: 'Cardiology',
    description: 'Cardiac review, risk factors, ECG interpretation and secondary prevention.',
    color: '#8a4f52',
    specialtyFields: [
      { key: 'bp_systolic', label: 'Systolic BP', kind: 'number', unit: 'mmHg' },
      { key: 'bp_diastolic', label: 'Diastolic BP', kind: 'number', unit: 'mmHg' },
      { key: 'heart_rate', label: 'Heart rate', kind: 'number', unit: 'bpm' },
      { key: 'ecg', label: 'ECG findings', kind: 'textarea' },
      { key: 'nyha', label: 'NYHA class', kind: 'select', options: ['I', 'II', 'III', 'IV', 'Not applicable'] },
      { key: 'ejection_fraction', label: 'Ejection fraction', kind: 'number', unit: '%' },
    ],
    servicePresets: [
      { name: 'Cardiology consultation', code: 'CAR-CONS', category: 'Consultations', price_cents: 22000, duration_min: 40 },
      { name: 'ECG (12-lead)', code: 'CAR-ECG', category: 'Diagnostics', price_cents: 7500, duration_min: 20 },
      { name: 'Echocardiogram', code: 'CAR-ECHO', category: 'Diagnostics', price_cents: 48000, duration_min: 45 },
      { name: 'Holter monitor fitting', code: 'CAR-HOLTER', category: 'Diagnostics', price_cents: 32000, duration_min: 30 },
    ],
    noteTemplate: {
      chief_complaint: 'Cardiac symptom and functional impact:',
      subjective: 'Chest pain, breathlessness or palpitations:\nExercise tolerance:\nRisk factors and family history:\nMedication adherence:',
      objective: 'Observations and heart sounds:\nPeripheral pulses and oedema:\nECG:\nEchocardiogram summary:',
      assessment: 'Cardiac diagnosis and severity:\nRisk stratification:',
      plan: 'Medication optimisation:\nInvestigations:\nLifestyle and rehabilitation:\nReview interval:',
    },
  },
]

export const defaultPack = clinicPacks[0]

export function clinicPack(id?: string | null): ClinicPack {
  if (!id) return defaultPack
  return clinicPacks.find((pack) => pack.id === id) ?? defaultPack
}

export function specialtyFieldSummary(pack: ClinicPack, data: Record<string, unknown>) {
  return pack.specialtyFields
    .map((field) => ({ ...field, value: data[field.key] }))
    .filter((field) => field.value !== undefined && field.value !== null && field.value !== '' && field.value !== false)
}

/** Parses a specialty_data JSON blob without ever throwing on bad data. */
export function parseSpecialtyData(raw?: string | null): Record<string, any> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
