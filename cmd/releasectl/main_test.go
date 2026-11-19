package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"aster/internal/updater"
)

func TestClassifyAsset(t *testing.T) {
	tests := []struct {
		name string
		want assetSpec
		ok   bool
	}{
		{"Aster-1.2.3-windows-amd64-setup.exe", assetSpec{OS: "windows", Arch: "amd64", Kind: updater.KindInstaller}, true},
		{"Aster-1.2.3-windows-arm64-setup.exe", assetSpec{OS: "windows", Arch: "arm64", Kind: updater.KindInstaller}, true},
		{"Aster-1.2.3-windows-amd64-portable.zip", assetSpec{OS: "windows", Arch: "amd64", Kind: updater.KindPortable}, true},
		{"Aster-1.2.3-darwin-universal.zip", assetSpec{OS: "darwin", Arch: "universal", Kind: updater.KindAppZip}, true},
		{"Aster-1.2.3-darwin-universal.dmg", assetSpec{OS: "darwin", Arch: "universal", Kind: updater.KindDMG}, true},
		{"Aster-1.2.3-linux-amd64-webkit40.tar.gz", assetSpec{OS: "linux", Arch: "amd64", Kind: updater.KindTarGz, Variant: "webkit40"}, true},
		{"Aster-1.2.3-linux-arm64-webkit41.deb", assetSpec{OS: "linux", Arch: "arm64", Kind: updater.KindDeb, Variant: "webkit41"}, true},
		{"Aster.exe", assetSpec{}, false},
		{"Aster-1.2.3-windows-386-setup.exe", assetSpec{}, false},
		{"Aster-1.2.3-linux-amd64.tar.gz", assetSpec{}, false},
	}
	for _, test := range tests {
		got, ok := classifyAsset(test.name)
		if ok != test.ok {
			t.Fatalf("%s: classified=%v, want %v", test.name, ok, test.ok)
		}
		if got != test.want {
			t.Errorf("%s: got %+v, want %+v", test.name, got, test.want)
		}
	}
}

func TestNormalizeVersion(t *testing.T) {
	tag, clean, err := normalizeVersion("v1.2.3")
	if err != nil {
		t.Fatal(err)
	}
	if tag != "v1.2.3" || clean != "1.2.3" {
		t.Fatalf("got %q %q", tag, clean)
	}
	if _, _, err := normalizeVersion("1.2"); err == nil {
		t.Fatal("expected an invalid version error")
	}
	if _, _, err := normalizeVersion(""); err == nil {
		t.Fatal("expected a missing version error")
	}
}

func TestBuildManifest(t *testing.T) {
	dir := t.TempDir()
	files := map[string]string{
		"Aster-1.2.3-windows-amd64-setup.exe":     "setup",
		"Aster-1.2.3-windows-amd64-portable.zip":  "portable",
		"Aster-1.2.3-darwin-universal.zip":        "mac",
		"Aster-1.2.3-linux-amd64-webkit41.tar.gz": "linux",
		"Aster-1.2.3-linux-amd64-webkit41.deb":    "deb",
	}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for _, meta := range []string{"latest.json", "SHA256SUMS.txt", "notes.txt.sig", "README.md"} {
		if err := os.WriteFile(filepath.Join(dir, meta), []byte("ignored"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	manifest, ignored, err := buildManifest(dir, "1.2.3", "https://example.test/releases/v1.2.3", "", "2026-01-02T03:04:05Z", "", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(ignored) != 1 || ignored[0] != "README.md" {
		t.Fatalf("ignored = %v", ignored)
	}
	if manifest.Version != "1.2.3" || manifest.Schema != updater.ManifestSchema {
		t.Fatalf("unexpected manifest header: %+v", manifest)
	}
	if len(manifest.Assets) != len(files) {
		t.Fatalf("got %d assets, want %d", len(manifest.Assets), len(files))
	}
	for _, asset := range manifest.Assets {
		body, ok := files[asset.Name]
		if !ok {
			t.Errorf("unexpected asset %q", asset.Name)
			continue
		}
		sum := sha256.Sum256([]byte(body))
		if asset.SHA256 != hex.EncodeToString(sum[:]) {
			t.Errorf("%s: sha256 = %q", asset.Name, asset.SHA256)
		}
		if asset.Size != int64(len(body)) {
			t.Errorf("%s: size = %d", asset.Name, asset.Size)
		}
		// Relative URLs resolve against the manifest's GitHub release asset
		// address, so they must stay plain escaped file names.
		if asset.URL != asset.Name {
			t.Errorf("%s: url = %q", asset.Name, asset.URL)
		}
	}
	if err := manifest.Validate(); err != nil {
		t.Fatal(err)
	}

	if _, _, err := buildManifest(dir, "1.2.3", "", "", "2026-01-02T03:04:05Z", "", false); err == nil {
		t.Fatal("expected an unknown asset error")
	}
}

func TestSignedManifestRoundTrip(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Aster-2.0.0-windows-amd64-setup.exe"), []byte("setup"), 0o644); err != nil {
		t.Fatal(err)
	}
	seed := make([]byte, ed25519.SeedSize)
	if _, err := rand.Read(seed); err != nil {
		t.Fatal(err)
	}
	private := base64.StdEncoding.EncodeToString(seed)
	public := base64.StdEncoding.EncodeToString(ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey))

	manifest, _, err := buildManifest(dir, "2.0.0", "https://example.test", "", "2026-01-02T03:04:05Z", "", true)
	if err != nil {
		t.Fatal(err)
	}
	if err := manifest.Sign(private); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "latest.json")
	if err := writeManifest(path, manifest); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := updater.ParseManifest(data)
	if err != nil {
		t.Fatal(err)
	}
	if err := parsed.Verify(public); err != nil {
		t.Fatalf("verify: %v", err)
	}
	parsed.Version = "2.0.1"
	if err := parsed.Verify(public); err == nil {
		t.Fatal("a changed version must invalidate the signature")
	}
}

func TestRunKeygenManifestVerify(t *testing.T) {
	dir := t.TempDir()
	assets := filepath.Join(dir, "dist")
	if err := os.MkdirAll(assets, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(assets, "Aster-1.4.0-windows-amd64-setup.exe"), []byte("setup"), 0o644); err != nil {
		t.Fatal(err)
	}

	keyPath := filepath.Join(dir, "update_signing_key")
	publicPath := filepath.Join(dir, "update_public_key.txt")
	var out strings.Builder
	if err := run([]string{"keygen", "-out", keyPath, "-public-out", publicPath}, &out, io.Discard); err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(out.String()) == "" {
		t.Fatal("keygen printed no public key")
	}

	manifestPath := filepath.Join(dir, "latest.json")
	out.Reset()
	if err := run([]string{"manifest", "-version", "v1.4.0", "-assets", assets, "-out", manifestPath, "-key", keyPath}, &out, io.Discard); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "1 assets, signed") {
		t.Fatalf("unexpected manifest output: %s", out.String())
	}

	out.Reset()
	if err := run([]string{"verify", "-manifest", manifestPath, "-key", publicPath}, &out, io.Discard); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "signature verified") {
		t.Fatalf("unexpected verify output: %s", out.String())
	}

	// The public key file written for the build is readable by the embedded
	// key loader: comments are ignored and a single key line remains.
	body, err := os.ReadFile(publicPath)
	if err != nil {
		t.Fatal(err)
	}
	var keyLine string
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			keyLine = line
		}
	}
	if keyLine == "" {
		t.Fatal("public key file has no key line")
	}
}
