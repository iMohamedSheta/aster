package updater

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ensureWritable proves the update can replace a binary before the app quits.
func ensureWritable(dir string) error {
	f, err := os.CreateTemp(dir, ".aster-write-*")
	if err != nil {
		return errors.New("this folder is not writable; install Aster somewhere the current account can update")
	}
	name := f.Name()
	_ = f.Close()
	_ = os.Remove(name)
	return nil
}

// shellQuote wraps a path for POSIX helpers.
func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}

// verifyBinaryVersion runs the staged binary's early --version path. It runs
// before the window is created, so it also proves the matching runtime
// libraries are present.
func verifyBinaryVersion(binary, expected string) error {
	binary, err := filepath.Abs(binary)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, binary, "--version").CombinedOutput()
	if err != nil {
		return fmt.Errorf("the downloaded Aster build did not start: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	got := strings.TrimSpace(string(out))
	want := strings.TrimSpace(strings.TrimPrefix(expected, "v"))
	if got != want {
		return fmt.Errorf("the downloaded build reports version %q, expected %q", got, want)
	}
	return nil
}
