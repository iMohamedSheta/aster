package updater

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Client fetches and verifies release manifests and assets.
type Client struct {
	ManifestURL  string
	PublicKey    string
	UserAgent    string
	manifestHTTP *http.Client
	downloadHTTP *http.Client
}

// CheckResult is a verified manifest plus the signature state.
type CheckResult struct {
	Manifest *Manifest
	Verified bool
}

// NewClient builds a client for one manifest URL. The public key may be empty
// in development builds; official releases embed one.
func NewClient(manifestURL, publicKey, version string) *Client {
	if strings.TrimSpace(manifestURL) == "" {
		manifestURL = DefaultManifestURL
	}
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ForceAttemptHTTP2:     true,
		TLSHandshakeTimeout:   15 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		IdleConnTimeout:       90 * time.Second,
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
	}
	redirects := func(req *http.Request, via []*http.Request) error {
		if len(via) >= 8 {
			return errors.New("too many redirects")
		}
		if req.URL.Scheme != "https" && !(req.URL.Scheme == "http" && isLocalHost(req.URL.Hostname())) {
			return fmt.Errorf("update redirect uses an insecure URL")
		}
		return nil
	}
	return &Client{
		ManifestURL: manifestURL,
		PublicKey:   strings.TrimSpace(publicKey),
		UserAgent:   "Aster-Updater/" + strings.TrimSpace(version),
		manifestHTTP: &http.Client{
			Transport:     transport,
			Timeout:       45 * time.Second,
			CheckRedirect: redirects,
		},
		downloadHTTP: &http.Client{
			Transport:     transport,
			CheckRedirect: redirects,
		},
	}
}

// Fetch downloads the manifest and verifies its signature when this build has
// a public key. An unsigned manifest is rejected by signed builds.
func (c *Client) Fetch(ctx context.Context) (*CheckResult, error) {
	if err := validateManifestURL(c.ManifestURL); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.ManifestURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build update request: %w", err)
	}
	req.Header.Set("User-Agent", c.UserAgent)
	req.Header.Set("Accept", "application/json")
	resp, err := c.manifestHTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("check for updates: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNoRelease
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("check for updates: update server returned %s", resp.Status)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, MaxManifestBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read update manifest: %w", err)
	}
	if len(data) > MaxManifestBytes {
		return nil, errors.New("update manifest is too large")
	}
	manifest, err := ParseManifest(data)
	if err != nil {
		return nil, err
	}
	verified := false
	if c.PublicKey != "" {
		if err := manifest.Verify(c.PublicKey); err != nil {
			return nil, err
		}
		verified = true
	}
	return &CheckResult{Manifest: manifest, Verified: verified}, nil
}

// Download fetches an asset into destDir, checking its exact size and SHA-256.
// An existing complete download is reused.
func (c *Client) Download(ctx context.Context, asset *Asset, destDir string, progress func(downloaded, total int64)) (string, error) {
	if asset == nil {
		return "", errors.New("no update asset selected")
	}
	if asset.Size <= 0 || asset.Size > MaxAssetBytes {
		return "", errors.New("update asset has an invalid size")
	}
	targetURL, err := ResolveAssetURL(c.ManifestURL, asset.URL)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(destDir, 0o700); err != nil {
		return "", fmt.Errorf("prepare update folder: %w", err)
	}
	target := filepath.Join(destDir, asset.Name)
	if fileMatches(target, asset) {
		if progress != nil {
			progress(asset.Size, asset.Size)
		}
		return target, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return "", fmt.Errorf("build download request: %w", err)
	}
	req.Header.Set("User-Agent", c.UserAgent)
	req.Header.Set("Accept", "application/octet-stream")
	resp, err := c.downloadHTTP.Do(req)
	if err != nil {
		return "", fmt.Errorf("download update: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download update: server returned %s", resp.Status)
	}

	part, err := os.CreateTemp(destDir, "."+asset.Name+".part-*")
	if err != nil {
		return "", fmt.Errorf("create update file: %w", err)
	}
	partPath := part.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = part.Close()
			_ = os.Remove(partPath)
		}
	}()
	_ = part.Chmod(0o600)

	hasher := sha256.New()
	counter := &progressWriter{writer: io.MultiWriter(part, hasher), progress: progress, total: asset.Size}
	limited := io.LimitReader(resp.Body, asset.Size+1)
	written, err := io.Copy(counter, limited)
	if err != nil {
		return "", fmt.Errorf("download update: %w", err)
	}
	if written != asset.Size {
		return "", fmt.Errorf("download update: expected %d bytes, received %d", asset.Size, written)
	}
	digest := hex.EncodeToString(hasher.Sum(nil))
	if !strings.EqualFold(digest, asset.SHA256) {
		return "", errors.New("downloaded update failed its SHA-256 check")
	}
	if err := part.Sync(); err != nil {
		return "", fmt.Errorf("save update file: %w", err)
	}
	if err := part.Close(); err != nil {
		return "", fmt.Errorf("save update file: %w", err)
	}
	_ = os.Remove(target)
	if err := os.Rename(partPath, target); err != nil {
		return "", fmt.Errorf("finish update download: %w", err)
	}
	cleanup = false
	if progress != nil {
		progress(asset.Size, asset.Size)
	}
	return target, nil
}

// ErrNoRelease means the repository has no published release yet.
var ErrNoRelease = errors.New("no published release was found")

func validateManifestURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("update URL: %w", err)
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && isLocalHost(u.Hostname())) {
		return errors.New("update manifest must use HTTPS")
	}
	if u.Host == "" {
		return errors.New("update manifest URL has no host")
	}
	return nil
}

func fileMatches(path string, asset *Asset) bool {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() != asset.Size {
		return false
	}
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	hasher := sha256.New()
	if _, err := io.Copy(hasher, f); err != nil {
		return false
	}
	return strings.EqualFold(hex.EncodeToString(hasher.Sum(nil)), asset.SHA256)
}

type progressWriter struct {
	writer   io.Writer
	progress func(downloaded, total int64)
	total    int64
	done     int64
}

func (w *progressWriter) Write(p []byte) (int, error) {
	n, err := w.writer.Write(p)
	w.done += int64(n)
	if w.progress != nil {
		w.progress(w.done, w.total)
	}
	return n, err
}
