package updater

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"aster/internal/config"
)

const (
	StatusIdle        = "idle"
	StatusChecking    = "checking"
	StatusAvailable   = "available"
	StatusDownloading = "downloading"
	StatusReady       = "ready"
	StatusInstalling  = "installing"
	StatusUpToDate    = "up-to-date"
	StatusError       = "error"
	StatusUnsupported = "unsupported"
)

// State is the complete update snapshot sent to the interface.
type State struct {
	Status          string `json:"status"`
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion"`
	NotesURL        string `json:"notesUrl"`
	PublishedAt     string `json:"publishedAt"`
	AssetName       string `json:"assetName"`
	AssetSize       int64  `json:"assetSize"`
	Downloaded      int64  `json:"downloaded"`
	Progress        int    `json:"progress"`
	Message         string `json:"message"`
	Error           string `json:"error"`
	CheckedAt       string `json:"checkedAt"`
	AutoCheck       bool   `json:"autoCheck"`
	Skipped         bool   `json:"skipped"`
	Verified        bool   `json:"verified"`
	JustUpdatedFrom string `json:"justUpdatedFrom"`
	Platform        string `json:"platform"`
}

// Options configures a Manager.
type Options struct {
	CurrentVersion string
	DataDir        string
	Config         *config.Config
	ManifestURL    string
	PublicKey      string
	LinuxWebKit    string
	OnState        func(State)
	Quit           func()
}

// Manager owns one check/download/install cycle at a time.
type Manager struct {
	mu       sync.Mutex
	opts     Options
	client   *Client
	platform Platform
	state    State

	manifest *Manifest
	asset    *Asset
	archive  string

	checking    bool
	downloading bool
	installing  bool

	stop     chan struct{}
	stopOnce sync.Once
}

// NewManager prepares the updater but does not start its background timer.
func NewManager(opts Options) *Manager {
	if strings.TrimSpace(opts.ManifestURL) == "" {
		opts.ManifestURL = os.Getenv("ASTER_UPDATE_MANIFEST")
	}
	if strings.TrimSpace(opts.ManifestURL) == "" {
		opts.ManifestURL = DefaultManifestURL
	}
	platform := detectPlatform(opts.LinuxWebKit)
	autoCheck := true
	checkedAt := ""
	if opts.Config != nil {
		autoCheck = !opts.Config.DisableUpdateCheck
		checkedAt = opts.Config.LastUpdateCheck
	}
	manager := &Manager{
		opts:     opts,
		client:   NewClient(opts.ManifestURL, opts.PublicKey, opts.CurrentVersion),
		platform: platform,
		stop:     make(chan struct{}),
	}
	manager.state = State{
		Status:          StatusIdle,
		CurrentVersion:  opts.CurrentVersion,
		CheckedAt:       checkedAt,
		AutoCheck:       autoCheck,
		Platform:        platform.OS + "/" + platform.Arch,
		JustUpdatedFrom: appliedFrom(opts.DataDir, opts.CurrentVersion),
	}
	// Old downloads are safe to remove once they are a week old; keep the
	// current release and the freshly applied one.
	pruneUpdates(opts.DataDir,
		filepath.Base(updateDir(opts.DataDir, opts.CurrentVersion)),
		filepath.Base(updateDir(opts.DataDir, manager.state.JustUpdatedFrom)))
	return manager
}

// State returns a copy safe for the bridge to serialise.
func (m *Manager) State() State {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state
}

func (m *Manager) setState(fn func(*State)) {
	m.mu.Lock()
	fn(&m.state)
	snapshot := m.state
	callback := m.opts.OnState
	m.mu.Unlock()
	if callback != nil {
		callback(snapshot)
	}
}

// Start begins the background check. It checks shortly after launch and then
// every six hours while the app stays open.
func (m *Manager) Start(ctx context.Context) {
	go func() {
		timer := time.NewTimer(15 * time.Second)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-m.stop:
				return
			case <-timer.C:
				if m.autoEnabled() {
					_, _ = m.Check(ctx, false)
				}
				timer.Reset(6 * time.Hour)
			}
		}
	}()
}

// Stop ends the background timer.
func (m *Manager) Stop() {
	m.stopOnce.Do(func() { close(m.stop) })
}

func (m *Manager) autoEnabled() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state.AutoCheck
}

// Check fetches the manifest and selects an asset. Manual checks surface
// offline/server errors; automatic checks stay quiet.
func (m *Manager) Check(ctx context.Context, manual bool) (State, error) {
	m.mu.Lock()
	if m.checking || m.downloading || m.installing {
		state := m.state
		m.mu.Unlock()
		if manual {
			return state, errors.New("an update is already in progress")
		}
		return state, nil
	}
	m.checking = true
	m.state.Status = StatusChecking
	m.state.Error = ""
	m.mu.Unlock()
	m.emit()
	defer func() {
		m.mu.Lock()
		m.checking = false
		m.mu.Unlock()
	}()

	result, err := m.client.Fetch(ctx)
	if err != nil {
		m.recordCheck()
		message := humanError(err)
		if manual {
			m.setState(func(s *State) {
				s.Status = StatusError
				s.Error = message
			})
			return m.State(), err
		}
		m.setState(func(s *State) {
			s.Status = StatusIdle
			if !errors.Is(err, ErrNoRelease) {
				s.Error = message
			}
		})
		return m.State(), err
	}

	manifest := result.Manifest
	cmp, err := CompareSemver(manifest.Version, m.opts.CurrentVersion)
	if err != nil {
		message := "The published update version is not valid."
		m.setState(func(s *State) {
			s.Status = StatusError
			s.Error = message
		})
		return m.State(), errors.New(message)
	}
	m.recordCheck()
	if cmp <= 0 {
		m.setState(func(s *State) {
			s.Status = StatusUpToDate
			s.LatestVersion = manifest.Version
			s.NotesURL = manifest.NotesURL
			s.PublishedAt = manifest.PublishedAt
			s.AssetName = ""
			s.AssetSize = 0
			s.Downloaded = 0
			s.Progress = 0
			s.Skipped = false
			s.Verified = result.Verified
			s.Error = ""
		})
		return m.State(), nil
	}

	asset, err := SelectAsset(manifest, m.platform)
	if err != nil {
		m.setState(func(s *State) {
			s.Status = StatusUnsupported
			s.LatestVersion = manifest.Version
			s.NotesURL = manifest.NotesURL
			s.PublishedAt = manifest.PublishedAt
			s.Verified = result.Verified
			s.Error = err.Error()
		})
		return m.State(), err
	}

	skipped := false
	if m.opts.Config != nil && strings.TrimSpace(m.opts.Config.SkippedUpdate) == manifest.Version {
		skipped = true
	}
	m.mu.Lock()
	m.manifest = manifest
	m.asset = asset
	m.archive = ""
	m.mu.Unlock()
	m.setState(func(s *State) {
		s.Status = StatusAvailable
		s.LatestVersion = manifest.Version
		s.NotesURL = manifest.NotesURL
		s.PublishedAt = manifest.PublishedAt
		s.AssetName = asset.Name
		s.AssetSize = asset.Size
		s.Downloaded = 0
		s.Progress = 0
		s.Skipped = skipped
		s.Verified = result.Verified
		s.Error = ""
	})
	return m.State(), nil
}

// Download fetches the selected asset. Progress events are throttled so a
// large installer does not flood the Wails event bridge.
func (m *Manager) Download(ctx context.Context) (State, error) {
	m.mu.Lock()
	if m.downloading || m.installing {
		state := m.state
		m.mu.Unlock()
		return state, errors.New("an update is already in progress")
	}
	if m.manifest == nil || m.asset == nil {
		state := m.state
		m.mu.Unlock()
		return state, errors.New("check for updates first")
	}
	if m.archive != "" {
		state := m.state
		m.mu.Unlock()
		return state, nil
	}
	manifest, asset := m.manifest, m.asset
	version := manifest.Version
	m.downloading = true
	m.state.Status = StatusDownloading
	m.state.Downloaded = 0
	m.state.Progress = 0
	m.state.Error = ""
	m.mu.Unlock()
	m.emit()

	last := time.Time{}
	archive, err := m.client.Download(ctx, asset, updateDir(m.opts.DataDir, version), func(done, total int64) {
		now := time.Now()
		if done < total && now.Sub(last) < 150*time.Millisecond {
			return
		}
		last = now
		pct := 0
		if total > 0 {
			pct = int(done * 100 / total)
			if pct > 100 {
				pct = 100
			}
		}
		m.setState(func(s *State) {
			s.Status = StatusDownloading
			s.Downloaded = done
			s.AssetSize = total
			s.Progress = pct
		})
	})
	m.mu.Lock()
	m.downloading = false
	if err != nil {
		m.mu.Unlock()
		m.setState(func(s *State) {
			s.Status = StatusAvailable
			s.Error = humanError(err)
		})
		return m.State(), err
	}
	m.archive = archive
	m.mu.Unlock()
	m.setState(func(s *State) {
		s.Status = StatusReady
		s.Downloaded = asset.Size
		s.AssetSize = asset.Size
		s.Progress = 100
		s.Error = ""
		s.Message = ""
	})
	return m.State(), nil
}

// Install starts the platform helper. On success the app quits shortly after
// this method returns, and the helper relaunches the new version.
func (m *Manager) Install() (State, error) {
	m.mu.Lock()
	if m.installing || m.downloading {
		state := m.state
		m.mu.Unlock()
		return state, errors.New("an update is already in progress")
	}
	if m.archive == "" || m.manifest == nil || m.asset == nil {
		state := m.state
		m.mu.Unlock()
		return state, errors.New("download the update first")
	}
	manifest, asset, archive := m.manifest, m.asset, m.archive
	m.installing = true
	m.state.Status = StatusInstalling
	m.state.Error = ""
	m.mu.Unlock()
	m.emit()

	err := installUpdate(InstallInput{
		Platform:       m.platform,
		DataDir:        m.opts.DataDir,
		Manifest:       manifest,
		Asset:          asset,
		Archive:        archive,
		CurrentVersion: m.opts.CurrentVersion,
		TargetVersion:  manifest.Version,
	})
	if err != nil {
		m.mu.Lock()
		m.installing = false
		m.mu.Unlock()
		m.setState(func(s *State) {
			s.Status = StatusReady
			s.Error = humanError(err)
		})
		return m.State(), err
	}
	if err := writeAppliedMarker(m.opts.DataDir, m.opts.CurrentVersion, manifest.Version); err != nil {
		m.setState(func(s *State) { s.Message = "The update is installing, but its completion note could not be saved." })
	}
	m.setState(func(s *State) {
		s.Status = StatusInstalling
		s.Message = "Aster will close and reopen to finish the update."
	})
	if quit := m.opts.Quit; quit != nil {
		time.AfterFunc(900*time.Millisecond, quit)
	}
	return m.State(), nil
}

// SetAutoCheck persists the device preference.
func (m *Manager) SetAutoCheck(enabled bool) (State, error) {
	if m.opts.Config != nil {
		m.opts.Config.DisableUpdateCheck = !enabled
		if err := m.opts.Config.Save(); err != nil {
			return m.State(), err
		}
	}
	m.setState(func(s *State) { s.AutoCheck = enabled })
	return m.State(), nil
}

// SkipVersion hides an available release until the person checks manually.
func (m *Manager) SkipVersion(version string) (State, error) {
	version = strings.TrimSpace(version)
	if m.opts.Config != nil {
		m.opts.Config.SkippedUpdate = version
		if err := m.opts.Config.Save(); err != nil {
			return m.State(), err
		}
	}
	m.setState(func(s *State) { s.Skipped = version != "" && s.LatestVersion == version })
	return m.State(), nil
}

// ClearSkippedVersion lets a skipped release appear again.
func (m *Manager) ClearSkippedVersion() (State, error) {
	if m.opts.Config != nil {
		m.opts.Config.SkippedUpdate = ""
		if err := m.opts.Config.Save(); err != nil {
			return m.State(), err
		}
	}
	m.setState(func(s *State) { s.Skipped = false })
	return m.State(), nil
}

func (m *Manager) recordCheck() {
	now := time.Now().UTC().Format(time.RFC3339)
	m.setState(func(s *State) { s.CheckedAt = now })
	if m.opts.Config != nil {
		m.opts.Config.LastUpdateCheck = now
		_ = m.opts.Config.Save()
	}
}

func (m *Manager) emit() {
	m.mu.Lock()
	snapshot := m.state
	callback := m.opts.OnState
	m.mu.Unlock()
	if callback != nil {
		callback(snapshot)
	}
}

func humanError(err error) string {
	if err == nil {
		return ""
	}
	switch {
	case errors.Is(err, ErrNoRelease):
		return "No published release is available yet."
	case errors.Is(err, context.DeadlineExceeded):
		return "The update server took too long to answer."
	case errors.Is(err, context.Canceled):
		return "The update was cancelled."
	default:
		return fmt.Sprint(err)
	}
}
