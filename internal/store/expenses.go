package store

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

var expenseCategories = map[string]bool{
	"rent": true, "salaries": true, "supplies": true, "utilities": true,
	"maintenance": true, "marketing": true, "insurance": true, "laboratory": true,
	"software": true, "equipment": true, "training": true, "other": true,
}

// ListExpenses returns clinic overheads between two inclusive dates. An empty
// location id aggregates the whole network, matching the reports scope.
func (s *Store) ListExpenses(from, to, locationID string) ([]map[string]any, error) {
	q := `SELECT x.*, COALESCE(l.name,'') AS location_name, COALESCE(l.color,'#2a3747') AS location_color,
		COALESCE(st.full_name,'') AS created_by_name
		FROM expenses x
		LEFT JOIN locations l ON l.id=x.location_id
		LEFT JOIN staff st ON st.id=x.created_by
		WHERE x.clinic_id=? AND x.deleted_at IS NULL AND x.spent_on>=? AND x.spent_on<=?`
	args := []any{s.ClinicID(), from, to}
	if strings.TrimSpace(locationID) != "" {
		q += " AND x.location_id=?"
		args = append(args, locationID)
	}
	q += " ORDER BY x.spent_on DESC, x.created_at DESC LIMIT 500"
	return s.queryMaps(q, args...)
}

// SaveExpense creates or updates an operating expense.
func (s *Store) SaveExpense(fields map[string]any) (map[string]any, error) {
	id := fieldID(fields)
	delete(fields, "id")
	if id != "" {
		if category, ok := fields["category"].(string); ok && !expenseCategories[category] {
			return nil, errors.New("invalid expense category")
		}
		if amount, ok := fields["amount_cents"]; ok && toInt64(amount) < 0 {
			return nil, errors.New("amount cannot be negative")
		}
		return s.UpdateRecord("expenses", id, fields, &Audit{
			Action: "expense.updated", Summary: "Updated expense",
		})
	}
	description := strings.TrimSpace(fmt.Sprint(fields["description"]))
	if description == "" {
		return nil, errors.New("describe the expense")
	}
	if amount := toInt64(fields["amount_cents"]); amount <= 0 {
		return nil, errors.New("enter an amount greater than zero")
	}
	category := fmt.Sprint(fields["category"])
	if !expenseCategories[category] {
		fields["category"] = "other"
	}
	if _, ok := fields["spent_on"]; !ok || fmt.Sprint(fields["spent_on"]) == "" {
		fields["spent_on"] = time.Now().Format("2006-01-02")
	}
	if _, ok := fields["method"]; !ok {
		fields["method"] = "bank"
	}
	if actor := s.Actor(); actor.ID != "" {
		fields["created_by"] = actor.ID
	}
	return s.CreateRecord("expenses", fields, &Audit{
		Action: "expense.created", Summary: "Recorded expense " + description,
	})
}
