//go:build !windows && !darwin && !linux

package updater

import "runtime"

func detectPlatform(_ string) Platform {
	return Platform{OS: runtime.GOOS, Arch: runtime.GOARCH, Package: "unsupported"}
}
