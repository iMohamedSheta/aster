package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// PairingCodeInfo returns the currently displayed code, its intended role and
// expiry. It deliberately checks the hash so a rotated code is never shown.
func (s *Store) PairingCodeInfo(clinicID string) (string, string, time.Time) {
	raw := s.serverMeta("invite_plain:" + clinicID)
	expiry := s.serverMeta("invite_exp:" + clinicID)
	exp, _ := time.Parse(time.RFC3339, expiry)
	if raw == "" || exp.IsZero() || time.Now().After(exp) {
		return "", "", exp
	}
	var role string
	err := s.db.Get(&role, `SELECT role FROM _server_invites
		WHERE clinic_id=? AND code_hash=? AND expires_at>? ORDER BY created_at DESC LIMIT 1`,
		clinicID, HashToken(raw), now())
	if err != nil {
		return "", "", exp
	}
	return FormatCode(raw), role, exp
}

// BackupTo writes a consistent copy of the live database using SQLite's
// VACUUM INTO, which is safe while the app is running.
func (s *Store) BackupTo(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("backup file already exists")
	}
	escaped := strings.ReplaceAll(path, "'", "''")
	if _, err := s.db.Exec("VACUUM INTO '" + escaped + "'"); err != nil {
		return fmt.Errorf("create backup: %w", err)
	}
	return nil
}

// ExportJSON writes every business table to a readable JSON document. It is a
// data-portability escape hatch, not a backup replacement.
func (s *Store) ExportJSON(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	out := map[string]any{
		"exported_at": time.Now().UTC().Format(time.RFC3339),
		"application": "Aster Clinic",
		"schema":      1,
	}
	for entity, table := range Entities {
		rows, err := s.db.Query(fmt.Sprintf("SELECT * FROM %q", table))
		if err != nil {
			return err
		}
		items, err := scanMapRows(rows)
		rows.Close()
		if err != nil {
			return err
		}
		out[entity] = items
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}
