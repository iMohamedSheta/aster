// Package config stores per-device settings that must not be replicated:
// node identity, sync credentials, current staff and UI preferences.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Config struct {
	NodeID      string `json:"nodeId"`
	DeviceName  string `json:"deviceName"`
	Mode        string `json:"mode"` // local | lan_host | lan_client | cloud
	StaffID     string `json:"staffId"`
	StaffName   string `json:"staffName"`
	StaffRole   string `json:"staffRole"`
	LocationID  string `json:"locationId"`
	ServerURL   string `json:"serverUrl"`
	Token       string `json:"token"`
	Fingerprint string `json:"fingerprint"`
	Workspace   string `json:"workspace"`
	LanPort     int    `json:"lanPort"`
	Onboarded   bool   `json:"onboarded"`
	Theme       string `json:"theme"`
	Locale      string `json:"locale"`

	// Update preferences. DisableUpdateCheck is inverted so existing device
	// files (where the field is absent) keep automatic updates on.
	DisableUpdateCheck bool   `json:"disableUpdateCheck,omitempty"`
	SkippedUpdate      string `json:"skippedUpdate,omitempty"`
	LastUpdateCheck    string `json:"lastUpdateCheck,omitempty"`

	mu   sync.Mutex
	path string
}

// DataDir resolves the per-user application folder. ASTER_HOME makes the app
// fully portable and is used by tests and screenshot runs.
func DataDir() string {
	if v := os.Getenv("ASTER_HOME"); v != "" {
		return v
	}
	base, err := os.UserConfigDir()
	if err != nil || base == "" {
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "Aster")
}

func DBPath(dir string) string {
	if v := os.Getenv("ASTER_DB_PATH"); v != "" {
		return v
	}
	return filepath.Join(dir, "aster.db")
}

func Load(dir string) (*Config, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	path := filepath.Join(dir, "device.json")
	c := &Config{path: path, Mode: "local", Theme: "light"}
	data, err := os.ReadFile(path)
	if err == nil {
		if err := json.Unmarshal(data, c); err != nil {
			return nil, fmt.Errorf("read device settings: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	if c.DeviceName == "" {
		host, _ := os.Hostname()
		if host == "" {
			host = "Aster desktop"
		}
		c.DeviceName = host
	}
	if c.LanPort == 0 {
		c.LanPort = 47821
	}
	if c.Theme == "" {
		c.Theme = "light"
	}
	c.NodeID = strings.ToLower(strings.TrimSpace(c.NodeID))
	return c, nil
}

func (c *Config) Save() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	tmp := c.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, c.path)
}

func (c *Config) Path() string { return c.path }

func (c *Config) IsConnected() bool {
	return (c.Mode == "lan_client" || c.Mode == "cloud") && c.ServerURL != "" && c.Token != ""
}

func BackupDir(dir string) string { return filepath.Join(dir, "backups") }

func Timestamp() string { return time.Now().Format("20060102-150405") }
