//go:build !windows && !darwin && !linux

package updater

import "fmt"

func installUpdate(in InstallInput) error {
	return fmt.Errorf("automatic updates are not supported on %s", in.Platform.OS)
}
