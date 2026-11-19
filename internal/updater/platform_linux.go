//go:build linux

package updater

import (
	"os"
	"os/exec"
	"runtime"
	"strings"
)

func detectPlatform(fallbackWebKit string) Platform {
	platform := Platform{
		OS:      "linux",
		Arch:    runtime.GOARCH,
		Package: KindTarGz,
		WebKit:  fallbackWebKit,
	}
	executable, err := os.Executable()
	if err != nil {
		if platform.WebKit == "" {
			platform.WebKit = "41"
		}
		return platform
	}
	if isDPKGInstall(executable) {
		platform.Package = KindDeb
	}
	if detected := webkitABI(executable); detected != "" {
		platform.WebKit = detected
	}
	if platform.WebKit == "" {
		platform.WebKit = "41"
	}
	return platform
}

func isDPKGInstall(executable string) bool {
	if _, err := os.Stat("/var/lib/dpkg/status"); err != nil {
		return false
	}
	out, err := exec.Command("dpkg-query", "-S", executable).Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), ":aster")
}

func webkitABI(executable string) string {
	out, err := exec.Command("ldd", executable).Output()
	if err != nil {
		return ""
	}
	text := string(out)
	switch {
	case strings.Contains(text, "libwebkit2gtk-4.1"):
		return "41"
	case strings.Contains(text, "libwebkit2gtk-4.0"):
		return "40"
	default:
		return ""
	}
}
