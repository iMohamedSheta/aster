//go:build linux

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
	switch in.Asset.Kind {
	case KindTarGz:
		return installTarGz(in)
	case KindDeb:
		return installDeb(in)
	default:
		return fmt.Errorf("unsupported Linux update package %q", in.Asset.Kind)
	}
}

func installTarGz(in InstallInput) error {
	current, err := os.Executable()
	if err != nil {
		return err
	}
	if prepared, err := filepath.EvalSymlinks(current); err == nil {
		current = prepared
	}
	if err := ensureWritable(filepath.Dir(current)); err != nil {
		return err
	}
	stage := filepath.Join(updateDir(in.DataDir, in.TargetVersion), "extract")
	_ = os.RemoveAll(stage)
	if err := os.MkdirAll(stage, 0o700); err != nil {
		return err
	}
	written, err := extractTarGz(in.Archive, stage)
	if err != nil {
		return err
	}
	staged := findStagedBinary(written)
	if staged == "" {
		return errors.New("the Linux update does not contain the aster executable")
	}
	if err := verifyBinaryVersion(staged, in.TargetVersion); err != nil {
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
target=%s
staged=%s
backup="${target}.old-$$"
if ! mv "$target" "$backup"; then
  echo "Could not move the installed binary: $target"
  exit 1
fi
if install -m 0755 "$staged" "$target"; then
  rm -f "$backup"
  echo "Update applied."
else
  echo "Copy failed; restoring the previous binary."
  mv "$backup" "$target"
  exit 1
fi
nohup "$target" >/dev/null 2>&1 &
`, shellQuote(logPath), os.Getpid(), shellQuote(current), shellQuote(staged))
	if err := os.WriteFile(scriptPath, []byte(script), 0o700); err != nil {
		return err
	}
	return startPosixHelper(scriptPath)
}

func installDeb(in InstallInput) error {
	if _, err := exec.LookPath("pkexec"); err != nil {
		return fmt.Errorf("system installation needs polkit's pkexec; run this update manually with: sudo dpkg -i %s", in.Archive)
	}
	if out, err := exec.Command("dpkg-deb", "-f", in.Archive, "Package", "Version").CombinedOutput(); err != nil {
		return fmt.Errorf("check the Linux package: %w (%s)", err, strings.TrimSpace(string(out)))
	} else {
		lines := strings.Fields(strings.ReplaceAll(string(out), "\n", " "))
		if len(lines) < 2 || lines[0] != "aster" {
			return errors.New("the downloaded package is not the Aster package")
		}
		foundVersion := strings.TrimPrefix(strings.TrimSpace(lines[1]), "v")
		if foundVersion != strings.TrimPrefix(in.TargetVersion, "v") {
			return fmt.Errorf("the downloaded package is version %s, expected %s", foundVersion, in.TargetVersion)
		}
	}
	if _, err := os.Stat("/usr/bin/aster"); err != nil {
		return fmt.Errorf("the installed Aster binary is not at /usr/bin/aster; install the update manually with: sudo dpkg -i %s", in.Archive)
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
if ! pkexec /usr/bin/dpkg -i %s; then
  echo "System package installation failed."
  exit 1
fi
nohup /usr/bin/aster >/dev/null 2>&1 &
`, shellQuote(logPath), os.Getpid(), shellQuote(in.Archive))
	if err := os.WriteFile(scriptPath, []byte(script), 0o700); err != nil {
		return err
	}
	return startPosixHelper(scriptPath)
}

func findStagedBinary(written []string) string {
	for _, path := range written {
		if filepath.Base(path) == "aster" {
			if info, err := os.Stat(path); err == nil && info.Mode().IsRegular() {
				return path
			}
		}
	}
	return ""
}

func startPosixHelper(scriptPath string) error {
	cmd := exec.Command("/bin/bash", scriptPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start Linux update helper: %w", err)
	}
	return cmd.Process.Release()
}
