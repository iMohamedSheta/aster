//go:build darwin

package updater

import "runtime"

func detectPlatform(_ string) Platform {
	return Platform{OS: "darwin", Arch: runtime.GOARCH, Package: KindAppZip}
}
