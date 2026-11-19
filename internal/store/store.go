package store

import (
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"

	syncerr "aster/internal/sync"
)

//go:embed schema.sql
var schemaSQL string

var ErrNotFound = errors.New("record not found")

// SyncMode controls how local mutations are recorded for replication.
type SyncMode string

const (
	ModeLocal  SyncMode = "local"  // standalone database
	ModeHost   SyncMode = "host"   // this device serves the workspace
	ModeClient SyncMode = "client" // replica of a LAN host or cloud workspace
)

// Syncable entity names. The server only accepts changes for these names.
var Entities = map[string]string{
	"clinics":              "clinics",
	"locations":            "locations",
	"tasks":                "tasks",
	"staff":                "staff",
	"patients":             "patients",
	"patient_files":        "patient_files",
	"patient_file_chunks":  "patient_file_chunks",
	"allergies":            "allergies",
	"conditions":           "conditions",
	"appointments":         "appointments",
	"encounters":           "encounters",
	"encounter_addenda":    "encounter_addenda",
	"vitals":               "vitals",
	"diagnoses":            "diagnoses",
	"prescriptions":        "prescriptions",
	"prescription_items":   "prescription_items",
	"services":             "services",
	"invoices":             "invoices",
	"invoice_items":        "invoice_items",
	"payments":             "payments",
	"treatment_plans":      "treatment_plans",
	"treatment_plan_items": "treatment_plan_items",
	"inventory_items":      "inventory_items",
	"expenses":             "expenses",
	"audit_logs":           "audit_logs",
}

// Clinical entities require a clinician role to write when connected.
var ClinicalEntities = map[string]bool{
	"encounters": true, "encounter_addenda": true, "vitals": true,
	"diagnoses": true, "prescriptions": true, "prescription_items": true,
	"treatment_plans": true, "treatment_plan_items": true,
}

var BillingEntities = map[string]bool{
	"invoices": true, "invoice_items": true, "payments": true, "services": true,
	"expenses": true,
}

var AdminEntities = map[string]bool{
	"staff": true, "clinics": true, "inventory_items": true,
}

// Metadata columns are managed by the store, never accepted from clients.
var metaColumns = map[string]bool{
	"id": true, "clinic_id": true, "created_at": true, "updated_at": true,
	"rev": true, "field_revs": true, "deleted_at": true, "origin_node": true,
}

type tableInfo struct {
	Columns []string
	Types   map[string]string
	Set     map[string]bool
}

type Actor struct {
	ID   string
	Name string
}

type Audit struct {
	Action  string
	Summary string
	Detail  any
}

type Store struct {
	db   *sqlx.DB
	path string

	clock *syncerr.Clock
	node  string

	mu       sync.RWMutex
	mode     SyncMode
	clinic   string
	location string
	tables   map[string]tableInfo
	actor    Actor
	onEvent  func(entity, id string)
}

// Open opens (and creates if needed) the SQLite database and applies the schema.
func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	dsn := path
	db, err := sqlx.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(0)
	for _, pragma := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=FULL",
		"PRAGMA busy_timeout=8000",
		"PRAGMA foreign_keys=ON",
		"PRAGMA wal_autocheckpoint=1000",
	} {
		if _, err := db.Exec(pragma); err != nil {
			db.Close()
			return nil, fmt.Errorf("%s: %w", pragma, err)
		}
	}
	if _, err := db.Exec(schemaSQL); err != nil {
		db.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	if err := migrateAccess(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate access fields: %w", err)
	}
	if err := migrateNetwork(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate clinic network fields: %w", err)
	}
	if _, err := db.Exec("PRAGMA user_version=1"); err != nil {
		db.Close()
		return nil, err
	}

	s := &Store{db: db, path: path, mode: ModeLocal, tables: map[string]tableInfo{}}
	s.loadTables()
	s.node = s.metaGet("node_id")
	if s.node == "" {
		s.node = syncerr.RandomNodeID()
		s.metaSet("node_id", s.node)
	}
	s.clock = syncerr.NewClock(s.node)
	if last := s.metaGet("last_hlc"); last != "" {
		s.clock.Observe(last)
	}
	s.clinic = s.metaGet("clinic_id")
	if s.clinic == "" {
		var id string
		_ = db.Get(&id, "SELECT id FROM clinics WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1")
		if id != "" {
			s.clinic = id
			s.metaSet("clinic_id", id)
		}
	}
	s.location = s.metaGet("location_id")
	return s, nil
}

// migrateAccess adds the access-control fields to databases created before
// password sign-in existed. New databases get them from schema.sql.
func migrateAccess(db *sqlx.DB) error {
	columns := []struct {
		table, name, decl string
	}{
		{"clinics", "signin_mode", "TEXT NOT NULL DEFAULT 'picker'"},
		{"staff", "username", "TEXT NOT NULL DEFAULT ''"},
		{"staff", "password_hash", "TEXT NOT NULL DEFAULT ''"},
		{"staff", "password_updated_at", "TEXT NOT NULL DEFAULT ''"},
	}
	for _, c := range columns {
		var n int
		if err := db.Get(&n, fmt.Sprintf("SELECT COUNT(1) FROM pragma_table_info('%s') WHERE name=?", c.table), c.name); err != nil {
			return err
		}
		if n == 0 {
			if _, err := db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", c.table, c.name, c.decl)); err != nil {
				return err
			}
		}
	}
	_, err := db.Exec("CREATE INDEX IF NOT EXISTS idx_staff_username ON staff(clinic_id, username)")
	return err
}

// migrateNetwork adds per-clinic location scoping and specialty fields to
// databases created before Aster supported clinic networks. It also makes sure
// every existing workspace has a primary clinic location so old records can be
// attributed without a manual migration step.
func migrateNetwork(db *sqlx.DB) error {
	var clinicType int
	if err := db.Get(&clinicType, "SELECT COUNT(1) FROM pragma_table_info('clinics') WHERE name='clinic_type'"); err != nil {
		return err
	}
	if clinicType == 0 {
		if _, err := db.Exec("ALTER TABLE clinics ADD COLUMN clinic_type TEXT NOT NULL DEFAULT 'general'"); err != nil {
			return err
		}
	}

	tables := []string{
		"staff", "patients", "appointments", "encounters", "encounter_addenda",
		"vitals", "diagnoses", "prescriptions", "prescription_items", "services",
		"invoices", "invoice_items", "payments",
	}
	for _, table := range tables {
		var n int
		if err := db.Get(&n, fmt.Sprintf("SELECT COUNT(1) FROM pragma_table_info('%s') WHERE name='location_id'", table)); err != nil {
			return err
		}
		if n == 0 {
			if _, err := db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN location_id TEXT NOT NULL DEFAULT ''", table)); err != nil {
				return err
			}
		}
	}

	var specialty int
	if err := db.Get(&specialty, "SELECT COUNT(1) FROM pragma_table_info('encounters') WHERE name='specialty_data'"); err != nil {
		return err
	}
	if specialty == 0 {
		if _, err := db.Exec("ALTER TABLE encounters ADD COLUMN specialty_data TEXT NOT NULL DEFAULT '{}'"); err != nil {
			return err
		}
	}
	_, err := db.Exec("CREATE INDEX IF NOT EXISTS idx_appointments_location ON appointments(clinic_id, location_id, start_at)")
	if err == nil {
		_, err = db.Exec("CREATE INDEX IF NOT EXISTS idx_encounters_location ON encounters(clinic_id, location_id, started_at)")
	}
	if err == nil {
		_, err = db.Exec("CREATE INDEX IF NOT EXISTS idx_invoices_location ON invoices(clinic_id, location_id, issued_at)")
	}
	return err
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) Path() string { return s.path }
func (s *Store) Node() string { return s.node }
func (s *Store) DB() *sqlx.DB { return s.db }
func (s *Store) ClinicID() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.clinic
}
func (s *Store) SetClinicID(id string) {
	s.mu.Lock()
	s.clinic = id
	s.mu.Unlock()
	s.metaSet("clinic_id", id)
}
func (s *Store) LocationID() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.location
}
func (s *Store) SetLocationID(id string) {
	s.mu.Lock()
	s.location = id
	s.mu.Unlock()
	s.metaSet("location_id", id)
}
func (s *Store) SyncMode() SyncMode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mode
}
func (s *Store) SetSyncMode(m SyncMode) {
	s.mu.Lock()
	s.mode = m
	s.mu.Unlock()
}
func (s *Store) SetActor(a Actor) {
	s.mu.Lock()
	s.actor = a
	s.mu.Unlock()
}
func (s *Store) Actor() Actor {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.actor
}
func (s *Store) SetEventHook(fn func(entity, id string)) {
	s.mu.Lock()
	s.onEvent = fn
	s.mu.Unlock()
}
func (s *Store) emit(entity, id string) {
	// Chunks are implementation details of one document. Emitting them would
	// invalidate every screen once per megabyte while a large file uploads.
	if entity == "patient_file_chunks" {
		return
	}
	s.mu.RLock()
	fn := s.onEvent
	s.mu.RUnlock()
	if fn != nil {
		fn(entity, id)
	}
}

func (s *Store) loadTables() {
	rows, err := s.db.Query("SELECT name FROM sqlite_master WHERE type='table'")
	if err != nil {
		return
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var n string
		if rows.Scan(&n) == nil {
			names = append(names, n)
		}
	}
	for _, name := range names {
		info := tableInfo{Types: map[string]string{}, Set: map[string]bool{}}
		cols, err := s.db.Query(fmt.Sprintf("PRAGMA table_info(%q)", name))
		if err != nil {
			continue
		}
		for cols.Next() {
			var cid int
			var col, typ string
			var notnull, pk int
			var dflt sql.NullString
			if cols.Scan(&cid, &col, &typ, &notnull, &dflt, &pk) == nil {
				info.Columns = append(info.Columns, col)
				info.Types[col] = strings.ToUpper(typ)
				info.Set[col] = true
			}
		}
		cols.Close()
		s.tables[name] = info
	}
}

func (s *Store) metaGet(key string) string {
	var v string
	_ = s.db.Get(&v, "SELECT value FROM sync_state WHERE key=?", key)
	return v
}

func (s *Store) metaSet(key, value string) {
	_, _ = s.db.Exec("INSERT INTO sync_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value)
}

func (s *Store) GetState(key string) string { return s.metaGet(key) }
func (s *Store) SetState(key, value string) { s.metaSet(key, value) }

// now returns the wall-clock portion of the current clock as RFC3339Nano UTC.
func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func (s *Store) nextRev() string {
	rev := s.clock.Next()
	s.metaSet("last_hlc", rev)
	return rev
}

func revTime(rev string) string {
	t := syncerr.WallTime(rev)
	if t.IsZero() {
		return now()
	}
	return t.Format(time.RFC3339Nano)
}

func (s *Store) table(entity string) (tableInfo, string, error) {
	tableName, ok := Entities[entity]
	if !ok {
		return tableInfo{}, "", fmt.Errorf("unknown entity %q", entity)
	}
	info, ok := s.tables[tableName]
	if !ok {
		return tableInfo{}, "", fmt.Errorf("missing table %q", tableName)
	}
	return info, tableName, nil
}

func normalize(typ string, v any) any {
	if v == nil {
		return nil
	}
	switch typ {
	case "INTEGER", "INT", "BIGINT":
		switch x := v.(type) {
		case float64:
			return int64(x)
		case float32:
			return int64(x)
		case int:
			return int64(x)
		case int64:
			return x
		case json.Number:
			n, _ := x.Int64()
			return n
		case bool:
			if x {
				return int64(1)
			}
			return int64(0)
		case string:
			n, err := strconv.ParseInt(x, 10, 64)
			if err != nil {
				return int64(0)
			}
			return n
		}
	case "REAL", "FLOAT", "DOUBLE", "NUMERIC":
		switch x := v.(type) {
		case float64:
			return x
		case float32:
			return float64(x)
		case int:
			return float64(x)
		case int64:
			return float64(x)
		case json.Number:
			f, _ := x.Float64()
			return f
		case string:
			f, err := strconv.ParseFloat(x, 64)
			if err != nil {
				return float64(0)
			}
			return f
		}
	default:
		switch x := v.(type) {
		case string:
			return x
		case bool:
			if x {
				return "1"
			}
			return "0"
		case float64:
			if x == float64(int64(x)) {
				return strconv.FormatInt(int64(x), 10)
			}
			return strconv.FormatFloat(x, 'f', -1, 64)
		case nil:
			return ""
		default:
			b, _ := json.Marshal(x)
			return string(b)
		}
	}
	return v
}

// cleanFields filters a client payload to writable columns and normalizes types.
func cleanFields(info tableInfo, fields map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range fields {
		if metaColumns[k] || !info.Set[k] {
			continue
		}
		out[k] = normalize(info.Types[k], v)
	}
	return out
}

func (s *Store) rowMapTx(tx *sqlx.Tx, table, id string) (map[string]any, error) {
	rows, err := tx.Query(fmt.Sprintf("SELECT * FROM %q WHERE id=?", table), id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, ErrNotFound
	}
	m, err := scanRowMap(rows)
	if err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Store) RowMap(entity, id string) (map[string]any, error) {
	return s.Row(entity, id)
}

// Row returns a single record with SQL NULLs converted to empty values.
func (s *Store) Row(entity, id string) (map[string]any, error) {
	info, table, err := s.table(entity)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Query(fmt.Sprintf("SELECT * FROM %q WHERE id=?", table), id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, ErrNotFound
	}
	m, err := scanRowMap(rows)
	if err != nil {
		return nil, err
	}
	return normalizeMap(info, m), nil
}

func scanRowMap(rows *sql.Rows) (map[string]any, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil, err
	}
	m := make(map[string]any, len(cols))
	for i, c := range cols {
		switch v := vals[i].(type) {
		case []byte:
			m[c] = string(v)
		case nil:
			m[c] = ""
		default:
			m[c] = v
		}
	}
	return m, nil
}

func normalizeMap(info tableInfo, m map[string]any) map[string]any {
	for k, v := range m {
		if t, ok := info.Types[k]; ok {
			if t == "INTEGER" || t == "INT" {
				switch x := v.(type) {
				case int64:
					m[k] = int(x)
				}
			}
		}
	}
	return m
}

func fieldsJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func decodeStringMap(s string) map[string]any {
	m := map[string]any{}
	_ = json.Unmarshal([]byte(s), &m)
	return m
}

func decodeRevs(s string) map[string]string {
	m := map[string]string{}
	_ = json.Unmarshal([]byte(s), &m)
	return m
}

// CreateRecord inserts one syncable record. Fields are validated against the
// table schema. The caller may supply an ID (used for imports); otherwise a
// UUIDv7 is generated.
func (s *Store) CreateRecord(entity string, fields map[string]any, audit *Audit) (map[string]any, error) {
	tx := s.db.MustBegin()
	row, _, err := s.createInTx(tx, entity, fields, audit)
	if err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	info, _, _ := s.table(entity)
	if id, _ := row["id"].(string); id != "" {
		s.emit(entity, id)
	}
	return normalizeMap(info, row), nil
}

// createInTx is the transactional insert primitive used by compound writes
// such as prescriptions with their line items.
func (s *Store) createInTx(tx *sqlx.Tx, entity string, fields map[string]any, audit *Audit) (map[string]any, string, error) {
	info, table, err := s.table(entity)
	if err != nil {
		return nil, "", err
	}
	clean := cleanFields(info, fields)
	if info.Set["location_id"] {
		if v, ok := clean["location_id"]; !ok || strings.TrimSpace(fmt.Sprint(v)) == "" {
			if loc := s.LocationID(); loc != "" {
				clean["location_id"] = loc
			}
		}
	}
	id, _ := fields["id"].(string)
	if id == "" {
		id = NewID()
	}
	rev := s.nextRev()
	nowS := revTime(rev)
	revs := map[string]string{}
	for k := range clean {
		revs[k] = rev
	}
	revJSON, _ := json.Marshal(revs)

	cols := []string{"id", "clinic_id", "created_at", "updated_at", "rev", "field_revs", "origin_node"}
	vals := []any{id, s.ClinicID(), nowS, nowS, rev, string(revJSON), s.node}
	keys := make([]string, 0, len(clean))
	for k := range clean {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		cols = append(cols, k)
		vals = append(vals, clean[k])
	}
	ph := make([]string, len(cols))
	for i := range cols {
		ph[i] = "?"
	}
	q := fmt.Sprintf("INSERT INTO %q (%s) VALUES (%s)", table, strings.Join(cols, ","), strings.Join(ph, ","))
	if _, err := tx.Exec(q, vals...); err != nil {
		return nil, "", fmt.Errorf("create %s: %w", entity, err)
	}
	row, err := s.rowMapTx(tx, table, id)
	if err != nil {
		return nil, "", err
	}
	if err := s.recordLocalTx(tx, entity, id, clean, false, rev); err != nil {
		return nil, "", err
	}
	if audit != nil {
		if err := s.writeAuditTx(tx, audit, entity, id); err != nil {
			return nil, "", err
		}
	}
	return row, id, nil
}

// UpdateRecord applies the subset of candidate fields that actually changed.
// It returns the updated record and the list of changed column names.
func (s *Store) UpdateRecord(entity, id string, candidate map[string]any, audit *Audit) (map[string]any, error) {
	info, table, err := s.table(entity)
	if err != nil {
		return nil, err
	}
	clean := cleanFields(info, candidate)
	if len(clean) == 0 {
		return s.Row(entity, id)
	}
	rev := s.nextRev()
	nowS := revTime(rev)

	tx := s.db.MustBegin()
	old, err := s.rowMapTx(tx, table, id)
	if err != nil {
		tx.Rollback()
		return nil, err
	}
	patch := map[string]any{}
	for k, v := range clean {
		if !equalValue(old[k], v) {
			patch[k] = v
		}
	}
	if len(patch) == 0 {
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return normalizeMap(info, old), nil
	}
	revs := decodeRevs(fmt.Sprint(old["field_revs"]))
	for k := range patch {
		revs[k] = rev
	}
	revJSON, _ := json.Marshal(revs)
	cols := make([]string, 0, len(patch)+3)
	vals := make([]any, 0, len(patch)+3)
	keys := make([]string, 0, len(patch))
	for k := range patch {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		cols = append(cols, fmt.Sprintf("%q=?", k))
		vals = append(vals, patch[k])
	}
	cols = append(cols, "updated_at=?", "rev=?", "field_revs=?", "origin_node=?")
	vals = append(vals, nowS, rev, string(revJSON), s.node)
	vals = append(vals, id)
	q := fmt.Sprintf("UPDATE %q SET %s WHERE id=?", table, strings.Join(cols, ", "))
	if _, err := tx.Exec(q, vals...); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("update %s: %w", entity, err)
	}
	if err := s.recordLocalTx(tx, entity, id, patch, false, rev); err != nil {
		tx.Rollback()
		return nil, err
	}
	if audit != nil {
		if err := s.writeAuditTx(tx, audit, entity, id); err != nil {
			tx.Rollback()
			return nil, err
		}
	}
	row, err := s.rowMapTx(tx, table, id)
	if err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	s.emit(entity, id)
	return normalizeMap(info, row), nil
}

func equalValue(a, b any) bool {
	if a == nil && b == nil {
		return true
	}
	return fmt.Sprint(a) == fmt.Sprint(b)
}

// Archive soft-deletes a record. Clinical records cannot be archived.
func (s *Store) Archive(entity, id string, audit *Audit) error {
	info, table, err := s.table(entity)
	if err != nil {
		return err
	}
	_ = info
	rev := s.nextRev()
	nowS := revTime(rev)

	tx := s.db.MustBegin()
	old, err := s.rowMapTx(tx, table, id)
	if err != nil {
		tx.Rollback()
		return err
	}
	revs := decodeRevs(fmt.Sprint(old["field_revs"]))
	revs["__deleted__"] = rev
	revJSON, _ := json.Marshal(revs)
	if _, err := tx.Exec(fmt.Sprintf("UPDATE %q SET deleted_at=?, updated_at=?, rev=?, field_revs=?, origin_node=? WHERE id=?", table),
		nowS, nowS, rev, string(revJSON), s.node, id); err != nil {
		tx.Rollback()
		return err
	}
	if err := s.recordLocalTx(tx, entity, id, map[string]any{}, true, rev); err != nil {
		tx.Rollback()
		return err
	}
	if audit != nil {
		if err := s.writeAuditTx(tx, audit, entity, id); err != nil {
			tx.Rollback()
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.emit(entity, id)
	return nil
}

// recordLocalTx records a local change for replication, depending on mode.
func (s *Store) recordLocalTx(tx *sqlx.Tx, entity, id string, fields map[string]any, deleted bool, rev string) error {
	mode := s.SyncMode()
	switch mode {
	case ModeClient:
		_, err := tx.Exec(`INSERT INTO sync_outbox(change_id,entity,entity_id,fields,deleted,hlc,created_at)
			VALUES(?,?,?,?,?,?,?)`, NewID(), entity, id, fieldsJSON(fields), boolInt(deleted), rev, now())
		return err
	case ModeHost:
		_, err := tx.Exec(`INSERT INTO _server_changes(clinic_id,entity,entity_id,rev,at) VALUES(?,?,?,?,?)`,
			s.ClinicID(), entity, id, rev, now())
		return err
	default:
		return nil
	}
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// fieldID reads the record id from a form payload. A missing or non-string id
// means "create", so callers must not use fmt.Sprint here: it turns a missing
// key into the literal string "<nil>" and would route inserts into updates.
func fieldID(fields map[string]any) string {
	id, _ := fields["id"].(string)
	return strings.TrimSpace(id)
}

func (s *Store) writeAuditTx(tx *sqlx.Tx, audit *Audit, entity, id string) error {
	if audit == nil {
		return nil
	}
	actor := s.Actor()
	rev := s.nextRev()
	nowS := revTime(rev)
	revs := map[string]string{"action": rev, "summary": rev, "entity": rev, "entity_id": rev}
	revJSON, _ := json.Marshal(revs)
	detail := ""
	if audit.Detail != nil {
		b, _ := json.Marshal(audit.Detail)
		detail = string(b)
	}
	auditID := NewID()
	_, err := tx.Exec(`INSERT INTO audit_logs(id,clinic_id,at,actor_id,actor_name,action,entity,entity_id,summary,detail,
		created_at,updated_at,rev,field_revs,origin_node)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		auditID, s.ClinicID(), nowS, actor.ID, actor.Name, audit.Action, entity, id, audit.Summary, detail,
		nowS, nowS, rev, string(revJSON), s.node)
	if err != nil {
		return err
	}
	return s.recordLocalTx(tx, "audit_logs", auditID, map[string]any{
		"at": nowS, "actor_id": actor.ID, "actor_name": actor.Name, "action": audit.Action,
		"entity": entity, "entity_id": id, "summary": audit.Summary, "detail": detail,
	}, false, rev)
}

// Audit writes a standalone audit entry (used by settings and sync events).
func (s *Store) Audit(action, summary string, detail any) error {
	tx := s.db.MustBegin()
	if err := s.writeAuditTx(tx, &Audit{Action: action, Summary: summary, Detail: detail}, "", ""); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// EnqueueAllForJoin re-stamps all local rows to a workspace and queues them for
// upload. Used when an existing standalone database joins a workspace without
// losing its data.
func (s *Store) EnqueueAllForJoin(workspaceID string) (int, error) {
	tx := s.db.MustBegin()
	defer tx.Rollback()
	count := 0
	for entity, table := range Entities {
		if entity == "clinics" || entity == "audit_logs" {
			continue
		}
		info := s.tables[table]
		rows, err := tx.Query(fmt.Sprintf("SELECT * FROM %q WHERE clinic_id<>? AND deleted_at IS NULL", table), workspaceID)
		if err != nil {
			return 0, err
		}
		type rec struct {
			id   string
			rev  string
			data map[string]any
		}
		var recs []rec
		for rows.Next() {
			m, err := scanRowMap(rows)
			if err != nil {
				rows.Close()
				return 0, err
			}
			id := fmt.Sprint(m["id"])
			rev := fmt.Sprint(m["rev"])
			if rev == "" {
				rev = s.nextRev()
			}
			fields := map[string]any{}
			for k, v := range m {
				if metaColumns[k] || k == "clinic_id" {
					continue
				}
				_ = info
				fields[k] = v
			}
			recs = append(recs, rec{id: id, rev: rev, data: fields})
		}
		rows.Close()
		for _, r := range recs {
			if _, err := tx.Exec(fmt.Sprintf("UPDATE %q SET clinic_id=? WHERE id=?", table), workspaceID, r.id); err != nil {
				return 0, err
			}
			if _, err := tx.Exec(`INSERT INTO sync_outbox(change_id,entity,entity_id,fields,deleted,hlc,created_at)
				VALUES(?,?,?,?,0,?,?)`, NewID(), entity, r.id, fieldsJSON(r.data), r.rev, now()); err != nil {
				return 0, err
			}
			count++
		}
	}
	// Stamp the clinic row itself to the workspace, but do not upload it; the
	// workspace profile is authoritative.
	if _, err := tx.Exec("UPDATE clinics SET clinic_id=? WHERE clinic_id<>?", workspaceID, workspaceID); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	s.SetClinicID(workspaceID)
	return count, nil
}

// ResetOutbox drops pending changes (used when switching workspace and
// discarding local data).
func (s *Store) ResetOutbox() error {
	_, err := s.db.Exec("DELETE FROM sync_outbox")
	return err
}

// ReindexForHost seeds the server change stream with all current rows. Safe to
// run repeatedly; clients merge idempotently.
func (s *Store) ReindexForHost() error {
	tx := s.db.MustBegin()
	defer tx.Rollback()
	for entity, table := range Entities {
		rows, err := tx.Query(fmt.Sprintf("SELECT id, rev FROM %q", table))
		if err != nil {
			return err
		}
		type pair struct{ id, rev string }
		var pairs []pair
		for rows.Next() {
			var p pair
			if err := rows.Scan(&p.id, &p.rev); err == nil {
				pairs = append(pairs, p)
			}
		}
		rows.Close()
		for _, p := range pairs {
			if _, err := tx.Exec(`INSERT INTO _server_changes(clinic_id,entity,entity_id,rev,at) VALUES(?,?,?,?,?)`,
				s.ClinicID(), entity, p.id, p.rev, now()); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

// EnqueueBackup copies every local row into the outbox with a fresh clock so a
// new cloud workspace receives the dataset.
func (s *Store) EnqueueBackup() (int, error) {
	tx := s.db.MustBegin()
	defer tx.Rollback()
	count := 0
	for entity, table := range Entities {
		if entity == "audit_logs" {
			continue
		}
		rows, err := tx.Query(fmt.Sprintf("SELECT * FROM %q", table))
		if err != nil {
			return 0, err
		}
		var recs []map[string]any
		for rows.Next() {
			m, err := scanRowMap(rows)
			if err != nil {
				rows.Close()
				return 0, err
			}
			recs = append(recs, m)
		}
		rows.Close()
		for _, m := range recs {
			id := fmt.Sprint(m["id"])
			rev := s.nextRev()
			revs := map[string]string{}
			for k := range m {
				if metaColumns[k] || k == "clinic_id" {
					continue
				}
				revs[k] = rev
			}
			revJSON, _ := json.Marshal(revs)
			if _, err := tx.Exec(fmt.Sprintf("UPDATE %q SET clinic_id=?, rev=?, field_revs=?, updated_at=? WHERE id=?", table),
				s.ClinicID(), rev, string(revJSON), revTime(rev), id); err != nil {
				return 0, err
			}
			fields := map[string]any{}
			for k, v := range m {
				if metaColumns[k] || k == "clinic_id" {
					continue
				}
				fields[k] = v
			}
			deleted := m["deleted_at"] != nil && fmt.Sprint(m["deleted_at"]) != ""
			if _, err := tx.Exec(`INSERT INTO sync_outbox(change_id,entity,entity_id,fields,deleted,hlc,created_at)
				VALUES(?,?,?,?,?,?,?)`, NewID(), entity, id, fieldsJSON(fields), boolInt(deleted), rev, now()); err != nil {
				return 0, err
			}
			count++
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return count, nil
}
