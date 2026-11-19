package store

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// Payroll keeps a monthly salary line per team member. Compensation defaults
// live in staff_pay; each month's line is copied from them so a later raise
// never rewrites history. Paying a line records an expense with the same net
// amount, which keeps the finance reports and the salary register in step.

var payrollMethods = map[string]bool{"cash": true, "bank": true, "card": true}

func normalizePayrollPeriod(period string) (string, error) {
	period = strings.TrimSpace(period)
	if period == "" {
		return time.Now().Format("2006-01"), nil
	}
	if _, err := time.Parse("2006-01", period); err != nil {
		return "", errors.New("choose a valid payroll month")
	}
	return period, nil
}

func payrollNet(base, allowances, deductions int64) (int64, error) {
	if base < 0 || allowances < 0 || deductions < 0 {
		return 0, errors.New("salary amounts cannot be negative")
	}
	net := base + allowances - deductions
	if net < 0 {
		return 0, errors.New("deductions cannot exceed the salary and allowances")
	}
	return net, nil
}

// PayrollBoard returns the salary register for one month. Every active team
// member appears, with their saved salary as a suggestion until the month has
// been generated.
func (s *Store) PayrollBoard(period, locationID string) (map[string]any, error) {
	period, err := normalizePayrollPeriod(period)
	if err != nil {
		return nil, err
	}
	q := `SELECT st.id AS staff_id, st.full_name, st.role, st.title,
			st.location_id, COALESCE(l.name,'') AS location_name,
			COALESCE(p.id,'') AS profile_id,
			COALESCE(p.base_cents,0) AS profile_base_cents,
			COALESCE(p.allowances_cents,0) AS profile_allowances_cents,
			COALESCE(p.deductions_cents,0) AS profile_deductions_cents,
			COALESCE(p.notes,'') AS profile_notes,
			COALESCE(e.id,'') AS entry_id,
			COALESCE(e.base_cents,0) AS entry_base_cents,
			COALESCE(e.allowances_cents,0) AS entry_allowances_cents,
			COALESCE(e.deductions_cents,0) AS entry_deductions_cents,
			COALESCE(e.net_cents,0) AS entry_net_cents,
			COALESCE(e.status,'') AS entry_status,
			COALESCE(e.paid_on,'') AS paid_on,
			COALESCE(e.method,'') AS method,
			COALESCE(e.reference,'') AS reference,
			COALESCE(e.notes,'') AS entry_notes,
			COALESCE(e.expense_id,'') AS expense_id,
			COALESCE(e.created_at,'') AS entry_created_at
		FROM staff st
		LEFT JOIN locations l ON l.id=st.location_id
		LEFT JOIN staff_pay p ON p.staff_id=st.id AND p.clinic_id=st.clinic_id AND p.deleted_at IS NULL
		LEFT JOIN payroll_entries e ON e.staff_id=st.id AND e.clinic_id=st.clinic_id
			AND e.period=? AND e.deleted_at IS NULL
		WHERE st.clinic_id=? AND st.deleted_at IS NULL AND (st.active=1 OR e.id IS NOT NULL)`
	args := []any{period, s.ClinicID()}
	if scope := strings.TrimSpace(locationID); scope != "" {
		q += " AND st.location_id=?"
		args = append(args, scope)
	}
	q += " ORDER BY CASE st.role WHEN 'owner' THEN 0 ELSE 1 END, st.full_name"
	rows, err := s.queryMaps(q, args...)
	if err != nil {
		return nil, err
	}

	var netTotal, paidTotal int64
	salaried, generated, paid, draft := 0, 0, 0, 0
	for _, row := range rows {
		entryID := strings.TrimSpace(fmt.Sprint(row["entry_id"]))
		profileID := strings.TrimSpace(fmt.Sprint(row["profile_id"]))
		if entryID == "" {
			base := toInt64(row["profile_base_cents"])
			allowances := toInt64(row["profile_allowances_cents"])
			deductions := toInt64(row["profile_deductions_cents"])
			net, _ := payrollNet(base, allowances, deductions)
			row["base_cents"] = base
			row["allowances_cents"] = allowances
			row["deductions_cents"] = deductions
			row["net_cents"] = net
			row["status"] = "not_generated"
			row["notes"] = ""
			row["has_salary"] = profileID != ""
			if profileID != "" {
				salaried++
			}
		} else {
			row["base_cents"] = toInt64(row["entry_base_cents"])
			row["allowances_cents"] = toInt64(row["entry_allowances_cents"])
			row["deductions_cents"] = toInt64(row["entry_deductions_cents"])
			row["net_cents"] = toInt64(row["entry_net_cents"])
			row["status"] = strings.TrimSpace(fmt.Sprint(row["entry_status"]))
			row["notes"] = fmt.Sprint(row["entry_notes"])
			row["has_salary"] = true
			salaried++
			generated++
			if row["status"] == "paid" {
				paid++
				paidTotal += toInt64(row["net_cents"])
			} else {
				draft++
			}
		}
		netTotal += toInt64(row["net_cents"])
	}

	periodRows, _ := s.queryMaps(`SELECT DISTINCT period FROM payroll_entries
		WHERE clinic_id=? AND deleted_at IS NULL ORDER BY period DESC LIMIT 18`, s.ClinicID())
	periods := make([]string, 0, len(periodRows)+1)
	seen := map[string]bool{period: true}
	periods = append(periods, period)
	for _, row := range periodRows {
		value := strings.TrimSpace(fmt.Sprint(row["period"]))
		if value != "" && !seen[value] {
			seen[value] = true
			periods = append(periods, value)
		}
	}

	return map[string]any{
		"period":  period,
		"rows":    rows,
		"periods": periods,
		"totals": map[string]any{
			"staff_count":       len(rows),
			"salaried_count":    salaried,
			"entry_count":       generated,
			"paid_count":        paid,
			"draft_count":       draft,
			"net_cents":         netTotal,
			"paid_cents":        paidTotal,
			"outstanding_cents": netTotal - paidTotal,
		},
		"generated": 0,
	}, nil
}

// SaveStaffPay stores a team member's default salary. Existing monthly lines
// are untouched.
func (s *Store) SaveStaffPay(staffID string, base, allowances, deductions int64, notes string) (map[string]any, error) {
	staffID = strings.TrimSpace(staffID)
	if staffID == "" {
		return nil, errors.New("choose a team member")
	}
	if _, err := payrollNet(base, allowances, deductions); err != nil {
		return nil, err
	}
	var locationID, name string
	if err := s.db.Get(&locationID, `SELECT location_id FROM staff
		WHERE id=? AND clinic_id=? AND deleted_at IS NULL`, staffID, s.ClinicID()); err != nil {
		return nil, errors.New("choose an active team member")
	}
	_ = s.db.Get(&name, `SELECT full_name FROM staff WHERE id=?`, staffID)

	fields := map[string]any{
		"staff_id":         staffID,
		"location_id":      locationID,
		"base_cents":       base,
		"allowances_cents": allowances,
		"deductions_cents": deductions,
		"notes":            strings.TrimSpace(notes),
	}
	var existing string
	_ = s.db.Get(&existing, `SELECT id FROM staff_pay
		WHERE clinic_id=? AND staff_id=? AND deleted_at IS NULL`, s.ClinicID(), staffID)
	audit := &Audit{Action: "payroll.salary_saved", Summary: "Saved salary for " + name}
	if existing != "" {
		return s.UpdateRecord("staff_pay", existing, fields, audit)
	}
	return s.CreateRecord("staff_pay", fields, audit)
}

// GeneratePayroll creates draft lines for every salaried team member who has
// no line for the month yet. It never changes an existing line.
func (s *Store) GeneratePayroll(period, locationID string) (map[string]any, error) {
	period, err := normalizePayrollPeriod(period)
	if err != nil {
		return nil, err
	}
	q := `SELECT st.id, st.full_name, st.location_id,
			p.base_cents, p.allowances_cents, p.deductions_cents
		FROM staff st
		JOIN staff_pay p ON p.staff_id=st.id AND p.clinic_id=st.clinic_id AND p.deleted_at IS NULL
		WHERE st.clinic_id=? AND st.deleted_at IS NULL AND st.active=1
			AND NOT EXISTS (SELECT 1 FROM payroll_entries e WHERE e.staff_id=st.id
				AND e.clinic_id=st.clinic_id AND e.period=? AND e.deleted_at IS NULL)`
	args := []any{s.ClinicID(), period}
	if scope := strings.TrimSpace(locationID); scope != "" {
		q += " AND st.location_id=?"
		args = append(args, scope)
	}
	q += " ORDER BY st.full_name"
	candidates, err := s.queryMaps(q, args...)
	if err != nil {
		return nil, err
	}
	created := 0
	for _, row := range candidates {
		base := toInt64(row["base_cents"])
		allowances := toInt64(row["allowances_cents"])
		deductions := toInt64(row["deductions_cents"])
		net, err := payrollNet(base, allowances, deductions)
		if err != nil || net <= 0 {
			continue
		}
		fields := map[string]any{
			"staff_id":         fmt.Sprint(row["id"]),
			"location_id":      fmt.Sprint(row["location_id"]),
			"period":           period,
			"base_cents":       base,
			"allowances_cents": allowances,
			"deductions_cents": deductions,
			"net_cents":        net,
			"status":           "draft",
		}
		if actor := s.Actor(); actor.ID != "" {
			fields["created_by"] = actor.ID
		}
		if _, err := s.CreateRecord("payroll_entries", fields, &Audit{
			Action: "payroll.generated", Summary: "Added salary for " + fmt.Sprint(row["full_name"]) + " · " + period,
		}); err != nil {
			return nil, err
		}
		created++
	}
	board, err := s.PayrollBoard(period, locationID)
	if err != nil {
		return nil, err
	}
	board["generated"] = created
	return board, nil
}

// SavePayrollEntry edits a draft line, or creates one for a month that has not
// been generated yet. Paid lines are locked; undo the payment first.
func (s *Store) SavePayrollEntry(fields map[string]any) (map[string]any, error) {
	id := fieldID(fields)
	delete(fields, "id")

	if id != "" {
		current, err := s.Row("payroll_entries", id)
		if err != nil {
			return nil, err
		}
		if fmt.Sprint(current["status"]) != "draft" {
			return nil, errors.New("this salary is already paid; undo the payment before editing it")
		}
		base := toInt64(current["base_cents"])
		allowances := toInt64(current["allowances_cents"])
		deductions := toInt64(current["deductions_cents"])
		if value, ok := fields["base_cents"]; ok {
			base = toInt64(value)
		}
		if value, ok := fields["allowances_cents"]; ok {
			allowances = toInt64(value)
		}
		if value, ok := fields["deductions_cents"]; ok {
			deductions = toInt64(value)
		}
		net, err := payrollNet(base, allowances, deductions)
		if err != nil {
			return nil, err
		}
		patch := map[string]any{
			"base_cents": base, "allowances_cents": allowances,
			"deductions_cents": deductions, "net_cents": net,
		}
		if value, ok := fields["notes"]; ok {
			patch["notes"] = strings.TrimSpace(fmt.Sprint(value))
		}
		return s.UpdateRecord("payroll_entries", id, patch, &Audit{
			Action: "payroll.updated", Summary: "Updated a salary line",
		})
	}

	staffID := strings.TrimSpace(fmt.Sprint(fields["staff_id"]))
	period, err := normalizePayrollPeriod(fmt.Sprint(fields["period"]))
	if err != nil {
		return nil, err
	}
	if staffID == "" {
		return nil, errors.New("choose a team member")
	}
	var locationID string
	if err := s.db.Get(&locationID, `SELECT location_id FROM staff
		WHERE id=? AND clinic_id=? AND deleted_at IS NULL`, staffID, s.ClinicID()); err != nil {
		return nil, errors.New("choose an active team member")
	}
	var existing int
	if err := s.db.Get(&existing, `SELECT COUNT(1) FROM payroll_entries
		WHERE clinic_id=? AND staff_id=? AND period=? AND deleted_at IS NULL`,
		s.ClinicID(), staffID, period); err != nil {
		return nil, err
	}
	if existing > 0 {
		return nil, errors.New("this salary is already on the month's register")
	}

	base := toInt64(fields["base_cents"])
	allowances := toInt64(fields["allowances_cents"])
	deductions := toInt64(fields["deductions_cents"])
	if _, ok := fields["base_cents"]; !ok {
		_ = s.db.Get(&base, `SELECT base_cents FROM staff_pay
			WHERE clinic_id=? AND staff_id=? AND deleted_at IS NULL`, s.ClinicID(), staffID)
	}
	if _, ok := fields["allowances_cents"]; !ok {
		_ = s.db.Get(&allowances, `SELECT allowances_cents FROM staff_pay
			WHERE clinic_id=? AND staff_id=? AND deleted_at IS NULL`, s.ClinicID(), staffID)
	}
	if _, ok := fields["deductions_cents"]; !ok {
		_ = s.db.Get(&deductions, `SELECT deductions_cents FROM staff_pay
			WHERE clinic_id=? AND staff_id=? AND deleted_at IS NULL`, s.ClinicID(), staffID)
	}
	net, err := payrollNet(base, allowances, deductions)
	if err != nil {
		return nil, err
	}
	entryNotes := ""
	if value, ok := fields["notes"]; ok {
		entryNotes = strings.TrimSpace(fmt.Sprint(value))
	}
	fields = map[string]any{
		"staff_id": staffID, "location_id": locationID, "period": period,
		"base_cents": base, "allowances_cents": allowances,
		"deductions_cents": deductions, "net_cents": net,
		"status": "draft", "notes": entryNotes,
	}
	if actor := s.Actor(); actor.ID != "" {
		fields["created_by"] = actor.ID
	}
	return s.CreateRecord("payroll_entries", fields, &Audit{
		Action: "payroll.added", Summary: "Added a salary line · " + period,
	})
}

// PayPayrollEntry marks a draft line as paid and records the matching salary
// expense in one transaction.
func (s *Store) PayPayrollEntry(id, method, reference, paidOn string) (map[string]any, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, errors.New("choose a salary line")
	}
	method = strings.TrimSpace(method)
	if method == "" {
		method = "bank"
	}
	if !payrollMethods[method] {
		return nil, errors.New("choose a valid payment method")
	}
	if strings.TrimSpace(paidOn) == "" {
		paidOn = time.Now().Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", paidOn); err != nil {
		return nil, errors.New("choose a valid payment date")
	}

	entry, err := s.Row("payroll_entries", id)
	if err != nil {
		return nil, err
	}
	if fmt.Sprint(entry["status"]) != "draft" {
		return nil, errors.New("this salary is already paid")
	}
	net := toInt64(entry["net_cents"])
	if net <= 0 {
		return nil, errors.New("the salary amount must be greater than zero")
	}
	staffID := fmt.Sprint(entry["staff_id"])
	period := fmt.Sprint(entry["period"])
	var staffName string
	_ = s.db.Get(&staffName, `SELECT full_name FROM staff WHERE id=?`, staffID)
	description := "Salary · " + staffName + " · " + period
	if strings.TrimSpace(staffName) == "" {
		description = "Salary · " + period
	}
	expense := map[string]any{
		"category": "salaries", "vendor": "Payroll", "description": description,
		"amount_cents": net, "spent_on": paidOn, "method": method,
		"reference": strings.TrimSpace(reference), "notes": fmt.Sprint(entry["notes"]),
	}
	if actor := s.Actor(); actor.ID != "" {
		expense["created_by"] = actor.ID
	}

	tx := s.db.MustBegin()
	_, expenseID, err := s.createInTx(tx, "expenses", expense, &Audit{
		Action: "expense.created", Summary: "Recorded expense " + description,
	})
	if err != nil {
		tx.Rollback()
		return nil, err
	}
	err = s.updateInTx(tx, "payroll_entries", id, map[string]any{
		"status": "paid", "paid_on": paidOn, "method": method,
		"reference": strings.TrimSpace(reference), "expense_id": expenseID,
	}, &Audit{Action: "payroll.paid", Summary: "Paid salary · " + staffName + " · " + period})
	if err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	s.emit("expenses", expenseID)
	s.emit("payroll_entries", id)
	return s.Row("payroll_entries", id)
}

// UnpayPayrollEntry reverses a payment: the linked expense is archived and the
// line returns to draft so it can be corrected.
func (s *Store) UnpayPayrollEntry(id string) (map[string]any, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, errors.New("choose a salary line")
	}
	entry, err := s.Row("payroll_entries", id)
	if err != nil {
		return nil, err
	}
	if fmt.Sprint(entry["status"]) != "paid" {
		return nil, errors.New("this salary is not paid")
	}

	// Reopening the line and removing its expense must not come apart: a
	// half-done reversal would leave a draft line whose salary is still
	// counted in the finance reports.
	expenseID := strings.TrimSpace(fmt.Sprint(entry["expense_id"]))
	tx := s.db.MustBegin()
	if err := s.updateInTx(tx, "payroll_entries", id, map[string]any{
		"status": "draft", "paid_on": "", "method": "", "reference": "", "expense_id": "",
	}, &Audit{Action: "payroll.payment_reversed", Summary: "Reopened a salary line"}); err != nil {
		tx.Rollback()
		return nil, err
	}
	if expenseID != "" {
		if err := s.archiveInTx(tx, "expenses", expenseID, &Audit{
			Action: "expense.removed", Summary: "Removed a salary payment after it was reversed",
		}); err != nil {
			tx.Rollback()
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	s.emit("payroll_entries", id)
	if expenseID != "" {
		s.emit("expenses", expenseID)
	}
	return s.Row("payroll_entries", id)
}

// DeletePayrollEntry removes a draft line. Paid lines must be reopened first.
func (s *Store) DeletePayrollEntry(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("choose a salary line")
	}
	entry, err := s.Row("payroll_entries", id)
	if err != nil {
		return err
	}
	if fmt.Sprint(entry["status"]) != "draft" {
		return errors.New("this salary is already paid; undo the payment before removing it")
	}
	return s.Archive("payroll_entries", id, &Audit{
		Action: "payroll.removed", Summary: "Removed a salary line",
	})
}
