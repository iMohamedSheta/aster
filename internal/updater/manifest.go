// Package updater implements Aster's GitHub-hosted desktop updates.
//
// A release publishes a small latest.json next to the installers. The app
// reads that manifest, compares versions, selects the asset built for this
// platform and verifies both the manifest signature (when the build carries
// an Ed25519 public key) and the SHA-256 of the downloaded file.
package updater

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

const (
	ManifestSchema = 1

	// DefaultManifestURL is the stable GitHub release asset. A release job
	// uploads latest.json beside theinstallers and GitHub resolves "latest"
	// to the newest non-prerelease release.
	DefaultManifestURL = "https://github.com/iMohamedSheta/aster/releases/latest/download/latest.json"

	// MaxManifestBytes bounds the update manifest itself.
	MaxManifestBytes = 1 << 20
	// MaxAssetBytes bounds an installer download. Aster's installers are
	// currently well under 100 MB; this leaves room for embedded runtimes.
	MaxAssetBytes = 512 << 20

	KindInstaller = "installer"
	KindPortable  = "portable"
	KindAppZip    = "appzip"
	KindDMG       = "dmg"
	KindTarGz     = "tarball"
	KindDeb       = "deb"
)

// Asset describes one downloadable release file.
type Asset struct {
	OS      string `json:"os"`
	Arch    string `json:"arch"`
	Kind    string `json:"kind"`
	Variant string `json:"variant,omitempty"`
	Name    string `json:"name"`
	URL     string `json:"url"`
	Size    int64  `json:"size"`
	SHA256  string `json:"sha256"`
}

// Manifest is the latest.json document.
type Manifest struct {
	Schema         int     `json:"schema"`
	Version        string  `json:"version"`
	PublishedAt    string  `json:"publishedAt,omitempty"`
	NotesURL       string  `json:"notesUrl,omitempty"`
	MinimumVersion string  `json:"minimumVersion,omitempty"`
	Assets         []Asset `json:"assets"`
	Signature      string  `json:"signature,omitempty"`
}

// signedManifest is the exact structure serialised for signing. Keep this in
// sync with Manifest fields; the signature covers everything except itself.
type signedManifest struct {
	Schema         int     `json:"schema"`
	Version        string  `json:"version"`
	PublishedAt    string  `json:"publishedAt,omitempty"`
	NotesURL       string  `json:"notesUrl,omitempty"`
	MinimumVersion string  `json:"minimumVersion,omitempty"`
	Assets         []Asset `json:"assets"`
}

// SigningBytes returns the canonical bytes covered by Signature.
func (m *Manifest) SigningBytes() ([]byte, error) {
	if m == nil {
		return nil, errors.New("empty manifest")
	}
	return json.Marshal(signedManifest{
		Schema:         m.Schema,
		Version:        m.Version,
		PublishedAt:    m.PublishedAt,
		NotesURL:       m.NotesURL,
		MinimumVersion: m.MinimumVersion,
		Assets:         m.Assets,
	})
}

// Sign adds an Ed25519 signature using a base64-encoded private key (64-byte
// private key or 32-byte seed).
func (m *Manifest) Sign(privateKeyBase64 string) error {
	key, err := decodePrivateKey(privateKeyBase64)
	if err != nil {
		return err
	}
	payload, err := m.SigningBytes()
	if err != nil {
		return err
	}
	m.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(key, payload))
	return nil
}

// Verify checks the manifest signature against a base64 Ed25519 public key.
func (m *Manifest) Verify(publicKeyBase64 string) error {
	if strings.TrimSpace(publicKeyBase64) == "" {
		return errors.New("no update public key configured in this build")
	}
	if strings.TrimSpace(m.Signature) == "" {
		return errors.New("update manifest is not signed")
	}
	publicKey, err := base64.StdEncoding.DecodeString(strings.TrimSpace(publicKeyBase64))
	if err != nil {
		return fmt.Errorf("decode update public key: %w", err)
	}
	if len(publicKey) != ed25519.PublicKeySize {
		return fmt.Errorf("update public key must be %d bytes", ed25519.PublicKeySize)
	}
	signature, err := base64.StdEncoding.DecodeString(strings.TrimSpace(m.Signature))
	if err != nil {
		return fmt.Errorf("decode update signature: %w", err)
	}
	if len(signature) != ed25519.SignatureSize {
		return fmt.Errorf("update signature must be %d bytes", ed25519.SignatureSize)
	}
	payload, err := m.SigningBytes()
	if err != nil {
		return err
	}
	if !ed25519.Verify(ed25519.PublicKey(publicKey), payload, signature) {
		return errors.New("update manifest signature is not valid")
	}
	return nil
}

func decodePrivateKey(value string) (ed25519.PrivateKey, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, errors.New("missing update signing key")
	}
	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("decode update signing key: %w", err)
	}
	switch len(raw) {
	case ed25519.PrivateKeySize:
		return ed25519.PrivateKey(raw), nil
	case ed25519.SeedSize:
		return ed25519.NewKeyFromSeed(raw), nil
	default:
		return nil, fmt.Errorf("update signing key must decode to %d or %d bytes", ed25519.SeedSize, ed25519.PrivateKeySize)
	}
}

// PublicKeyFromPrivate returns the base64 public key for a private key.
func PublicKeyFromPrivate(privateKeyBase64 string) (string, error) {
	key, err := decodePrivateKey(privateKeyBase64)
	if err != nil {
		return "", err
	}
	public := key.Public().(ed25519.PublicKey)
	return base64.StdEncoding.EncodeToString(public), nil
}

// ParseManifest decodes and validates a latest.json document.
func ParseManifest(data []byte) (*Manifest, error) {
	if len(data) == 0 {
		return nil, errors.New("empty update manifest")
	}
	if len(data) > MaxManifestBytes {
		return nil, errors.New("update manifest is too large")
	}
	var manifest Manifest
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&manifest); err != nil {
		return nil, fmt.Errorf("read update manifest: %w", err)
	}
	if err := manifest.Validate(); err != nil {
		return nil, err
	}
	return &manifest, nil
}

// Validate performs structural checks that must hold before an asset is used.
func (m *Manifest) Validate() error {
	if m == nil {
		return errors.New("empty update manifest")
	}
	if m.Schema != ManifestSchema {
		return fmt.Errorf("unsupported update manifest schema %d", m.Schema)
	}
	if _, err := ParseSemver(m.Version); err != nil {
		return fmt.Errorf("update version: %w", err)
	}
	if m.MinimumVersion != "" {
		if _, err := ParseSemver(m.MinimumVersion); err != nil {
			return fmt.Errorf("minimum version: %w", err)
		}
	}
	if len(m.Assets) == 0 {
		return errors.New("update manifest lists no assets")
	}
	seen := map[string]bool{}
	for i, asset := range m.Assets {
		if strings.TrimSpace(asset.Name) == "" {
			return fmt.Errorf("asset %d has no name", i)
		}
		if asset.Name != assetBaseName(asset.Name) || asset.Name == "." || asset.Name == ".." {
			return fmt.Errorf("asset %q must be a plain file name", asset.Name)
		}
		if seen[asset.Name] {
			return fmt.Errorf("asset %q is listed twice", asset.Name)
		}
		seen[asset.Name] = true
		if strings.TrimSpace(asset.URL) == "" {
			return fmt.Errorf("asset %q has no URL", asset.Name)
		}
		if asset.Size <= 0 || asset.Size > MaxAssetBytes {
			return fmt.Errorf("asset %q has an invalid size", asset.Name)
		}
		digest := strings.ToLower(strings.TrimSpace(asset.SHA256))
		if len(digest) != sha256.Size*2 {
			return fmt.Errorf("asset %q has an invalid SHA-256", asset.Name)
		}
		if _, err := hex.DecodeString(digest); err != nil {
			return fmt.Errorf("asset %q has an invalid SHA-256", asset.Name)
		}
		if strings.TrimSpace(asset.OS) == "" || strings.TrimSpace(asset.Arch) == "" {
			return fmt.Errorf("asset %q is missing os or arch", asset.Name)
		}
		if !validKind(asset.Kind) {
			return fmt.Errorf("asset %q has an unsupported kind %q", asset.Name, asset.Kind)
		}
	}
	return nil
}

func validKind(kind string) bool {
	switch kind {
	case KindInstaller, KindPortable, KindAppZip, KindDMG, KindTarGz, KindDeb:
		return true
	default:
		return false
	}
}

func assetBaseName(name string) string {
	name = strings.ReplaceAll(name, "\\", "/")
	parts := strings.Split(name, "/")
	return parts[len(parts)-1]
}

// Platform describes the running install and therefore which asset applies.
type Platform struct {
	OS      string // runtime.GOOS values: windows, darwin, linux
	Arch    string
	Package string // windows: installer|portable; linux: deb|tarball; darwin: appzip
	WebKit  string // Linux only: "40" or "41"
}

// SelectAsset chooses the best asset for a platform.
func SelectAsset(manifest *Manifest, platform Platform) (*Asset, error) {
	if manifest == nil {
		return nil, errors.New("no update manifest")
	}
	osName := normalizeOS(platform.OS)
	arch := normalizeArch(platform.Arch)
	type ranked struct {
		asset *Asset
		rank  int
	}
	var matches []ranked
	for i := range manifest.Assets {
		asset := &manifest.Assets[i]
		if normalizeOS(asset.OS) != osName {
			continue
		}
		if !archMatches(asset.Arch, arch) {
			continue
		}
		rank := kindRank(osName, asset.Kind, platform.Package)
		if rank < 0 {
			continue
		}
		if osName == "linux" {
			rank += linuxVariantRank(asset, platform)
		}
		matches = append(matches, ranked{asset: asset, rank: rank})
	}
	if len(matches) == 0 {
		return nil, fmt.Errorf("no update package is available for %s/%s", osName, arch)
	}
	sort.SliceStable(matches, func(i, j int) bool {
		if matches[i].rank == matches[j].rank {
			return matches[i].asset.Name < matches[j].asset.Name
		}
		return matches[i].rank > matches[j].rank
	})
	return matches[0].asset, nil
}

func normalizeOS(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "macos", "mac", "osx", "darwin":
		return "darwin"
	case "win", "win32", "windows":
		return "windows"
	case "linux":
		return "linux"
	default:
		return strings.ToLower(strings.TrimSpace(value))
	}
}

func normalizeArch(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "x86_64", "x64", "amd64":
		return "amd64"
	case "aarch64", "arm64":
		return "arm64"
	case "universal", "all":
		return "universal"
	default:
		return strings.ToLower(strings.TrimSpace(value))
	}
}

func archMatches(assetArch, runningArch string) bool {
	assetArch = normalizeArch(assetArch)
	return assetArch == "universal" || assetArch == runningArch
}

// Higher ranks win. Installers are preferred on Windows because they register
// an uninstaller and update the installed copy in place.
func kindRank(osName, kind, packageType string) int {
	switch osName {
	case "windows":
		switch kind {
		case KindInstaller:
			if packageType == KindPortable {
				return 80
			}
			return 100
		case KindPortable:
			if packageType == KindPortable {
				return 100
			}
			return 80
		}
	case "darwin":
		switch kind {
		case KindAppZip:
			return 100
		case KindDMG:
			return 50
		}
	case "linux":
		switch kind {
		case KindDeb:
			if packageType == "deb" {
				return 100
			}
			return 50
		case KindTarGz:
			if packageType == "deb" {
				return 40
			}
			return 100
		}
	}
	return -1
}

func linuxVariantRank(asset *Asset, platform Platform) int {
	variant := strings.ToLower(strings.TrimSpace(asset.Variant))
	if variant == "" {
		return 0
	}
	want := strings.TrimSpace(platform.WebKit)
	if want == "" {
		// A binary built without an explicit WebKit marker is safest with the
		// oldest supported ABI, matching the default Wails Linux build.
		want = "40"
	}
	if variant == "webkit"+want || variant == want {
		return 20
	}
	return -20
}

// ResolveAssetURL resolves relative asset URLs against the manifest URL.
func ResolveAssetURL(manifestURL, assetURL string) (string, error) {
	base, err := url.Parse(manifestURL)
	if err != nil {
		return "", fmt.Errorf("update URL: %w", err)
	}
	ref, err := url.Parse(strings.TrimSpace(assetURL))
	if err != nil {
		return "", fmt.Errorf("asset URL: %w", err)
	}
	resolved := base.ResolveReference(ref)
	if resolved.Scheme != "https" && !(resolved.Scheme == "http" && isLocalHost(resolved.Hostname())) {
		return "", fmt.Errorf("update URLs must use HTTPS")
	}
	return resolved.String(), nil
}

func isLocalHost(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

// ---- Semantic versions ---------------------------------------------------

// Semver is a parsed semantic version. Build metadata is kept but ignored in
// comparisons, as the specification requires.
type Semver struct {
	Major int
	Minor int
	Patch int
	Pre   []string
	Build string
}

func (v Semver) String() string {
	out := fmt.Sprintf("%d.%d.%d", v.Major, v.Minor, v.Patch)
	if len(v.Pre) > 0 {
		out += "-" + strings.Join(v.Pre, ".")
	}
	if v.Build != "" {
		out += "+" + v.Build
	}
	return out
}

// ParseSemver parses versions with an optional leading v.
func ParseSemver(value string) (Semver, error) {
	raw := strings.TrimSpace(value)
	if strings.HasPrefix(raw, "v") || strings.HasPrefix(raw, "V") {
		raw = raw[1:]
	}
	if raw == "" {
		return Semver{}, errors.New("empty version")
	}
	var build string
	if i := strings.Index(raw, "+"); i >= 0 {
		build = raw[i+1:]
		raw = raw[:i]
		if build == "" {
			return Semver{}, errors.New("empty build metadata")
		}
	}
	var pre []string
	if i := strings.Index(raw, "-"); i >= 0 {
		preRaw := raw[i+1:]
		raw = raw[:i]
		if preRaw == "" {
			return Semver{}, errors.New("empty prerelease")
		}
		for _, id := range strings.Split(preRaw, ".") {
			if id == "" {
				return Semver{}, errors.New("empty prerelease identifier")
			}
			pre = append(pre, id)
		}
	}
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return Semver{}, fmt.Errorf("version %q must have three parts", value)
	}
	numbers := make([]int, 3)
	for i, part := range parts {
		if part == "" {
			return Semver{}, fmt.Errorf("version %q has an empty part", value)
		}
		if len(part) > 1 && part[0] == '0' {
			return Semver{}, fmt.Errorf("version %q has a leading zero", value)
		}
		n, err := strconv.Atoi(part)
		if err != nil || n < 0 {
			return Semver{}, fmt.Errorf("version %q is not numeric", value)
		}
		numbers[i] = n
	}
	return Semver{Major: numbers[0], Minor: numbers[1], Patch: numbers[2], Pre: pre, Build: build}, nil
}

// CompareSemver returns -1, 0 or 1.
func CompareSemver(a, b string) (int, error) {
	left, err := ParseSemver(a)
	if err != nil {
		return 0, err
	}
	right, err := ParseSemver(b)
	if err != nil {
		return 0, err
	}
	return left.Compare(right), nil
}

// Compare follows the SemVer precedence rules.
func (v Semver) Compare(other Semver) int {
	if c := compareInt(v.Major, other.Major); c != 0 {
		return c
	}
	if c := compareInt(v.Minor, other.Minor); c != 0 {
		return c
	}
	if c := compareInt(v.Patch, other.Patch); c != 0 {
		return c
	}
	if len(v.Pre) == 0 && len(other.Pre) == 0 {
		return 0
	}
	if len(v.Pre) == 0 {
		return 1
	}
	if len(other.Pre) == 0 {
		return -1
	}
	for i := 0; i < len(v.Pre) && i < len(other.Pre); i++ {
		if c := comparePrerelease(v.Pre[i], other.Pre[i]); c != 0 {
			return c
		}
	}
	return compareInt(len(v.Pre), len(other.Pre))
}

func compareInt(a, b int) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	default:
		return 0
	}
}

func comparePrerelease(a, b string) int {
	an, aerr := strconv.Atoi(a)
	bn, berr := strconv.Atoi(b)
	switch {
	case aerr == nil && berr == nil:
		return compareInt(an, bn)
	case aerr == nil:
		return -1 // numeric identifiers have lower precedence
	case berr == nil:
		return 1
	default:
		return strings.Compare(a, b)
	}
}

// CurrentPlatform describes the running application. Package detection is
// filled in by platform-specific files.
func CurrentPlatform() Platform {
	return Platform{
		OS:   runtime.GOOS,
		Arch: runtime.GOARCH,
	}
}
