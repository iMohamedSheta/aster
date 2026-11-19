package store

import (
	"fmt"
	"testing"
)

func payrollRows(t *testing.T, board map[string]any) []map[string]any {
	t.Helper()
	rows, _ := board["rows"].([]map[string]any)
	return rows
}

func TestPayrollLifecycle(t *testing.T) {
	st := testStore(t)
	staff, err := st.ListStaff()
	if err != nil || len(staff) == 0 {
		t.Fatalf("list staff: %v %d", err, len(staff))
	}
	ownerID := fmt.Sprint(staff[0]["id"])

	if _, err := st.SaveStaffPay(ownerID, 1_000_000, 100_000, 50_000, "Monthly"); err != nil {
		t.Fatalf("save salary: %v", err)
	}
	if _, err := st.SaveStaffPay(ownerID, 1_000_000, 100_000, 2_000_000, ""); err == nil {
		t.Fatal("deductions above gross should be rejected")
	}

	board, err := st.PayrollBoard("2026-11", "")
	if err != nil {
		t.Fatalf("board: %v", err)
	}
	rows := payrollRows(t, board)
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(rows))
	}
	if got := toInt64(rows[0]["net_cents"]); got != 1_050_000 {
		t.Fatalf("suggested net = %d, want 1050000", got)
	}
	if fmt.Sprint(rows[0]["status"]) != "not_generated" {
		t.Fatalf("status = %v", rows[0]["status"])
	}

	board, err = st.GeneratePayroll("2026-11", "")
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if got := board["generated"]; got != 1 {
		t.Fatalf("generated = %v, want 1", got)
	}
	rows = payrollRows(t, board)
	entryID := fmt.Sprint(rows[0]["entry_id"])
	if entryID == "" || fmt.Sprint(rows[0]["status"]) != "draft" {
		t.Fatalf("generated row: %+v", rows[0])
	}

	// A second run is idempotent.
	board, err = st.GeneratePayroll("2026-11", "")
	if err != nil || board["generated"] != 0 {
		t.Fatalf("second generate: %v generated=%v", err, board["generated"])
	}

	if _, err := st.SavePayrollEntry(map[string]any{
		"id": entryID, "base_cents": 1_200_000, "notes": "Reviewed",
	}); err != nil {
		t.Fatalf("edit draft: %v", err)
	}
	board, _ = st.PayrollBoard("2026-11", "")
	rows = payrollRows(t, board)
	if got := toInt64(rows[0]["net_cents"]); got != 1_250_000 {
		t.Fatalf("edited net = %d", got)
	}

	paid, err := st.PayPayrollEntry(entryID, "bank", "TRX-1", "2026-11-30")
	if err != nil {
		t.Fatalf("pay: %v", err)
	}
	if fmt.Sprint(paid["status"]) != "paid" || fmt.Sprint(paid["expense_id"]) == "" {
		t.Fatalf("paid entry: %+v", paid)
	}
	expenses, err := st.ListExpenses("2026-11-01", "2026-11-30", "")
	if err != nil {
		t.Fatalf("expenses: %v", err)
	}
	if len(expenses) != 1 {
		t.Fatalf("expenses = %d, want 1", len(expenses))
	}
	if fmt.Sprint(expenses[0]["category"]) != "salaries" || toInt64(expenses[0]["amount_cents"]) != 1_250_000 {
		t.Fatalf("salary expense: %+v", expenses[0])
	}
	if _, err := st.SavePayrollEntry(map[string]any{"id": entryID, "base_cents": 1}); err == nil {
		t.Fatal("paid salary should be locked")
	}

	reopened, err := st.UnpayPayrollEntry(entryID)
	if err != nil {
		t.Fatalf("unpay: %v", err)
	}
	if fmt.Sprint(reopened["status"]) != "draft" {
		t.Fatalf("reopened status = %v", reopened["status"])
	}
	expenses, _ = st.ListExpenses("2026-11-01", "2026-11-30", "")
	if len(expenses) != 0 {
		t.Fatalf("reversed payment left %d expenses", len(expenses))
	}

	if err := st.DeletePayrollEntry(entryID); err != nil {
		t.Fatalf("delete draft: %v", err)
	}
	board, _ = st.PayrollBoard("2026-11", "")
	rows = payrollRows(t, board)
	if len(rows) != 1 || fmt.Sprint(rows[0]["entry_id"]) != "" {
		t.Fatalf("after delete: %+v", rows)
	}
}

func TestPayrollAddsMemberWithoutSalaryProfile(t *testing.T) {
	st := testStore(t)
	member, err := st.SaveStaff(map[string]any{
		"full_name": "Nour Hassan", "role": "nurse", "active": 1,
	})
	if err != nil {
		t.Fatalf("add staff: %v", err)
	}
	board, err := st.SavePayrollEntry(map[string]any{
		"staff_id": fmt.Sprint(member["id"]), "period": "2026-12",
		"base_cents": 800_000, "allowances_cents": 0, "deductions_cents": 0,
	})
	if err != nil {
		t.Fatalf("add line: %v", err)
	}
	if fmt.Sprint(board["period"]) != "2026-12" || toInt64(board["net_cents"]) != 800_000 {
		t.Fatalf("line: %+v", board)
	}
	board, _ = st.PayrollBoard("2026-12", "")
	totals, _ := board["totals"].(map[string]any)
	if toInt64(totals["net_cents"]) != 800_000 || toInt64(totals["outstanding_cents"]) != 800_000 {
		t.Fatalf("totals: %+v", totals)
	}
}
