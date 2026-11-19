package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"aster/internal/api"
	"aster/internal/config"
	"aster/internal/store"
	"aster/internal/syncengine"
	"aster/internal/version"
)

type App struct {
	ctx context.Context

	cfg     *config.Config
	cfgPath string
	dataDir string
	st      *store.Store
	engine  *syncengine.Client

	mu         sync.Mutex
	srv        *api.Server
	beaconStop chan struct{}
	hostErr    string

	// signedIn is session-scoped on purpose: every launch starts at the
	// sign-in screen, while the account choice itself is remembered.
	signedIn atomic.Bool

	// Failed password attempts are tracked per account. The guard lives in
	// memory only, so restarting the app clears it.
	authMu   sync.Mutex
	attempts map[string]*signInAttempt

	startRoute string
}

type signInAttempt struct {
	failures    int
	lockedUntil time.Time
}

func NewApp(cfg *config.Config, cfgPath, dataDir string, st *store.Store) *App {
	a := &App{cfg: cfg, cfgPath: cfgPath, dataDir: dataDir, st: st}
	a.engine = syncengine.New(st)
	if r := os.Getenv("ASTER_START_ROUTE"); r != "" {
		a.startRoute = r
	}
	return a
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.st.SetActor(a.currentActor())
	a.st.SetEventHook(func(entity, id string) {
		wruntime.EventsEmit(a.ctx, "data:changed", map[string]any{"entity": entity, "id": id})
	})
	a.engine.OnEvent(func(s syncengine.Status) {
		wruntime.EventsEmit(a.ctx, "sync:status", s)
	})

	if a.cfg.NodeID == "" {
		a.cfg.NodeID = a.st.Node()
		_ = a.cfg.Save()
	}

	// Make sure the workspace has a primary clinic location before any screen
	// can ask for one, then restore the location this device was using.
	if a.st.ClinicID() != "" {
		if loc, err := a.st.EnsureDefaultLocation(); err == nil && loc != nil {
			if a.cfg.LocationID == "" {
				a.cfg.LocationID = fmt.Sprint(loc["id"])
				_ = a.cfg.Save()
			} else {
				a.st.SetLocationID(a.cfg.LocationID)
			}
		}
	}

	if a.cfg.Mode == "lan_host" {
		go func() {
			if err := a.startHosting(a.cfg.LanPort); err != nil {
				a.mu.Lock()
				a.hostErr = err.Error()
				a.mu.Unlock()
				a.st.LogActivity("host", "error", "Could not start workspace host: "+err.Error(), "")
			}
		}()
	}
	if a.cfg.IsConnected() {
		_ = a.engine.Configure(a.cfg.ServerURL, a.cfg.Token, a.cfg.Fingerprint, a.cfg.DeviceName, a.cfg.Workspace)
		a.engine.Start(25 * time.Second)
	}
	go a.dailyBackup()
}

func (a *App) shutdown(ctx context.Context) {
	a.engine.Stop()
	a.mu.Lock()
	stop := a.beaconStop
	srv := a.srv
	a.beaconStop = nil
	a.srv = nil
	a.mu.Unlock()
	if stop != nil {
		close(stop)
	}
	if srv != nil {
		c, cancel := context.WithTimeout(ctx, 4*time.Second)
		_ = srv.Stop(c)
		cancel()
	}
	_ = a.st.Close()
}

func (a *App) currentActor() store.Actor {
	staff, err := a.st.ListStaff()
	if err != nil || len(staff) == 0 {
		return store.Actor{ID: a.cfg.StaffID, Name: a.cfg.StaffName}
	}
	chosen := map[string]any{}
	for _, s := range staff {
		if fmt.Sprint(s["id"]) == a.cfg.StaffID {
			chosen = s
			break
		}
	}
	if chosen == nil || len(chosen) == 0 {
		for _, s := range staff {
			if fmt.Sprint(s["role"]) == "owner" {
				chosen = s
				break
			}
		}
	}
	if chosen == nil || len(chosen) == 0 {
		chosen = staff[0]
	}
	a.cfg.StaffID = fmt.Sprint(chosen["id"])
	a.cfg.StaffName = fmt.Sprint(chosen["full_name"])
	a.cfg.StaffRole = fmt.Sprint(chosen["role"])
	_ = a.cfg.Save()
	return store.Actor{ID: a.cfg.StaffID, Name: a.cfg.StaffName}
}

// ---- Bootstrap -----------------------------------------------------------

type HostStatus struct {
	Running     bool     `json:"running"`
	URLs        []string `json:"urls"`
	PairingCode string   `json:"pairingCode"`
	PairingRole string   `json:"pairingRole"`
	ExpiresAt   string   `json:"expiresAt"`
	Fingerprint string   `json:"fingerprint"`
	Port        int      `json:"port"`
	Error       string   `json:"error"`
}

type BootstrapData struct {
	Version          string            `json:"version"`
	AppName          string            `json:"appName"`
	Tagline          string            `json:"tagline"`
	Onboarded        bool              `json:"onboarded"`
	SignedIn         bool              `json:"signedIn"`
	SignInMode       string            `json:"signInMode"`
	NeedsAccessSetup bool              `json:"needsAccessSetup"`
	DefaultStaffID   string            `json:"defaultStaffId"`
	Clinic           map[string]any    `json:"clinic"`
	Staff            []map[string]any  `json:"staff"`
	CurrentStaff     map[string]any    `json:"currentStaff"`
	Locations        []map[string]any  `json:"locations"`
	ActiveLocationID string            `json:"activeLocationId"`
	ActiveLocation   map[string]any    `json:"activeLocation"`
	ClinicType       string            `json:"clinicType"`
	Mode             string            `json:"mode"`
	Sync             syncengine.Status `json:"sync"`
	Host             HostStatus        `json:"host"`
	Conflicts        int               `json:"conflicts"`
	StartRoute       string            `json:"startRoute"`
	Theme            string            `json:"theme"`
	Locale           string            `json:"locale"`
	ServerURL        string            `json:"serverUrl"`
	Workspace        string            `json:"workspace"`
	DeviceName       string            `json:"deviceName"`
	DataDir          string            `json:"dataDir"`
	ServerInfo       map[string]any    `json:"serverInfo"`
}

func staffIsActive(s map[string]any) bool {
	if s == nil {
		return false
	}
	switch fmt.Sprint(s["active"]) {
	case "", "0", "false", "<nil>":
		return false
	}
	return true
}

func staffByID(staff []map[string]any, id string) map[string]any {
	if id == "" {
		return nil
	}
	for _, s := range staff {
		if fmt.Sprint(s["id"]) == id {
			return s
		}
	}
	return nil
}

// defaultStaffFor picks the account offered first on the sign-in screen.
// The clinic manager is always the default; the last account used on this
// device is only a fallback when no manager account exists.
func defaultStaffFor(staff []map[string]any, preferredID string) map[string]any {
	for _, s := range staff {
		if staffIsActive(s) && fmt.Sprint(s["role"]) == "owner" {
			return s
		}
	}
	if s := staffByID(staff, preferredID); staffIsActive(s) {
		return s
	}
	for _, s := range staff {
		if staffIsActive(s) {
			return s
		}
	}
	return nil
}

func (a *App) Bootstrap() BootstrapData {
	clinic, _ := a.st.GetClinic()
	staff, _ := a.st.ListStaff()
	signedIn := a.signedIn.Load()
	fallback := defaultStaffFor(staff, a.cfg.StaffID)

	var current map[string]any
	if signedIn {
		current = staffByID(staff, a.cfg.StaffID)
		if !staffIsActive(current) {
			current = fallback
		}
	}
	if current != nil {
		a.cfg.StaffID = fmt.Sprint(current["id"])
		a.cfg.StaffName = fmt.Sprint(current["full_name"])
		a.cfg.StaffRole = fmt.Sprint(current["role"])
	}
	defaultID := ""
	if fallback != nil {
		defaultID = fmt.Sprint(fallback["id"])
	}
	needsSetup := !signedIn && len(staff) > 0 && !a.st.HasAnyPassword()

	locations, _ := a.st.ListLocations()
	activeID := a.st.LocationID()
	var active map[string]any
	for _, loc := range locations {
		if fmt.Sprint(loc["id"]) == activeID {
			active = loc
			break
		}
	}
	if active == nil && len(locations) > 0 {
		// The remembered clinic may have been archived on another device.
		active = locations[0]
		activeID = fmt.Sprint(active["id"])
		a.st.SetLocationID(activeID)
		a.cfg.LocationID = activeID
		_ = a.cfg.Save()
	}
	clinicType := ""
	if clinic != nil {
		clinicType = fmt.Sprint(clinic["clinic_type"])
	}

	return BootstrapData{
		Version: version.Version, AppName: "Aster", Tagline: "Clinic works, beautifully kept",
		Onboarded: a.cfg.Onboarded,
		SignedIn:  signedIn, SignInMode: a.st.ClinicSignInMode(), NeedsAccessSetup: needsSetup,
		DefaultStaffID: defaultID,
		Clinic:         clinic, Staff: staff, CurrentStaff: current, Mode: a.cfg.Mode,
		Locations: locations, ActiveLocationID: activeID, ActiveLocation: active,
		ClinicType: clinicType,
		Sync:       a.engine.Status(), Host: a.HostStatus(), Conflicts: a.st.CountOpenConflicts(),
		StartRoute: a.startRoute, Theme: a.cfg.Theme, Locale: a.cfg.Locale, ServerURL: a.cfg.ServerURL,
		Workspace: a.cfg.Workspace, DeviceName: a.cfg.DeviceName, DataDir: a.dataDir,
	}
}

const (
	maxSignInFailures = 5
	signInLockWindow  = 60 * time.Second
)

func (a *App) attemptFor(key string) *signInAttempt {
	if a.attempts == nil {
		a.attempts = map[string]*signInAttempt{}
	}
	entry := a.attempts[key]
	if entry == nil {
		entry = &signInAttempt{}
		a.attempts[key] = entry
	}
	return entry
}

// checkSignInLock reports whether this account is temporarily blocked after
// repeated failures.
func (a *App) checkSignInLock(key string) error {
	a.authMu.Lock()
	defer a.authMu.Unlock()
	entry := a.attemptFor(key)
	if entry.lockedUntil.IsZero() {
		return nil
	}
	if time.Now().Before(entry.lockedUntil) {
		seconds := int(time.Until(entry.lockedUntil).Seconds()) + 1
		return fmt.Errorf("Too many failed attempts. Try again in %d seconds", seconds)
	}
	entry.failures = 0
	entry.lockedUntil = time.Time{}
	return nil
}

func (a *App) clearSignInLock(key string) {
	a.authMu.Lock()
	defer a.authMu.Unlock()
	delete(a.attempts, key)
}

// noteSignInFailure records one failed attempt and returns the message the
// person should see, including how many tries remain.
func (a *App) noteSignInFailure(key, subject string) error {
	a.authMu.Lock()
	defer a.authMu.Unlock()
	entry := a.attemptFor(key)
	entry.failures++
	if entry.failures >= maxSignInFailures {
		entry.lockedUntil = time.Now().Add(signInLockWindow)
		entry.failures = 0
		return fmt.Errorf("Too many failed attempts. Try again in %d seconds", int(signInLockWindow.Seconds()))
	}
	left := maxSignInFailures - entry.failures
	if left == 1 {
		return fmt.Errorf("%s. 1 attempt left before a short lock", subject)
	}
	return fmt.Errorf("%s. %d attempts left before a short lock", subject, left)
}

// finishSignIn activates the session once credentials are accepted.
func (a *App) finishSignIn(account *store.StaffAuth) (BootstrapData, error) {
	a.clearSignInLock("id:" + account.ID)
	a.clearSignInLock("user:" + store.NormalizeUsername(account.Username))
	a.cfg.StaffID = account.ID
	a.cfg.StaffName = account.FullName
	a.cfg.StaffRole = account.Role
	if err := a.cfg.Save(); err != nil {
		return a.Bootstrap(), err
	}
	a.st.SetActor(store.Actor{ID: account.ID, Name: account.FullName})
	a.signedIn.Store(true)
	a.st.LogActivity("session", "ok", "Signed in as "+account.FullName, "")
	return a.Bootstrap(), nil
}

// signInUnchecked is the private launch shortcut used by --auto-login for
// screenshots and demos. It is deliberately not bound to the interface.
func (a *App) signInUnchecked(id string) (BootstrapData, error) {
	staff, err := a.st.ListStaff()
	if err != nil {
		return a.Bootstrap(), err
	}
	id = strings.TrimSpace(id)
	var chosen map[string]any
	if id == "" {
		chosen = defaultStaffFor(staff, a.cfg.StaffID)
	} else {
		chosen = staffByID(staff, id)
		if chosen == nil {
			return a.Bootstrap(), fmt.Errorf("Account not found")
		}
	}
	if !staffIsActive(chosen) {
		return a.Bootstrap(), fmt.Errorf("no active team accounts are available")
	}
	account, err := a.st.StaffAuthByID(fmt.Sprint(chosen["id"]))
	if err != nil || account == nil {
		return a.Bootstrap(), fmt.Errorf("Account not found")
	}
	return a.finishSignIn(account)
}

// SignInAccount signs in from the account picker. The clinic manager is
// offered first, but any active account with a password can be used.
func (a *App) SignInAccount(id, password string) (BootstrapData, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return a.Bootstrap(), fmt.Errorf("Choose an account to continue")
	}
	if password == "" {
		return a.Bootstrap(), fmt.Errorf("Enter your password")
	}
	key := "id:" + id
	if err := a.checkSignInLock(key); err != nil {
		return a.Bootstrap(), err
	}
	account, err := a.st.StaffAuthByID(id)
	if err != nil {
		return a.Bootstrap(), err
	}
	if account == nil || !account.Active || account.PasswordHash == "" {
		return a.Bootstrap(), a.noteSignInFailure(key, "Incorrect password")
	}
	if !store.CheckPasswordHash(account.PasswordHash, password) {
		a.st.LogActivity("session", "warn", "Failed sign-in attempt for "+account.FullName, "")
		return a.Bootstrap(), a.noteSignInFailure(key, "Incorrect password")
	}
	return a.finishSignIn(account)
}

// SignInWithPassword signs in by typing a username and password. It is the
// mode a clinic manager can choose instead of the account picker.
func (a *App) SignInWithPassword(username, password string) (BootstrapData, error) {
	username = store.NormalizeUsername(username)
	if username == "" || password == "" {
		return a.Bootstrap(), fmt.Errorf("Enter your username and password")
	}
	key := "user:" + username
	if err := a.checkSignInLock(key); err != nil {
		return a.Bootstrap(), err
	}
	account, err := a.st.StaffAuthByUsername(username)
	if err != nil {
		return a.Bootstrap(), err
	}
	if account == nil || !account.Active || account.PasswordHash == "" {
		return a.Bootstrap(), a.noteSignInFailure(key, "Incorrect username or password")
	}
	if !store.CheckPasswordHash(account.PasswordHash, password) {
		a.st.LogActivity("session", "warn", "Failed sign-in attempt for "+account.FullName, "")
		return a.Bootstrap(), a.noteSignInFailure(key, "Incorrect username or password")
	}
	return a.finishSignIn(account)
}

// SetupManagerAccess gives the clinic manager a username and password on a
// database created before password sign-in existed. It is only available
// while no account can sign in yet.
func (a *App) SetupManagerAccess(username, password string) (BootstrapData, error) {
	if a.signedIn.Load() {
		return a.Bootstrap(), fmt.Errorf("Access is already set up")
	}
	if a.st.HasAnyPassword() {
		return a.Bootstrap(), fmt.Errorf("This clinic already has password access")
	}
	staff, err := a.st.ListStaff()
	if err != nil {
		return a.Bootstrap(), err
	}
	var owner map[string]any
	for _, s := range staff {
		if fmt.Sprint(s["role"]) == "owner" && staffIsActive(s) {
			owner = s
			break
		}
	}
	if owner == nil {
		return a.Bootstrap(), fmt.Errorf("No clinic manager account was found")
	}
	if err := store.ValidateUsername(username); err != nil {
		return a.Bootstrap(), err
	}
	if err := store.ValidatePassword(password); err != nil {
		return a.Bootstrap(), err
	}
	if _, err := a.st.SetStaffCredentials(fmt.Sprint(owner["id"]), username, password); err != nil {
		return a.Bootstrap(), err
	}
	a.st.LogActivity("access", "ok", "Clinic manager access was set up", "")
	account, err := a.st.StaffAuthByID(fmt.Sprint(owner["id"]))
	if err != nil || account == nil {
		return a.Bootstrap(), fmt.Errorf("Account not found")
	}
	return a.finishSignIn(account)
}

// SignOut returns to the sign-in screen without touching any clinic data.
func (a *App) SignOut() BootstrapData {
	a.signedIn.Store(false)
	return a.Bootstrap()
}

// requireManager guards every access-control change.
func (a *App) requireManager() error {
	if !a.signedIn.Load() {
		return fmt.Errorf("Sign in as the clinic manager first")
	}
	if a.cfg.StaffRole != "owner" {
		return fmt.Errorf("Only the clinic manager can change access settings")
	}
	return nil
}

// SetSignInMode chooses how this clinic signs in: the account picker or a
// typed username. The setting is stored with the clinic and shared by devices.
func (a *App) SetSignInMode(mode string) error {
	if err := a.requireManager(); err != nil {
		return err
	}
	if err := a.st.SetClinicSignInMode(mode); err != nil {
		return err
	}
	a.st.LogActivity("access", "ok", "Sign-in method changed to "+mode, "")
	return nil
}

// SetStaffCredentials lets the clinic manager set a username and/or a new
// password for a team member. An empty password leaves it unchanged.
func (a *App) SetStaffCredentials(id, username, password string) (map[string]any, error) {
	if err := a.requireManager(); err != nil {
		return nil, err
	}
	row, err := a.st.SetStaffCredentials(id, username, password)
	if err != nil {
		return nil, err
	}
	a.st.LogActivity("access", "ok", "Access updated for "+fmt.Sprint(row["full_name"]), "")
	return row, nil
}

// ChangeOwnPassword verifies the current password before replacing it.
func (a *App) ChangeOwnPassword(current, next string) error {
	if !a.signedIn.Load() {
		return fmt.Errorf("Sign in first")
	}
	account, err := a.st.StaffAuthByID(a.cfg.StaffID)
	if err != nil || account == nil {
		return fmt.Errorf("Account not found")
	}
	if !store.CheckPasswordHash(account.PasswordHash, current) {
		return fmt.Errorf("Current password is incorrect")
	}
	if err := store.ValidatePassword(next); err != nil {
		return err
	}
	if _, err := a.st.SetStaffCredentials(account.ID, "", next); err != nil {
		return err
	}
	a.st.LogActivity("access", "ok", "Changed their own password", "")
	return nil
}

type OnboardingInput struct {
	ClinicName string `json:"clinicName"`
	ClinicType string `json:"clinicType"`
	OwnerName  string `json:"ownerName"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	Currency   string `json:"currency"`
	Symbol     string `json:"currencySymbol"`
	Timezone   string `json:"timezone"`
}

func (a *App) CompleteOnboarding(in OnboardingInput) (BootstrapData, error) {
	name := strings.TrimSpace(in.ClinicName)
	owner := strings.TrimSpace(in.OwnerName)
	if name == "" || owner == "" {
		return BootstrapData{}, fmt.Errorf("clinic name and your name are required")
	}
	if err := store.ValidateUsername(in.Username); err != nil {
		return BootstrapData{}, err
	}
	if err := store.ValidatePassword(in.Password); err != nil {
		return BootstrapData{}, err
	}
	clinicID, err := a.st.EnsureClinic(name, owner, "local")
	if err != nil {
		return BootstrapData{}, err
	}
	_ = clinicID
	profile := map[string]any{"name": name, "legal_name": name}
	if kind := strings.TrimSpace(in.ClinicType); kind != "" {
		profile["clinic_type"] = kind
	}
	if in.Currency != "" {
		profile["currency"] = in.Currency
	}
	if in.Symbol != "" {
		profile["currency_symbol"] = in.Symbol
	}
	if in.Timezone != "" {
		profile["timezone"] = in.Timezone
	}
	_, _ = a.st.UpdateClinic(profile)
	// Every workspace starts with its primary clinic location. The location
	// reuses the clinic id, so historic and future records stay attributable.
	if loc, err := a.st.EnsureDefaultLocation(); err == nil && loc != nil {
		a.cfg.LocationID = fmt.Sprint(loc["id"])
		a.st.SetLocationID(a.cfg.LocationID)
	}
	a.cfg.Onboarded = true
	a.cfg.Mode = "local"
	a.st.SetSyncMode(store.ModeLocal)
	staff, _ := a.st.ListStaff()
	for _, s := range staff {
		if fmt.Sprint(s["role"]) == "owner" {
			a.cfg.StaffID = fmt.Sprint(s["id"])
			a.cfg.StaffName = fmt.Sprint(s["full_name"])
			a.cfg.StaffRole = "owner"
			if _, err := a.st.SetStaffCredentials(a.cfg.StaffID, in.Username, in.Password); err != nil {
				return BootstrapData{}, err
			}
			break
		}
	}
	if err := a.cfg.Save(); err != nil {
		return BootstrapData{}, err
	}
	a.st.SetActor(store.Actor{ID: a.cfg.StaffID, Name: a.cfg.StaffName})
	a.signedIn.Store(false)
	a.st.LogActivity("session", "ok", "Clinic created with manager account "+a.cfg.StaffName, "")
	return a.Bootstrap(), nil
}

func (a *App) SetTheme(theme string) {
	if theme != "light" && theme != "dark" && theme != "system" {
		return
	}
	a.cfg.Theme = theme
	_ = a.cfg.Save()
}

// ---- Clinic & dashboard --------------------------------------------------

func (a *App) Clinic() (map[string]any, error) { return a.st.GetClinic() }

func (a *App) SaveClinic(fields map[string]any) (map[string]any, error) {
	return a.st.UpdateClinic(fields)
}

func (a *App) Dashboard(start, end string) (map[string]any, error) {
	return a.st.Dashboard(start, end)
}

func (a *App) Reports(start, end, locationID string) (map[string]any, error) {
	return a.st.Reports(start, end, locationID)
}

// ---- Clinic network & tasks ---------------------------------------------

func (a *App) Locations() ([]map[string]any, error) { return a.st.ListLocations() }

func (a *App) Location(id string) (map[string]any, error) { return a.st.LocationByID(id) }

// SetActiveLocation switches this device to another clinic in the network.
// Records are stamped with the active clinic from then on.
func (a *App) SetActiveLocation(id string) (BootstrapData, error) {
	loc, err := a.st.LocationByID(id)
	if err != nil {
		return a.Bootstrap(), err
	}
	if fmt.Sprint(loc["active"]) == "0" || fmt.Sprint(loc["active"]) == "false" {
		return a.Bootstrap(), fmt.Errorf("this clinic is archived")
	}
	a.st.SetLocationID(id)
	a.cfg.LocationID = id
	if err := a.cfg.Save(); err != nil {
		return a.Bootstrap(), err
	}
	a.st.LogActivity("location", "ok", "Switched clinic to "+fmt.Sprint(loc["name"]), id)
	return a.Bootstrap(), nil
}

func (a *App) SaveLocation(fields map[string]any) (map[string]any, error) {
	return a.st.SaveLocation(fields)
}

func (a *App) ArchiveLocation(id string) error { return a.st.ArchiveLocation(id) }

func (a *App) NetworkOverview(start, end string) (map[string]any, error) {
	return a.st.NetworkOverview(start, end)
}

func (a *App) Tasks(filter string) ([]map[string]any, error) { return a.st.ListTasks(filter) }

func (a *App) Task(id string) (map[string]any, error) { return a.st.TaskByID(id) }

func (a *App) SaveTask(fields map[string]any) (map[string]any, error) {
	return a.st.SaveTask(fields)
}

func (a *App) SetTaskStatus(id, status string) (map[string]any, error) {
	return a.st.SetTaskStatus(id, status)
}

// ---- Treatment plans, stock and expenses ---------------------------------

func (a *App) TreatmentPlans(patientID, status string) ([]map[string]any, error) {
	return a.st.ListTreatmentPlans(patientID, status)
}

func (a *App) TreatmentPlan(id string) (map[string]any, error) {
	return a.st.TreatmentPlanDetail(id)
}

func (a *App) SaveTreatmentPlan(fields map[string]any) (map[string]any, error) {
	return a.st.SaveTreatmentPlan(fields)
}

func (a *App) SaveTreatmentPlanItem(fields map[string]any) (map[string]any, error) {
	return a.st.SaveTreatmentPlanItem(fields)
}

func (a *App) SetTreatmentPlanItemStatus(id, status string) (map[string]any, error) {
	return a.st.SetTreatmentPlanItemStatus(id, status)
}

func (a *App) Inventory(filter string) ([]map[string]any, error) {
	return a.st.ListInventory(filter)
}

func (a *App) InventorySummary(locationID string) (map[string]any, error) {
	return a.st.InventorySummary(locationID)
}

func (a *App) SaveInventoryItem(fields map[string]any) (map[string]any, error) {
	return a.st.SaveInventoryItem(fields)
}

func (a *App) AdjustStock(itemID, kind string, quantity float64, reason string) (map[string]any, error) {
	return a.st.AdjustStock(itemID, kind, quantity, reason)
}

func (a *App) Expenses(from, to, locationID string) ([]map[string]any, error) {
	return a.st.ListExpenses(from, to, locationID)
}

func (a *App) SaveExpense(fields map[string]any) (map[string]any, error) {
	return a.st.SaveExpense(fields)
}

// SaveExport writes a generated report (CSV, JSON or HTML) to a file the user
// chooses. Without a dialog, such as in the hosted web client, it falls back to
// the workspace exports folder.
func (a *App) SaveExport(filename, content string) (map[string]any, error) {
	if filename == "" {
		filename = "aster-export-" + config.Timestamp() + ".csv"
	}
	path := ""
	if a.ctx != nil {
		chosen, err := wruntime.SaveFileDialog(a.ctx, wruntime.SaveDialogOptions{
			DefaultFilename: filename,
			Title:           "Export Aster report",
		})
		if err == nil && chosen != "" {
			path = chosen
		}
	}
	if path == "" {
		dir := filepath.Join(a.dataDir, "exports")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return nil, err
		}
		path = filepath.Join(dir, filename)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		return nil, err
	}
	a.st.LogActivity("export", "ok", "Exported "+filename, "")
	return map[string]any{"path": path, "name": filepath.Base(path)}, nil
}

// OpenExternal opens a web link in the user's default browser. Contact
// actions such as WhatsApp use it; only http(s) links are accepted so a
// record cannot launch a local file or a custom protocol handler.
func (a *App) OpenExternal(rawURL string) error {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return fmt.Errorf("invalid link: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("only web links can be opened")
	}
	wruntime.BrowserOpenURL(a.ctx, u.String())
	return nil
}

func (a *App) Audit(limit int) ([]map[string]any, error) { return a.st.AuditLog(limit) }

// ---- Patients ------------------------------------------------------------

func (a *App) Patients(query, status string, limit int) ([]map[string]any, error) {
	return a.st.ListPatients(store.PatientFilter{Query: query, Status: status, Limit: limit})
}

func (a *App) Patient(id string) (store.PatientDetail, error) { return a.st.PatientDetail(id) }

func (a *App) CreatePatient(in store.PatientInput) (map[string]any, error) {
	return a.st.CreatePatient(in)
}

func (a *App) UpdatePatient(id string, in store.PatientInput) (map[string]any, error) {
	return a.st.UpdatePatient(id, in)
}

func (a *App) ArchivePatient(id string) error {
	p, err := a.st.Row("patients", id)
	if err != nil {
		return err
	}
	return a.st.Archive("patients", id, &store.Audit{
		Action: "patient.archived", Summary: "Archived patient " + fmt.Sprint(p["first_name"]) + " " + fmt.Sprint(p["last_name"]),
	})
}

func (a *App) SaveAllergy(fields map[string]any) (map[string]any, error) {
	return a.st.SaveAllergy(fields)
}

func (a *App) SaveCondition(fields map[string]any) (map[string]any, error) {
	return a.st.SaveCondition(fields)
}

func (a *App) DeleteEntity(entity, id string) error {
	return a.st.ArchiveEntity(entity, id, entity)
}

// ---- Patient documents ---------------------------------------------------

// PatientFiles lists document metadata. An empty patient id searches the
// whole workspace, which is what the Files page uses.
func (a *App) PatientFiles(patientID, query, category string) ([]map[string]any, error) {
	return a.st.ListPatientFiles(patientID, query, category, 300)
}

func (a *App) RecentPatientFiles(limit int) ([]map[string]any, error) {
	return a.st.RecentPatientFiles(limit)
}

func (a *App) FilesOverview() (map[string]any, error) { return a.st.FilesOverview() }

func (a *App) UploadPatientFile(in store.PatientFileInput) (map[string]any, error) {
	return a.st.CreatePatientFile(in)
}

// BeginPatientFileUpload creates the hidden document header for a large file.
// The bridge then appends chunks and calls FinishPatientFileUpload.
func (a *App) BeginPatientFileUpload(in store.PatientFileInput) (map[string]any, error) {
	return a.st.BeginPatientFileUpload(in)
}

func (a *App) AppendPatientFileChunk(id string, index int, dataBase64 string) error {
	return a.st.AppendPatientFileChunk(id, index, dataBase64)
}

func (a *App) FinishPatientFileUpload(id string) (map[string]any, error) {
	return a.st.FinishPatientFileUpload(id)
}

func (a *App) AbortPatientFileUpload(id string) error { return a.st.AbortPatientFileUpload(id) }

func (a *App) UpdatePatientFile(id string, fields map[string]any) (map[string]any, error) {
	return a.st.UpdatePatientFile(id, fields)
}

func (a *App) ArchivePatientFile(id string) error { return a.st.ArchivePatientFile(id) }

// PatientFileContent returns the base64 payload for an in-app preview.
func (a *App) PatientFileContent(id string) (map[string]any, error) {
	return a.st.PatientFileContent(id)
}

// OpenPatientFile writes the document to a temporary folder and hands it to
// the operating system, which opens it in the user's preferred application.
// The content is streamed so a large document never sits in memory at once.
func (a *App) OpenPatientFile(id string) error {
	if a.ctx == nil {
		return fmt.Errorf("documents can only be opened in the desktop app")
	}
	name, _, _, err := a.st.PatientFileExportInfo(id)
	if err != nil {
		return err
	}
	dir := filepath.Join(os.TempDir(), "aster-open")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	path := filepath.Join(dir, id+"-"+filepath.Base(name))
	if err := a.writePatientFile(id, path); err != nil {
		return err
	}
	return openLocalPath(path)
}

// SavePatientFileAs writes a copy wherever the user chooses and returns
// saved=false when the save dialog is dismissed.
func (a *App) SavePatientFileAs(id string) (map[string]any, error) {
	_, name, _, err := a.st.PatientFileExportInfo(id)
	if err != nil {
		return nil, err
	}
	name = filepath.Base(strings.TrimSpace(name))
	if name == "" || name == "." {
		name = "document"
	}
	path := ""
	if a.ctx != nil {
		chosen, err := wruntime.SaveFileDialog(a.ctx, wruntime.SaveDialogOptions{
			DefaultFilename: name,
			Title:           "Save patient document",
		})
		if err != nil || chosen == "" {
			return map[string]any{"saved": false}, nil
		}
		path = chosen
	} else {
		dir := filepath.Join(a.dataDir, "exports")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return nil, err
		}
		ext := filepath.Ext(name)
		base := strings.TrimSuffix(name, ext)
		path = filepath.Join(dir, base+"-"+config.Timestamp()+ext)
	}
	if err := a.writePatientFile(id, path); err != nil {
		return nil, err
	}
	a.st.LogActivity("document.export", "ok", "Saved document "+name, "")
	return map[string]any{"saved": true, "path": path, "name": filepath.Base(path)}, nil
}

func (a *App) writePatientFile(id, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if err := a.st.WritePatientFileTo(id, f); err != nil {
		f.Close()
		_ = os.Remove(path)
		return err
	}
	return f.Close()
}

func openLocalPath(path string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", path).Start()
	case "darwin":
		return exec.Command("open", path).Start()
	default:
		return exec.Command("xdg-open", path).Start()
	}
}

// ---- Appointments --------------------------------------------------------

func (a *App) Appointments(start, end, providerID string) ([]map[string]any, error) {
	return a.st.AppointmentsBetween(start, end, providerID)
}

func (a *App) CreateAppointment(in store.AppointmentInput) (map[string]any, error) {
	return a.st.CreateAppointment(in)
}

func (a *App) UpdateAppointment(id string, patch map[string]any) (map[string]any, error) {
	return a.st.UpdateAppointment(id, patch)
}

func (a *App) SetAppointmentStatus(id, status string) (map[string]any, error) {
	return a.st.UpdateAppointment(id, map[string]any{"status": status})
}

// ---- Encounters ----------------------------------------------------------

func (a *App) Encounters(patientID, providerID string, limit int) ([]map[string]any, error) {
	return a.st.ListEncounters(patientID, providerID, limit)
}

func (a *App) Encounter(id string) (store.EncounterDetail, error) { return a.st.EncounterDetail(id) }

func (a *App) SaveEncounter(in store.EncounterInput) (map[string]any, error) {
	return a.st.SaveEncounter(in)
}

func (a *App) SignEncounter(id string) (map[string]any, error) {
	return a.st.SignEncounter(id, a.cfg.StaffID, a.cfg.StaffName)
}

func (a *App) AddAddendum(id, body string) (map[string]any, error) {
	return a.st.AddAddendum(id, a.cfg.StaffID, body)
}

func (a *App) SaveVitals(encounterID string, fields map[string]any) (map[string]any, error) {
	return a.st.SaveVitals(encounterID, fields)
}

func (a *App) SaveDiagnosis(encounterID string, fields map[string]any) (map[string]any, error) {
	return a.st.SaveDiagnosis(encounterID, fields)
}

// ---- Prescriptions -------------------------------------------------------

func (a *App) Prescriptions(patientID string) ([]map[string]any, error) {
	return a.st.ListPrescriptions(patientID, 100)
}

func (a *App) Prescription(id string) (map[string]any, error) {
	return a.st.PrescriptionDetail(id)
}

func (a *App) CreatePrescription(in store.PrescriptionInput) (map[string]any, error) {
	if in.ProviderID == "" {
		in.ProviderID = a.cfg.StaffID
	}
	return a.st.CreatePrescription(in)
}

func (a *App) UpdatePrescriptionStatus(id, status string) (map[string]any, error) {
	return a.st.UpdatePrescriptionStatus(id, status)
}

// ---- Billing -------------------------------------------------------------

func (a *App) Services() ([]map[string]any, error) { return a.st.ListServices() }

func (a *App) SaveService(fields map[string]any) (map[string]any, error) {
	return a.st.SaveService(fields)
}

func (a *App) Invoices(filter string) ([]map[string]any, error) { return a.st.ListInvoices(filter) }

func (a *App) Invoice(id string) (map[string]any, error) { return a.st.InvoiceDetail(id) }

func (a *App) CreateInvoice(in store.InvoiceInput) (map[string]any, error) {
	return a.st.CreateInvoice(in)
}

func (a *App) AddPayment(in store.PaymentInput) (map[string]any, error) {
	return a.st.AddPayment(in)
}

func (a *App) VoidInvoice(id string) (map[string]any, error) { return a.st.VoidInvoice(id) }

// ---- Staff ---------------------------------------------------------------

func (a *App) Staff() ([]map[string]any, error) { return a.st.ListStaff() }

func (a *App) SaveStaff(fields map[string]any) (map[string]any, error) {
	if _, ok := fields["username"]; ok {
		if err := a.requireManager(); err != nil {
			return nil, err
		}
	}
	if _, ok := fields["password"]; ok {
		if err := a.requireManager(); err != nil {
			return nil, err
		}
	}
	return a.st.SaveStaff(fields)
}

// ---- Connectivity --------------------------------------------------------

func (a *App) HostStatus() HostStatus {
	a.mu.Lock()
	srv := a.srv
	hostErr := a.hostErr
	a.mu.Unlock()
	h := HostStatus{Port: a.cfg.LanPort, Error: hostErr}
	if srv != nil {
		h.Running = true
		h.URLs = srv.URLs()
		h.Fingerprint = srv.Fingerprint()
		code, role, exp := a.st.PairingCodeInfo(a.st.ClinicID())
		h.PairingCode = code
		h.PairingRole = role
		h.ExpiresAt = exp.Format(time.RFC3339)
	}
	return h
}

// StartHosting turns this computer into the clinic workspace server.
func (a *App) StartHosting(port int) (HostStatus, error) {
	if port == 0 {
		port = a.cfg.LanPort
	}
	if err := a.startHosting(port); err != nil {
		return a.HostStatus(), err
	}
	return a.HostStatus(), nil
}

func (a *App) startHosting(port int) error {
	if a.st.ClinicID() == "" {
		return fmt.Errorf("set up your clinic before hosting")
	}
	a.mu.Lock()
	if a.srv != nil {
		a.mu.Unlock()
		return nil
	}
	a.mu.Unlock()

	// Stop cloud/LAN client sync before becoming authoritative.
	a.engine.Stop()
	a.engine.Clear()

	srv, err := api.New(api.Options{
		Store: a.st, Port: port, ClinicID: a.st.ClinicID(), DataDir: a.dataDir,
		Version: version.Version, TLS: true,
	})
	if err != nil {
		return err
	}
	if err := srv.Start(); err != nil {
		return err
	}
	code, _, err := a.st.EnsureInvite(a.st.ClinicID(), "receptionist", 24*time.Hour, false)
	if err != nil {
		_ = srv.Stop(context.Background())
		return err
	}
	_ = code
	a.st.SetSyncMode(store.ModeHost)
	if err := a.st.ReindexForHost(); err != nil {
		_ = srv.Stop(context.Background())
		return err
	}
	a.mu.Lock()
	a.srv = srv
	a.hostErr = ""
	stop := make(chan struct{})
	a.beaconStop = stop
	a.mu.Unlock()

	clinic, _ := a.st.GetClinic()
	api.StartBeacon(stop, a.st.ClinicID(), fmt.Sprint(clinic["name"]), port, true, version.Version)

	a.cfg.Mode = "lan_host"
	a.cfg.LanPort = port
	_ = a.cfg.Save()
	a.st.LogActivity("host", "ok", "Workspace hosting started on port "+fmt.Sprint(port), "")
	return nil
}

func (a *App) StopHosting() (BootstrapData, error) {
	a.mu.Lock()
	srv := a.srv
	stop := a.beaconStop
	a.srv = nil
	a.beaconStop = nil
	a.mu.Unlock()
	if stop != nil {
		close(stop)
	}
	if srv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		_ = srv.Stop(ctx)
		cancel()
	}
	a.st.SetSyncMode(store.ModeLocal)
	a.cfg.Mode = "local"
	_ = a.cfg.Save()
	a.st.LogActivity("host", "ok", "Workspace hosting stopped", "")
	return a.Bootstrap(), nil
}

func (a *App) CreatePairingCode(role string) (HostStatus, error) {
	if role == "" {
		role = "receptionist"
	}
	a.mu.Lock()
	running := a.srv != nil
	a.mu.Unlock()
	if !running {
		return a.HostStatus(), fmt.Errorf("start hosting before creating a pairing code")
	}
	if _, _, err := a.st.EnsureInvite(a.st.ClinicID(), role, 24*time.Hour, true); err != nil {
		return a.HostStatus(), err
	}
	return a.HostStatus(), nil
}

func (a *App) DiscoverHosts() []map[string]any {
	found := api.Discover(2500 * time.Millisecond)
	out := []map[string]any{}
	for _, h := range found {
		out = append(out, map[string]any{
			"name": h.Name, "clinicId": h.ClinicID, "address": h.Address,
			"port": h.Port, "secure": h.Secure, "version": h.Version,
		})
	}
	return out
}

func (a *App) TestServer(baseURL string) (map[string]any, error) {
	info, fingerprint, err := a.engine.Probe(context.Background(), baseURL)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"name": info.Name, "clinicId": info.ClinicID, "clinicName": info.ClinicName,
		"version": info.Version, "protocol": info.Protocol, "fingerprint": fingerprint,
		"multiTenant": info.MultiTenant,
	}, nil
}

type JoinInput struct {
	URL        string `json:"url"`
	Code       string `json:"code"`
	StaffName  string `json:"staffName"`
	DeviceName string `json:"deviceName"`
	Role       string `json:"role"`
	KeepLocal  bool   `json:"keepLocal"`
	Mode       string `json:"mode"`
}

func (a *App) JoinWorkspace(in JoinInput) (BootstrapData, error) {
	pr, err := a.engine.Pair(context.Background(), in.URL, in.Code, in.StaffName, in.DeviceName, in.Role)
	if err != nil {
		return a.Bootstrap(), err
	}
	if err := a.adoptWorkspace(pr, in.KeepLocal, in.StaffName, in.DeviceName, in.Mode); err != nil {
		return a.Bootstrap(), err
	}
	return a.Bootstrap(), nil
}

type CloudCreateInput struct {
	URL        string `json:"url"`
	ClinicName string `json:"clinicName"`
	OwnerName  string `json:"ownerName"`
	DeviceName string `json:"deviceName"`
}

func (a *App) CreateCloudWorkspace(in CloudCreateInput) (BootstrapData, error) {
	profile := map[string]any{}
	if clinic, err := a.st.GetClinic(); err == nil {
		for k, v := range clinic {
			switch k {
			case "id", "clinic_id", "created_at", "updated_at", "rev", "field_revs", "deleted_at", "origin_node":
				continue
			}
			profile[k] = v
		}
	}
	pr, err := a.engine.CreateWorkspace(context.Background(), in.URL, in.ClinicName, in.OwnerName, in.DeviceName, profile)
	if err != nil {
		return a.Bootstrap(), err
	}
	if err := a.adoptWorkspace(pr, true, in.OwnerName, in.DeviceName, "cloud"); err != nil {
		return a.Bootstrap(), err
	}
	return a.Bootstrap(), nil
}

func (a *App) adoptWorkspace(pr syncengine.PairResponse, keepLocal bool, staffName, deviceName, mode string) error {
	a.mu.Lock()
	srv := a.srv
	stop := a.beaconStop
	a.srv = nil
	a.beaconStop = nil
	a.mu.Unlock()
	if stop != nil {
		close(stop)
	}
	if srv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		_ = srv.Stop(ctx)
		cancel()
	}
	a.engine.Stop()

	if staffName == "" {
		staffName = pr.DeviceName
	}
	if deviceName == "" {
		deviceName = a.cfg.DeviceName
	}
	if !keepLocal {
		if err := a.st.WipeForWorkspace(pr.ClinicID); err != nil {
			return err
		}
	} else {
		if _, err := a.st.EnqueueAllForJoin(pr.ClinicID); err != nil {
			return err
		}
	}
	if pr.Clinic != nil {
		if _, err := a.st.ApplyRemoteRow("clinics", pr.Clinic); err != nil {
			return err
		}
	}
	a.st.SetClinicID(pr.ClinicID)
	a.st.SetActor(store.Actor{ID: pr.StaffID, Name: staffName})

	if mode == "" {
		mode = "cloud"
	}
	if mode != "lan_client" {
		mode = "cloud"
	}
	a.cfg.Mode = mode
	a.cfg.ServerURL = pr.ServerURL
	a.cfg.Token = pr.Token
	a.cfg.Fingerprint = pr.Fingerprint
	a.cfg.Workspace = pr.ClinicName
	a.cfg.StaffID = pr.StaffID
	a.cfg.StaffName = staffName
	a.cfg.StaffRole = pr.Role
	a.cfg.DeviceName = deviceName
	a.cfg.Onboarded = true
	if err := a.cfg.Save(); err != nil {
		return err
	}
	if err := a.engine.Configure(a.cfg.ServerURL, a.cfg.Token, a.cfg.Fingerprint, deviceName, pr.ClinicName); err != nil {
		return err
	}
	a.engine.Start(25 * time.Second)
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	_, _ = a.engine.SyncNow(ctx)
	// A freshly created workspace arrives without a clinic location; make the
	// primary one now that the clinic row exists locally.
	if loc, err := a.st.EnsureDefaultLocation(); err == nil && loc != nil {
		a.cfg.LocationID = fmt.Sprint(loc["id"])
		a.st.SetLocationID(a.cfg.LocationID)
		_ = a.cfg.Save()
	}
	a.signedIn.Store(true)
	return nil
}

func (a *App) DisconnectSync() (BootstrapData, error) {
	a.engine.Stop()
	a.engine.Clear()
	a.mu.Lock()
	if a.beaconStop != nil {
		close(a.beaconStop)
		a.beaconStop = nil
	}
	a.mu.Unlock()
	a.st.SetSyncMode(store.ModeLocal)
	a.cfg.Mode = "local"
	a.cfg.ServerURL = ""
	a.cfg.Token = ""
	a.cfg.Fingerprint = ""
	a.cfg.Workspace = ""
	_ = a.cfg.Save()
	_ = a.st.ResetOutbox()
	a.st.LogActivity("sync", "ok", "Disconnected. Records remain on this computer.", "")
	return a.Bootstrap(), nil
}

func (a *App) SyncStatus() syncengine.Status { return a.engine.Status() }

func (a *App) SyncNow() (syncengine.Stats, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	return a.engine.SyncNow(ctx)
}

func (a *App) SyncActivity(limit int) ([]map[string]any, error) { return a.st.Activity(limit) }

func (a *App) ClearSyncActivity() error { return a.st.ClearActivity() }

func (a *App) Conflicts() ([]map[string]any, error) { return a.st.OpenConflicts() }

func (a *App) ResolveConflict(id, action string) (BootstrapData, error) {
	if action == "keep_local" {
		var entity, entityID, field, localValue string
		err := a.st.DB().QueryRow(`SELECT entity, entity_id, field, local_value FROM sync_conflicts
			WHERE id=? AND resolved_at IS NULL`, id).Scan(&entity, &entityID, &field, &localValue)
		if err != nil {
			return a.Bootstrap(), fmt.Errorf("conflict not found")
		}
		if _, err := a.st.UpdateRecord(entity, entityID, map[string]any{field: localValue}, &store.Audit{
			Action: "conflict.kept_local", Summary: "Kept this device's value for " + field,
		}); err != nil {
			return a.Bootstrap(), err
		}
		_ = a.st.ResolveConflict(id, "keep_local")
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			_, _ = a.engine.SyncNow(ctx)
		}()
	} else {
		_ = a.st.ResolveConflict(id, "keep_remote")
	}
	return a.Bootstrap(), nil
}

func (a *App) Devices() ([]store.Device, error) {
	return a.st.ListDevices(a.st.ClinicID())
}

func (a *App) RevokeDevice(id string) error {
	return a.st.RevokeDevice(a.st.ClinicID(), id)
}

// ---- Data management -----------------------------------------------------

type DataInfo struct {
	DBPath     string `json:"dbPath"`
	DBSize     int64  `json:"dbSize"`
	BackupDir  string `json:"backupDir"`
	LastBackup string `json:"lastBackup"`
	DataDir    string `json:"dataDir"`
}

func (a *App) DataInformation() DataInfo {
	info := DataInfo{
		DBPath: a.st.Path(), BackupDir: config.BackupDir(a.dataDir), DataDir: a.dataDir,
		LastBackup: a.st.GetState("last_backup"),
	}
	if st, err := os.Stat(a.st.Path()); err == nil {
		info.DBSize = st.Size()
	}
	return info
}

func (a *App) BackupNow() (DataInfo, error) {
	if err := a.backup(); err != nil {
		return a.DataInformation(), err
	}
	return a.DataInformation(), nil
}

func (a *App) backup() error {
	dir := config.BackupDir(a.dataDir)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	name := "aster-backup-" + config.Timestamp() + ".db"
	if err := a.st.BackupTo(filepath.Join(dir, name)); err != nil {
		return err
	}
	a.st.SetState("last_backup", time.Now().UTC().Format(time.RFC3339))
	a.st.LogActivity("backup", "ok", "Backup created: "+name, "")
	return nil
}

func (a *App) dailyBackup() {
	time.Sleep(20 * time.Second)
	a.mu.Lock()
	hosting := a.srv != nil
	a.mu.Unlock()
	if hosting {
		return
	}
	last := a.st.GetState("last_backup")
	if last != "" {
		if t, err := time.Parse(time.RFC3339, last); err == nil && time.Since(t) < 24*time.Hour {
			return
		}
	}
	if err := a.backup(); err != nil {
		a.st.LogActivity("backup", "error", "Automatic backup failed: "+err.Error(), "")
	}
}

func (a *App) ExportJSON() (map[string]any, error) {
	dir := config.BackupDir(a.dataDir)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	path := filepath.Join(dir, "aster-export-"+config.Timestamp()+".json")
	if err := a.st.ExportJSON(path); err != nil {
		return nil, err
	}
	return map[string]any{"path": path}, nil
}
