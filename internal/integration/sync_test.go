package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"aster/internal/api"
	"aster/internal/store"
	"aster/internal/syncengine"
)

type env struct {
	t       *testing.T
	server  *api.Server
	host    *store.Store
	client  *store.Store
	engine  *syncengine.Client
	baseURL string
	pair    syncengine.PairResponse
}

func newEnv(t *testing.T) *env {
	t.Helper()
	dir := t.TempDir()
	host, err := store.Open(filepath.Join(dir, "host.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { host.Close() })
	clinicID, err := host.EnsureClinic("Test Clinic", "Dr. Owner", "local")
	if err != nil {
		t.Fatal(err)
	}
	host.SetSyncMode(store.ModeHost)
	if err := host.ReindexForHost(); err != nil {
		t.Fatal(err)
	}
	code, _, err := host.EnsureInvite(clinicID, "doctor", 24*time.Hour, true)
	if err != nil {
		t.Fatal(err)
	}
	srv, err := api.New(api.Options{
		Store: host, Address: "127.0.0.1:0", ClinicID: clinicID, DataDir: dir,
		Version: "test", TLS: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Stop(ctx)
	})
	base := "http://" + srv.Addr()

	client, err := store.Open(filepath.Join(dir, "client.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { client.Close() })
	eng := syncengine.New(client)
	pairResp, err := eng.Pair(context.Background(), base, code, "Dr. Client", "Test Laptop", "doctor")
	if err != nil {
		t.Fatalf("pair: %v", err)
	}
	if pairResp.ClinicID != clinicID {
		t.Fatalf("workspace mismatch: %s != %s", pairResp.ClinicID, clinicID)
	}
	client.SetClinicID(clinicID)
	if pairResp.Clinic != nil {
		if _, err := client.ApplyRemoteRow("clinics", pairResp.Clinic); err != nil {
			t.Fatal(err)
		}
	}
	if err := eng.Configure(base, pairResp.Token, pairResp.Fingerprint, "Test Laptop", "Test Clinic"); err != nil {
		t.Fatal(err)
	}
	return &env{t: t, server: srv, host: host, client: client, engine: eng, baseURL: base, pair: pairResp}
}

func (e *env) sync() {
	e.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := e.engine.SyncNow(ctx); err != nil {
		e.t.Fatalf("sync: %v", err)
	}
}

func TestPairingAndSyncRoundTrip(t *testing.T) {
	e := newEnv(t)
	e.sync()

	// Replicated clinic profile arrived.
	c, err := e.client.GetClinic()
	if err != nil {
		t.Fatal(err)
	}
	if c["name"] != "Test Clinic" {
		t.Fatalf("unexpected clinic name %v", c["name"])
	}

	// Host creates a patient; client pulls it.
	p, err := e.host.CreatePatient(store.PatientInput{FirstName: "Ada", LastName: "Lovelace", Phone: "+1 555 0100"})
	if err != nil {
		t.Fatal(err)
	}
	e.sync()
	got, err := e.client.Row("patients", fmt.Sprint(p["id"]))
	if err != nil {
		t.Fatalf("client did not receive patient: %v", err)
	}
	if got["first_name"] != "Ada" {
		t.Fatalf("bad patient %v", got["first_name"])
	}

	// Client writes while offline, then pushes.
	e.engine.Stop()
	q, err := e.client.CreatePatient(store.PatientInput{FirstName: "Grace", LastName: "Hopper"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.host.Row("patients", fmt.Sprint(q["id"])); err == nil {
		t.Fatal("patient should not exist on host before sync")
	}
	e.sync()
	if _, err := e.host.Row("patients", fmt.Sprint(q["id"])); err != nil {
		t.Fatalf("host did not receive client patient: %v", err)
	}
}

func TestColumnLevelMergeAndConflict(t *testing.T) {
	e := newEnv(t)
	e.sync()
	p, err := e.host.CreatePatient(store.PatientInput{FirstName: "Alan", LastName: "Turing", Phone: "old", Email: "old@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	pid := fmt.Sprint(p["id"])
	e.sync()

	// Both sides edit different columns. Both changes must survive.
	if _, err := e.client.UpdatePatient(pid, store.PatientInput{FirstName: "Alan", LastName: "Turing", Phone: "client-phone", Email: "old@example.com"}); err != nil {
		t.Fatal(err)
	}
	time.Sleep(5 * time.Millisecond)
	if _, err := e.host.UpdatePatient(pid, store.PatientInput{FirstName: "Alan", LastName: "Turing", Phone: "old", Email: "host@example.com"}); err != nil {
		t.Fatal(err)
	}
	e.sync()
	merged, _ := e.host.Row("patients", pid)
	if merged["phone"] != "client-phone" {
		t.Fatalf("client phone lost: %v", merged["phone"])
	}
	if merged["email"] != "host@example.com" {
		t.Fatalf("host email lost: %v", merged["email"])
	}

	// Same column, both sides: the later clock wins and the client records a
	// reviewable conflict instead of silently losing data.
	if _, err := e.client.UpdatePatient(pid, store.PatientInput{FirstName: "Alan", LastName: "Turing", Phone: "client-new"}); err != nil {
		t.Fatal(err)
	}
	time.Sleep(5 * time.Millisecond)
	if _, err := e.host.UpdatePatient(pid, store.PatientInput{FirstName: "Alan", LastName: "Turing", Phone: "host-new"}); err != nil {
		t.Fatal(err)
	}
	e.sync()
	after, _ := e.client.Row("patients", pid)
	if after["phone"] != "host-new" {
		t.Fatalf("expected host-new to win, got %v", after["phone"])
	}
	conflicts, err := e.client.OpenConflicts()
	if err != nil {
		t.Fatal(err)
	}
	if len(conflicts) == 0 {
		t.Fatal("expected a reviewable conflict")
	}
	found := false
	for _, c := range conflicts {
		if c["field"] == "phone" && c["local_value"] == "client-new" {
			found = true
		}
	}
	if !found {
		t.Fatalf("phone conflict not recorded: %+v", conflicts)
	}
}

func TestServerRejectsForeignWorkspaceWrites(t *testing.T) {
	e := newEnv(t)
	// A device token is scoped to its workspace; the server always stamps the
	// token's clinic id and ignores client-supplied clinic ids.
	body := map[string]any{"changes": []map[string]any{{
		"changeId": store.NewID(), "entity": "patients", "entityId": store.NewID(),
		"hlc":    "9999999999999999:000000:deadbeef",
		"fields": map[string]any{"first_name": "Intruder", "clinic_id": "other"},
	}}}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodPost, e.baseURL+"/v1/sync/push", bytes.NewReader(b))
	req.Header.Set("Authorization", "Bearer "+e.pair.Token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("unexpected status %d", resp.StatusCode)
	}
	var out struct {
		Results []store.PushResult `json:"results"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if len(out.Results) != 1 {
		t.Fatalf("expected one result")
	}
	row, err := e.host.Row("patients", out.Results[0].EntityID)
	if err != nil {
		t.Fatal("host row missing")
	}
	if row["clinic_id"] != e.pair.ClinicID {
		t.Fatalf("clinic id was not stamped from the token: %v", row["clinic_id"])
	}
}
