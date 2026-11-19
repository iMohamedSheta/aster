package main

import (
	"fmt"
	"path/filepath"
	"testing"

	"aster/internal/config"
	"aster/internal/store"
)

// First-run setup creates the clinic manager but must not open the clinic.
// The person signs in with the credentials they just created.
func TestOnboardingCreatesManagerThenRequiresSignIn(t *testing.T) {
	dir := t.TempDir()
	cfg, err := config.Load(dir)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	st, err := store.Open(filepath.Join(dir, "aster.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	app := NewApp(cfg, cfg.Path(), dir, st)
	boot, err := app.CompleteOnboarding(OnboardingInput{
		ClinicName: "Cedar Clinic",
		ClinicType: "family",
		OwnerName:  "Dr. Sam Carter",
		Username:   "manager",
		Password:   "clinic-pass-1",
		Currency:   "EGP",
		Symbol:     "E£",
		Timezone:   "Africa/Cairo",
	})
	if err != nil {
		t.Fatalf("complete onboarding: %v", err)
	}
	if !boot.Onboarded {
		t.Fatal("clinic should be marked as set up")
	}
	if boot.SignedIn {
		t.Fatal("onboarding must not sign the manager in automatically")
	}
	if boot.DefaultStaffID == "" {
		t.Fatal("the manager account should be offered on the sign-in screen")
	}

	var managerPassword int
	if err := st.DB().Get(&managerPassword, `SELECT CASE WHEN password_hash <> '' THEN 1 ELSE 0 END
		FROM staff WHERE id=?`, boot.DefaultStaffID); err != nil {
		t.Fatalf("read manager credentials: %v", err)
	}
	if managerPassword != 1 {
		t.Fatal("the manager account should have a password")
	}

	// First-run setup must not add demonstration records.
	for _, table := range []string{"patients", "appointments", "encounters", "invoices", "expenses"} {
		var count int
		if err := st.DB().Get(&count, fmt.Sprintf("SELECT COUNT(1) FROM %s", table)); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		if count != 0 {
			t.Fatalf("%s should be empty after onboarding, found %d rows", table, count)
		}
	}

	next, err := app.SignInAccount(boot.DefaultStaffID, "clinic-pass-1")
	if err != nil {
		t.Fatalf("sign in: %v", err)
	}
	if !next.SignedIn {
		t.Fatal("the manager should be signed in after entering valid credentials")
	}
}
