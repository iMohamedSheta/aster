# Releasing Aster

Aster updates itself from **GitHub Releases**. There is no separate update
server. A release publishes one small `latest.json` beside the installers:

```
https://github.com/iMohamedSheta/aster/releases/latest/download/latest.json
```

The manifest's `version` comes from the release tag, so the tag is the single
source of truth for what version users receive. The app reads the manifest,
compares versions, downloads the asset for its platform, checks its SHA-256 and
(when the build carries a public key) the Ed25519 manifest signature, then asks
the user before installing.

## What a release publishes

| Platform | Asset | Used by |
| --- | --- | --- |
| Windows x64 / ARM64 | `Aster-<version>-windows-<arch>-setup.exe` | Installed users; silent per-user update |
| Windows x64 / ARM64 | `Aster-<version>-windows-<arch>-portable.zip` | Portable installs |
| macOS universal | `Aster-<version>-darwin-universal.zip` | Signed `.app` bundle updates |
| Linux x64 | `Aster-<version>-linux-amd64-webkit40.tar.gz` | Per-user installs (`~/.local/opt/aster`) |
| Linux x64 | `Aster-<version>-linux-amd64-webkit40.deb` | System installs (`/usr/bin/aster`) |
| Linux x64 / ARM64 | `Aster-<version>-linux-<arch>-webkit41.tar.gz` | Per-user installs on WebKit 4.1 distros |
| Linux x64 / ARM64 | `Aster-<version>-linux-<arch>-webkit41.deb` | System installs on WebKit 4.1 distros |
| All | `latest.json` | The update manifest |
| All | `SHA256SUMS.txt` | Manual download verification |

The Linux WebKit variants exist because WebKitGTK 4.0 and 4.1 are not ABI
compatible. The app detects the ABI of the running binary and only offers the
matching archive. The pipeline publishes WebKit 4.0 for x64 and WebKit 4.1 for
x64 and ARM64; both `.deb` and `.tar.gz` variants are built for every supported
combination.

## One-time setup

### 1. Update signing key (required for production)

Generate an Ed25519 key pair. The private key never goes into the repository.

```bash
go run ./cmd/releasectl keygen \
  -out ../aster-update-signing.key \
  -public-out internal/version/update_public_key.txt
```

* Commit `internal/version/update_public_key.txt`. Every release build embeds
  it and will refuse unsigned manifests.
* Add the **contents** of `../aster-update-signing.key` (one base64 line) as the
  GitHub Actions secret `UPDATE_SIGNING_KEY`.
* Keep `../aster-update-signing.key` somewhere safe and backed up. Losing it
  means shipping a build with a new public key, which existing installs will
  not trust for updates.
* The release workflow compares the public key derived from the secret with the
  committed file and fails on a mismatch.

With no public key committed, builds accept unsigned manifests. That is only
for development; set repository variable `REQUIRE_SIGNING=true` to make the
release workflow fail instead of publishing unsigned production artifacts.

### 2. Windows code signing (optional but required for production)

Add these repository secrets:

| Secret | Meaning |
| --- | --- |
| `WINDOWS_CERT_PFX_BASE64` | Base64 of the Authenticode `.pfx` file |
| `WINDOWS_CERT_PASSWORD` | Password for the `.pfx` |

Optional repository variable `WINDOWS_TIMESTAMP_URL` overrides the default
timestamp server (`http://timestamp.digicert.com`).

The workflow signs `Aster.exe`, rebuilds the installer around the signed
executable, then signs the installer. Unsigned builds still work; they just
show a SmartScreen warning.

### 3. Apple signing and notarization (optional but required for production)

Add these repository secrets:

| Secret | Meaning |
| --- | --- |
| `APPLE_CERT_P12_BASE64` | Base64 of the Developer ID Application `.p12` |
| `APPLE_CERT_PASSWORD` | Password for the `.p12` |
| `APPLE_SIGNING_IDENTITY` | For example `Developer ID Application: Aster Clinic (TEAMID)` |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_APP_PASSWORD` | App-specific password for notarization |

Without a certificate the `.app` is unsigned, and the updater only enforces
codesigning when the **currently installed** app is signed. Without
notarization credentials a signed app is published with a warning; Gatekeeper
may still ask the user to confirm the first launch. With
`REQUIRE_SIGNING=true`, both a certificate and notarization credentials are
required.

## Cutting a release

Add the release notes to `CHANGELOG.md` first, grouped into features and fixes:

```markdown
## 1.2.3 — 2026-11-19

### Features

- What users can do now.

### Fixes and hardening

- What no longer goes wrong.
```

Then tag the commit:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The publish job extracts the matching `CHANGELOG.md` section into the GitHub
release body and appends a link to the tag's commits. When the section is
missing it falls back to GitHub's generated notes.

The `Release` workflow then:

1. Reads `1.2.3` from the tag and rejects malformed tags.
2. Builds Windows amd64/ARM64, macOS universal, and the Linux matrix.
3. Signs binaries when the secrets are configured.
4. Creates a **draft** GitHub release for the tag with the changelog notes.
5. Uploads every asset and `SHA256SUMS.txt`.
6. Generates and signs `latest.json`, verifies the signature against the
   committed public key, and uploads it **last**.
7. Publishes the release (or marks it a prerelease).

GitHub release assets on a **private** repository require authentication for
every download. Aster's updater makes anonymous HTTPS requests, so either make
the repository public or mirror the assets to a public release repository.
Until then, `releases/latest/download/latest.json` returns 404 to installed
apps and in-app updates cannot run.

A prerelease tag such as `v1.2.3-beta.1` is published with the prerelease flag.
GitHub's `releases/latest` excludes prereleases, so installed users stay on the
stable channel.

To rebuild a tag without moving it:

```bash
gh workflow run release.yml -f tag=v1.2.3
```

If a release already exists, the workflow re-uploads the assets with
`--clobber` and publishes it again.

## Manual checks

Build the release tool and inspect a manifest locally:

```bash
go test ./cmd/releasectl ./internal/updater
go run ./cmd/releasectl manifest -version v1.2.3 -assets ./dist -out ./dist/latest.json
go run ./cmd/releasectl verify -manifest ./dist/latest.json
```

`releasectl manifest` refuses files that do not follow the asset naming
contract unless `-skip-unknown` is passed. Keep names stable: the app selects
assets by platform, architecture, package kind and Linux WebKit variant.

Test the update path against a local manifest with:

```bash
ASTER_UPDATE_MANIFEST=http://localhost:8080/latest.json ./Aster
```

The updater accepts HTTP only for `localhost`/`127.0.0.1`; every other URL must
be HTTPS.

## Install locations and data

| Platform | Application | Clinic data |
| --- | --- | --- |
| Windows | `%LOCALAPPDATA%\Programs\Aster` | `%APPDATA%\Aster` |
| macOS | `Aster.app` wherever the user installed it | `~/Library/Application Support/Aster` |
| Linux (user) | `~/.local/opt/aster/aster` | `~/.config/Aster` |
| Linux (deb) | `/usr/bin/aster` | `~/.config/Aster` |

The Windows uninstaller and the Linux uninstall script deliberately **keep**
the clinic data directory. Never change that without an explicit backup and
restore flow.
