package updater

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"strings"
	"testing"
)

func TestCompareSemver(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"1.0.0", "1.0.0", 0},
		{"v1.0.1", "1.0.0", 1},
		{"1.0.0", "1.0.0-beta.2", 1},
		{"1.0.0-beta.2", "1.0.0-beta.1", 1},
		{"1.0.0-beta.10", "1.0.0-beta.2", 1},
		{"1.0.0-alpha", "1.0.0-alpha.1", -1},
		{"1.0.0+build.1", "1.0.0+build.2", 0},
	}
	for _, tc := range cases {
		got, err := CompareSemver(tc.a, tc.b)
		if err != nil {
			t.Fatalf("compare %s %s: %v", tc.a, tc.b, err)
		}
		if got != tc.want {
			t.Errorf("compare %s %s = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
	for _, invalid := range []string{"", "1.2", "1.2.3.4", "01.2.3", "1.2.x", "1.2.3-"} {
		if _, err := ParseSemver(invalid); err == nil {
			t.Errorf("expected %q to be rejected", invalid)
		}
	}
}

func testManifest(assets ...Asset) *Manifest {
	if len(assets) == 0 {
		assets = []Asset{{
			OS: "windows", Arch: "amd64", Kind: KindInstaller,
			Name: "Aster-1.1.0-windows-amd64-setup.exe", URL: "https://example.com/setup.exe",
			Size: 100, SHA256: strings.Repeat("a", 64),
		}}
	}
	return &Manifest{
		Schema: ManifestSchema, Version: "1.1.0", PublishedAt: "2026-11-19T10:00:00Z",
		NotesURL: "https://example.com/notes", Assets: assets,
	}
}

func TestManifestSignAndVerify(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	manifest := testManifest()
	if err := manifest.Sign(base64.StdEncoding.EncodeToString(private)); err != nil {
		t.Fatal(err)
	}
	if err := manifest.Verify(base64.StdEncoding.EncodeToString(public)); err != nil {
		t.Fatalf("verify: %v", err)
	}
	manifest.Assets[0].SHA256 = strings.Repeat("b", 64)
	if err := manifest.Verify(base64.StdEncoding.EncodeToString(public)); err == nil {
		t.Fatal("tampered manifest passed signature verification")
	}
	if err := manifest.Verify(""); err == nil {
		t.Fatal("empty public key should not verify")
	}
}

func TestSelectAsset(t *testing.T) {
	assets := []Asset{
		{OS: "windows", Arch: "amd64", Kind: KindInstaller, Name: "setup.exe", URL: "https://e/x", Size: 1, SHA256: strings.Repeat("a", 64)},
		{OS: "windows", Arch: "amd64", Kind: KindPortable, Name: "portable.zip", URL: "https://e/x", Size: 1, SHA256: strings.Repeat("a", 64)},
		{OS: "darwin", Arch: "universal", Kind: KindAppZip, Name: "mac.zip", URL: "https://e/x", Size: 1, SHA256: strings.Repeat("a", 64)},
		{OS: "linux", Arch: "amd64", Kind: KindTarGz, Variant: "webkit40", Name: "linux40.tar.gz", URL: "https://e/x", Size: 1, SHA256: strings.Repeat("a", 64)},
		{OS: "linux", Arch: "amd64", Kind: KindTarGz, Variant: "webkit41", Name: "linux41.tar.gz", URL: "https://e/x", Size: 1, SHA256: strings.Repeat("a", 64)},
		{OS: "linux", Arch: "amd64", Kind: KindDeb, Variant: "webkit41", Name: "aster.deb", URL: "https://e/x", Size: 1, SHA256: strings.Repeat("a", 64)},
	}
	manifest := testManifest(assets...)

	win, err := SelectAsset(manifest, Platform{OS: "windows", Arch: "amd64", Package: KindInstaller})
	if err != nil || win.Kind != KindInstaller {
		t.Fatalf("windows installer: %v %v", win, err)
	}
	portable, err := SelectAsset(manifest, Platform{OS: "windows", Arch: "amd64", Package: KindPortable})
	if err != nil || portable.Kind != KindPortable {
		t.Fatalf("windows portable: %v %v", portable, err)
	}
	mac, err := SelectAsset(manifest, Platform{OS: "darwin", Arch: "arm64"})
	if err != nil || mac.Kind != KindAppZip {
		t.Fatalf("mac universal: %v %v", mac, err)
	}
	linux40, err := SelectAsset(manifest, Platform{OS: "linux", Arch: "amd64", Package: KindTarGz, WebKit: "40"})
	if err != nil || linux40.Name != "linux40.tar.gz" {
		t.Fatalf("linux 4.0: %v %v", linux40, err)
	}
	deb, err := SelectAsset(manifest, Platform{OS: "linux", Arch: "amd64", Package: KindDeb, WebKit: "41"})
	if err != nil || deb.Kind != KindDeb {
		t.Fatalf("linux deb: %v %v", deb, err)
	}
}

func TestManifestValidationRejectsUnsafeNames(t *testing.T) {
	manifest := testManifest(Asset{
		OS: "windows", Arch: "amd64", Kind: KindInstaller,
		Name: "../setup.exe", URL: "https://example.com/x", Size: 10, SHA256: strings.Repeat("a", 64),
	})
	if err := manifest.Validate(); err == nil {
		t.Fatal("expected traversal name to be rejected")
	}
}

func TestResolveAssetURL(t *testing.T) {
	got, err := ResolveAssetURL("https://github.com/o/r/releases/latest/download/latest.json", "Aster.exe")
	if err != nil || got != "https://github.com/o/r/releases/latest/download/Aster.exe" {
		t.Fatalf("resolve: %q %v", got, err)
	}
	if _, err := ResolveAssetURL("http://example.com/latest.json", "Aster.exe"); err == nil {
		t.Fatal("remote plain HTTP should be rejected")
	}
}
