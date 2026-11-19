package updater

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"aster/internal/config"
)

func TestClientFetchAndDownload(t *testing.T) {
	payload := []byte("installer bytes")
	sum := sha256.Sum256(payload)
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	var serverURL string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/latest.json":
			manifest := testManifest(Asset{
				OS: "windows", Arch: "amd64", Kind: KindInstaller,
				Name: "Aster-1.1.0-windows-amd64-setup.exe", URL: serverURL + "/setup.exe",
				Size: int64(len(payload)), SHA256: hex.EncodeToString(sum[:]),
			})
			if err := manifest.Sign(base64.StdEncoding.EncodeToString(private)); err != nil {
				t.Error(err)
				return
			}
			_ = json.NewEncoder(w).Encode(manifest)
		case "/setup.exe":
			_, _ = w.Write(payload)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	serverURL = server.URL

	client := NewClient(server.URL+"/latest.json", base64.StdEncoding.EncodeToString(public), "0.9.0")
	result, err := client.Fetch(context.Background())
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if !result.Verified || result.Manifest.Version != "1.1.0" {
		t.Fatalf("unexpected result: %+v", result)
	}
	asset := result.Manifest.Assets[0]
	dir := t.TempDir()
	var progress int64
	path, err := client.Download(context.Background(), &asset, dir, func(done, total int64) {
		progress = done
	})
	if err != nil {
		t.Fatalf("download: %v", err)
	}
	if progress != int64(len(payload)) {
		t.Fatalf("progress = %d", progress)
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != string(payload) {
		t.Fatalf("downloaded file: %q %v", got, err)
	}
	// A second download is served from the verified cache.
	if _, err := client.Download(context.Background(), &asset, dir, nil); err != nil {
		t.Fatalf("cached download: %v", err)
	}
}

func TestClientRejectsUnsignedManifestWhenKeyConfigured(t *testing.T) {
	public, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	manifest := testManifest()
	data, _ := json.Marshal(manifest)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(data)
	}))
	defer server.Close()
	client := NewClient(server.URL, base64.StdEncoding.EncodeToString(public), "0.9.0")
	if _, err := client.Fetch(context.Background()); err == nil {
		t.Fatal("unsigned manifest should be rejected")
	}
}

func TestManagerCheckSkipAndState(t *testing.T) {
	var serverURL string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(testManifest(platformTestAsset(serverURL)))
	}))
	defer server.Close()
	serverURL = server.URL

	dir := t.TempDir()
	cfg, err := config.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	var states []State
	manager := NewManager(Options{
		CurrentVersion: "1.0.0",
		DataDir:        dir,
		Config:         cfg,
		ManifestURL:    server.URL,
		OnState:        func(s State) { states = append(states, s) },
	})
	state, err := manager.Check(context.Background(), true)
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if state.Status != StatusAvailable || state.LatestVersion != "1.1.0" {
		t.Fatalf("state: %+v", state)
	}
	if len(states) == 0 || states[len(states)-1].Status != StatusAvailable {
		t.Fatalf("expected state events, got %d", len(states))
	}
	state, err = manager.SkipVersion("1.1.0")
	if err != nil || !state.Skipped {
		t.Fatalf("skip: %+v %v", state, err)
	}
	state, err = manager.SetAutoCheck(false)
	if err != nil || state.AutoCheck {
		t.Fatalf("auto check: %+v %v", state, err)
	}
	if cfg.LastUpdateCheck == "" {
		t.Fatal("last check time was not persisted")
	}
}

func TestAppliedMarker(t *testing.T) {
	dir := t.TempDir()
	if err := writeAppliedMarker(dir, "1.0.0", "1.1.0"); err != nil {
		t.Fatal(err)
	}
	if got := appliedFrom(dir, "1.1.0"); got != "1.0.0" {
		t.Fatalf("appliedFrom = %q", got)
	}
	if got := appliedFrom(dir, "1.2.0"); got != "" {
		t.Fatalf("stale marker = %q", got)
	}
}

func TestManagerUpToDateQuiet(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(testManifest())
	}))
	defer server.Close()
	manager := NewManager(Options{
		CurrentVersion: "1.1.0",
		DataDir:        t.TempDir(),
		ManifestURL:    server.URL,
	})
	state, err := manager.Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if state.Status != StatusUpToDate || state.Error != "" {
		t.Fatalf("state: %+v", state)
	}
}

func TestHumanErrorNoRelease(t *testing.T) {
	if got := humanError(ErrNoRelease); !strings.Contains(got, "No published") {
		t.Fatalf("humanError = %q", got)
	}
	if got := humanError(context.DeadlineExceeded); !strings.Contains(got, "too long") {
		t.Fatalf("humanError deadline = %q", got)
	}
}

func TestUpdateDirIsVersioned(t *testing.T) {
	dir := t.TempDir()
	got := updateDir(dir, "v1.2.3")
	if filepath.Base(got) != "v1.2.3" {
		t.Fatalf("updateDir = %q", got)
	}
}

func platformTestAsset(base string) Asset {
	asset := Asset{Arch: "amd64", Size: 10, SHA256: strings.Repeat("a", 64), URL: base + "/asset"}
	switch runtime.GOOS {
	case "windows":
		asset.OS, asset.Kind, asset.Name = "windows", KindInstaller, "Aster-1.1.0-windows-amd64-setup.exe"
	case "darwin":
		asset.OS, asset.Arch, asset.Kind, asset.Name = "darwin", "universal", KindAppZip, "Aster-1.1.0-macos-universal.zip"
	case "linux":
		asset.OS, asset.Kind, asset.Name = "linux", KindTarGz, "Aster-1.1.0-linux-amd64-webkit41.tar.gz"
		asset.Variant = "webkit41"
	default:
		asset.OS, asset.Kind, asset.Name = runtime.GOOS, KindTarGz, "Aster-1.1.0-unknown.tar.gz"
	}
	return asset
}
