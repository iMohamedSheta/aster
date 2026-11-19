# Changelog

All notable changes to Aster are recorded here. Release notes for a tag
`vX.Y.Z` come from the matching section below.

## 0.1.0 — 2026-11-19

First desktop release: an Arabic-first, local-first clinic workspace for
Windows, macOS and Linux.

### Features

- **Payroll (الرواتب)** — an owner-only monthly salary register. Salary
  defaults live per team member, each month is generated as a draft line, and
  paying a line records the matching salary expense in Finance. Paid lines are
  locked until the payment is reversed.
- **Services catalogue (الخدمات)** — the clinic price list now lives on its own
  `/services` page, separate from Billing. Services can be filtered by category
  and status, and invoice lines keep their own price copy.
- **Billing** — invoices, payments, balances, collection rate, voiding and
  printable invoices. Billing is now invoices-only; service management no
  longer lives inside it.
- **Patient documents** — documents up to 200 MB upload in chunks, so large
  scans do not block the interface, and are streamed back when opened.
- **Over-the-air updates** — Aster checks GitHub Releases in the background,
  shows when an update is available, verifies the download, and asks before
  installing. The release tag is the update version.
- **Desktop packaging** — per-user Windows NSIS installer and portable ZIP,
  universal macOS app with DMG and ZIP, and Linux `.deb` and `.tar.gz` builds
  for WebKit 4.0 and 4.1 on x64 and ARM64.
- **Arabic and English** — the interface defaults to Arabic with full RTL
  layout and can be switched to English from Settings.
- **Headless workspace server** — `cmd/aster-server` runs the same workspace
  protocol without the desktop shell for clinics that host their own server.
- **Documentation** — project README and a release guide covering signing,
  assets, installation and updates.

### Fixes and hardening

- Salary payment reversal now reopens the line and archives its linked expense
  in one transaction, so Finance can never keep a payment that payroll no
  longer shows.
- The Windows uninstaller reads the same 64-bit registry view as the installer,
  so removing Aster no longer leaves a stale entry behind.
- The macOS DMG stages `Aster.app` with an Applications shortcut and is built
  from the signed bundle.
- Linux `.deb` packaging resolves the staged binary, desktop entry and icon
  from absolute paths during the release build.
- Update downloads are checked against the manifest's SHA-256 and, when a
  public update key is embedded, its Ed25519 signature. Unsigned production
  releases are refused once a key is committed.
- The Windows installer keeps clinic data in `%APPDATA%\Aster` during upgrades
  and uninstalls; removing the application never deletes patient records.

### Downloads

- **Windows:** `Aster-0.1.0-windows-amd64-setup.exe`,
  `Aster-0.1.0-windows-arm64-setup.exe`, or the matching portable ZIP.
- **macOS:** `Aster-0.1.0-darwin-universal.dmg` for a manual install, or the
  universal ZIP for self-updating installs.
- **Linux:** `.deb` or `.tar.gz` for x64 and ARM64. The app selects the WebKit
  4.0 or 4.1 archive that matches the WebKit ABI it was built against.

### Notes

This first release is unsigned because Windows and Apple signing credentials
and the update signing key are not configured yet. See
[`docs/RELEASING.md`](https://github.com/iMohamedSheta/aster/blob/main/docs/RELEASING.md)
for the production signing setup.
