package updater

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type appliedMarker struct {
	From string `json:"from"`
	To   string `json:"to"`
	At   string `json:"at"`
}

func markerPath(dataDir string) string {
	return filepath.Join(dataDir, "updates", "applied.json")
}

func writeAppliedMarker(dataDir, from, to string) error {
	path := markerPath(dataDir)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(appliedMarker{From: from, To: to, At: time.Now().UTC().Format(time.RFC3339)}, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// appliedFrom reports the version that was replaced by the currently running
// build. A stale marker from a failed install is ignored.
func appliedFrom(dataDir, currentVersion string) string {
	data, err := os.ReadFile(markerPath(dataDir))
	if err != nil {
		return ""
	}
	var marker appliedMarker
	if err := json.Unmarshal(data, &marker); err != nil {
		return ""
	}
	if strings.TrimSpace(marker.To) != strings.TrimSpace(currentVersion) || strings.TrimSpace(marker.From) == "" {
		return ""
	}
	return marker.From
}

// updateDir is where a version's downloaded payload and helper scripts live.
func updateDir(dataDir, version string) string {
	return filepath.Join(dataDir, "updates", "v"+strings.TrimPrefix(strings.TrimSpace(version), "v"))
}

// pruneUpdates removes old downloaded versions while keeping the most recent
// one and any directory referenced by the applied marker.
func pruneUpdates(dataDir string, keep ...string) {
	root := filepath.Join(dataDir, "updates")
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	keepSet := map[string]bool{}
	for _, name := range keep {
		if name != "" {
			keepSet[filepath.Clean(name)] = true
		}
	}
	keepSet[filepath.Clean("applied.json")] = true
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if keepSet[filepath.Clean(entry.Name())] {
			continue
		}
		info, err := entry.Info()
		if err == nil && time.Since(info.ModTime()) < 7*24*time.Hour {
			continue // leave recent downloads alone
		}
		_ = os.RemoveAll(filepath.Join(root, entry.Name()))
	}
}

var errNoInstall = errors.New("this build cannot install updates automatically")
