package store

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// ---- Treatment plans -----------------------------------------------------

var treatmentPlanStatuses = map[string]bool{
	"draft": true, "active": true, "completed": true, "cancelled": true,
}

var treatmentItemStatuses = map[string]bool{
	"planned": true, "scheduled": true, "completed": true, "cancelled": true,
}

// ListTreatmentPlans returns treatment plans for the active clinic. Pass a
// patient id to follow one person's plan across every clinic in the network.
func (s *Store) ListTreatmentPlans(patientID, status string) ([]map[string]any, error) {
	q := `SELECT tp.*, p.first_name, p.last_name, p.mrn,
		COALESCE(st.full_name,'Unassigned') AS provider_name, COALESCE(st.color,'#2a3747') AS provider_color,
		COALESCE(l.name,'') AS location_name, COALESCE(l.color,'#2a3747') AS location_color,
		(SELECT COUNT(1) FROM treatment_plan_items i WHERE i.plan_id=tp.id AND i.deleted_at IS NULL) AS item_count,
		(SELECT COUNT(1) FROM treatment_plan_items i WHERE i.plan_id=tp.id AND i.deleted_at IS NULL AND i.status='completed') AS completed_count,
		(SELECT COALESCE(SUM(i.total_cents),0) FROM treatment_plan_items i WHERE i.plan_id=tp.id AND i.deleted_at IS NULL) AS total_cents,
		(SELECT COALESCE(SUM(CASE WHEN i.status='completed' THEN i.total_cents ELSE 0 END),0)
			FROM treatment_plan_items i WHERE i.plan_id=tp.id AND i.deleted_at IS NULL) AS completed_cents
		FROM treatment_plans tp
		LEFT JOIN patients p ON p.id=tp.patient_id
		LEFT JOIN staff st ON st.id=tp.provider_id
		LEFT JOIN locations l ON l.id=tp.location_id
		WHERE tp.clinic_id=? AND tp.deleted_at IS NULL`
	args := []any{s.ClinicID()}
	if patientID != "" {
		q += " AND tp.patient_id=?"
		args = append(args, patientID)
	} else if location := s.LocationID(); location != "" {
		q += " AND tp.location_id=?"
		args = append(args, location)
	}
	if status != "" && status != "all" {
		q += " AND tp.status=?"
		args = append(args, status)
	}
	q += ` ORDER BY CASE tp.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
		COALESCE(NULLIF(tp.target_on,''),'9999-12-31'), tp.updated_at DESC LIMIT 300`
	return s.queryMaps(q, args...)
}

// TreatmentPlanDetail returns one plan with its line items.
func (s *Store) TreatmentPlanDetail(id string) (map[string]any, error) {
	rows, err := s.queryMaps(`SELECT tp.*, p.first_name, p.last_name, p.mrn, p.date_of_birth,
		COALESCE(st.full_name,'Unassigned') AS provider_name, COALESCE(st.color,'#2a3747') AS provider_color,
		COALESCE(l.name,'') AS location_name, COALESCE(l.color,'#2a3747') AS location_color,
		(SELECT COUNT(1) FROM treatment_plan_items i WHERE i.plan_id=tp.id AND i.deleted_at IS NULL) AS item_count,
		(SELECT COUNT(1) FROM treatment_plan_items i WHERE i.plan_id=tp.id AND i.deleted_at IS NULL AND i.status='completed') AS completed_count,
		(SELECT COALESCE(SUM(i.total_cents),0) FROM treatment_plan_items i WHERE i.plan_id=tp.id AND i.deleted_at IS NULL) AS total_cents,
		(SELECT COALESCE(SUM(CASE WHEN i.status='completed' THEN i.total_cents ELSE 0 END),0)
			FROM treatment_plan_items i WHERE i.plan_id=tp.id AND i.deleted_at IS NULL) AS completed_cents
		FROM treatment_plans tp
		LEFT JOIN patients p ON p.id=tp.patient_id
		LEFT JOIN staff st ON st.id=tp.provider_id
		LEFT JOIN locations l ON l.id=tp.location_id
		WHERE tp.id=? AND tp.clinic_id=? AND tp.deleted_at IS NULL`, id, s.ClinicID())
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrNotFound
	}
	plan := rows[0]
	items, _ := s.queryMaps(`SELECT i.*, COALESCE(sv.name,'') AS service_name, COALESCE(sv.code,'') AS service_code
		FROM treatment_plan_items i LEFT JOIN services sv ON sv.id=i.service_id
		WHERE i.plan_id=? AND i.clinic_id=? AND i.deleted_at IS NULL
		ORDER BY i.position, i.created_at`, id, s.ClinicID())
	return map[string]any{"plan": plan, "items": items}, nil
}

// SaveTreatmentPlan creates or updates the header of a treatment plan.
func (s *Store) SaveTreatmentPlan(fields map[string]any) (map[string]any, error) {
	id := fieldID(fields)
	delete(fields, "id")
	if id != "" {
		if status, ok := fields["status"].(string); ok {
			if !treatmentPlanStatuses[status] {
				return nil, errors.New("invalid treatment plan status")
			}
			if status == "completed" {
				if _, exists := fields["completed_at"]; !exists {
					fields["completed_at"] = time.Now().UTC().Format(time.RFC3339)
				}
			} else if status == "active" || status == "draft" {
				fields["completed_at"] = ""
			}
		}
		return s.UpdateRecord("treatment_plans", id, fields, &Audit{
			Action: "treatment_plan.updated", Summary: "Updated treatment plan",
		})
	}
	if strings.TrimSpace(fmt.Sprint(fields["patient_id"])) == "" {
		return nil, errors.New("choose a patient for the treatment plan")
	}
	if strings.TrimSpace(fmt.Sprint(fields["title"])) == "" {
		fields["title"] = "Treatment plan"
	}
	if _, ok := fields["status"]; !ok {
		fields["status"] = "active"
	}
	if _, ok := fields["started_on"]; !ok {
		fields["started_on"] = time.Now().Format("2006-01-02")
	}
	if actor := s.Actor(); actor.ID != "" {
		if _, ok := fields["provider_id"]; !ok {
			fields["provider_id"] = actor.ID
		}
	}
	return s.CreateRecord("treatment_plans", fields, &Audit{
		Action: "treatment_plan.created", Summary: "Started treatment plan " + fmt.Sprint(fields["title"]),
	})
}

// SaveTreatmentPlanItem creates or updates one procedure on a plan.
func (s *Store) SaveTreatmentPlanItem(fields map[string]any) (map[string]any, error) {
	id := fieldID(fields)
	delete(fields, "id")
	if id != "" {
		existing, err := s.Row("treatment_plan_items", id)
		if err != nil {
			return nil, err
		}
		if status, ok := fields["status"].(string); ok {
			if !treatmentItemStatuses[status] {
				return nil, errors.New("invalid treatment item status")
			}
			if status == "completed" {
				if _, exists := fields["completed_at"]; !exists {
					fields["completed_at"] = time.Now().UTC().Format(time.RFC3339)
				}
			} else {
				fields["completed_at"] = ""
			}
		}
		quantity, unitPrice := toFloat(existing["quantity"]), toInt64(existing["unit_price_cents"])
		if v, ok := fields["quantity"]; ok {
			quantity = toFloat(v)
		}
		if v, ok := fields["unit_price_cents"]; ok {
			unitPrice = toInt64(v)
		}
		if quantity < 0 {
			return nil, errors.New("quantity cannot be negative")
		}
		if _, ok := fields["quantity"]; ok {
			fields["total_cents"] = int64(quantity*float64(unitPrice) + 0.5)
		} else if _, ok := fields["unit_price_cents"]; ok {
			fields["total_cents"] = int64(quantity*float64(unitPrice) + 0.5)
		}
		return s.UpdateRecord("treatment_plan_items", id, fields, &Audit{
			Action: "treatment_plan_item.updated", Summary: "Updated treatment procedure",
		})
	}

	planID := strings.TrimSpace(fmt.Sprint(fields["plan_id"]))
	if planID == "" {
		return nil, errors.New("a treatment plan is required")
	}
	if _, err := s.Row("treatment_plans", planID); err != nil {
		return nil, errors.New("treatment plan not found")
	}
	serviceID := strings.TrimSpace(fmt.Sprint(fields["service_id"]))
	if serviceID != "" {
		if svc, err := s.Row("services", serviceID); err == nil {
			if strings.TrimSpace(fmt.Sprint(fields["name"])) == "" {
				fields["name"] = svc["name"]
			}
			if _, ok := fields["unit_price_cents"]; !ok {
				fields["unit_price_cents"] = svc["price_cents"]
			}
		}
	}
	if strings.TrimSpace(fmt.Sprint(fields["name"])) == "" {
		return nil, errors.New("procedure name is required")
	}
	quantity, unitPrice := 1.0, int64(0)
	if v, ok := fields["quantity"]; ok {
		quantity = toFloat(v)
	}
	if v, ok := fields["unit_price_cents"]; ok {
		unitPrice = toInt64(v)
	}
	if quantity <= 0 {
		quantity = 1
	}
	fields["quantity"] = quantity
	fields["unit_price_cents"] = unitPrice
	fields["total_cents"] = int64(quantity*float64(unitPrice) + 0.5)
	if _, ok := fields["status"]; !ok {
		fields["status"] = "planned"
	}
	if _, ok := fields["position"]; !ok {
		var maxPos int
		_ = s.db.Get(&maxPos, "SELECT COALESCE(MAX(position),0) FROM treatment_plan_items WHERE plan_id=? AND deleted_at IS NULL", planID)
		fields["position"] = maxPos + 1
	}
	return s.CreateRecord("treatment_plan_items", fields, &Audit{
		Action: "treatment_plan_item.created", Summary: "Added procedure to treatment plan",
	})
}

func (s *Store) SetTreatmentPlanItemStatus(id, status string) (map[string]any, error) {
	if !treatmentItemStatuses[status] {
		return nil, errors.New("invalid treatment item status")
	}
	patch := map[string]any{"status": status}
	if status == "completed" {
		patch["completed_at"] = time.Now().UTC().Format(time.RFC3339)
	} else {
		patch["completed_at"] = ""
	}
	return s.UpdateRecord("treatment_plan_items", id, patch, &Audit{
		Action: "treatment_plan_item." + status, Summary: "Treatment procedure marked " + status,
	})
}

func toFloat(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int64:
		return float64(n)
	case int:
		return float64(n)
	default:
		var out float64
		_, _ = fmt.Sscan(fmt.Sprint(v), &out)
		return out
	}
}
