//go:build windows

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

const createNoWindow = 0x08000000

func installUpdate(in InstallInput) error {
	switch in.Asset.Kind {
	case KindInstaller:
		return startInstallerHelper(in)
	case KindPortable:
		return startPortableHelper(in)
	default:
		return fmt.Errorf("unsupported Windows update package %q", in.Asset.Kind)
	}
}

func startInstallerHelper(in InstallInput) error {
	installer, err := filepath.Abs(in.Archive)
	if err != nil {
		return err
	}
	if _, err := os.Stat(installer); err != nil {
		return fmt.Errorf("installer is missing: %w", err)
	}
	helperDir := updateDir(in.DataDir, in.TargetVersion)
	if err := os.MkdirAll(helperDir, 0o700); err != nil {
		return err
	}
	logPath := filepath.Join(helperDir, "install.log")
	scriptPath := filepath.Join(helperDir, fmt.Sprintf("install-%d.ps1", time.Now().UnixNano()))
	script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
Start-Transcript -Path %s -Append | Out-Null
try {
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-Process -Id %d -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 300
    }
    $installer = %s
    $process = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
    Start-Sleep -Milliseconds 900
    $exe = Join-Path $env:LOCALAPPDATA 'Programs\Aster\Aster.exe'
    if (Test-Path -LiteralPath $exe) {
        Start-Process -FilePath $exe
    } else {
        throw "Aster was not found after setup finished (exit code $($process.ExitCode))."
    }
} catch {
    $_ | Out-String | Add-Content -Path %s
    exit 1
} finally {
    Stop-Transcript | Out-Null
}
`, psQuote(logPath), os.Getpid(), psQuote(installer), psQuote(logPath+".error"))
	if err := os.WriteFile(scriptPath, []byte(script), 0o600); err != nil {
		return err
	}
	return startPowerShell(scriptPath)
}

func startPortableHelper(in InstallInput) error {
	current, err := os.Executable()
	if err != nil {
		return err
	}
	if err := ensureWritable(filepath.Dir(current)); err != nil {
		return err
	}
	stage := filepath.Join(updateDir(in.DataDir, in.TargetVersion), "portable")
	newExe, err := extractZipFile(in.Archive, stage, "Aster.exe")
	if err != nil {
		return err
	}
	helperDir := updateDir(in.DataDir, in.TargetVersion)
	logPath := filepath.Join(helperDir, "install.log")
	scriptPath := filepath.Join(helperDir, fmt.Sprintf("install-%d.ps1", time.Now().UnixNano()))
	script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
Start-Transcript -Path %s -Append | Out-Null
try {
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-Process -Id %d -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 300
    }
    $copied = $false
    for ($i = 0; $i -lt 120 -and -not $copied; $i++) {
        try {
            Copy-Item -LiteralPath %s -Destination %s -Force
            $copied = $true
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $copied) { throw "Could not replace Aster.exe; it stayed locked." }
    Start-Process -FilePath %s
} catch {
    $_ | Out-String | Add-Content -Path %s
    exit 1
} finally {
    Stop-Transcript | Out-Null
}
`, psQuote(logPath), os.Getpid(), psQuote(newExe), psQuote(current), psQuote(current), psQuote(logPath+".error"))
	if err := os.WriteFile(scriptPath, []byte(script), 0o600); err != nil {
		return err
	}
	return startPowerShell(scriptPath)
}

func startPowerShell(scriptPath string) error {
	cmd := exec.Command("powershell.exe",
		"-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-WindowStyle", "Hidden", "-File", scriptPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start update installer: %w", err)
	}
	return cmd.Process.Release()
}

func psQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}
