# Aster

**Aster** is an Arabic-first, local-first clinic workspace for small clinics and
private practices. It runs as a native desktop application on Windows, macOS and
Linux, keeps the clinic database on the device, and can share one workspace
across several clinic locations over the local network.

واجهة عربية أولاً، وبيانات العيادة محفوظة على جهازك.

## Features

| Area | What it covers |
| --- | --- |
| Patients | Patient records, medical history, allergies, contacts and documents |
| Documents | Patient files up to 200 MB, uploaded in chunks |
| Scheduling | Appointments, arrivals, queue status and follow-ups |
| Care | Visits and encounters, prescriptions, treatment plans and tasks |
| Billing | Invoices, payments, balances, voiding and printable invoices |
| Services | A standalone price-list page for consultations, procedures and tests |
| Finance | Expenses, collection reporting and financial summaries |
| Payroll | Monthly salary register; paying a line records the matching expense |
| Inventory | Stock items, adjustments and low-stock reporting |
| Network | Multi-location clinic setup and LAN workspace synchronisation |
| Updates | GitHub Releases over-the-air updates with manifest signing support |

The interface defaults to Arabic with full RTL layout and can be switched to
English from **Settings → Appearance**. The application is designed to remain
usable offline; syncing is a deployment choice, not a requirement.

## Technology

- **Desktop shell:** [Wails v2](https://wails.io) (Go + system webview)
- **Backend:** Go 1.26, SQLite via `modernc.org/sqlite`, `sqlx`
- **Frontend:** React 18, TypeScript, Vite 5, TanStack Query, Tailwind CSS
- **Local data:** a single SQLite database per device
- **Updates:** GitHub Releases plus a signed `latest.json` manifest

## Getting started

### Prerequisites

- Go **1.26.3** or newer
- Node.js **20** or newer with npm
- The Wails CLI:

  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```

- Platform dependencies:
  - **Windows:** WebView2 (installed by the Aster installer when missing)
  - **macOS:** Xcode Command Line Tools
  - **Linux:** GTK 3 and WebKitGTK 4.0 or 4.1 development packages

Run `wails doctor` to check that the platform toolchain is complete.

### Run in development

```bash
git clone https://github.com/iMohamedSheta/aster.git
cd aster
cd frontend && npm install && cd ..
wails dev
```

`wails dev` starts the frontend dev server, rebuilds Go changes, and opens the
desktop window with hot reload.

### Build

```bash
wails build
```

The application is written to `build/bin/Aster` (`Aster.exe` on Windows). Use
`wails build -clean` for a clean build, and see `docs/RELEASING.md` for the
installer and multi-platform release pipeline.

### Tests and checks

```bash
go vet ./...
go test ./... -count=1
cd frontend && npm run build
```

The frontend build runs `tsc --noEmit` before producing the Vite bundle.

## Where data lives

Aster stores its workspace in the per-user configuration folder:

| Platform | Folder |
| --- | --- |
| Windows | `%APPDATA%\Aster` |
| macOS | `~/Library/Application Support/Aster` |
| Linux | `~/.config/Aster` |

Inside that folder:

- `aster.db` — the clinic database (with `-wal` and `-shm` files while running)
- `device.json` — device settings, appearance, active location and update state

Set `ASTER_HOME` to use a different, fully portable data folder, or set
`ASTER_DB_PATH` to point at a specific database file. Back up `aster.db` while
the application is closed.

## Project layout

```text
.
├── app.go                      Wails bridge: clinic API and app lifecycle
├── main.go                     Desktop entry point
├── cmd/
│   ├── aster-server/           Headless workspace server for cloud/LAN hosting
│   └── releasectl/             Update key and manifest tooling
├── frontend/
│   └── src/
│       ├── pages/              One component per workspace page
│       ├── components/         Shared UI, dialogs and layout
│       └── lib/                API client, types, translations, updates
├── internal/
│   ├── api/                    HTTP API used by the headless server
│   ├── config/                 Device settings and data paths
│   ├── store/                  SQLite schema, queries and payroll
│   ├── sync/                   Replication protocol
│   ├── syncengine/             Background sync engine
│   ├── updater/                Update check, download and install
│   └── version/                Version and embedded update public key
├── build/
│   ├── windows/installer/      Custom per-user NSIS installer
│   └── darwin/                 macOS bundle metadata and entitlements
├── packaging/linux/            Desktop entry and per-user install scripts
├── scripts/set-version.mjs     Keeps build metadata on the release tag version
└── docs/RELEASING.md           Release, signing and update contract
```

Services are deliberately kept outside Billing: **Billing** manages invoices
and payments, while **Services** (`/services`) manages the reusable price list.
Invoice lines still select a service and keep their own price copy, so editing
the catalogue never rewrites issued invoices.

## Desktop releases and updates

Releases are built from a git tag, for example `v0.1.0`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The tag is the version users receive. The release workflow builds Windows
installers and portable builds, a universal macOS app and DMG, and Linux `.deb`
and `.tar.gz` variants. It publishes `latest.json` last, after every installer,
so the update endpoint never points at a missing asset.

Aster verifies the SHA-256 of every download and, when a public key is embedded
in the build, the Ed25519 signature of the manifest. Updates always ask before
installing. The full signing setup, asset naming contract and manual checks are
in [`docs/RELEASING.md`](docs/RELEASING.md).

## Headless workspace server

`cmd/aster-server` serves the same workspace protocol without the desktop shell,
for clinics that host their database on a small server:

```bash
go run ./cmd/aster-server -addr :47821
```

Use `-home` to choose the data folder, `-db` for an explicit database path,
`-tls` to serve HTTPS with a self-signed certificate, and `-signup` only when
self-service workspace creation is intended.

## License

Aster is a private project. No open-source license has been attached yet.
