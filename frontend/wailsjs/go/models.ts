export namespace main {
	
	export class HostStatus {
	    running: boolean;
	    urls: string[];
	    pairingCode: string;
	    pairingRole: string;
	    expiresAt: string;
	    fingerprint: string;
	    port: number;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new HostStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.urls = source["urls"];
	        this.pairingCode = source["pairingCode"];
	        this.pairingRole = source["pairingRole"];
	        this.expiresAt = source["expiresAt"];
	        this.fingerprint = source["fingerprint"];
	        this.port = source["port"];
	        this.error = source["error"];
	    }
	}
	export class BootstrapData {
	    version: string;
	    appName: string;
	    tagline: string;
	    onboarded: boolean;
	    signedIn: boolean;
	    signInMode: string;
	    needsAccessSetup: boolean;
	    defaultStaffId: string;
	    clinic: Record<string, any>;
	    staff: any[];
	    currentStaff: Record<string, any>;
	    locations: any[];
	    activeLocationId: string;
	    activeLocation: Record<string, any>;
	    clinicType: string;
	    mode: string;
	    sync: syncengine.Status;
	    host: HostStatus;
	    conflicts: number;
	    startRoute: string;
	    theme: string;
	    locale: string;
	    serverUrl: string;
	    workspace: string;
	    deviceName: string;
	    dataDir: string;
	    serverInfo: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new BootstrapData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.appName = source["appName"];
	        this.tagline = source["tagline"];
	        this.onboarded = source["onboarded"];
	        this.signedIn = source["signedIn"];
	        this.signInMode = source["signInMode"];
	        this.needsAccessSetup = source["needsAccessSetup"];
	        this.defaultStaffId = source["defaultStaffId"];
	        this.clinic = source["clinic"];
	        this.staff = source["staff"];
	        this.currentStaff = source["currentStaff"];
	        this.locations = source["locations"];
	        this.activeLocationId = source["activeLocationId"];
	        this.activeLocation = source["activeLocation"];
	        this.clinicType = source["clinicType"];
	        this.mode = source["mode"];
	        this.sync = this.convertValues(source["sync"], syncengine.Status);
	        this.host = this.convertValues(source["host"], HostStatus);
	        this.conflicts = source["conflicts"];
	        this.startRoute = source["startRoute"];
	        this.theme = source["theme"];
	        this.locale = source["locale"];
	        this.serverUrl = source["serverUrl"];
	        this.workspace = source["workspace"];
	        this.deviceName = source["deviceName"];
	        this.dataDir = source["dataDir"];
	        this.serverInfo = source["serverInfo"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CloudCreateInput {
	    url: string;
	    clinicName: string;
	    ownerName: string;
	    deviceName: string;
	
	    static createFrom(source: any = {}) {
	        return new CloudCreateInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.clinicName = source["clinicName"];
	        this.ownerName = source["ownerName"];
	        this.deviceName = source["deviceName"];
	    }
	}
	export class DataInfo {
	    dbPath: string;
	    dbSize: number;
	    backupDir: string;
	    lastBackup: string;
	    dataDir: string;
	
	    static createFrom(source: any = {}) {
	        return new DataInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dbPath = source["dbPath"];
	        this.dbSize = source["dbSize"];
	        this.backupDir = source["backupDir"];
	        this.lastBackup = source["lastBackup"];
	        this.dataDir = source["dataDir"];
	    }
	}
	
	export class JoinInput {
	    url: string;
	    code: string;
	    staffName: string;
	    deviceName: string;
	    role: string;
	    keepLocal: boolean;
	    mode: string;
	
	    static createFrom(source: any = {}) {
	        return new JoinInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.code = source["code"];
	        this.staffName = source["staffName"];
	        this.deviceName = source["deviceName"];
	        this.role = source["role"];
	        this.keepLocal = source["keepLocal"];
	        this.mode = source["mode"];
	    }
	}
	export class OnboardingInput {
	    clinicName: string;
	    clinicType: string;
	    ownerName: string;
	    username: string;
	    password: string;
	    currency: string;
	    currencySymbol: string;
	    timezone: string;
	
	    static createFrom(source: any = {}) {
	        return new OnboardingInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.clinicName = source["clinicName"];
	        this.clinicType = source["clinicType"];
	        this.ownerName = source["ownerName"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.currency = source["currency"];
	        this.currencySymbol = source["currencySymbol"];
	        this.timezone = source["timezone"];
	    }
	}

}

export namespace store {
	
	export class AppointmentInput {
	    patient_id: string;
	    provider_id: string;
	    start_at: string;
	    end_at: string;
	    reason: string;
	    room: string;
	    notes: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new AppointmentInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.patient_id = source["patient_id"];
	        this.provider_id = source["provider_id"];
	        this.start_at = source["start_at"];
	        this.end_at = source["end_at"];
	        this.reason = source["reason"];
	        this.room = source["room"];
	        this.notes = source["notes"];
	        this.status = source["status"];
	    }
	}
	export class Device {
	    id: string;
	    clinicId: string;
	    name: string;
	    role: string;
	    staffId: string;
	    createdAt: string;
	    lastSeenAt: string;
	    revokedAt: string;
	    certFingerprint: string;
	
	    static createFrom(source: any = {}) {
	        return new Device(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.clinicId = source["clinicId"];
	        this.name = source["name"];
	        this.role = source["role"];
	        this.staffId = source["staffId"];
	        this.createdAt = source["createdAt"];
	        this.lastSeenAt = source["lastSeenAt"];
	        this.revokedAt = source["revokedAt"];
	        this.certFingerprint = source["certFingerprint"];
	    }
	}
	export class EncounterDetail {
	    encounter: Record<string, any>;
	    patient: Record<string, any>;
	    vitals: Record<string, any>;
	    diagnoses: any[];
	    prescriptions: any[];
	    addenda: any[];
	    allergies: any[];
	
	    static createFrom(source: any = {}) {
	        return new EncounterDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.encounter = source["encounter"];
	        this.patient = source["patient"];
	        this.vitals = source["vitals"];
	        this.diagnoses = source["diagnoses"];
	        this.prescriptions = source["prescriptions"];
	        this.addenda = source["addenda"];
	        this.allergies = source["allergies"];
	    }
	}
	export class EncounterInput {
	    id: string;
	    patient_id: string;
	    appointment_id: string;
	    provider_id: string;
	    type: string;
	    chief_complaint: string;
	    subjective: string;
	    objective: string;
	    assessment: string;
	    plan: string;
	    follow_up_on: string;
	    started_at: string;
	    specialty_data: string;
	
	    static createFrom(source: any = {}) {
	        return new EncounterInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.patient_id = source["patient_id"];
	        this.appointment_id = source["appointment_id"];
	        this.provider_id = source["provider_id"];
	        this.type = source["type"];
	        this.chief_complaint = source["chief_complaint"];
	        this.subjective = source["subjective"];
	        this.objective = source["objective"];
	        this.assessment = source["assessment"];
	        this.plan = source["plan"];
	        this.follow_up_on = source["follow_up_on"];
	        this.started_at = source["started_at"];
	        this.specialty_data = source["specialty_data"];
	    }
	}
	export class InvoiceItemInput {
	    service_id: string;
	    description: string;
	    quantity: number;
	    unit_price_cents: number;
	
	    static createFrom(source: any = {}) {
	        return new InvoiceItemInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.service_id = source["service_id"];
	        this.description = source["description"];
	        this.quantity = source["quantity"];
	        this.unit_price_cents = source["unit_price_cents"];
	    }
	}
	export class InvoiceInput {
	    patient_id: string;
	    encounter_id: string;
	    issued_at: string;
	    due_at: string;
	    discount_cents: number;
	    tax_rate_bp: number;
	    notes: string;
	    items: InvoiceItemInput[];
	
	    static createFrom(source: any = {}) {
	        return new InvoiceInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.patient_id = source["patient_id"];
	        this.encounter_id = source["encounter_id"];
	        this.issued_at = source["issued_at"];
	        this.due_at = source["due_at"];
	        this.discount_cents = source["discount_cents"];
	        this.tax_rate_bp = source["tax_rate_bp"];
	        this.notes = source["notes"];
	        this.items = this.convertValues(source["items"], InvoiceItemInput);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class PatientDetail {
	    patient: Record<string, any>;
	    allergies: any[];
	    conditions: any[];
	    encounters: any[];
	    appointments: any[];
	    prescriptions: any[];
	    invoices: any[];
	    vitals: any[];
	    stats: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new PatientDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.patient = source["patient"];
	        this.allergies = source["allergies"];
	        this.conditions = source["conditions"];
	        this.encounters = source["encounters"];
	        this.appointments = source["appointments"];
	        this.prescriptions = source["prescriptions"];
	        this.invoices = source["invoices"];
	        this.vitals = source["vitals"];
	        this.stats = source["stats"];
	    }
	}
	export class PatientFileInput {
	    patient_id: string;
	    encounter_id: string;
	    category: string;
	    title: string;
	    file_name: string;
	    mime: string;
	    notes: string;
	    expires_on: string;
	    data_base64: string;
	
	    static createFrom(source: any = {}) {
	        return new PatientFileInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.patient_id = source["patient_id"];
	        this.encounter_id = source["encounter_id"];
	        this.category = source["category"];
	        this.title = source["title"];
	        this.file_name = source["file_name"];
	        this.mime = source["mime"];
	        this.notes = source["notes"];
	        this.expires_on = source["expires_on"];
	        this.data_base64 = source["data_base64"];
	    }
	}
	export class PatientInput {
	    id: string;
	    mrn: string;
	    first_name: string;
	    last_name: string;
	    preferred_name: string;
	    sex: string;
	    date_of_birth: string;
	    phone: string;
	    alt_phone: string;
	    email: string;
	    address: string;
	    city: string;
	    national_id: string;
	    blood_type: string;
	    marital_status: string;
	    occupation: string;
	    emergency_contact_name: string;
	    emergency_contact_phone: string;
	    insurance_provider: string;
	    insurance_number: string;
	    notes: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new PatientInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.mrn = source["mrn"];
	        this.first_name = source["first_name"];
	        this.last_name = source["last_name"];
	        this.preferred_name = source["preferred_name"];
	        this.sex = source["sex"];
	        this.date_of_birth = source["date_of_birth"];
	        this.phone = source["phone"];
	        this.alt_phone = source["alt_phone"];
	        this.email = source["email"];
	        this.address = source["address"];
	        this.city = source["city"];
	        this.national_id = source["national_id"];
	        this.blood_type = source["blood_type"];
	        this.marital_status = source["marital_status"];
	        this.occupation = source["occupation"];
	        this.emergency_contact_name = source["emergency_contact_name"];
	        this.emergency_contact_phone = source["emergency_contact_phone"];
	        this.insurance_provider = source["insurance_provider"];
	        this.insurance_number = source["insurance_number"];
	        this.notes = source["notes"];
	        this.status = source["status"];
	    }
	}
	export class PaymentInput {
	    invoice_id: string;
	    amount_cents: number;
	    method: string;
	    reference: string;
	    notes: string;
	
	    static createFrom(source: any = {}) {
	        return new PaymentInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.invoice_id = source["invoice_id"];
	        this.amount_cents = source["amount_cents"];
	        this.method = source["method"];
	        this.reference = source["reference"];
	        this.notes = source["notes"];
	    }
	}
	export class PrescriptionItemInput {
	    drug_name: string;
	    strength: string;
	    form: string;
	    dose: string;
	    frequency: string;
	    duration_days: number;
	    quantity: number;
	    instructions: string;
	    refills: number;
	
	    static createFrom(source: any = {}) {
	        return new PrescriptionItemInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.drug_name = source["drug_name"];
	        this.strength = source["strength"];
	        this.form = source["form"];
	        this.dose = source["dose"];
	        this.frequency = source["frequency"];
	        this.duration_days = source["duration_days"];
	        this.quantity = source["quantity"];
	        this.instructions = source["instructions"];
	        this.refills = source["refills"];
	    }
	}
	export class PrescriptionInput {
	    patient_id: string;
	    encounter_id: string;
	    provider_id: string;
	    notes: string;
	    items: PrescriptionItemInput[];
	
	    static createFrom(source: any = {}) {
	        return new PrescriptionInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.patient_id = source["patient_id"];
	        this.encounter_id = source["encounter_id"];
	        this.provider_id = source["provider_id"];
	        this.notes = source["notes"];
	        this.items = this.convertValues(source["items"], PrescriptionItemInput);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace syncengine {
	
	export class Stats {
	    pushed: number;
	    pulled: number;
	    conflicts: number;
	    duration: string;
	
	    static createFrom(source: any = {}) {
	        return new Stats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pushed = source["pushed"];
	        this.pulled = source["pulled"];
	        this.conflicts = source["conflicts"];
	        this.duration = source["duration"];
	    }
	}
	export class Status {
	    mode: string;
	    state: string;
	    serverUrl: string;
	    workspace: string;
	    deviceName: string;
	    lastSyncAt: string;
	    pending: number;
	    cursor: number;
	    conflicts: number;
	    error: string;
	    serverLabel: string;
	
	    static createFrom(source: any = {}) {
	        return new Status(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.state = source["state"];
	        this.serverUrl = source["serverUrl"];
	        this.workspace = source["workspace"];
	        this.deviceName = source["deviceName"];
	        this.lastSyncAt = source["lastSyncAt"];
	        this.pending = source["pending"];
	        this.cursor = source["cursor"];
	        this.conflicts = source["conflicts"];
	        this.error = source["error"];
	        this.serverLabel = source["serverLabel"];
	    }
	}

}

export namespace updater {
	
	export class State {
	    status: string;
	    currentVersion: string;
	    latestVersion: string;
	    notesUrl: string;
	    publishedAt: string;
	    assetName: string;
	    assetSize: number;
	    downloaded: number;
	    progress: number;
	    message: string;
	    error: string;
	    checkedAt: string;
	    autoCheck: boolean;
	    skipped: boolean;
	    verified: boolean;
	    justUpdatedFrom: string;
	    platform: string;
	
	    static createFrom(source: any = {}) {
	        return new State(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.notesUrl = source["notesUrl"];
	        this.publishedAt = source["publishedAt"];
	        this.assetName = source["assetName"];
	        this.assetSize = source["assetSize"];
	        this.downloaded = source["downloaded"];
	        this.progress = source["progress"];
	        this.message = source["message"];
	        this.error = source["error"];
	        this.checkedAt = source["checkedAt"];
	        this.autoCheck = source["autoCheck"];
	        this.skipped = source["skipped"];
	        this.verified = source["verified"];
	        this.justUpdatedFrom = source["justUpdatedFrom"];
	        this.platform = source["platform"];
	    }
	}

}

