package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

func (s *Store) queryMaps(q string, args ...any) ([]map[string]any, error) {
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMapRows(rows)
}

// ---- Patients ------------------------------------------------------------

type PatientFilter struct {
	Query  string
	Status string
	Limit  int
}

func (s *Store) ListPatients(f PatientFilter) ([]map[string]any, error) {
	if f.Limit <= 0 || f.Limit > 500 {
		f.Limit = 200
	}
	args := []any{time.Now().UTC().Format(time.RFC3339)}
	q := `SELECT p.*, COALESCE(l.name,'') AS location_name, COALESCE(l.color,'#2a3747') AS location_color,
		(SELECT MAX(e.started_at) FROM encounters e WHERE e.patient_id=p.id AND e.deleted_at IS NULL) AS last_visit_at,
		(SELECT MIN(a.start_at) FROM appointments a WHERE a.patient_id=p.id AND a.deleted_at IS NULL
			AND a.start_at>=? AND a.status NOT IN ('cancelled','no_show')) AS next_appointment_at,
		(SELECT COALESCE(SUM(i.total_cents-i.paid_cents),0) FROM invoices i
			WHERE i.patient_id=p.id AND i.deleted_at IS NULL AND i.status NOT IN ('paid','void')) AS balance_cents,
		(SELECT COUNT(1) FROM patient_files f WHERE f.patient_id=p.id AND f.deleted_at IS NULL AND f.checksum<>'') AS file_count
		FROM patients p LEFT JOIN locations l ON l.id=p.location_id WHERE p.deleted_at IS NULL`
	if f.Status != "" && f.Status != "all" {
		q += " AND p.status=?"
		args = append(args, f.Status)
	}
	if q2 := strings.TrimSpace(f.Query); q2 != "" {
		like := "%" + q2 + "%"
		conds := []string{
			"p.first_name LIKE ?", "p.last_name LIKE ?", "(p.first_name||' '||p.last_name) LIKE ?",
			"p.mrn LIKE ?", "p.phone LIKE ?", "p.national_id LIKE ?", "p.email LIKE ?",
		}
		args = append(args, like, like, like, like, like, like, like)
		// Phones are stored internationally (+201012345678), while people
		// search with the local form (01012345678). Compare digit-only forms
		// and try the number without its trunk zero as well.
		if digits := onlyDigits(q2); len(digits) >= 3 {
			phone := `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p.phone,' ',''),'-',''),'(',''),')',''),'+','')`
			conds = append(conds, phone+" LIKE ?")
			args = append(args, "%"+digits+"%")
			if strings.HasPrefix(digits, "0") && len(digits) > 3 {
				conds = append(conds, phone+" LIKE ?")
				args = append(args, "%"+digits[1:]+"%")
			}
		}
		q += " AND (" + strings.Join(conds, " OR ") + ")"
	}
	q += " ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT ?"
	args = append(args, f.Limit)
	return s.queryMaps(q, args...)
}

func onlyDigits(value string) string {
	return strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, value)
}

func (s *Store) GetPatient(id string) (map[string]any, error) {
	rows, err := s.queryMaps(`SELECT p.*, COALESCE(l.name,'') AS location_name, COALESCE(l.color,'#2a3747') AS location_color,
		(SELECT MAX(e.started_at) FROM encounters e WHERE e.patient_id=p.id AND e.deleted_at IS NULL) AS last_visit_at,
		(SELECT COALESCE(SUM(i.total_cents-i.paid_cents),0) FROM invoices i
			WHERE i.patient_id=p.id AND i.deleted_at IS NULL AND i.status NOT IN ('paid','void')) AS balance_cents
		FROM patients p LEFT JOIN locations l ON l.id=p.location_id WHERE p.id=? AND p.deleted_at IS NULL`, id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrNotFound
	}
	return rows[0], nil
}

type PatientDetail struct {
	Patient       map[string]any   `json:"patient"`
	Allergies     []map[string]any `json:"allergies"`
	Conditions    []map[string]any `json:"conditions"`
	Encounters    []map[string]any `json:"encounters"`
	Appointments  []map[string]any `json:"appointments"`
	Prescriptions []map[string]any `json:"prescriptions"`
	Invoices      []map[string]any `json:"invoices"`
	Vitals        []map[string]any `json:"vitals"`
	Stats         map[string]any   `json:"stats"`
}

func (s *Store) PatientDetail(id string) (PatientDetail, error) {
	var d PatientDetail
	p, err := s.GetPatient(id)
	if err != nil {
		return d, err
	}
	d.Patient = p
	d.Allergies, _ = s.queryMaps(`SELECT * FROM allergies WHERE patient_id=? AND deleted_at IS NULL ORDER BY active DESC, severity DESC, allergen`, id)
	d.Conditions, _ = s.queryMaps(`SELECT * FROM conditions WHERE patient_id=? AND deleted_at IS NULL ORDER BY status, diagnosed_on DESC`, id)
	d.Encounters, _ = s.queryMaps(`SELECT e.*, st.full_name AS provider_name, st.color AS provider_color,
		COALESCE(l.name,'') AS location_name
		FROM encounters e LEFT JOIN staff st ON st.id=e.provider_id
		LEFT JOIN locations l ON l.id=e.location_id
		WHERE e.patient_id=? AND e.deleted_at IS NULL ORDER BY e.started_at DESC LIMIT 40`, id)
	d.Appointments, _ = s.queryMaps(`SELECT a.*, st.full_name AS provider_name, st.color AS provider_color,
		COALESCE(l.name,'') AS location_name
		FROM appointments a LEFT JOIN staff st ON st.id=a.provider_id
		LEFT JOIN locations l ON l.id=a.location_id
		WHERE a.patient_id=? AND a.deleted_at IS NULL ORDER BY a.start_at DESC LIMIT 40`, id)
	d.Prescriptions, _ = s.queryMaps(`SELECT pr.*, st.full_name AS provider_name,
		COALESCE(l.name,'') AS location_name,
		(SELECT COUNT(1) FROM prescription_items pi WHERE pi.prescription_id=pr.id AND pi.deleted_at IS NULL) AS item_count
		FROM prescriptions pr LEFT JOIN staff st ON st.id=pr.provider_id
		LEFT JOIN locations l ON l.id=pr.location_id
		WHERE pr.patient_id=? AND pr.deleted_at IS NULL ORDER BY pr.issued_at DESC LIMIT 30`, id)
	d.Invoices, _ = s.queryMaps(`SELECT i.*, COALESCE(l.name,'') AS location_name
		FROM invoices i LEFT JOIN locations l ON l.id=i.location_id
		WHERE i.patient_id=? AND i.deleted_at IS NULL ORDER BY i.issued_at DESC LIMIT 30`, id)
	d.Vitals, _ = s.queryMaps(`SELECT * FROM vitals WHERE patient_id=? AND deleted_at IS NULL ORDER BY measured_at ASC LIMIT 60`, id)
	var visits, activeRx, documents int
	var outstanding int64
	var last string
	_ = s.db.Get(&visits, "SELECT COUNT(1) FROM encounters WHERE patient_id=? AND deleted_at IS NULL", id)
	_ = s.db.Get(&activeRx, "SELECT COUNT(1) FROM prescriptions WHERE patient_id=? AND status='active' AND deleted_at IS NULL", id)
	_ = s.db.Get(&outstanding, "SELECT COALESCE(SUM(total_cents-paid_cents),0) FROM invoices WHERE patient_id=? AND status NOT IN ('paid','void') AND deleted_at IS NULL", id)
	_ = s.db.Get(&last, "SELECT COALESCE(MAX(started_at),'') FROM encounters WHERE patient_id=? AND deleted_at IS NULL", id)
	_ = s.db.Get(&documents, "SELECT COUNT(1) FROM patient_files WHERE patient_id=? AND deleted_at IS NULL AND checksum<>''", id)
	d.Stats = map[string]any{
		"visits": visits, "active_prescriptions": activeRx,
		"outstanding_cents": outstanding, "last_visit_at": last,
		"documents": documents,
	}
	return d, nil
}

type PatientInput struct {
	ID                    string `json:"id"`
	MRN                   string `json:"mrn"`
	FirstName             string `json:"first_name"`
	LastName              string `json:"last_name"`
	PreferredName         string `json:"preferred_name"`
	Sex                   string `json:"sex"`
	DateOfBirth           string `json:"date_of_birth"`
	Phone                 string `json:"phone"`
	AltPhone              string `json:"alt_phone"`
	Email                 string `json:"email"`
	Address               string `json:"address"`
	City                  string `json:"city"`
	NationalID            string `json:"national_id"`
	BloodType             string `json:"blood_type"`
	MaritalStatus         string `json:"marital_status"`
	Occupation            string `json:"occupation"`
	EmergencyContactName  string `json:"emergency_contact_name"`
	EmergencyContactPhone string `json:"emergency_contact_phone"`
	InsuranceProvider     string `json:"insurance_provider"`
	InsuranceNumber       string `json:"insurance_number"`
	Notes                 string `json:"notes"`
	Status                string `json:"status"`
}

func (p PatientInput) fields() map[string]any {
	m := map[string]any{
		"mrn": p.MRN, "first_name": p.FirstName, "last_name": p.LastName,
		"preferred_name": p.PreferredName, "sex": p.Sex, "date_of_birth": p.DateOfBirth,
		"phone": p.Phone, "alt_phone": p.AltPhone, "email": p.Email, "address": p.Address,
		"city": p.City, "national_id": p.NationalID, "blood_type": p.BloodType,
		"marital_status": p.MaritalStatus, "occupation": p.Occupation,
		"emergency_contact_name":  p.EmergencyContactName,
		"emergency_contact_phone": p.EmergencyContactPhone,
		"insurance_provider":      p.InsuranceProvider, "insurance_number": p.InsuranceNumber,
		"notes": p.Notes, "status": p.Status,
	}
	if m["status"] == "" {
		m["status"] = "active"
	}
	return m
}

func (s *Store) CreatePatient(p PatientInput) (map[string]any, error) {
	if strings.TrimSpace(p.FirstName) == "" || strings.TrimSpace(p.LastName) == "" {
		return nil, errors.New("first and last name are required")
	}
	if p.MRN == "" {
		p.MRN = ShortCode("P")
	}
	row, err := s.CreateRecord("patients", p.fields(), &Audit{
		Action: "patient.created", Summary: "Registered patient " + p.FirstName + " " + p.LastName,
	})
	if err != nil {
		// A duplicate MRN is the only realistic unique constraint here; retry.
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			p.MRN = ShortCode("P")
			return s.CreateRecord("patients", p.fields(), &Audit{
				Action: "patient.created", Summary: "Registered patient " + p.FirstName + " " + p.LastName,
			})
		}
	}
	return row, err
}

func (s *Store) UpdatePatient(id string, p PatientInput) (map[string]any, error) {
	fields := p.fields()
	delete(fields, "mrn")
	if p.Status == "" {
		fields["status"] = "active"
	}
	return s.UpdateRecord("patients", id, fields, &Audit{
		Action: "patient.updated", Summary: "Updated patient " + p.FirstName + " " + p.LastName,
	})
}

// ---- Allergies & conditions ---------------------------------------------

func (s *Store) SaveAllergy(fields map[string]any) (map[string]any, error) {
	id := fieldID(fields)
	delete(fields, "id")
	if id != "" {
		return s.UpdateRecord("allergies", id, fields, &Audit{Action: "allergy.updated", Summary: "Updated allergy record"})
	}
	return s.CreateRecord("allergies", fields, &Audit{Action: "allergy.created", Summary: "Recorded allergy"})
}

func (s *Store) SaveCondition(fields map[string]any) (map[string]any, error) {
	id := fieldID(fields)
	delete(fields, "id")
	if id != "" {
		return s.UpdateRecord("conditions", id, fields, &Audit{Action: "condition.updated", Summary: "Updated medical condition"})
	}
	return s.CreateRecord("conditions", fields, &Audit{Action: "condition.created", Summary: "Recorded medical condition"})
}

func (s *Store) ArchiveEntity(entity, id, label string) error {
	if entity == "encounters" || entity == "prescriptions" || entity == "invoices" {
		return errors.New("this record cannot be deleted; use void or archive the patient instead")
	}
	return s.Archive(entity, id, &Audit{Action: entity + ".archived", Summary: "Archived " + label})
}

// ---- Appointments --------------------------------------------------------

func (s *Store) AppointmentsBetween(start, end, providerID string) ([]map[string]any, error) {
	q := `SELECT a.*, p.first_name, p.last_name, p.mrn, p.date_of_birth, p.phone,
		COALESCE(st.full_name,'Unassigned') AS provider_name, COALESCE(st.color,'#2a3747') AS provider_color,
		(SELECT e.id FROM encounters e WHERE e.appointment_id=a.id AND e.deleted_at IS NULL ORDER BY e.started_at DESC LIMIT 1) AS encounter_id
		FROM appointments a
		LEFT JOIN patients p ON p.id=a.patient_id
		LEFT JOIN staff st ON st.id=a.provider_id
		WHERE a.deleted_at IS NULL AND a.start_at>=? AND a.start_at<?`
	args := []any{start, end}
	if location := s.LocationID(); location != "" {
		q += " AND a.location_id=?"
		args = append(args, location)
	}
	if providerID != "" {
		q += " AND a.provider_id=?"
		args = append(args, providerID)
	}
	q += " ORDER BY a.start_at"
	return s.queryMaps(q, args...)
}

type AppointmentInput struct {
	PatientID  string `json:"patient_id"`
	ProviderID string `json:"provider_id"`
	StartAt    string `json:"start_at"`
	EndAt      string `json:"end_at"`
	Reason     string `json:"reason"`
	Room       string `json:"room"`
	Notes      string `json:"notes"`
	Status     string `json:"status"`
}

var appointmentStatuses = map[string]bool{
	"scheduled": true, "confirmed": true, "arrived": true, "waiting": true,
	"in_progress": true, "completed": true, "cancelled": true, "no_show": true,
}

func (s *Store) CreateAppointment(in AppointmentInput) (map[string]any, error) {
	if in.PatientID == "" || in.StartAt == "" {
		return nil, errors.New("patient and start time are required")
	}
	if in.Status == "" {
		in.Status = "scheduled"
	}
	if !appointmentStatuses[in.Status] {
		return nil, errors.New("invalid appointment status")
	}
	if in.EndAt == "" {
		if t, err := time.Parse(time.RFC3339, in.StartAt); err == nil {
			in.EndAt = t.Add(30 * time.Minute).Format(time.RFC3339)
		}
	}
	if in.EndAt <= in.StartAt {
		return nil, errors.New("end time must be after start time")
	}
	return s.CreateRecord("appointments", map[string]any{
		"patient_id": in.PatientID, "provider_id": in.ProviderID, "start_at": in.StartAt,
		"end_at": in.EndAt, "status": in.Status, "reason": in.Reason, "room": in.Room, "notes": in.Notes,
	}, &Audit{Action: "appointment.created", Summary: "Booked appointment"})
}

func (s *Store) UpdateAppointment(id string, patch map[string]any) (map[string]any, error) {
	if st, ok := patch["status"].(string); ok && st != "" && !appointmentStatuses[st] {
		return nil, errors.New("invalid appointment status")
	}
	if st, ok := patch["status"].(string); ok && (st == "arrived" || st == "waiting") {
		if _, exists := patch["checked_in_at"]; !exists {
			patch["checked_in_at"] = time.Now().UTC().Format(time.RFC3339)
		}
	}
	return s.UpdateRecord("appointments", id, patch, &Audit{Action: "appointment.updated", Summary: "Updated appointment"})
}

// ---- Encounters ----------------------------------------------------------

func (s *Store) ListEncounters(patientID, providerID string, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 300 {
		limit = 100
	}
	q := `SELECT e.*, p.first_name, p.last_name, p.mrn, p.date_of_birth,
		COALESCE(st.full_name,'Unassigned') AS provider_name, COALESCE(st.color,'#2a3747') AS provider_color,
		(SELECT COUNT(1) FROM diagnoses d WHERE d.encounter_id=e.id AND d.deleted_at IS NULL) AS diagnosis_count
		FROM encounters e
		LEFT JOIN patients p ON p.id=e.patient_id
		LEFT JOIN staff st ON st.id=e.provider_id
		WHERE e.deleted_at IS NULL`
	args := []any{}
	if location := s.LocationID(); location != "" {
		q += " AND e.location_id=?"
		args = append(args, location)
	}
	if patientID != "" {
		q += " AND e.patient_id=?"
		args = append(args, patientID)
	}
	if providerID != "" {
		q += " AND e.provider_id=?"
		args = append(args, providerID)
	}
	q += " ORDER BY e.started_at DESC LIMIT ?"
	args = append(args, limit)
	return s.queryMaps(q, args...)
}

type EncounterDetail struct {
	Encounter     map[string]any   `json:"encounter"`
	Patient       map[string]any   `json:"patient"`
	Vitals        map[string]any   `json:"vitals"`
	Diagnoses     []map[string]any `json:"diagnoses"`
	Prescriptions []map[string]any `json:"prescriptions"`
	Addenda       []map[string]any `json:"addenda"`
	Allergies     []map[string]any `json:"allergies"`
}

func (s *Store) EncounterDetail(id string) (EncounterDetail, error) {
	var d EncounterDetail
	rows, err := s.queryMaps(`SELECT e.*, p.first_name, p.last_name, p.mrn, p.date_of_birth, p.sex, p.phone,
		COALESCE(st.full_name,'Unassigned') AS provider_name, COALESCE(st.color,'#2a3747') AS provider_color
		FROM encounters e
		LEFT JOIN patients p ON p.id=e.patient_id
		LEFT JOIN staff st ON st.id=e.provider_id
		WHERE e.id=? AND e.deleted_at IS NULL`, id)
	if err != nil {
		return d, err
	}
	if len(rows) == 0 {
		return d, ErrNotFound
	}
	d.Encounter = rows[0]
	pid := fmt.Sprint(rows[0]["patient_id"])
	d.Patient, _ = s.GetPatient(pid)
	d.Allergies, _ = s.queryMaps(`SELECT * FROM allergies WHERE patient_id=? AND active=1 AND deleted_at IS NULL`, pid)
	vrows, _ := s.queryMaps(`SELECT * FROM vitals WHERE encounter_id=? AND deleted_at IS NULL ORDER BY measured_at DESC LIMIT 1`, id)
	if len(vrows) > 0 {
		d.Vitals = vrows[0]
	}
	d.Diagnoses, _ = s.queryMaps(`SELECT * FROM diagnoses WHERE encounter_id=? AND deleted_at IS NULL ORDER BY kind, description`, id)
	d.Addenda, _ = s.queryMaps(`SELECT a.*, COALESCE(st.full_name,'') AS provider_name FROM encounter_addenda a
		LEFT JOIN staff st ON st.id=a.provider_id WHERE a.encounter_id=? AND a.deleted_at IS NULL ORDER BY a.created_at`, id)
	rxRows, _ := s.queryMaps(`SELECT * FROM prescriptions WHERE encounter_id=? AND deleted_at IS NULL ORDER BY issued_at`, id)
	for _, rx := range rxRows {
		rx["items"], _ = s.queryMaps(`SELECT * FROM prescription_items WHERE prescription_id=? AND deleted_at IS NULL ORDER BY position`, fmt.Sprint(rx["id"]))
	}
	d.Prescriptions = rxRows
	return d, nil
}

type EncounterInput struct {
	ID             string `json:"id"`
	PatientID      string `json:"patient_id"`
	AppointmentID  string `json:"appointment_id"`
	ProviderID     string `json:"provider_id"`
	Type           string `json:"type"`
	ChiefComplaint string `json:"chief_complaint"`
	Subjective     string `json:"subjective"`
	Objective      string `json:"objective"`
	Assessment     string `json:"assessment"`
	Plan           string `json:"plan"`
	FollowUpOn     string `json:"follow_up_on"`
	StartedAt      string `json:"started_at"`
	SpecialtyData  string `json:"specialty_data"`
}

func (s *Store) SaveEncounter(in EncounterInput) (map[string]any, error) {
	fields := map[string]any{
		"patient_id": in.PatientID, "appointment_id": in.AppointmentID, "provider_id": in.ProviderID,
		"type": in.Type, "chief_complaint": in.ChiefComplaint, "subjective": in.Subjective,
		"objective": in.Objective, "assessment": in.Assessment, "plan": in.Plan,
		"follow_up_on": in.FollowUpOn, "started_at": in.StartedAt,
	}
	if strings.TrimSpace(in.SpecialtyData) != "" {
		fields["specialty_data"] = in.SpecialtyData
	}
	if in.ID != "" {
		cur, err := s.Row("encounters", in.ID)
		if err != nil {
			return nil, err
		}
		if fmt.Sprint(cur["status"]) == "signed" {
			return nil, errors.New("this visit is signed. Add an addendum instead of editing it")
		}
		delete(fields, "appointment_id")
		delete(fields, "patient_id")
		delete(fields, "started_at")
		return s.UpdateRecord("encounters", in.ID, fields, &Audit{Action: "encounter.updated", Summary: "Updated visit"})
	}
	if in.PatientID == "" {
		return nil, errors.New("patient is required")
	}
	if in.Type == "" {
		fields["type"] = "visit"
	}
	if in.StartedAt == "" {
		fields["started_at"] = time.Now().UTC().Format(time.RFC3339)
	}
	fields["status"] = "draft"
	return s.CreateRecord("encounters", fields, &Audit{Action: "encounter.created", Summary: "Started a visit"})
}

func (s *Store) SignEncounter(id, providerID, signedName string) (map[string]any, error) {
	cur, err := s.Row("encounters", id)
	if err != nil {
		return nil, err
	}
	if fmt.Sprint(cur["status"]) == "signed" {
		return nil, errors.New("visit is already signed")
	}
	if strings.TrimSpace(fmt.Sprint(cur["assessment"])) == "" {
		return nil, errors.New("add an assessment before signing")
	}
	return s.UpdateRecord("encounters", id, map[string]any{
		"status": "signed", "signed_at": time.Now().UTC().Format(time.RFC3339),
		"signed_by": providerID, "signed_name": signedName,
		"ended_at": time.Now().UTC().Format(time.RFC3339),
	}, &Audit{Action: "encounter.signed", Summary: "Signed clinical visit"})
}

func (s *Store) AddAddendum(encounterID, providerID, body string) (map[string]any, error) {
	if strings.TrimSpace(body) == "" {
		return nil, errors.New("addendum text is required")
	}
	enc, err := s.Row("encounters", encounterID)
	if err != nil {
		return nil, err
	}
	return s.CreateRecord("encounter_addenda", map[string]any{
		"encounter_id": encounterID, "patient_id": fmt.Sprint(enc["patient_id"]),
		"provider_id": providerID, "body": body,
	}, &Audit{Action: "encounter.addendum", Summary: "Added a clinical addendum"})
}

func (s *Store) SaveVitals(encounterID string, fields map[string]any) (map[string]any, error) {
	enc, err := s.Row("encounters", encounterID)
	if err != nil {
		return nil, err
	}
	fields["encounter_id"] = encounterID
	fields["patient_id"] = fmt.Sprint(enc["patient_id"])
	rows, _ := s.queryMaps("SELECT id FROM vitals WHERE encounter_id=? AND deleted_at IS NULL LIMIT 1", encounterID)
	if len(rows) > 0 {
		delete(fields, "measured_at")
		return s.UpdateRecord("vitals", fmt.Sprint(rows[0]["id"]), fields, &Audit{Action: "vitals.updated", Summary: "Recorded vitals"})
	}
	if fmt.Sprint(fields["measured_at"]) == "" {
		fields["measured_at"] = time.Now().UTC().Format(time.RFC3339)
	}
	return s.CreateRecord("vitals", fields, &Audit{Action: "vitals.created", Summary: "Recorded vitals"})
}

func (s *Store) SaveDiagnosis(encounterID string, fields map[string]any) (map[string]any, error) {
	enc, err := s.Row("encounters", encounterID)
	if err != nil {
		return nil, err
	}
	id := fieldID(fields)
	delete(fields, "id")
	fields["encounter_id"] = encounterID
	fields["patient_id"] = fmt.Sprint(enc["patient_id"])
	if id != "" {
		return s.UpdateRecord("diagnoses", id, fields, &Audit{Action: "diagnosis.updated", Summary: "Updated diagnosis"})
	}
	return s.CreateRecord("diagnoses", fields, &Audit{Action: "diagnosis.created", Summary: "Added diagnosis"})
}

// ---- Prescriptions -------------------------------------------------------

type PrescriptionItemInput struct {
	DrugName     string `json:"drug_name"`
	Strength     string `json:"strength"`
	Form         string `json:"form"`
	Dose         string `json:"dose"`
	Frequency    string `json:"frequency"`
	DurationDays int    `json:"duration_days"`
	Quantity     int    `json:"quantity"`
	Instructions string `json:"instructions"`
	Refills      int    `json:"refills"`
}

type PrescriptionInput struct {
	PatientID   string                  `json:"patient_id"`
	EncounterID string                  `json:"encounter_id"`
	ProviderID  string                  `json:"provider_id"`
	Notes       string                  `json:"notes"`
	Items       []PrescriptionItemInput `json:"items"`
}

func (s *Store) CreatePrescription(in PrescriptionInput) (map[string]any, error) {
	if in.PatientID == "" {
		return nil, errors.New("patient is required")
	}
	if len(in.Items) == 0 {
		return nil, errors.New("add at least one medication")
	}
	tx := s.db.MustBegin()
	defer tx.Rollback()
	rx, rxID, err := s.createInTx(tx, "prescriptions", map[string]any{
		"patient_id": in.PatientID, "encounter_id": in.EncounterID, "provider_id": in.ProviderID,
		"status": "active", "issued_at": time.Now().UTC().Format(time.RFC3339), "notes": in.Notes,
	}, &Audit{Action: "prescription.created", Summary: "Issued a prescription"})
	if err != nil {
		return nil, err
	}
	_ = rx
	for i, item := range in.Items {
		if strings.TrimSpace(item.DrugName) == "" {
			continue
		}
		if _, _, err := s.createInTx(tx, "prescription_items", map[string]any{
			"prescription_id": rxID, "drug_name": item.DrugName, "strength": item.Strength,
			"form": item.Form, "dose": item.Dose, "frequency": item.Frequency,
			"duration_days": item.DurationDays, "quantity": item.Quantity,
			"instructions": item.Instructions, "refills": item.Refills, "position": i,
		}, nil); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	s.emit("prescriptions", rxID)
	return s.PrescriptionDetail(rxID)
}

func (s *Store) PrescriptionDetail(id string) (map[string]any, error) {
	rx, err := s.Row("prescriptions", id)
	if err != nil {
		return nil, err
	}
	rx["items"], _ = s.queryMaps(`SELECT * FROM prescription_items WHERE prescription_id=? AND deleted_at IS NULL ORDER BY position`, id)
	rx["patient"], _ = s.GetPatient(fmt.Sprint(rx["patient_id"]))
	if pid := fmt.Sprint(rx["provider_id"]); pid != "" {
		rx["provider"], _ = s.StaffPublic(pid)
	}
	clinic, _ := s.GetClinic()
	rx["clinic"] = clinic
	if locationID := fmt.Sprint(rx["location_id"]); locationID != "" {
		if location, err := s.LocationByID(locationID); err == nil {
			rx["location"] = location
		}
	}
	return rx, nil
}

func (s *Store) ListPrescriptions(patientID string, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 300 {
		limit = 100
	}
	q := `SELECT pr.*, p.first_name, p.last_name, p.mrn, COALESCE(st.full_name,'') AS provider_name,
		(SELECT COUNT(1) FROM prescription_items pi WHERE pi.prescription_id=pr.id AND pi.deleted_at IS NULL) AS item_count
		FROM prescriptions pr LEFT JOIN patients p ON p.id=pr.patient_id LEFT JOIN staff st ON st.id=pr.provider_id
		WHERE pr.deleted_at IS NULL`
	args := []any{}
	if patientID != "" {
		q += " AND pr.patient_id=?"
		args = append(args, patientID)
	} else if location := s.LocationID(); location != "" {
		q += " AND pr.location_id=?"
		args = append(args, location)
	}
	q += " ORDER BY pr.issued_at DESC LIMIT ?"
	args = append(args, limit)
	return s.queryMaps(q, args...)
}

func (s *Store) UpdatePrescriptionStatus(id, status string) (map[string]any, error) {
	if status != "active" && status != "completed" && status != "cancelled" {
		return nil, errors.New("invalid prescription status")
	}
	return s.UpdateRecord("prescriptions", id, map[string]any{"status": status}, &Audit{
		Action: "prescription.status", Summary: "Prescription marked " + status,
	})
}

// ---- Services & invoices -------------------------------------------------

func (s *Store) ListServices() ([]map[string]any, error) {
	return s.queryMaps("SELECT * FROM services WHERE deleted_at IS NULL AND active=1 ORDER BY category, name")
}

func (s *Store) SaveService(fields map[string]any) (map[string]any, error) {
	id := fieldID(fields)
	delete(fields, "id")
	if id != "" {
		return s.UpdateRecord("services", id, fields, &Audit{Action: "service.updated", Summary: "Updated service"})
	}
	if fmt.Sprint(fields["name"]) == "" {
		return nil, errors.New("service name is required")
	}
	return s.CreateRecord("services", fields, &Audit{Action: "service.created", Summary: "Added service"})
}

func (s *Store) ListInvoices(filter string) ([]map[string]any, error) {
	q := `SELECT i.*, p.first_name, p.last_name, p.mrn,
		(SELECT COUNT(1) FROM invoice_items ii WHERE ii.invoice_id=i.id AND ii.deleted_at IS NULL) AS item_count
		FROM invoices i LEFT JOIN patients p ON p.id=i.patient_id WHERE i.deleted_at IS NULL`
	args := []any{}
	if location := s.LocationID(); location != "" {
		q += " AND i.location_id=?"
		args = append(args, location)
	}
	switch filter {
	case "open":
		q += " AND i.status IN ('unpaid','partial')"
	case "paid":
		q += " AND i.status='paid'"
	case "void":
		q += " AND i.status='void'"
	}
	q += " ORDER BY i.issued_at DESC LIMIT 300"
	return s.queryMaps(q, args...)
}

type InvoiceItemInput struct {
	ServiceID      string  `json:"service_id"`
	Description    string  `json:"description"`
	Quantity       float64 `json:"quantity"`
	UnitPriceCents int64   `json:"unit_price_cents"`
}

type InvoiceInput struct {
	PatientID     string             `json:"patient_id"`
	EncounterID   string             `json:"encounter_id"`
	IssuedAt      string             `json:"issued_at"`
	DueAt         string             `json:"due_at"`
	DiscountCents int64              `json:"discount_cents"`
	TaxRateBp     int64              `json:"tax_rate_bp"`
	Notes         string             `json:"notes"`
	Items         []InvoiceItemInput `json:"items"`
}

func (s *Store) CreateInvoice(in InvoiceInput) (map[string]any, error) {
	if in.PatientID == "" {
		return nil, errors.New("patient is required")
	}
	if len(in.Items) == 0 {
		return nil, errors.New("add at least one line item")
	}
	var subtotal int64
	for _, it := range in.Items {
		if it.Quantity <= 0 {
			it.Quantity = 1
		}
		subtotal += int64(it.Quantity*float64(it.UnitPriceCents) + 0.5)
	}
	discount := in.DiscountCents
	if discount < 0 {
		discount = 0
	}
	if discount > subtotal {
		discount = subtotal
	}
	tax := (subtotal - discount) * in.TaxRateBp / 10000
	total := subtotal - discount + tax
	number := ShortCode("INV")
	issued := in.IssuedAt
	if issued == "" {
		issued = time.Now().UTC().Format(time.RFC3339)
	}
	status := "unpaid"
	if total <= 0 {
		status = "paid"
	}
	tx := s.db.MustBegin()
	defer tx.Rollback()
	inv, invID, err := s.createInTx(tx, "invoices", map[string]any{
		"patient_id": in.PatientID, "encounter_id": in.EncounterID, "number": number,
		"status": status, "issued_at": issued, "due_at": in.DueAt,
		"subtotal_cents": subtotal, "discount_cents": discount, "tax_cents": tax,
		"total_cents": total, "paid_cents": 0, "notes": in.Notes,
	}, &Audit{Action: "invoice.created", Summary: "Created invoice " + number})
	if err != nil {
		return nil, err
	}
	_ = inv
	for i, it := range in.Items {
		qty := it.Quantity
		if qty <= 0 {
			qty = 1
		}
		desc := it.Description
		if desc == "" && it.ServiceID != "" {
			if svc, err := s.Row("services", it.ServiceID); err == nil {
				desc = fmt.Sprint(svc["name"])
			}
		}
		line := int64(qty*float64(it.UnitPriceCents) + 0.5)
		if _, _, err := s.createInTx(tx, "invoice_items", map[string]any{
			"invoice_id": invID, "service_id": it.ServiceID, "description": desc,
			"quantity": qty, "unit_price_cents": it.UnitPriceCents, "total_cents": line, "position": i,
		}, nil); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	s.emit("invoices", invID)
	return s.InvoiceDetail(invID)
}

func (s *Store) InvoiceDetail(id string) (map[string]any, error) {
	inv, err := s.Row("invoices", id)
	if err != nil {
		return nil, err
	}
	inv["items"], _ = s.queryMaps(`SELECT * FROM invoice_items WHERE invoice_id=? AND deleted_at IS NULL ORDER BY position`, id)
	inv["payments"], _ = s.queryMaps(`SELECT * FROM payments WHERE invoice_id=? AND deleted_at IS NULL ORDER BY paid_at`, id)
	inv["patient"], _ = s.GetPatient(fmt.Sprint(inv["patient_id"]))
	inv["clinic"], _ = s.GetClinic()
	if locationID := fmt.Sprint(inv["location_id"]); locationID != "" {
		if location, err := s.LocationByID(locationID); err == nil {
			inv["location"] = location
		}
	}
	return inv, nil
}

type PaymentInput struct {
	InvoiceID   string `json:"invoice_id"`
	AmountCents int64  `json:"amount_cents"`
	Method      string `json:"method"`
	Reference   string `json:"reference"`
	Notes       string `json:"notes"`
}

func (s *Store) AddPayment(in PaymentInput) (map[string]any, error) {
	if in.AmountCents <= 0 {
		return nil, errors.New("payment amount must be greater than zero")
	}
	inv, err := s.Row("invoices", in.InvoiceID)
	if err != nil {
		return nil, err
	}
	if fmt.Sprint(inv["status"]) == "void" {
		return nil, errors.New("cannot take payment for a void invoice")
	}
	if in.Method == "" {
		in.Method = "cash"
	}
	tx := s.db.MustBegin()
	defer tx.Rollback()
	if _, _, err := s.createInTx(tx, "payments", map[string]any{
		"invoice_id": in.InvoiceID, "amount_cents": in.AmountCents, "method": in.Method,
		"paid_at": time.Now().UTC().Format(time.RFC3339), "reference": in.Reference, "notes": in.Notes,
	}, &Audit{Action: "payment.created", Summary: "Recorded payment"}); err != nil {
		return nil, err
	}
	var paid, total int64
	if err := tx.Get(&paid, "SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE invoice_id=? AND deleted_at IS NULL", in.InvoiceID); err != nil {
		return nil, err
	}
	total = toInt64(inv["total_cents"])
	status := "partial"
	if paid >= total {
		status = "paid"
		if paid > total {
			paid = total
		}
	} else if paid == 0 {
		status = "unpaid"
	}
	if err := s.updateInTx(tx, "invoices", in.InvoiceID, map[string]any{
		"paid_cents": paid, "status": status,
	}, &Audit{Action: "invoice.paid", Summary: "Invoice payment recorded"}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.InvoiceDetail(in.InvoiceID)
}

func (s *Store) VoidInvoice(id string) (map[string]any, error) {
	return s.UpdateRecord("invoices", id, map[string]any{"status": "void"}, &Audit{Action: "invoice.voided", Summary: "Voided invoice"})
}

func toInt64(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	case []byte:
		var n int64
		fmt.Sscanf(string(x), "%d", &n)
		return n
	case string:
		var n int64
		fmt.Sscanf(x, "%d", &n)
		return n
	}
	return 0
}

// updateInTx mirrors UpdateRecord but works inside a caller-owned transaction.
func (s *Store) updateInTx(tx *sqlx.Tx, entity, id string, candidate map[string]any, audit *Audit) error {
	info, table, err := s.table(entity)
	if err != nil {
		return err
	}
	// Take the revision before the transaction reads: nextRev writes the clock
	// through the pool, and doing that after a read would leave the transaction
	// with a stale WAL snapshot (SQLITE_BUSY_SNAPSHOT on its first write).
	rev := s.nextRev()
	clean := cleanFields(info, candidate)
	old, err := s.rowMapTx(tx, table, id)
	if err != nil {
		return err
	}
	patch := map[string]any{}
	for k, v := range clean {
		if !equalValue(old[k], v) {
			patch[k] = v
		}
	}
	if len(patch) == 0 {
		return nil
	}
	revs := decodeRevs(fmt.Sprint(old["field_revs"]))
	for k := range patch {
		revs[k] = rev
	}
	revJSON, _ := json.Marshal(revs)
	set := make([]string, 0, len(patch)+4)
	args := make([]any, 0, len(patch)+5)
	for k, v := range patch {
		set = append(set, fmt.Sprintf("%q=?", k))
		args = append(args, v)
	}
	set = append(set, "updated_at=?", "rev=?", "field_revs=?", "origin_node=?")
	args = append(args, revTime(rev), rev, string(revJSON), s.node, id)
	if _, err := tx.Exec(fmt.Sprintf("UPDATE %q SET %s WHERE id=?", table, strings.Join(set, ",")), args...); err != nil {
		return err
	}
	if err := s.recordLocalTx(tx, entity, id, patch, false, rev); err != nil {
		return err
	}
	if audit != nil {
		if err := s.writeAuditTx(tx, audit, entity, id); err != nil {
			return err
		}
	}
	return nil
}

// ---- Staff & clinic ------------------------------------------------------

func (s *Store) GetClinic() (map[string]any, error) {
	if s.ClinicID() == "" {
		return nil, ErrNotFound
	}
	return s.Row("clinics", s.ClinicID())
}

func (s *Store) UpdateClinic(fields map[string]any) (map[string]any, error) {
	delete(fields, "id")
	delete(fields, "clinic_id")
	return s.UpdateRecord("clinics", s.ClinicID(), fields, &Audit{Action: "clinic.updated", Summary: "Updated clinic settings"})
}

// ---- Dashboard & reports -------------------------------------------------

func (s *Store) Dashboard(dayStart, dayEnd string) (map[string]any, error) {
	locationID := s.LocationID()
	appts, _ := s.AppointmentsBetween(dayStart, dayEnd, "")
	var todayCount, arrivedCount, completedCount int
	for _, a := range appts {
		todayCount++
		switch fmt.Sprint(a["status"]) {
		case "arrived", "waiting", "in_progress":
			arrivedCount++
		case "completed":
			completedCount++
		}
	}
	monthStart := dayStart[:8] + "01T00:00:00Z"
	if len(dayStart) >= 10 {
		monthStart = dayStart[:8] + "01T00:00:00Z"
	}
	locSQL, locArgs := locationClause(locationID, "location_id")
	var newPatients, outstanding, monthRevenue int64
	_ = s.db.Get(&newPatients, "SELECT COUNT(1) FROM patients WHERE deleted_at IS NULL AND created_at>=?"+locSQL,
		append([]any{monthStart}, locArgs...)...)
	_ = s.db.Get(&outstanding, "SELECT COALESCE(SUM(total_cents-paid_cents),0) FROM invoices WHERE deleted_at IS NULL AND status IN ('unpaid','partial')"+locSQL,
		locArgs...)
	_ = s.db.Get(&monthRevenue, "SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE deleted_at IS NULL AND paid_at>=?"+locSQL,
		append([]any{monthStart}, locArgs...)...)
	var monthExpenses int64
	_ = s.db.Get(&monthExpenses, "SELECT COALESCE(SUM(amount_cents),0) FROM expenses WHERE deleted_at IS NULL AND spent_on>=? AND spent_on<=?"+locSQL,
		append([]any{monthStart[:10], dayStart[:10]}, locArgs...)...)
	inventory, _ := s.InventorySummary(locationID)
	followups, _ := s.queryMaps(`SELECT e.id, e.patient_id, e.follow_up_on, p.first_name, p.last_name, p.mrn,
		COALESCE(st.full_name,'') AS provider_name
		FROM encounters e LEFT JOIN patients p ON p.id=e.patient_id LEFT JOIN staff st ON st.id=e.provider_id
		WHERE e.deleted_at IS NULL AND e.follow_up_on<>'' AND e.follow_up_on>=?`+locationClauseSQL(locationID, "e.location_id")+`
		ORDER BY e.follow_up_on LIMIT 8`, append([]any{dayStart[:10]}, locArgs...)...)
	unpaid, _ := s.queryMaps(`SELECT i.*, p.first_name, p.last_name, p.mrn FROM invoices i
		LEFT JOIN patients p ON p.id=i.patient_id
		WHERE i.deleted_at IS NULL AND i.status IN ('unpaid','partial')`+locationClauseSQL(locationID, "i.location_id")+`
		ORDER BY i.issued_at DESC LIMIT 6`, locArgs...)
	recent, _ := s.queryMaps(`SELECT * FROM patients WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5`)
	draftVisits, _ := s.queryMaps(`SELECT e.id, e.patient_id, e.started_at, p.first_name, p.last_name, p.mrn
		FROM encounters e JOIN patients p ON p.id=e.patient_id
		WHERE e.deleted_at IS NULL AND e.status='draft'`+locationClauseSQL(locationID, "e.location_id")+`
		ORDER BY e.started_at DESC LIMIT 5`, locArgs...)
	allTasks, _ := s.ListTasks("open")
	tasksDue, tasksOverdue, tasksOpen := 0, 0, len(allTasks)
	today := dayStart[:10]
	for _, t := range allTasks {
		due := fmt.Sprint(t["due_on"])
		if due != "" && due <= today {
			tasksDue++
		}
		if due != "" && due < today {
			tasksOverdue++
		}
	}
	tasks := allTasks
	if len(tasks) > 6 {
		tasks = tasks[:6]
	}
	return map[string]any{
		"appointments_today": todayCount, "waiting": arrivedCount, "completed": completedCount,
		"new_patients_month": newPatients, "outstanding_cents": outstanding, "month_revenue_cents": monthRevenue,
		"month_expenses_cents": monthExpenses, "low_stock": inventory["low_stock"],
		"out_of_stock": inventory["out_of_stock"], "stock_value_cents": inventory["stock_value_cents"],
		"today": appts, "followups": followups, "unpaid": unpaid, "recent_patients": recent,
		"draft_visits": draftVisits, "tasks": tasks, "tasks_open": tasksOpen,
		"tasks_due": tasksDue, "tasks_overdue": tasksOverdue,
	}, nil
}

// Reports returns the complete metric pack for one period. An empty
// locationID aggregates every clinic in the network; otherwise only records
// attributed to that clinic are counted.
func (s *Store) Reports(dayStart, dayEnd, locationID string) (map[string]any, error) {
	return s.reportsFor(dayStart, dayEnd, locationID)
}

func locationClause(locationID, column string) (string, []any) {
	if strings.TrimSpace(locationID) == "" {
		return "", nil
	}
	return " AND " + column + "=?", []any{locationID}
}

func periodArgs(dayStart, dayEnd string, extra []any) []any {
	args := []any{dayStart, dayEnd}
	return append(args, extra...)
}

func (s *Store) reportsFor(dayStart, dayEnd, locationID string) (map[string]any, error) {
	var invoiced, collected, outstanding, expenses int64
	var visits, appointments, completed, cancelled, noShows, newPatients, uniquePatients int64
	var unsignedNotes, prescriptions, followUps int64
	var avgWait, avgVisit float64

	invLoc, invLocArgs := locationClause(locationID, "location_id")
	_ = s.db.Get(&invoiced, "SELECT COALESCE(SUM(total_cents),0) FROM invoices WHERE deleted_at IS NULL AND status<>'void' AND issued_at>=? AND issued_at<?"+invLoc,
		periodArgs(dayStart, dayEnd, invLocArgs)...)
	payLoc, payLocArgs := locationClause(locationID, "location_id")
	_ = s.db.Get(&collected, "SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE deleted_at IS NULL AND paid_at>=? AND paid_at<?"+payLoc,
		periodArgs(dayStart, dayEnd, payLocArgs)...)
	_ = s.db.Get(&outstanding, "SELECT COALESCE(SUM(total_cents-paid_cents),0) FROM invoices WHERE deleted_at IS NULL AND status IN ('unpaid','partial')"+invLoc,
		invLocArgs...)
	expLoc, expLocArgs := locationClause(locationID, "location_id")
	_ = s.db.Get(&expenses, `SELECT COALESCE(SUM(amount_cents),0) FROM expenses
		WHERE deleted_at IS NULL AND spent_on>=? AND spent_on<?`+expLoc,
		periodArgs(dayStart[:10], dayEnd[:10], expLocArgs)...)
	encLoc, encLocArgs := locationClause(locationID, "location_id")
	_ = s.db.Get(&visits, "SELECT COUNT(1) FROM encounters WHERE deleted_at IS NULL AND started_at>=? AND started_at<?"+encLoc,
		periodArgs(dayStart, dayEnd, encLocArgs)...)
	_ = s.db.Get(&unsignedNotes, "SELECT COUNT(1) FROM encounters WHERE deleted_at IS NULL AND status='draft' AND started_at>=? AND started_at<?"+encLoc,
		periodArgs(dayStart, dayEnd, encLocArgs)...)
	_ = s.db.Get(&uniquePatients, "SELECT COUNT(DISTINCT patient_id) FROM encounters WHERE deleted_at IS NULL AND started_at>=? AND started_at<?"+encLoc,
		periodArgs(dayStart, dayEnd, encLocArgs)...)
	apptLoc, apptLocArgs := locationClause(locationID, "location_id")
	_ = s.db.Get(&appointments, "SELECT COUNT(1) FROM appointments WHERE deleted_at IS NULL AND start_at>=? AND start_at<?"+apptLoc,
		periodArgs(dayStart, dayEnd, apptLocArgs)...)
	_ = s.db.Get(&completed, "SELECT COUNT(1) FROM appointments WHERE deleted_at IS NULL AND status='completed' AND start_at>=? AND start_at<?"+apptLoc,
		periodArgs(dayStart, dayEnd, apptLocArgs)...)
	_ = s.db.Get(&cancelled, "SELECT COUNT(1) FROM appointments WHERE deleted_at IS NULL AND status='cancelled' AND start_at>=? AND start_at<?"+apptLoc,
		periodArgs(dayStart, dayEnd, apptLocArgs)...)
	_ = s.db.Get(&noShows, "SELECT COUNT(1) FROM appointments WHERE deleted_at IS NULL AND status='no_show' AND start_at>=? AND start_at<?"+apptLoc,
		periodArgs(dayStart, dayEnd, apptLocArgs)...)
	patientLoc, patientLocArgs := locationClause(locationID, "location_id")
	_ = s.db.Get(&newPatients, "SELECT COUNT(1) FROM patients WHERE deleted_at IS NULL AND created_at>=? AND created_at<?"+patientLoc,
		periodArgs(dayStart, dayEnd, patientLocArgs)...)
	_ = s.db.Get(&avgWait, `SELECT COALESCE(AVG((julianday(start_at)-julianday(checked_in_at))*1440),0)
		FROM appointments WHERE deleted_at IS NULL AND checked_in_at<>'' AND start_at>=? AND start_at<?
		AND julianday(start_at)>=julianday(checked_in_at)`+apptLoc,
		periodArgs(dayStart, dayEnd, apptLocArgs)...)
	_ = s.db.Get(&avgVisit, `SELECT COALESCE(AVG((julianday(ended_at)-julianday(started_at))*1440),0)
		FROM encounters WHERE deleted_at IS NULL AND ended_at<>'' AND started_at>=? AND started_at<?
		AND julianday(ended_at)>=julianday(started_at)`+encLoc,
		periodArgs(dayStart, dayEnd, encLocArgs)...)
	rxLoc, rxLocArgs := locationClause(locationID, "location_id")
	_ = s.db.Get(&prescriptions, "SELECT COUNT(1) FROM prescriptions WHERE deleted_at IS NULL AND issued_at>=? AND issued_at<?"+rxLoc,
		periodArgs(dayStart, dayEnd, rxLocArgs)...)
	_ = s.db.Get(&followUps, "SELECT COUNT(1) FROM encounters WHERE deleted_at IS NULL AND follow_up_on>=? AND follow_up_on<=?"+encLoc,
		periodArgs(dayStart[:10], dayEnd[:10], encLocArgs)...)

	byDay, _ := s.queryMaps(`SELECT substr(paid_at,1,10) AS day, SUM(amount_cents) AS cents
		FROM payments WHERE deleted_at IS NULL AND paid_at>=? AND paid_at<?`+payLoc+` GROUP BY day ORDER BY day`,
		periodArgs(dayStart, dayEnd, payLocArgs)...)
	invoicedByDay, _ := s.queryMaps(`SELECT substr(issued_at,1,10) AS day, SUM(total_cents) AS cents
		FROM invoices WHERE deleted_at IS NULL AND status<>'void' AND issued_at>=? AND issued_at<?`+invLoc+` GROUP BY day ORDER BY day`,
		periodArgs(dayStart, dayEnd, invLocArgs)...)
	statusCounts, _ := s.queryMaps(`SELECT status, COUNT(1) AS n FROM appointments
		WHERE deleted_at IS NULL AND start_at>=? AND start_at<?`+apptLoc+` GROUP BY status`,
		periodArgs(dayStart, dayEnd, apptLocArgs)...)
	topDiagnoses, _ := s.queryMaps(`SELECT description, COUNT(1) AS n FROM diagnoses
		WHERE deleted_at IS NULL AND created_at>=? AND created_at<? AND description<>''`+locationClauseSQL(locationID, "location_id")+`
		GROUP BY description ORDER BY n DESC LIMIT 8`, periodArgs(dayStart, dayEnd, locationArgs(locationID))...)
	providers, _ := s.queryMaps(`SELECT s.id, s.full_name, s.color, COUNT(e.id) AS visits,
		COUNT(DISTINCT e.patient_id) AS unique_patients,
		COUNT(DISTINCT CASE WHEN e.status='signed' THEN e.id END) AS signed,
		COALESCE(AVG(CASE WHEN e.ended_at<>'' THEN (julianday(e.ended_at)-julianday(e.started_at))*1440 END),0) AS avg_minutes
		FROM staff s LEFT JOIN encounters e ON e.provider_id=s.id AND e.deleted_at IS NULL AND e.started_at>=? AND e.started_at<?`+
		locationClauseSQL(locationID, "e.location_id")+`
		WHERE s.deleted_at IS NULL AND s.active=1 GROUP BY s.id HAVING visits>0 ORDER BY visits DESC`,
		periodArgs(dayStart, dayEnd, locationArgs(locationID))...)
	providerRevenue, _ := s.queryMaps(`SELECT e.provider_id AS id, COALESCE(SUM(i.total_cents),0) AS cents
		FROM invoices i JOIN encounters e ON e.id=i.encounter_id
		WHERE i.deleted_at IS NULL AND i.status<>'void' AND i.issued_at>=? AND i.issued_at<?`+
		locationClauseSQL(locationID, "i.location_id")+` GROUP BY e.provider_id`,
		periodArgs(dayStart, dayEnd, locationArgs(locationID))...)
	revenueByMethod, _ := s.queryMaps(`SELECT method, SUM(amount_cents) AS cents, COUNT(1) AS n
		FROM payments WHERE deleted_at IS NULL AND paid_at>=? AND paid_at<?`+payLoc+`
		GROUP BY method ORDER BY cents DESC`, periodArgs(dayStart, dayEnd, payLocArgs)...)
	revenueByService, _ := s.queryMaps(`SELECT ii.description AS label, SUM(ii.total_cents) AS cents, SUM(ii.quantity) AS n
		FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
		WHERE ii.deleted_at IS NULL AND i.deleted_at IS NULL AND i.status<>'void' AND i.issued_at>=? AND i.issued_at<?
		AND ii.description<>''`+locationClauseSQL(locationID, "i.location_id")+`
		GROUP BY ii.description ORDER BY cents DESC LIMIT 10`, periodArgs(dayStart, dayEnd, locationArgs(locationID))...)
	expensesByCategory, _ := s.queryMaps(`SELECT category AS label, SUM(amount_cents) AS cents, COUNT(1) AS n
		FROM expenses WHERE deleted_at IS NULL AND spent_on>=? AND spent_on<?`+expLoc+`
		GROUP BY category ORDER BY cents DESC`, periodArgs(dayStart[:10], dayEnd[:10], expLocArgs)...)
	revenueByLocation, _ := s.queryMaps(`SELECT COALESCE(l.id,'') AS id, COALESCE(l.name,'Unassigned') AS name,
		COALESCE(l.color,'#2a3747') AS color, SUM(p.amount_cents) AS cents
		FROM payments p LEFT JOIN locations l ON l.id=p.location_id
		WHERE p.deleted_at IS NULL AND p.paid_at>=? AND p.paid_at<?`+locationClauseSQL(locationID, "p.location_id")+`
		GROUP BY l.id ORDER BY cents DESC`, periodArgs(dayStart, dayEnd, locationArgs(locationID))...)
	visitsByWeekday, _ := s.queryMaps(`SELECT CAST(strftime('%w', started_at) AS INTEGER) AS weekday, COUNT(1) AS n
		FROM encounters WHERE deleted_at IS NULL AND started_at>=? AND started_at<?`+encLoc+`
		GROUP BY weekday ORDER BY weekday`, periodArgs(dayStart, dayEnd, encLocArgs)...)
	visitsByHour, _ := s.queryMaps(`SELECT CAST(strftime('%H', start_at) AS INTEGER) AS hour, COUNT(1) AS n
		FROM appointments WHERE deleted_at IS NULL AND start_at>=? AND start_at<?`+apptLoc+`
		GROUP BY hour ORDER BY hour`, periodArgs(dayStart, dayEnd, apptLocArgs)...)
	payerMix, _ := s.queryMaps(`SELECT COALESCE(NULLIF(p.insurance_provider,''),'Self-pay') AS label,
		COUNT(DISTINCT p.id) AS n FROM encounters e JOIN patients p ON p.id=e.patient_id
		WHERE e.deleted_at IS NULL AND e.started_at>=? AND e.started_at<?`+locationClauseSQL(locationID, "e.location_id")+`
		GROUP BY label ORDER BY n DESC LIMIT 8`, periodArgs(dayStart, dayEnd, locationArgs(locationID))...)
	ageRows, _ := s.queryMaps(`SELECT DISTINCT p.id, p.date_of_birth, p.sex FROM encounters e
		JOIN patients p ON p.id=e.patient_id
		WHERE e.deleted_at IS NULL AND e.started_at>=? AND e.started_at<?`+locationClauseSQL(locationID, "e.location_id"),
		periodArgs(dayStart, dayEnd, locationArgs(locationID))...)
	aging, _ := s.queryMaps(`SELECT CASE
		WHEN julianday('now')-julianday(issued_at)<=30 THEN '0-30'
		WHEN julianday('now')-julianday(issued_at)<=60 THEN '31-60'
		WHEN julianday('now')-julianday(issued_at)<=90 THEN '61-90'
		ELSE '90+' END AS bucket, COALESCE(SUM(total_cents-paid_cents),0) AS cents, COUNT(1) AS n
		FROM invoices WHERE deleted_at IS NULL AND status IN ('unpaid','partial') AND total_cents>paid_cents`+invLoc+`
		GROUP BY bucket`, invLocArgs...)
	monthly, _ := s.queryMaps(`SELECT substr(created_at,1,7) AS month, COUNT(1) AS n FROM patients
		WHERE deleted_at IS NULL`+patientLoc+` GROUP BY month ORDER BY month DESC LIMIT 6`,
		patientLocArgs...)

	providerRevenueByID := map[string]int64{}
	for _, row := range providerRevenue {
		providerRevenueByID[fmt.Sprint(row["id"])] = toInt64(row["cents"])
	}
	for _, row := range providers {
		row["revenue_cents"] = providerRevenueByID[fmt.Sprint(row["id"])]
	}

	// Age bands and sex mix are derived in Go so the report does not depend on
	// SQLite date arithmetic for birthdays.
	ageBands := map[string]int64{"0–17": 0, "18–34": 0, "35–49": 0, "50–64": 0, "65+": 0}
	sexMix := map[string]int64{}
	nowT := time.Now()
	for _, row := range ageRows {
		if dob := fmt.Sprint(row["date_of_birth"]); dob != "" {
			if t, err := time.Parse("2006-01-02", dob); err == nil {
				ageBands[ageBand(nowT.Year()-t.Year(), nowT.YearDay() < t.YearDay())]++
			}
		}
		sex := strings.TrimSpace(fmt.Sprint(row["sex"]))
		if sex == "" {
			sex = "unknown"
		}
		sexMix[sex]++
	}
	ageBandRows := []map[string]any{}
	for _, band := range []string{"0–17", "18–34", "35–49", "50–64", "65+"} {
		ageBandRows = append(ageBandRows, map[string]any{"band": band, "n": ageBands[band]})
	}
	sexRows := []map[string]any{}
	for sex, n := range sexMix {
		sexRows = append(sexRows, map[string]any{"sex": sex, "n": n})
	}

	// Header context lets the report screen show which clinic and currency the
	// figures belong to without another round trip.
	clinicName, clinicType, currency, symbol := "", "", "", ""
	if clinic, err := s.GetClinic(); err == nil && clinic != nil {
		clinicName = fmt.Sprint(clinic["name"])
		clinicType = fmt.Sprint(clinic["clinic_type"])
		currency = fmt.Sprint(clinic["currency"])
		symbol = fmt.Sprint(clinic["currency_symbol"])
	}
	locationName := ""
	if locationID != "" {
		if loc, err := s.LocationByID(locationID); err == nil {
			locationName = fmt.Sprint(loc["name"])
		}
	}

	return map[string]any{
		"clinic_name": clinicName, "clinic_type": clinicType,
		"currency": currency, "currency_symbol": symbol, "location_name": locationName,
		"revenue_cents": collected, "invoiced_cents": invoiced, "outstanding_cents": outstanding,
		"expenses_cents": expenses, "net_cents": collected - expenses,
		"visits": visits, "appointments": appointments, "completed": completed,
		"cancelled": cancelled, "no_shows": noShows, "new_patients": newPatients,
		"unique_patients": uniquePatients, "returning_patients": maxInt64(0, uniquePatients-newPatients),
		"unsigned_notes": unsignedNotes, "prescriptions": prescriptions, "follow_ups_due": followUps,
		"avg_wait_minutes": int64(avgWait + 0.5), "avg_visit_minutes": int64(avgVisit + 0.5),
		"revenue_by_day": byDay, "invoiced_by_day": invoicedByDay,
		"status_counts": statusCounts, "top_diagnoses": topDiagnoses,
		"provider_load": providers, "patient_growth": monthly,
		"revenue_by_method": revenueByMethod, "revenue_by_service": revenueByService,
		"expenses_by_category": expensesByCategory,
		"revenue_by_location":  revenueByLocation, "visits_by_weekday": visitsByWeekday,
		"visits_by_hour": visitsByHour, "payer_mix": payerMix,
		"age_bands": ageBandRows, "sex_mix": sexRows, "outstanding_aging": aging,
		"location_id": locationID,
	}, nil
}

func locationClauseSQL(locationID, column string) string {
	if strings.TrimSpace(locationID) == "" {
		return ""
	}
	return " AND " + column + "=?"
}

func locationArgs(locationID string) []any {
	if strings.TrimSpace(locationID) == "" {
		return nil
	}
	return []any{locationID}
}

func ageBand(age int, birthdayPending bool) string {
	if birthdayPending {
		age--
	}
	switch {
	case age < 18:
		return "0–17"
	case age < 35:
		return "18–34"
	case age < 50:
		return "35–49"
	case age < 65:
		return "50–64"
	default:
		return "65+"
	}
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func (s *Store) AuditLog(limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 500 {
		limit = 150
	}
	return s.queryMaps("SELECT * FROM audit_logs WHERE deleted_at IS NULL ORDER BY at DESC LIMIT ?", limit)
}

func (s *Store) TableCounts() (map[string]any, error) {
	out := map[string]any{}
	for entity, table := range Entities {
		var n int
		q := fmt.Sprintf("SELECT COUNT(1) FROM %q WHERE deleted_at IS NULL", table)
		if err := s.db.Get(&n, q); err != nil {
			continue
		}
		out[entity] = n
	}
	return out, nil
}
