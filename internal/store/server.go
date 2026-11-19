package store

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

// HashToken returns the hex SHA-256 digest used to store bearer tokens and
// pairing codes. Plaintext secrets never touch the database.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// NormalizeCode makes human-entered pairing codes tolerant of case and dashes.
func NormalizeCode(code string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(code) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// FormatCode renders a 12 character code in readable groups.
func FormatCode(raw string) string {
	raw = NormalizeCode(raw)
	if len(raw) != 12 {
		return raw
	}
	return raw[0:4] + "-" + raw[4:8] + "-" + raw[8:12]
}

// NewPairingCode returns a 12 character code with no ambiguous glyphs.
func NewPairingCode() string {
	const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	out := make([]byte, 12)
	seed := HashToken(NewID() + NewID())
	for i := 0; i < 12; i++ {
		var v int
		fmt.Sscanf(seed[i*2:i*2+2], "%x", &v)
		out[i] = alphabet[v%len(alphabet)]
	}
	return string(out)
}

type Device struct {
	ID              string `db:"id" json:"id"`
	ClinicID        string `db:"clinic_id" json:"clinicId"`
	Name            string `db:"name" json:"name"`
	Role            string `db:"role" json:"role"`
	StaffID         string `db:"staff_id" json:"staffId"`
	TokenHash       string `db:"token_hash" json:"-"`
	CreatedAt       string `db:"created_at" json:"createdAt"`
	LastSeenAt      string `db:"last_seen_at" json:"lastSeenAt"`
	RevokedAt       string `db:"revoked_at" json:"revokedAt"`
	CertFingerprint string `db:"cert_fingerprint" json:"certFingerprint"`
}

// CreateWorkspace creates a new tenant with a clinic profile and owner staff.
// It is used by a cloud server's self-service onboarding.
func (s *Store) CreateWorkspace(name, ownerName string, profile map[string]any) (string, string, map[string]any, error) {
	clinicID := NewID()
	ownerID := NewID()
	rev := s.clock.Next()
	clinicFields := map[string]any{
		"name": name, "legal_name": name, "currency": "EGP", "currency_symbol": "E£",
		"timezone": "Africa/Cairo", "opening_time": "08:00", "closing_time": "18:00",
		"slot_minutes": 30, "work_days": "1,2,3,4,5",
	}
	for k, v := range profile {
		if metaColumns[k] || k == "id" || k == "clinic_id" || k == "name" {
			continue
		}
		if _, ok := s.tables["clinics"].Set[k]; ok {
			clinicFields[k] = v
		}
	}
	clinicFields["name"] = name
	staffFields := map[string]any{
		"full_name": ownerName, "role": "owner", "title": "Clinic owner", "active": 1,
		"color": "#2e3a54",
	}
	changes := []Change{
		{ChangeID: NewID(), Entity: "clinics", EntityID: clinicID, Fields: clinicFields, HLC: rev},
		{ChangeID: NewID(), Entity: "staff", EntityID: ownerID, Fields: staffFields, HLC: s.clock.Next()},
	}
	if _, _, err := s.ApplyIncoming(clinicID, changes); err != nil {
		return "", "", nil, err
	}
	row, err := s.Row("clinics", clinicID)
	if err != nil {
		return "", "", nil, err
	}
	return clinicID, ownerID, row, nil
}

// CreateStaffMember adds a staff record to a workspace (authoritative write).
func (s *Store) CreateStaffMember(clinicID, name, role, title string) (string, error) {
	id := NewID()
	rev := s.clock.Next()
	ch := Change{ChangeID: NewID(), Entity: "staff", EntityID: id, HLC: rev, Fields: map[string]any{
		"full_name": name, "role": role, "title": title, "active": 1, "color": "#4f6b8a",
	}}
	if _, _, err := s.ApplyIncoming(clinicID, []Change{ch}); err != nil {
		return "", err
	}
	return id, nil
}

// CreateDevice stores a hashed bearer token and returns the device.
func (s *Store) CreateDevice(clinicID, name, role, staffID, tokenHash, fingerprint string) (Device, error) {
	d := Device{
		ID: NewID(), ClinicID: clinicID, Name: name, Role: role, StaffID: staffID,
		TokenHash: tokenHash, CreatedAt: now(), LastSeenAt: now(), CertFingerprint: fingerprint,
	}
	_, err := s.db.Exec(`INSERT INTO _server_devices(id,clinic_id,name,role,staff_id,token_hash,created_at,last_seen_at,cert_fingerprint)
		VALUES(?,?,?,?,?,?,?,?,?)`, d.ID, d.ClinicID, d.Name, d.Role, d.StaffID, d.TokenHash, d.CreatedAt, d.LastSeenAt, d.CertFingerprint)
	if err != nil {
		return Device{}, err
	}
	return d, nil
}

// AuthenticateDevice resolves a raw bearer token to an active device.
func (s *Store) AuthenticateDevice(rawToken string) (Device, error) {
	var d Device
	err := s.db.Get(&d, `SELECT id,clinic_id,name,role,staff_id,token_hash,created_at,last_seen_at,
		COALESCE(revoked_at,'') AS revoked_at, cert_fingerprint
		FROM _server_devices WHERE token_hash=? AND revoked_at IS NULL`, HashToken(rawToken))
	if err != nil {
		return Device{}, err
	}
	// Throttle last-seen writes to once a minute.
	if last := d.LastSeenAt; last == "" || time.Since(parseTime(last)) > time.Minute {
		_, _ = s.db.Exec("UPDATE _server_devices SET last_seen_at=? WHERE id=?", now(), d.ID)
	}
	return d, nil
}

func parseTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return time.Time{}
	}
	return t
}

// ListDevices returns every device for a workspace.
func (s *Store) ListDevices(clinicID string) ([]Device, error) {
	var out []Device
	err := s.db.Select(&out, `SELECT id,clinic_id,name,role,staff_id,token_hash,created_at,last_seen_at,
		COALESCE(revoked_at,'') AS revoked_at, cert_fingerprint
		FROM _server_devices WHERE clinic_id=? ORDER BY created_at`, clinicID)
	return out, err
}

// RevokeDevice invalidates a paired device.
func (s *Store) RevokeDevice(clinicID, id string) error {
	_, err := s.db.Exec("UPDATE _server_devices SET revoked_at=? WHERE id=? AND clinic_id=?", now(), id, clinicID)
	return err
}

// ---- Pairing codes / invites --------------------------------------------

// EnsureInvite returns a valid pairing code, creating or rotating if needed.
func (s *Store) EnsureInvite(clinicID, role string, ttl time.Duration, rotate bool) (string, time.Time, error) {
	code := s.serverMeta("invite_plain:" + clinicID)
	expiry := s.serverMeta("invite_exp:" + clinicID)
	exp, _ := time.Parse(time.RFC3339, expiry)
	if !rotate && code != "" && time.Now().Before(exp) {
		return FormatCode(code), exp, nil
	}
	raw := NewPairingCode()
	exp = time.Now().UTC().Add(ttl)
	_, err := s.db.Exec(`INSERT INTO _server_invites(id,clinic_id,code_hash,role,created_at,expires_at)
		VALUES(?,?,?,?,?,?)`, NewID(), clinicID, HashToken(raw), role, now(), exp.Format(time.RFC3339Nano))
	if err != nil {
		return "", time.Time{}, err
	}
	s.setServerMeta("invite_plain:"+clinicID, raw)
	s.setServerMeta("invite_exp:"+clinicID, exp.Format(time.RFC3339))
	return FormatCode(raw), exp, nil
}

// PairingCode returns the currently displayed code without rotating it.
func (s *Store) PairingCode(clinicID string) (string, time.Time) {
	code := s.serverMeta("invite_plain:" + clinicID)
	expiry := s.serverMeta("invite_exp:" + clinicID)
	exp, _ := time.Parse(time.RFC3339, expiry)
	if code == "" || time.Now().After(exp) {
		return "", exp
	}
	return FormatCode(code), exp
}

// ValidateInvite checks a code against active invites for a workspace.
func (s *Store) ValidateInvite(clinicID, code string) bool {
	normalized := NormalizeCode(code)
	if normalized == "" {
		return false
	}
	var n int
	_ = s.db.Get(&n, `SELECT COUNT(1) FROM _server_invites
		WHERE clinic_id=? AND code_hash=? AND expires_at>?`, clinicID, HashToken(normalized), now())
	return n > 0
}

// FindInviteByCode resolves a code to its workspace and intended role. Used by
// a multi-tenant cloud endpoint where the code itself identifies the
// workspace.
func (s *Store) FindInviteByCode(code string) (clinicID, role string, ok bool) {
	normalized := NormalizeCode(code)
	if normalized == "" {
		return "", "", false
	}
	err := s.db.QueryRow(`SELECT clinic_id, role FROM _server_invites
		WHERE code_hash=? AND expires_at>? ORDER BY created_at DESC LIMIT 1`,
		HashToken(normalized), now()).Scan(&clinicID, &role)
	return clinicID, role, err == nil
}

func (s *Store) serverMeta(key string) string {
	var v string
	_ = s.db.Get(&v, "SELECT value FROM _server_meta WHERE key=?", key)
	return v
}

func (s *Store) setServerMeta(key, value string) {
	_, _ = s.db.Exec("INSERT INTO _server_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value)
}

// ServerClinic returns the clinic profile for a workspace.
func (s *Store) ServerClinic(clinicID string) (map[string]any, error) {
	return s.Row("clinics", clinicID)
}

// ClinicExists reports whether a workspace exists in this database.
func (s *Store) ClinicExists(clinicID string) bool {
	var n int
	_ = s.db.Get(&n, "SELECT COUNT(1) FROM clinics WHERE id=?", clinicID)
	return n > 0
}

// ServerWorkspaceCount is used by the headless server to offer a helpful
// first-run log message.
func (s *Store) ServerWorkspaceCount() int {
	var n int
	_ = s.db.Get(&n, "SELECT COUNT(1) FROM clinics")
	return n
}

// WorkspaceNames lists workspaces for the local server console.
func (s *Store) WorkspaceNames() []string {
	var names []string
	_ = s.db.Select(&names, "SELECT name FROM clinics ORDER BY created_at")
	return names
}
