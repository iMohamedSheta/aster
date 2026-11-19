package store

import (
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	// SignInModePicker asks a person to choose their account, then enter the
	// password for that account. The clinic manager is always offered first.
	SignInModePicker = "picker"
	// SignInModeUsername asks for a username and password, without listing the
	// team on screen.
	SignInModeUsername = "username"
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,31}$`)

// StaffAuth is the private credential record used by the sign-in check. It is
// never returned to the interface.
type StaffAuth struct {
	ID           string
	FullName     string
	Role         string
	Username     string
	PasswordHash string
	Active       bool
}

// NormalizeUsername keeps usernames case-insensitive and free of stray spaces.
func NormalizeUsername(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func ValidateUsername(value string) error {
	if !usernamePattern.MatchString(NormalizeUsername(value)) {
		return errors.New("Username must be 3–32 characters using letters, numbers, dots, dashes or underscores")
	}
	return nil
}

func ValidatePassword(value string) error {
	if len(value) < 8 {
		return errors.New("Password must be at least 8 characters")
	}
	if len(value) > 72 {
		return errors.New("Password must be 72 characters or fewer")
	}
	return nil
}

func HashPassword(value string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(value), bcrypt.DefaultCost)
	return string(hash), err
}

func CheckPasswordHash(hash, value string) bool {
	if hash == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(value)) == nil
}

// publicStaffColumns deliberately omits password_hash. Everything returned to
// the interface goes through this projection.
const publicStaffColumns = `id, clinic_id, full_name, role, title, specialization,
	license_number, phone, email, color, active, notes, username,
	CASE WHEN password_hash <> '' THEN 1 ELSE 0 END AS has_password,
	created_at, updated_at`

func (s *Store) ListStaff() ([]map[string]any, error) {
	return s.queryMaps(`SELECT ` + publicStaffColumns + ` FROM staff
		WHERE deleted_at IS NULL ORDER BY active DESC, full_name`)
}

func (s *Store) StaffPublic(id string) (map[string]any, error) {
	rows, err := s.queryMaps(`SELECT `+publicStaffColumns+` FROM staff WHERE id=? AND deleted_at IS NULL`, id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrNotFound
	}
	return rows[0], nil
}

func (s *Store) StaffAuthByID(id string) (*StaffAuth, error) {
	return s.staffAuth(`id=?`, id)
}

func (s *Store) StaffAuthByUsername(username string) (*StaffAuth, error) {
	return s.staffAuth(`lower(username)=?`, NormalizeUsername(username))
}

func (s *Store) staffAuth(where string, arg string) (*StaffAuth, error) {
	var row struct {
		ID           string `db:"id"`
		FullName     string `db:"full_name"`
		Role         string `db:"role"`
		Username     string `db:"username"`
		PasswordHash string `db:"password_hash"`
		Active       int    `db:"active"`
	}
	err := s.db.Get(&row, `SELECT id, full_name, role, username, password_hash, active
		FROM staff WHERE clinic_id=? AND deleted_at IS NULL AND `+where+` LIMIT 1`, s.ClinicID(), arg)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &StaffAuth{
		ID: row.ID, FullName: row.FullName, Role: row.Role,
		Username: row.Username, PasswordHash: row.PasswordHash, Active: row.Active != 0,
	}, nil
}

// HasAnyPassword reports whether at least one active account can sign in. A
// workspace without one gets a one-time access setup step on the login screen.
func (s *Store) HasAnyPassword() bool {
	var n int
	_ = s.db.Get(&n, `SELECT COUNT(1) FROM staff
		WHERE clinic_id=? AND deleted_at IS NULL AND active=1 AND password_hash<>''`, s.ClinicID())
	return n > 0
}

// UsernameTaken reports whether another account already uses this username.
func (s *Store) UsernameTaken(username, excludeID string) (bool, error) {
	var n int
	err := s.db.Get(&n, `SELECT COUNT(1) FROM staff
		WHERE clinic_id=? AND deleted_at IS NULL AND lower(username)=? AND id<>?`,
		s.ClinicID(), NormalizeUsername(username), excludeID)
	return n > 0, err
}

func (s *Store) ClinicSignInMode() string {
	clinic, err := s.GetClinic()
	if err != nil {
		return SignInModePicker
	}
	mode := fmt.Sprint(clinic["signin_mode"])
	if mode != SignInModeUsername {
		return SignInModePicker
	}
	return mode
}

func (s *Store) SetClinicSignInMode(mode string) error {
	if mode != SignInModePicker && mode != SignInModeUsername {
		return errors.New("unknown sign-in method")
	}
	_, err := s.UpdateClinic(map[string]any{"signin_mode": mode})
	return err
}

// SaveStaff writes a team member. A plain `password` field is hashed here and
// never stored as text; `password_hash` from callers is ignored.
func (s *Store) SaveStaff(fields map[string]any) (map[string]any, error) {
	id := fieldID(fields)
	delete(fields, "id")
	delete(fields, "password_hash")
	delete(fields, "password_updated_at")

	if raw, ok := fields["username"]; ok {
		username := NormalizeUsername(fmt.Sprint(raw))
		if username == "" {
			delete(fields, "username")
		} else {
			if err := ValidateUsername(username); err != nil {
				return nil, err
			}
			var used int
			if err := s.db.Get(&used, `SELECT COUNT(1) FROM staff
				WHERE clinic_id=? AND deleted_at IS NULL AND lower(username)=? AND id<>?`,
				s.ClinicID(), username, id); err != nil {
				return nil, err
			}
			if used > 0 {
				return nil, errors.New("That username is already in use")
			}
			fields["username"] = username
		}
	}

	if raw, ok := fields["password"]; ok {
		password := fmt.Sprint(raw)
		delete(fields, "password")
		if password != "" {
			if err := ValidatePassword(password); err != nil {
				return nil, err
			}
			hash, err := HashPassword(password)
			if err != nil {
				return nil, err
			}
			fields["password_hash"] = hash
			fields["password_updated_at"] = time.Now().UTC().Format(time.RFC3339Nano)
		}
	}

	var row map[string]any
	var err error
	if id != "" {
		row, err = s.UpdateRecord("staff", id, fields, &Audit{Action: "staff.updated", Summary: "Updated staff member"})
	} else {
		if fmt.Sprint(fields["full_name"]) == "" {
			return nil, errors.New("name is required")
		}
		if fmt.Sprint(fields["role"]) == "" {
			fields["role"] = "doctor"
		}
		if _, ok := fields["active"]; !ok {
			fields["active"] = 1
		}
		row, err = s.CreateRecord("staff", fields, &Audit{Action: "staff.created", Summary: "Added staff member"})
	}
	if err != nil {
		return nil, err
	}
	return s.StaffPublic(fmt.Sprint(row["id"]))
}

// SetStaffCredentials is the manager action for setting or resetting access.
func (s *Store) SetStaffCredentials(id, username, password string) (map[string]any, error) {
	fields := map[string]any{"id": id}
	if strings.TrimSpace(username) != "" {
		fields["username"] = username
	}
	if password != "" {
		fields["password"] = password
	}
	return s.SaveStaff(fields)
}
