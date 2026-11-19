package version

import (
	_ "embed"
	"strings"
)

// Version, Commit and BuildDate are replaced at release time:
//
//	go build -ldflags "-X aster/internal/version.Version=1.2.3 \
//	  -X aster/internal/version.Commit=<sha> \
//	  -X aster/internal/version.BuildDate=<RFC3339>"
var (
	Version   = "0.1.0-dev"
	Commit    = ""
	BuildDate = ""
)

// LinuxWebKit is set for Linux release builds ("40" or "41"). The updater
// uses it to pick an archive linked against the same WebKit ABI, because the
// two builds cannot replace each other safely.
var LinuxWebKit = ""

// update_public_key.txt carries the Ed25519 public key used to verify signed
// update manifests. Keep it empty for local development builds; release
// builds refuse to install an unsigned manifest when a key is present.
//
//go:embed update_public_key.txt
var updatePublicKeyFile string

// UpdatePublicKey returns the trimmed base64 public key, or "" when this
// build does not verify update signatures.
func UpdatePublicKey() string {
	for _, line := range strings.Split(updatePublicKeyFile, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		return line
	}
	return ""
}

// Display returns a compact version string for UI and logs.
func Display() string {
	if Version == "" {
		return "dev"
	}
	return Version
}

// Full returns the version with the short commit when one was stamped in.
func Full() string {
	if Commit == "" {
		return Display()
	}
	short := Commit
	if len(short) > 7 {
		short = short[:7]
	}
	return Display() + " (" + short + ")"
}
