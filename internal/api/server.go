// Package api implements the workspace server used both by the desktop app in
// private-network mode and by the headless cloud binary.
package api

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"aster/internal/store"
)

type Options struct {
	Store       *store.Store
	Address     string
	Port        int
	ClinicID    string // fixed workspace for LAN hosting; empty for multi-tenant cloud
	DataDir     string
	Version     string
	AllowSignup bool
	TLS         bool
	Logger      *log.Logger
}

type Server struct {
	opts        Options
	httpServer  *http.Server
	listener    net.Listener
	fingerprint string
	cert        *tls.Certificate
	started     time.Time
	limiter     *rateLimiter
	log         *log.Logger
	mu          sync.Mutex
}

func New(opts Options) (*Server, error) {
	if opts.Store == nil {
		return nil, fmt.Errorf("store is required")
	}
	if opts.Logger == nil {
		opts.Logger = log.New(os.Stdout, "[aster] ", log.LstdFlags)
	}
	s := &Server{opts: opts, limiter: newRateLimiter(), log: opts.Logger}
	if opts.TLS {
		cert, fp, err := loadOrCreateCert(opts.DataDir)
		if err != nil {
			return nil, err
		}
		s.cert = cert
		s.fingerprint = fp
	}
	return s, nil
}

func (s *Server) Fingerprint() string { return s.fingerprint }

// Addr returns the actual bound address (useful with port 0 in tests).
func (s *Server) Addr() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.listener == nil {
		return ""
	}
	return s.listener.Addr().String()
}

func (s *Server) Port() int {
	if s.opts.Port != 0 {
		return s.opts.Port
	}
	return 47821
}

// Start binds the listener and serves requests in the background.
func (s *Server) Start() error {
	addr := s.opts.Address
	if addr == "" {
		addr = fmt.Sprintf(":%d", s.Port())
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", addr, err)
	}
	if s.cert != nil {
		ln = tls.NewListener(ln, &tls.Config{
			Certificates: []tls.Certificate{*s.cert},
			MinVersion:   tls.VersionTLS12,
		})
	}
	s.mu.Lock()
	s.listener = ln
	s.started = time.Now()
	s.httpServer = &http.Server{
		Handler:           s.routes(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       45 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    1 << 20,
		ErrorLog:          s.log,
	}
	s.mu.Unlock()
	go func() {
		err := s.httpServer.Serve(ln)
		if err != nil && err != http.ErrServerClosed {
			s.log.Printf("server stopped: %v", err)
		}
	}()
	return nil
}

func (s *Server) Stop(ctx context.Context) error {
	s.mu.Lock()
	srv := s.httpServer
	s.mu.Unlock()
	if srv == nil {
		return nil
	}
	return srv.Shutdown(ctx)
}

func (s *Server) URLs() []string {
	scheme := "http"
	if s.cert != nil {
		scheme = "https"
	}
	port := s.Port()
	var urls []string
	for _, ip := range LocalIPv4s() {
		urls = append(urls, fmt.Sprintf("%s://%s:%d", scheme, ip, port))
	}
	return urls
}

// LocalIPv4s lists private and public IPv4 addresses of this machine.
func LocalIPv4s() []string {
	var out []string
	ifaces, err := net.Interfaces()
	if err != nil {
		return out
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipnet.IP.To4()
			if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				continue
			}
			out = append(out, ip.String())
		}
	}
	return out
}

// ---- Routing -------------------------------------------------------------

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", s.handleHealth)
	mux.HandleFunc("GET /v1/info", s.handleInfo)
	mux.HandleFunc("POST /v1/pair", s.handlePair)
	mux.HandleFunc("POST /v1/workspaces", s.handleCreateWorkspace)
	mux.HandleFunc("GET /v1/sync/changes", s.withAuth(s.handleChanges))
	mux.HandleFunc("POST /v1/sync/push", s.withAuth(s.handlePush))
	mux.HandleFunc("GET /v1/devices", s.withAuth(s.handleDevices))
	mux.HandleFunc("POST /v1/devices/revoke", s.withAuth(s.handleRevokeDevice))
	mux.HandleFunc("POST /v1/invites/rotate", s.withAuth(s.handleRotateInvite))
	mux.HandleFunc("GET /v1/staff", s.withAuth(s.handleStaff))
	return s.commonHeaders(mux)
}

func (s *Server) commonHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Aster-Protocol", "1")
		next.ServeHTTP(w, r)
	})
}

type authedHandler func(w http.ResponseWriter, r *http.Request, dev store.Device)

func (s *Server) withAuth(next authedHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := bearer(r)
		if token == "" {
			writeError(w, http.StatusUnauthorized, "missing device token")
			return
		}
		dev, err := s.opts.Store.AuthenticateDevice(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "device is not authorised")
			return
		}
		if s.opts.ClinicID != "" && dev.ClinicID != s.opts.ClinicID {
			writeError(w, http.StatusForbidden, "device belongs to another workspace")
			return
		}
		next(w, r, dev)
	}
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return ""
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func limitBody(w http.ResponseWriter, r *http.Request, max int64) bool {
	r.Body = http.MaxBytesReader(w, r.Body, max)
	return true
}

// ---- Public handlers -----------------------------------------------------

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "time": time.Now().UTC().Format(time.RFC3339Nano)})
}

type infoResponse struct {
	Name       string `json:"name"`
	ClinicID   string `json:"clinicId"`
	ClinicName string `json:"clinicName"`
	Version    string `json:"version"`
	Protocol   int    `json:"protocol"`
	ServerTime string `json:"serverTime"`
	Multi      bool   `json:"multiTenant"`
}

func (s *Server) handleInfo(w http.ResponseWriter, r *http.Request) {
	info := infoResponse{
		Name: "Aster workspace", Version: s.opts.Version, Protocol: 1,
		ServerTime: time.Now().UTC().Format(time.RFC3339Nano),
		ClinicID:   s.opts.ClinicID, Multi: s.opts.ClinicID == "",
	}
	if s.opts.ClinicID != "" {
		if c, err := s.opts.Store.ServerClinic(s.opts.ClinicID); err == nil {
			info.ClinicName = fmt.Sprint(c["name"])
			info.Name = info.ClinicName + " · Aster"
		}
	}
	if info.Multi {
		info.Name = "Aster Cloud"
	}
	writeJSON(w, http.StatusOK, info)
}

type pairRequest struct {
	Code       string `json:"code"`
	StaffName  string `json:"staffName"`
	DeviceName string `json:"deviceName"`
	Role       string `json:"role"`
	ClinicID   string `json:"clinicId"`
}

type pairPayload struct {
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
}

var allowedRoles = map[string]bool{
	"owner": true, "doctor": true, "nurse": true, "receptionist": true, "accountant": true,
}

func (s *Server) handlePair(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allow("pair:"+clientIP(r), 12, time.Minute) {
		writeError(w, http.StatusTooManyRequests, "too many pairing attempts, wait a minute")
		return
	}
	limitBody(w, r, 32<<10)
	var req pairRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	clinicID := s.opts.ClinicID
	inviteRole := ""
	if foundClinic, role, ok := s.opts.Store.FindInviteByCode(req.Code); ok {
		if clinicID != "" && foundClinic != clinicID {
			writeError(w, http.StatusUnauthorized, "pairing code is not valid for this clinic")
			return
		}
		clinicID = foundClinic
		inviteRole = role
	} else if clinicID != "" && s.opts.Store.ValidateInvite(clinicID, req.Code) {
		inviteRole = "receptionist"
	} else {
		writeError(w, http.StatusUnauthorized, "pairing code is invalid or expired")
		return
	}
	if clinicID == "" {
		writeError(w, http.StatusBadRequest, "workspace could not be resolved")
		return
	}
	if _, err := s.opts.Store.ServerClinic(clinicID); err != nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return
	}
	role := inviteRole
	if !allowedRoles[role] {
		role = strings.ToLower(strings.TrimSpace(req.Role))
	}
	if !allowedRoles[role] {
		role = "receptionist"
	}
	staffName := strings.TrimSpace(req.StaffName)
	if staffName == "" {
		staffName = "Clinic staff"
	}
	deviceName := strings.TrimSpace(req.DeviceName)
	if deviceName == "" {
		deviceName = "Aster device"
	}
	staffID, err := s.opts.Store.CreateStaffMember(clinicID, staffName, role, roleLabel(role))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create staff profile")
		return
	}
	token := randomToken()
	dev, err := s.opts.Store.CreateDevice(clinicID, deviceName, role, staffID, store.HashToken(token), "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not register device")
		return
	}
	clinic, _ := s.opts.Store.ServerClinic(clinicID)
	writeJSON(w, http.StatusOK, pairPayload{
		Token: token, ClinicID: clinicID, ClinicName: fmt.Sprint(clinic["name"]),
		StaffID: staffID, DeviceID: dev.ID, DeviceName: deviceName, Role: role,
		Fingerprint: s.fingerprint, ServerTime: time.Now().UTC().Format(time.RFC3339Nano),
		Clinic: clinic,
	})
}

func roleLabel(role string) string {
	switch role {
	case "owner":
		return "Clinic owner"
	case "doctor":
		return "Physician"
	case "nurse":
		return "Nurse"
	case "receptionist":
		return "Front desk"
	case "accountant":
		return "Billing"
	}
	return ""
}

func (s *Server) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	if !s.opts.AllowSignup {
		writeError(w, http.StatusForbidden, "workspace creation is disabled on this server")
		return
	}
	if !s.limiter.allow("signup:"+clientIP(r), 10, time.Hour) {
		writeError(w, http.StatusTooManyRequests, "too many workspaces created from this address")
		return
	}
	limitBody(w, r, 32<<10)
	var req struct {
		ClinicName string         `json:"clinicName"`
		OwnerName  string         `json:"ownerName"`
		DeviceName string         `json:"deviceName"`
		Clinic     map[string]any `json:"clinic"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	req.ClinicName = strings.TrimSpace(req.ClinicName)
	req.OwnerName = strings.TrimSpace(req.OwnerName)
	if req.ClinicName == "" || req.OwnerName == "" {
		writeError(w, http.StatusBadRequest, "clinic name and owner name are required")
		return
	}
	clinicID, staffID, clinic, err := s.opts.Store.CreateWorkspace(req.ClinicName, req.OwnerName, req.Clinic)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create workspace")
		return
	}
	code, _, err := s.opts.Store.EnsureInvite(clinicID, "owner", 365*24*time.Hour, true)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create workspace invitation")
		return
	}
	token := randomToken()
	deviceName := strings.TrimSpace(req.DeviceName)
	if deviceName == "" {
		deviceName = "Owner device"
	}
	dev, err := s.opts.Store.CreateDevice(clinicID, deviceName, "owner", staffID, store.HashToken(token), "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not register device")
		return
	}
	writeJSON(w, http.StatusCreated, pairPayload{
		Token: token, ClinicID: clinicID, ClinicName: req.ClinicName, StaffID: staffID,
		DeviceID: dev.ID, DeviceName: deviceName, Role: "owner", Fingerprint: s.fingerprint,
		ServerTime: time.Now().UTC().Format(time.RFC3339Nano), Clinic: clinic, InviteCode: code,
	})
}

func (s *Server) handleStaff(w http.ResponseWriter, r *http.Request, dev store.Device) {
	var out []map[string]any
	rows, err := s.opts.Store.DB().Query("SELECT id,full_name,role,title,specialization,active FROM staff WHERE clinic_id=? AND deleted_at IS NULL ORDER BY full_name", dev.ClinicID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load staff")
		return
	}
	defer rows.Close()
	for rows.Next() {
		m := map[string]any{}
		var id, name, role, title, spec string
		var active int
		if err := rows.Scan(&id, &name, &role, &title, &spec, &active); err == nil {
			m = map[string]any{"id": id, "full_name": name, "role": role, "title": title, "specialization": spec, "active": active}
			out = append(out, m)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"staff": out})
}

// ---- Sync handlers -------------------------------------------------------

func (s *Server) handleChanges(w http.ResponseWriter, r *http.Request, dev store.Device) {
	since, _ := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	changes, cursor, hasMore, err := s.opts.Store.ChangesSince(dev.ClinicID, since, limit, 24<<20)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read changes")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"changes": changes, "cursor": cursor, "hasMore": hasMore,
		"serverTime": time.Now().UTC().Format(time.RFC3339Nano),
	})
}

func (s *Server) handlePush(w http.ResponseWriter, r *http.Request, dev store.Device) {
	limitBody(w, r, 32<<20)
	var req struct {
		Changes []store.Change `json:"changes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid change batch")
		return
	}
	if len(req.Changes) > 500 {
		writeError(w, http.StatusRequestEntityTooLarge, "too many changes in one batch")
		return
	}
	allowed := make([]store.Change, 0, len(req.Changes))
	denied := []store.PushResult{}
	for _, ch := range req.Changes {
		if !canWrite(dev.Role, ch.Entity) {
			denied = append(denied, store.PushResult{
				ChangeID: ch.ChangeID, Entity: ch.Entity, EntityID: ch.EntityID,
				Status: "rejected", Message: "your role cannot change this record",
			})
			continue
		}
		allowed = append(allowed, ch)
	}
	results, cursor, err := s.opts.Store.ApplyIncoming(dev.ClinicID, allowed)
	if err != nil {
		s.log.Printf("apply incoming: %v", err)
		writeError(w, http.StatusInternalServerError, "could not apply changes")
		return
	}
	results = append(results, denied...)
	wipeActivity := r.URL.Query().Get("quiet") == "1"
	_ = wipeActivity
	writeJSON(w, http.StatusOK, map[string]any{
		"results": results, "cursor": cursor,
		"serverTime": time.Now().UTC().Format(time.RFC3339Nano),
	})
}

func canWrite(role, entity string) bool {
	if role == "owner" {
		return true
	}
	_, ok := store.Entities[entity]
	if !ok {
		return false
	}
	if store.AdminEntities[entity] {
		return role == "owner"
	}
	if store.ClinicalEntities[entity] {
		return role == "doctor" || role == "nurse"
	}
	if store.BillingEntities[entity] {
		return role == "doctor" || role == "receptionist" || role == "accountant"
	}
	switch role {
	case "doctor", "nurse", "receptionist":
		return true
	}
	return false
}

// ---- Device management ---------------------------------------------------

func (s *Server) handleDevices(w http.ResponseWriter, r *http.Request, dev store.Device) {
	if dev.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the clinic owner can manage devices")
		return
	}
	devices, err := s.opts.Store.ListDevices(dev.ClinicID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list devices")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": devices})
}

func (s *Server) handleRevokeDevice(w http.ResponseWriter, r *http.Request, dev store.Device) {
	if dev.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the clinic owner can revoke devices")
		return
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
		writeError(w, http.StatusBadRequest, "device id is required")
		return
	}
	if err := s.opts.Store.RevokeDevice(dev.ClinicID, req.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not revoke device")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleRotateInvite(w http.ResponseWriter, r *http.Request, dev store.Device) {
	if dev.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the clinic owner can create pairing codes")
		return
	}
	var req struct {
		Role string `json:"role"`
		TTL  int    `json:"ttlHours"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	role := req.Role
	if !allowedRoles[role] {
		role = "doctor"
	}
	ttl := time.Duration(req.TTL) * time.Hour
	if ttl <= 0 || ttl > 365*24*time.Hour {
		ttl = 24 * time.Hour
	}
	code, expires, err := s.opts.Store.EnsureInvite(dev.ClinicID, role, ttl, true)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create code")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"code": code, "expiresAt": expires.Format(time.RFC3339), "role": role})
}

// ---- Helpers -------------------------------------------------------------

func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand unavailable")
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

type rateLimiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{hits: map[string][]time.Time{}}
}

func (l *rateLimiter) allow(key string, limit int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := time.Now().Add(-window)
	list := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if t.After(cutoff) {
			list = append(list, t)
		}
	}
	if len(list) >= limit {
		l.hits[key] = list
		return false
	}
	l.hits[key] = append(list, time.Now())
	return true
}

// ---- Certificate ---------------------------------------------------------

func loadOrCreateCert(dir string) (*tls.Certificate, string, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, "", err
	}
	certPath := filepath.Join(dir, "workspace-cert.pem")
	keyPath := filepath.Join(dir, "workspace-key.pem")
	if certPEM, err := os.ReadFile(certPath); err == nil {
		if keyPEM, err := os.ReadFile(keyPath); err == nil {
			cert, err := tls.X509KeyPair(certPEM, keyPEM)
			if err == nil {
				leaf, _ := x509.ParseCertificate(cert.Certificate[0])
				if leaf != nil {
					cert.Leaf = leaf
					sum := sha256.Sum256(leaf.Raw)
					return &cert, hex.EncodeToString(sum[:]), nil
				}
			}
		}
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, "", err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, "", err
	}
	hostname, _ := os.Hostname()
	ips := []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")}
	for _, s := range LocalIPv4s() {
		ips = append(ips, net.ParseIP(s))
	}
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   "Aster Clinic Workspace",
			Organization: []string{"Aster Clinic"},
		},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().AddDate(10, 0, 0),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{"localhost", hostname, "aster.local"},
		IPAddresses:           ips,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return nil, "", err
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return nil, "", err
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
	if err := os.WriteFile(keyPath, keyPEM, 0o600); err != nil {
		return nil, "", err
	}
	if err := os.WriteFile(certPath, certPEM, 0o644); err != nil {
		return nil, "", err
	}
	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, "", err
	}
	leaf, _ := x509.ParseCertificate(cert.Certificate[0])
	cert.Leaf = leaf
	sum := sha256.Sum256(der)
	return &cert, hex.EncodeToString(sum[:]), nil
}
