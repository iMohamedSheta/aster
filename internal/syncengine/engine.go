// Package syncengine is the client side of Aster's replication protocol. It is
// transport-thin: the same code syncs with a LAN host or a cloud workspace.
package syncengine

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"aster/internal/store"
)

type State string

const (
	StateLocal   State = "local"
	StateOffline State = "offline"
	StateSyncing State = "syncing"
	StateSynced  State = "synced"
	StateError   State = "error"
)

type Status struct {
	Mode        string `json:"mode"`
	State       string `json:"state"`
	ServerURL   string `json:"serverUrl"`
	Workspace   string `json:"workspace"`
	DeviceName  string `json:"deviceName"`
	LastSyncAt  string `json:"lastSyncAt"`
	Pending     int    `json:"pending"`
	Cursor      int64  `json:"cursor"`
	Conflicts   int    `json:"conflicts"`
	Error       string `json:"error"`
	ServerLabel string `json:"serverLabel"`
}

type Stats struct {
	Pushed    int    `json:"pushed"`
	Pulled    int    `json:"pulled"`
	Conflicts int    `json:"conflicts"`
	Duration  string `json:"duration"`
}

type Client struct {
	store       *store.Store
	baseURL     string
	token       string
	fingerprint string
	http        *http.Client

	mu      sync.Mutex
	syncMu  sync.Mutex
	status  Status
	onEvent func(Status)
	stop    chan struct{}
	started bool
	lastLog time.Time
}

func New(st *store.Store) *Client {
	c := &Client{
		store:  st,
		status: Status{Mode: "local", State: string(StateLocal)},
		http:   &http.Client{Timeout: 60 * time.Second},
	}
	c.status.LastSyncAt = st.GetState("last_sync_at")
	return c
}

func (c *Client) OnEvent(fn func(Status)) { c.onEvent = fn }

func normalizeURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("server address is required")
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("only http and https are supported")
	}
	u.Path = strings.TrimRight(u.Path, "/")
	return u.String(), nil
}

// Configure installs workspace credentials and builds a transport that pins
// the host certificate when a fingerprint is present.
func (c *Client) Configure(baseURL, token, fingerprint, deviceName, workspace string) error {
	u, err := normalizeURL(baseURL)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.baseURL = u
	c.token = token
	c.fingerprint = normalizeFingerprint(fingerprint)
	c.status.ServerURL = u
	c.status.DeviceName = deviceName
	c.status.Workspace = workspace
	c.status.Mode = "client"
	c.status.State = string(StateOffline)
	c.status.Error = ""
	if c.store.SyncMode() != store.ModeClient {
		c.store.SetSyncMode(store.ModeClient)
	}
	c.applyTransportLocked()
	return nil
}

func (c *Client) Clear() {
	c.Stop()
	c.mu.Lock()
	defer c.mu.Unlock()
	c.baseURL = ""
	c.token = ""
	c.fingerprint = ""
	c.status = Status{Mode: "local", State: string(StateLocal), LastSyncAt: c.store.GetState("last_sync_at")}
	c.http = &http.Client{Timeout: 60 * time.Second}
}

func (c *Client) applyTransportLocked() {
	if c.fingerprint == "" {
		c.http = &http.Client{Timeout: 60 * time.Second}
		return
	}
	pin := c.fingerprint
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			// Pin the self-signed certificate's SHA-256 fingerprint instead of
			// relying on a public CA.
			InsecureSkipVerify: true,
			VerifyPeerCertificate: func(rawCerts [][]byte, _ [][]*x509.Certificate) error {
				if len(rawCerts) == 0 {
					return fmt.Errorf("server presented no certificate")
				}
				sum := sha256.Sum256(rawCerts[0])
				got := hex.EncodeToString(sum[:])
				if got != pin {
					return fmt.Errorf("certificate fingerprint mismatch")
				}
				return nil
			},
		},
		ForceAttemptHTTP2: true,
	}
	c.http = &http.Client{Transport: tr, Timeout: 60 * time.Second}
}

func normalizeFingerprint(fp string) string {
	fp = strings.ToLower(strings.TrimSpace(fp))
	fp = strings.ReplaceAll(fp, ":", "")
	return fp
}

func certFingerprint(resp *http.Response) string {
	if resp == nil || resp.TLS == nil || len(resp.TLS.PeerCertificates) == 0 {
		return ""
	}
	sum := sha256.Sum256(resp.TLS.PeerCertificates[0].Raw)
	return hex.EncodeToString(sum[:])
}

func (c *Client) Status() Status {
	c.mu.Lock()
	defer c.mu.Unlock()
	st := c.status
	if n, err := c.store.OutboxCount(); err == nil {
		st.Pending = n
	}
	st.Conflicts = c.store.CountOpenConflicts()
	st.Cursor = c.store.Cursor()
	return st
}

func (c *Client) setStatus(fn func(*Status)) {
	c.mu.Lock()
	fn(&c.status)
	st := c.status
	cb := c.onEvent
	c.mu.Unlock()
	if cb != nil {
		cb(st)
	}
}

func (c *Client) log(kind, status, message string) {
	if status == "ok" && time.Since(c.lastLog) < 20*time.Second {
		return
	}
	c.lastLog = time.Now()
	c.store.LogActivity(kind, status, message, "")
}

// Start runs a background sync loop. It is safe to call once.
func (c *Client) Start(interval time.Duration) {
	c.mu.Lock()
	if c.started || c.baseURL == "" {
		c.mu.Unlock()
		return
	}
	c.started = true
	c.stop = make(chan struct{})
	stop := c.stop
	c.mu.Unlock()
	go func() {
		// First sync shortly after startup.
		timer := time.NewTimer(1200 * time.Millisecond)
		defer timer.Stop()
		for {
			select {
			case <-stop:
				return
			case <-timer.C:
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
				_, _ = c.SyncNow(ctx)
				cancel()
				timer.Reset(interval)
			}
		}
	}()
}

func (c *Client) Stop() {
	c.mu.Lock()
	if c.started && c.stop != nil {
		close(c.stop)
		c.stop = nil
		c.started = false
	}
	c.mu.Unlock()
}

// ---- HTTP helpers --------------------------------------------------------

type PairResponse struct {
	Token       string         `json:"token"`
	ClinicID    string         `json:"clinicId"`
	ClinicName  string         `json:"clinicName"`
	StaffID     string         `json:"staffId"`
	DeviceID    string         `json:"deviceId"`
	DeviceName  string         `json:"deviceName"`
	Role        string         `json:"role"`
	Fingerprint string         `json:"fingerprint"`
	ServerTime  string         `json:"serverTime"`
	Clinic      map[string]any `json:"clinic"`
	InviteCode  string         `json:"inviteCode,omitempty"`
	ServerURL   string         `json:"serverUrl"`
}

type ServerInfo struct {
	Name        string `json:"name"`
	ClinicID    string `json:"clinicId"`
	ClinicName  string `json:"clinicName"`
	Version     string `json:"version"`
	Protocol    int    `json:"protocol"`
	ServerTime  string `json:"serverTime"`
	MultiTenant bool   `json:"multiTenant"`
}

func (c *Client) request(ctx context.Context, method, path string, body any, auth bool) (*http.Response, []byte, error) {
	c.mu.Lock()
	base := c.baseURL
	token := c.token
	client := c.http
	c.mu.Unlock()
	if base == "" {
		return nil, nil, fmt.Errorf("no sync server configured")
	}
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, nil, err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, base+path, reader)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Aster-Desktop/"+Version)
	if auth && token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return resp, nil, err
	}
	if resp.StatusCode >= 400 {
		var problem struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(data, &problem)
		if problem.Error == "" {
			problem.Error = strings.TrimSpace(string(data))
		}
		if problem.Error == "" {
			problem.Error = resp.Status
		}
		return resp, data, &APIError{Status: resp.StatusCode, Message: problem.Error}
	}
	return resp, data, nil
}

type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string { return e.Message }

var Version = "0.1.0"

// Probe fetches server identity without credentials.
func (c *Client) Probe(ctx context.Context, baseURL string) (ServerInfo, string, error) {
	u, err := normalizeURL(baseURL)
	if err != nil {
		return ServerInfo{}, "", err
	}
	c.mu.Lock()
	oldBase := c.baseURL
	c.baseURL = u
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		c.baseURL = oldBase
		c.mu.Unlock()
	}()
	resp, data, err := c.request(ctx, http.MethodGet, "/v1/info", nil, false)
	if err != nil {
		return ServerInfo{}, "", err
	}
	var info ServerInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return info, "", err
	}
	return info, certFingerprint(resp), nil
}

// Pair exchanges a pairing code for a device token.
func (c *Client) Pair(ctx context.Context, baseURL, code, staffName, deviceName, role string) (PairResponse, error) {
	u, err := normalizeURL(baseURL)
	if err != nil {
		return PairResponse{}, err
	}
	body := map[string]any{
		"code": code, "staffName": staffName, "deviceName": deviceName, "role": role,
	}
	// Pairing uses a temporary client with no pin: trust is established by the
	// secret code, then the certificate is pinned for all future requests.
	c.mu.Lock()
	oldBase, oldToken := c.baseURL, c.token
	c.baseURL = u
	c.token = ""
	c.http = &http.Client{Timeout: 20 * time.Second}
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		c.baseURL = oldBase
		c.token = oldToken
		c.mu.Unlock()
	}()
	resp, data, err := c.request(ctx, http.MethodPost, "/v1/pair", body, false)
	if err != nil {
		return PairResponse{}, err
	}
	var pr PairResponse
	if err := json.Unmarshal(data, &pr); err != nil {
		return PairResponse{}, err
	}
	if pr.Fingerprint == "" {
		pr.Fingerprint = certFingerprint(resp)
	}
	pr.ServerURL = u
	return pr, nil
}

// CreateWorkspace starts a cloud workspace and returns owner credentials.
func (c *Client) CreateWorkspace(ctx context.Context, baseURL, clinicName, ownerName, deviceName string, profile map[string]any) (PairResponse, error) {
	u, err := normalizeURL(baseURL)
	if err != nil {
		return PairResponse{}, err
	}
	c.mu.Lock()
	oldBase := c.baseURL
	c.baseURL = u
	c.http = &http.Client{Timeout: 30 * time.Second}
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		c.baseURL = oldBase
		c.mu.Unlock()
	}()
	body := map[string]any{"clinicName": clinicName, "ownerName": ownerName, "deviceName": deviceName, "clinic": profile}
	resp, data, err := c.request(ctx, http.MethodPost, "/v1/workspaces", body, false)
	if err != nil {
		return PairResponse{}, err
	}
	var pr PairResponse
	if err := json.Unmarshal(data, &pr); err != nil {
		return PairResponse{}, err
	}
	if pr.Fingerprint == "" {
		pr.Fingerprint = certFingerprint(resp)
	}
	pr.ServerURL = u
	return pr, nil
}

// ---- Sync ----------------------------------------------------------------

// SyncNow pushes local changes then pulls remote ones. It is serialized.
func (c *Client) SyncNow(ctx context.Context) (Stats, error) {
	started := time.Now()
	stats := Stats{}
	c.mu.Lock()
	if c.baseURL == "" || c.token == "" {
		c.mu.Unlock()
		return stats, fmt.Errorf("sync is not configured")
	}
	c.mu.Unlock()
	c.syncMu.Lock()
	defer c.syncMu.Unlock()

	c.setStatus(func(s *Status) { s.State = string(StateSyncing); s.Error = "" })
	if err := c.push(ctx, &stats); err != nil {
		c.fail(err)
		stats.Duration = time.Since(started).Round(time.Millisecond).String()
		return stats, err
	}
	if err := c.pull(ctx, &stats); err != nil {
		c.fail(err)
		stats.Duration = time.Since(started).Round(time.Millisecond).String()
		return stats, err
	}
	nowS := time.Now().UTC().Format(time.RFC3339Nano)
	c.store.SetState("last_sync_at", nowS)
	c.setStatus(func(s *Status) {
		s.State = string(StateSynced)
		s.LastSyncAt = nowS
		s.Error = ""
	})
	stats.Duration = time.Since(started).Round(time.Millisecond).String()
	if stats.Pushed > 0 || stats.Pulled > 0 {
		c.store.LogActivity("sync", "ok", fmt.Sprintf("Synced %d up, %d down", stats.Pushed, stats.Pulled), "")
		c.lastLog = time.Now()
	}
	return stats, nil
}

func (c *Client) fail(err error) {
	state := StateOffline
	msg := err.Error()
	if api, ok := err.(*APIError); ok {
		if api.Status == 401 || api.Status == 403 {
			state = StateError
			msg = "This device is no longer authorised. Pair it again."
		} else {
			state = StateError
		}
	}
	c.setStatus(func(s *Status) { s.State = string(state); s.Error = msg })
	c.store.LogActivity("sync", "error", msg, "")
}

type pushResponse struct {
	Results []store.PushResult `json:"results"`
	Cursor  int64              `json:"cursor"`
}

func (c *Client) push(ctx context.Context, stats *Stats) error {
	for {
		changes, ids, err := c.store.OutboxBatch(200)
		if err != nil {
			return err
		}
		if len(changes) == 0 {
			return nil
		}
		_, data, err := c.request(ctx, http.MethodPost, "/v1/sync/push", map[string]any{"changes": changes}, true)
		if err != nil {
			_ = c.store.MarkOutboxError(ids, err.Error())
			return err
		}
		var pr pushResponse
		if err := json.Unmarshal(data, &pr); err != nil {
			return err
		}
		for _, res := range pr.Results {
			if len(res.Rejected) > 0 {
				_ = c.store.RecordConflicts(res.Entity, []store.PushResult{res})
				stats.Conflicts += len(res.Rejected)
			}
			if res.Row != nil && res.Entity != "" {
				if _, err := c.store.ApplyRemoteRow(res.Entity, res.Row); err != nil {
					return err
				}
			}
		}
		// Do not advance the pull cursor here: other devices may have produced
		// changes before this push that this device has not pulled yet.
		if err := c.store.MarkOutboxDone(ids); err != nil {
			return err
		}
		stats.Pushed += len(changes)
		// Keep going until the outbox is empty. A byte-capped batch can contain
		// far fewer than 200 changes, and treating that as the end would send
		// only one batch per sync while a large document is uploading.
	}
}

type changesResponse struct {
	Changes []store.ChangeRow `json:"changes"`
	Cursor  int64             `json:"cursor"`
	HasMore bool              `json:"hasMore"`
}

func (c *Client) pull(ctx context.Context, stats *Stats) error {
	for {
		cursor := c.store.Cursor()
		path := fmt.Sprintf("/v1/sync/changes?since=%d&limit=500", cursor)
		_, data, err := c.request(ctx, http.MethodGet, path, nil, true)
		if err != nil {
			return err
		}
		var cr changesResponse
		if err := json.Unmarshal(data, &cr); err != nil {
			return err
		}
		for _, ch := range cr.Changes {
			applied, err := c.store.ApplyRemoteRow(ch.Entity, ch.Row)
			if err != nil {
				return err
			}
			if applied {
				stats.Pulled++
			}
			c.store.SetCursor(ch.Seq)
		}
		if len(cr.Changes) == 0 {
			return nil
		}
		if !cr.HasMore {
			return nil
		}
	}
}
