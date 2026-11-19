//go:build windows

package updater

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func detectPlatform(_ string) Platform {
	platform := Platform{OS: "windows", Arch: runtime.GOARCH, Package: KindInstaller}
	executable, err := os.Executable()
	if err != nil {
		return platform
	}
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		return platform
	}
	installed := filepath.Join(base, "Programs", "Aster", "Aster.exe")
	if !strings.EqualFold(filepath.Clean(executable), filepath.Clean(installed)) {
		platform.Package = KindPortable
	}
	return platform
}
