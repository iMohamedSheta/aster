package store

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// locationTables are the replicated tables that carry a clinic location. The
// primary location is backfilled into any row written before Aster supported
// multi-clinic workspaces.
var locationTables = []string{
	"staff", "patients", "appointments", "encounters", "encounter_addenda",
	"vitals", "diagnoses", "prescriptions", "prescription_items", "services",
	"invoices", "invoice_items", "payments", "tasks",
	"treatment_plans", "treatment_plan_items", "inventory_items", "expenses",
	"staff_pay", "payroll_entries",
}

// EnsureDefaultLocation makes sure the workspace has at least one clinic
// location and that every historic record is attributed to it. It is safe to
// call on every launch.
func (s *Store) EnsureDefaultLocation() (map[string]any, error) {
	clinic, err := s.GetClinic()
	if err != nil {
		return nil, err
	}
	clinicID := s.ClinicID()
	if clinicID == "" {
		return nil, errors.New("clinic must exist before adding a location")
	}

	var primary string
	_ = s.db.Get(&primary, `SELECT id FROM locations WHERE clinic_id=? AND deleted_at IS NULL
		ORDER BY created_at LIMIT 1`, clinicID)

	if primary == "" {
		// The primary location deliberately reuses the clinic id. It makes the
		// migration idempotent and keeps historic records easy to attribute.
		fields := map[string]any{
			"id": clinicID, "name": clinic["name"], "code": "MAIN",
			"type": clinic["clinic_type"], "specialty": "", "phone": clinic["phone"],
			"email": clinic["email"], "address_line1": clinic["address_line1"],
			"address_line2": clinic["address_line2"], "city": clinic["city"],
			"state": clinic["state"], "country": clinic["country"],
			"postal_code": clinic["postal_code"], "timezone": clinic["timezone"],
			"opening_time": clinic["opening_time"], "closing_time": clinic["closing_time"],
			"slot_minutes": clinic["slot_minutes"], "work_days": clinic["work_days"],
			"rooms": 1, "active": 1, "color": "#2a3747",
		}
		if fmt.Sprint(fields["name"]) == "" {
			fields["name"] = "Main clinic"
		}
		if fmt.Sprint(fields["type"]) == "" {
			fields["type"] = "general"
		}
		row, err := s.CreateRecord("locations", fields, &Audit{
			Action: "location.created", Summary: "Created the primary clinic location",
		})
		if err != nil {
			// A tombstoned row may already own the id. Bring it back instead of
			// failing the whole launch.
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				primary = clinicID
			} else {
				return nil, err
			}
		} else {
			primary = fmt.Sprint(row["id"])
		}
	}

	if primary != "" {
		tx := s.db.MustBegin()
		for _, table := range locationTables {
			_, _ = tx.Exec(fmt.Sprintf(`UPDATE %q SET location_id=? WHERE clinic_id=?
				AND (location_id IS NULL OR location_id='')`, table), primary, clinicID)
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		current := s.LocationID()
		valid := false
		if current != "" {
			var n int
			_ = s.db.Get(&n, "SELECT COUNT(1) FROM locations WHERE id=? AND clinic_id=? AND deleted_at IS NULL", current, clinicID)
			valid = n > 0
		}
		if !valid {
			s.SetLocationID(primary)
		}
	}
	return s.ActiveLocation()
}

// ActiveLocation returns the clinic this device is currently working in.
func (s *Store) ActiveLocation() (map[string]any, error) {
	id := s.LocationID()
	if id == "" {
		return nil, ErrNotFound
	}
	return s.Row("locations", id)
}

func (s *Store) ListLocations() ([]map[string]any, error) {
	rows, err := s.queryMaps(`SELECT l.*, COALESCE(st.full_name,'') AS manager_name,
		(SELECT COUNT(1) FROM patients p WHERE p.location_id=l.id AND p.deleted_at IS NULL) AS patient_count,
		(SELECT COUNT(1) FROM staff s WHERE s.location_id=l.id AND s.deleted_at IS NULL AND s.active=1) AS staff_count,
		(SELECT COUNT(1) FROM encounters e WHERE e.location_id=l.id AND e.deleted_at IS NULL) AS visit_count,
		(SELECT COALESCE(SUM(i.total_cents-i.paid_cents),0) FROM invoices i WHERE i.location_id=l.id AND i.deleted_at IS NULL AND i.status IN ('unpaid','partial')) AS outstanding_cents
		FROM locations l LEFT JOIN staff st ON st.id=l.manager_id
		WHERE l.clinic_id=? AND l.deleted_at IS NULL
		ORDER BY l.active DESC, l.name COLLATE NOCASE`, s.ClinicID())
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Store) LocationByID(id string) (map[string]any, error) {
	row, err := s.Row("locations", id)
	if err != nil {
		return nil, err
	}
	if fmt.Sprint(row["clinic_id"]) != s.ClinicID() {
		return nil, ErrNotFound
	}
	return row, nil
}

// SaveLocation creates or updates a clinic in the network.
func (s *Store) SaveLocation(fields map[string]any) (map[string]any, error) {
	id := fieldID(fields)
	delete(fields, "id")
	if id != "" {
		row, err := s.UpdateRecord("locations", id, fields, &Audit{
			Action: "location.updated", Summary: "Updated clinic location",
		})
		return row, err
	}
	if strings.TrimSpace(fmt.Sprint(fields["name"])) == "" {
		return nil, errors.New("clinic name is required")
	}
	if strings.TrimSpace(fmt.Sprint(fields["type"])) == "" {
		fields["type"] = "general"
	}
	if _, ok := fields["active"]; !ok {
		fields["active"] = 1
	}
	if _, ok := fields["color"]; !ok {
		fields["color"] = "#2a3747"
	}
	return s.CreateRecord("locations", fields, &Audit{
		Action: "location.created", Summary: "Added clinic location " + fmt.Sprint(fields["name"]),
	})
}

// ArchiveLocation removes a clinic from the network while keeping its records
// for reporting and audit. The last active clinic cannot be archived.
func (s *Store) ArchiveLocation(id string) error {
	var active int
	_ = s.db.Get(&active, "SELECT COUNT(1) FROM locations WHERE clinic_id=? AND deleted_at IS NULL AND active=1", s.ClinicID())
	if active <= 1 {
		return errors.New("a clinic network needs at least one active clinic")
	}
	row, err := s.LocationByID(id)
	if err != nil {
		return err
	}
	if err := s.Archive("locations", id, &Audit{
		Action: "location.archived", Summary: "Archived clinic " + fmt.Sprint(row["name"]),
	}); err != nil {
		return err
	}
	if s.LocationID() == id {
		var next string
		_ = s.db.Get(&next, "SELECT id FROM locations WHERE clinic_id=? AND deleted_at IS NULL AND active=1 ORDER BY created_at LIMIT 1", s.ClinicID())
		if next != "" {
			s.SetLocationID(next)
		}
	}
	return nil
}

// ---- Tasks ---------------------------------------------------------------

func (s *Store) ListTasks(filter string) ([]map[string]any, error) {
	q := `SELECT t.*, COALESCE(l.name,'') AS location_name, COALESCE(l.color,'#2a3747') AS location_color,
		p.first_name, p.last_name, p.mrn, COALESCE(st.full_name,'') AS assignee_name,
		COALESCE(cr.full_name,'') AS created_by_name
		FROM tasks t
		LEFT JOIN locations l ON l.id=t.location_id
		LEFT JOIN patients p ON p.id=t.patient_id
		LEFT JOIN staff st ON st.id=t.assignee_id
		LEFT JOIN staff cr ON cr.id=t.created_by
		WHERE t.clinic_id=? AND t.deleted_at IS NULL`
	args := []any{s.ClinicID()}
	today := time.Now().Format("2006-01-02")
	switch filter {
	case "open":
		q += " AND t.status IN ('open','in_progress')"
	case "today":
		q += " AND t.status IN ('open','in_progress') AND t.due_on<>'' AND t.due_on<=?"
		args = append(args, today)
	case "overdue":
		q += " AND t.status IN ('open','in_progress') AND t.due_on<>'' AND t.due_on<?"
		args = append(args, today)
	case "done":
		q += " AND t.status='done'"
	case "all":
	default:
		q += " AND t.status IN ('open','in_progress')"
	}
	q += ` ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
		CASE WHEN t.due_on='' THEN '9999-12-31' ELSE t.due_on END, t.created_at DESC LIMIT 300`
	return s.queryMaps(q, args...)
}

func (s *Store) TaskByID(id string) (map[string]any, error) {
	return s.Row("tasks", id)
}

// SaveTask creates or updates a clinical or administrative task.
func (s *Store) SaveTask(fields map[string]any) (map[string]any, error) {
	id := fieldID(fields)
	delete(fields, "id")
	if id != "" {
		if status, ok := fields["status"].(string); ok && status == "done" {
			if _, exists := fields["completed_at"]; !exists {
				fields["completed_at"] = time.Now().UTC().Format(time.RFC3339)
			}
		}
		return s.UpdateRecord("tasks", id, fields, &Audit{
			Action: "task.updated", Summary: "Updated task",
		})
	}
	if strings.TrimSpace(fmt.Sprint(fields["title"])) == "" {
		return nil, errors.New("task title is required")
	}
	if _, ok := fields["status"]; !ok {
		fields["status"] = "open"
	}
	if _, ok := fields["priority"]; !ok {
		fields["priority"] = "normal"
	}
	if _, ok := fields["category"]; !ok {
		fields["category"] = "clinical"
	}
	if actor := s.Actor(); actor.ID != "" {
		fields["created_by"] = actor.ID
	}
	return s.CreateRecord("tasks", fields, &Audit{
		Action: "task.created", Summary: "Created task " + fmt.Sprint(fields["title"]),
	})
}

func (s *Store) SetTaskStatus(id, status string) (map[string]any, error) {
	switch status {
	case "open", "in_progress", "done", "cancelled":
	default:
		return nil, errors.New("invalid task status")
	}
	patch := map[string]any{"status": status}
	if status == "done" {
		patch["completed_at"] = time.Now().UTC().Format(time.RFC3339)
	} else {
		patch["completed_at"] = ""
	}
	return s.UpdateRecord("tasks", id, patch, &Audit{
		Action: "task." + status, Summary: "Task marked " + status,
	})
}

// ---- Network control centre ----------------------------------------------

// NetworkOverview is the aggregated control view across every active clinic.
// It always sums all locations; pass a location id to Reports for a single
// clinic's figures.
func (s *Store) NetworkOverview(dayStart, dayEnd string) (map[string]any, error) {
	locations, err := s.ListLocations()
	if err != nil {
		return nil, err
	}
	clinic, _ := s.GetClinic()
	totals, err := s.reportsFor(dayStart, dayEnd, "")
	if err != nil {
		return nil, err
	}

	stats := make([]map[string]any, 0, len(locations))
	for _, loc := range locations {
		id := fmt.Sprint(loc["id"])
		metrics, _ := s.reportsFor(dayStart, dayEnd, id)
		entry := map[string]any{}
		for k, v := range loc {
			entry[k] = v
		}
		if metrics != nil {
			for _, key := range []string{
				"revenue_cents", "invoiced_cents", "outstanding_cents", "expenses_cents", "net_cents",
				"visits", "appointments", "completed", "cancelled", "no_shows", "new_patients",
				"unique_patients", "returning_patients", "unsigned_notes", "prescriptions",
				"avg_wait_minutes", "avg_visit_minutes",
			} {
				entry[key] = metrics[key]
			}
			entry["revenue_by_day"] = metrics["revenue_by_day"]
			entry["status_counts"] = metrics["status_counts"]
			entry["provider_load"] = metrics["provider_load"]
			entry["top_diagnoses"] = metrics["top_diagnoses"]
		}
		if stock, err := s.InventorySummary(id); err == nil {
			entry["low_stock"] = stock["low_stock"]
			entry["out_of_stock"] = stock["out_of_stock"]
			entry["stock_value_cents"] = stock["stock_value_cents"]
		}
		stats = append(stats, entry)
	}

	// Collect operational alerts that deserve a manager's attention today.
	alerts := []map[string]any{}
	for _, loc := range stats {
		name := fmt.Sprint(loc["name"])
		appointments := toInt64(loc["appointments"])
		noShows := toInt64(loc["no_shows"])
		if appointments >= 5 && noShows*100/appointments >= 12 {
			alerts = append(alerts, map[string]any{
				"tone": "warning", "location": name,
				"title":  "No-show rate is high",
				"detail": fmt.Sprintf("%d of %d appointments were missed in this period.", noShows, appointments),
			})
		}
		invoiced := toInt64(loc["invoiced_cents"])
		collected := toInt64(loc["revenue_cents"])
		if invoiced > 0 && collected*100/invoiced < 65 {
			alerts = append(alerts, map[string]any{
				"tone": "warning", "location": name,
				"title":  "Collections are lagging",
				"detail": fmt.Sprintf("%d%% of invoiced value was collected.", collected*100/invoiced),
			})
		}
		unsigned := toInt64(loc["unsigned_notes"])
		if unsigned > 0 {
			alerts = append(alerts, map[string]any{
				"tone": "info", "location": name,
				"title":  "Unsigned visits",
				"detail": fmt.Sprintf("%d draft visit%s waiting for a signature.", unsigned, pluralS(unsigned)),
			})
		}
		outstanding := toInt64(loc["outstanding_cents"])
		if outstanding > 0 {
			alerts = append(alerts, map[string]any{
				"tone": "neutral", "location": name,
				"title":  "Open balances",
				"detail": fmt.Sprintf("Outstanding patient balance %s.", moneyText(outstanding)),
			})
		}
		lowStock := toInt64(loc["low_stock"])
		outStock := toInt64(loc["out_of_stock"])
		if lowStock+outStock > 0 {
			detail := fmt.Sprintf("%d item%s at or below reorder level.", lowStock+outStock, pluralS(lowStock+outStock))
			if outStock > 0 {
				detail = fmt.Sprintf("%d item%s at or below reorder level, including %d out of stock.", lowStock+outStock, pluralS(lowStock+outStock), outStock)
			}
			alerts = append(alerts, map[string]any{
				"tone": "warning", "location": name, "title": "Stock needs replenishing", "detail": detail,
			})
		}
	}
	if len(alerts) > 8 {
		alerts = alerts[:8]
	}

	inventory, _ := s.InventorySummary("")
	return map[string]any{
		"network_name": clinic["name"], "clinic_type": clinic["clinic_type"],
		"locations": stats, "totals": totals, "alerts": alerts, "inventory": inventory,
		"trend": totals["revenue_by_day"], "range_start": dayStart, "range_end": dayEnd,
	}, nil
}

func pluralS(n int64) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func moneyText(cents int64) string {
	return fmt.Sprintf("%.2f", float64(cents)/100)
}
