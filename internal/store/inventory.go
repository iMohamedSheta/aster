package store

import (
	"errors"
	"fmt"
	"strings"
)

var inventoryFilters = map[string]bool{
	"all": true, "low": true, "out": true, "expiring": true, "inactive": true,
}

// ListInventory returns stock for the active clinic, with a computed stock
// state so the frontend does not need to duplicate reorder thresholds.
func (s *Store) ListInventory(filter string) ([]map[string]any, error) {
	if filter == "" {
		filter = "all"
	}
	if !inventoryFilters[filter] {
		return nil, errors.New("invalid inventory filter")
	}
	q := `SELECT i.*, COALESCE(l.name,'') AS location_name, COALESCE(l.color,'#2a3747') AS location_color,
		CASE WHEN i.quantity<=0 THEN 'out' WHEN i.quantity<=i.reorder_level THEN 'low' ELSE 'ok' END AS stock_state,
		CASE WHEN i.expiry_on<>'' AND i.expiry_on<=date('now','+90 day') THEN 1 ELSE 0 END AS expiring
		FROM inventory_items i LEFT JOIN locations l ON l.id=i.location_id
		WHERE i.clinic_id=? AND i.deleted_at IS NULL`
	args := []any{s.ClinicID()}
	if location := s.LocationID(); location != "" {
		q += " AND i.location_id=?"
		args = append(args, location)
	}
	switch filter {
	case "low":
		q += " AND i.active=1 AND i.quantity<=i.reorder_level"
	case "out":
		q += " AND i.active=1 AND i.quantity<=0"
	case "expiring":
		q += " AND i.active=1 AND i.expiry_on<>'' AND i.expiry_on<=date('now','+90 day')"
	case "inactive":
		q += " AND i.active=0"
	default:
		q += " AND i.active=1"
	}
	q += ` ORDER BY CASE WHEN i.quantity<=0 THEN 0 WHEN i.quantity<=i.reorder_level THEN 1 ELSE 2 END,
		CASE WHEN i.expiry_on='' THEN '9999-12-31' ELSE i.expiry_on END,
		i.name COLLATE NOCASE`
	return s.queryMaps(q, args...)
}

// InventorySummary powers dashboard and network alerts. An empty location id
// sums every clinic.
func (s *Store) InventorySummary(locationID string) (map[string]any, error) {
	q := `SELECT COUNT(1) AS items,
		COALESCE(SUM(CASE WHEN quantity<=0 THEN 1 ELSE 0 END),0) AS out_of_stock,
		COALESCE(SUM(CASE WHEN quantity>0 AND quantity<=reorder_level THEN 1 ELSE 0 END),0) AS low_stock,
		COALESCE(SUM(CASE WHEN expiry_on<>'' AND expiry_on<=date('now','+90 day') THEN 1 ELSE 0 END),0) AS expiring,
		COALESCE(SUM(quantity*unit_cost_cents),0) AS stock_value_cents
		FROM inventory_items WHERE clinic_id=? AND deleted_at IS NULL AND active=1`
	args := []any{s.ClinicID()}
	if strings.TrimSpace(locationID) != "" {
		q += " AND location_id=?"
		args = append(args, locationID)
	}
	rows, err := s.queryMaps(q, args...)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return map[string]any{"items": 0, "out_of_stock": 0, "low_stock": 0, "expiring": 0, "stock_value_cents": 0}, nil
	}
	return rows[0], nil
}

// SaveInventoryItem creates or updates a stock item. Quantity changes made by
// daily use should go through AdjustStock so the audit trail explains them.
func (s *Store) SaveInventoryItem(fields map[string]any) (map[string]any, error) {
	id := fieldID(fields)
	delete(fields, "id")
	if id != "" {
		if name, ok := fields["name"]; ok && strings.TrimSpace(fmt.Sprint(name)) == "" {
			return nil, errors.New("item name is required")
		}
		return s.UpdateRecord("inventory_items", id, fields, &Audit{
			Action: "inventory_item.updated", Summary: "Updated stock item",
		})
	}
	if strings.TrimSpace(fmt.Sprint(fields["name"])) == "" {
		return nil, errors.New("item name is required")
	}
	if _, ok := fields["unit"]; !ok {
		fields["unit"] = "unit"
	}
	if _, ok := fields["category"]; !ok {
		fields["category"] = "supplies"
	}
	if _, ok := fields["active"]; !ok {
		fields["active"] = 1
	}
	if qty, ok := fields["quantity"]; ok && toFloat(qty) < 0 {
		return nil, errors.New("quantity cannot be negative")
	}
	return s.CreateRecord("inventory_items", fields, &Audit{
		Action: "inventory_item.created", Summary: "Added stock item " + fmt.Sprint(fields["name"]),
	})
}

// AdjustStock records a receipt, usage, wastage or physical count against one
// stock item. Quantities are positive magnitudes except for "count", which
// sets the on-hand figure.
func (s *Store) AdjustStock(itemID, kind string, quantity float64, reason string) (map[string]any, error) {
	if quantity < 0 {
		return nil, errors.New("quantity cannot be negative")
	}
	item, err := s.Row("inventory_items", itemID)
	if err != nil {
		return nil, err
	}
	current := toFloat(item["quantity"])
	next := current
	switch kind {
	case "received":
		next = current + quantity
	case "used", "wasted":
		next = current - quantity
	case "count":
		next = quantity
	default:
		return nil, errors.New("invalid stock adjustment")
	}
	if next < 0 {
		return nil, errors.New("stock cannot fall below zero")
	}
	label := map[string]string{"received": "Stock received", "used": "Stock used", "wasted": "Stock written off", "count": "Stock count corrected"}[kind]
	updated, err := s.UpdateRecord("inventory_items", itemID, map[string]any{"quantity": next}, &Audit{
		Action:  "inventory_item." + kind,
		Summary: label + " · " + fmt.Sprint(item["name"]),
		Detail: map[string]any{
			"kind": kind, "quantity": quantity, "previous": current, "current": next, "reason": reason,
		},
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}
