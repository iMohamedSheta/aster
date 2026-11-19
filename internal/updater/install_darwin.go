//go:build darwin

package updater

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func installUpdate(in InstallInput) error {
	if in.Asset.Kind != KindAppZip {
		return fmt.Errorf("unsupported macOS update package %q", in.Asset.Kind)
	}
	current, err := os.Executable()
	if err != nil {
		return err
	}
	app, err := appBundle(current)
	if err != nil {
		return err
	}
	if err := ensureWritable(filepath.Dir(app)); err != nil {
		return err
	}
	stage := filepath.Join(updateDir(in.DataDir, in.TargetVersion), "app")
	_ = os.RemoveAll(stage)
	if err := os.MkdirAll(stage, 0o700); err != nil {
		return err
	}
	if out, err := exec.Command("ditto", "-x", "-k", in.Archive, stage).CombinedOutput(); err != nil {
		return fmt.Errorf("unpack macOS update: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	stagedApp, err := findAppBundle(stage)
	if err != nil {
		return err
	}
	if err := verifyAppSignature(current, stagedApp); err != nil {
		return err
	}
	if err := verifyAppVersion(stagedApp, in.TargetVersion); err != nil {
		return err
	}

	helperDir := updateDir(in.DataDir, in.TargetVersion)
	logPath := filepath.Join(helperDir, "install.log")
	scriptPath := filepath.Join(helperDir, fmt.Sprintf("install-%d.sh", time.Now().UnixNano()))
	script := fmt.Sprintf(`#!/bin/bash
set -u
exec >>%s 2>&1
echo "Aster update helper started $(date -u +%%Y-%%m-%%dT%%H:%%M:%%SZ)"
pid=%d
while kill -0 "$pid" 2>/dev/null; do sleep 0.3; done
app=%s
staged=%s
backup="${app}.old-$$"
if ! mv "$app" "$backup"; then
  echo "Could not move the installed app: $app"
  exit 1
fi
if /usr/bin/ditto "$staged" "$app"; then
  /usr/bin/xattr -dr com.apple.quarantine "$app" 2>/dev/null || true
  rm -rf "$backup"
  /usr/bin/open "$app"
  echo "Update applied."
else
  echo "Copy failed; restoring the previous app."
  rm -rf "$app"
  mv "$backup" "$app"
  /usr/bin/open "$app"
  exit 1
fi
`, shellQuote(logPath), os.Getpid(), shellQuote(app), shellQuote(stagedApp))
	if err := os.WriteFile(scriptPath, []byte(script), 0o700); err != nil {
		return err
	}
	cmd := exec.Command("/bin/bash", scriptPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start macOS update helper: %w", err)
	}
	return cmd.Process.Release()
}

func appBundle(executable string) (string, error) {
	current := filepath.Clean(executable)
	for i := 0; i < 4; i++ {
		if strings.HasSuffix(current, ".app") {
			if info, err := os.Stat(current); err == nil && info.IsDir() {
				return current, nil
			}
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	return "", errors.New("Aster is not running from a macOS app bundle")
}

func findAppBundle(root string) (string, error) {
	var found string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() && strings.HasSuffix(info.Name(), ".app") {
			found = path
			return filepath.SkipDir
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", errors.New("the macOS update does not contain an app bundle")
	}
	return found, nil
}

func verifyAppSignature(current, staged string) error {
	if err := codesignVerify(current); err != nil {
		// Development builds are unsigned. Only enforce signing when the
		// currently installed app is signed.
		return nil
	}
	if err := codesignVerify(staged); err != nil {
		return fmt.Errorf("the downloaded app is not correctly signed: %w", err)
	}
	return nil
}

func codesignVerify(app string) error {
	out, err := exec.Command("/usr/bin/codesign", "--verify", "--deep", "--strict", app).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%w (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func verifyAppVersion(app, expected string) error {
	macOS := filepath.Join(app, "Contents", "MacOS")
	entries, err := os.ReadDir(macOS)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join(macOS, entry.Name())
		info, err := entry.Info()
		if err != nil || info.Mode()&0o111 == 0 {
			continue
		}
		return verifyBinaryVersion(path, expected)
	}
	return errors.New("the downloaded app has no executable")
}
