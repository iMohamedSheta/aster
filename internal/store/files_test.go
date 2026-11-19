package store

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
)

func TestChunkedPatientFileRoundTrip(t *testing.T) {
	st := testStore(t)
	patient, err := st.CreatePatient(PatientInput{FirstName: "Mona", LastName: "Ali"})
	if err != nil {
		t.Fatalf("create patient: %v", err)
	}
	patientID := fmt.Sprint(patient["id"])

	raw := bytes.Repeat([]byte("scan-content-"), 200_000) // 2.6 MB
	header, err := st.BeginPatientFileUpload(PatientFileInput{
		PatientID: patientID, Category: "lab", FileName: "scan.pdf",
		Mime: "application/pdf", Title: "Blood work",
	})
	if err != nil {
		t.Fatalf("begin upload: %v", err)
	}
	id := fmt.Sprint(header["id"])

	// The header must stay hidden until every part arrived.
	if _, err := st.PatientFileByID(id); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unfinished document should be hidden, got %v", err)
	}

	index := 0
	for offset := 0; offset < len(raw); offset, index = offset+PatientFileChunkBytes, index+1 {
		end := offset + PatientFileChunkBytes
		if end > len(raw) {
			end = len(raw)
		}
		encoded := base64.StdEncoding.EncodeToString(raw[offset:end])
		if err := st.AppendPatientFileChunk(id, index, encoded); err != nil {
			t.Fatalf("append chunk %d: %v", index, err)
		}
		// A retried part must not fail or double count.
		if err := st.AppendPatientFileChunk(id, index, encoded); err != nil {
			t.Fatalf("retry chunk %d: %v", index, err)
		}
	}

	finished, err := st.FinishPatientFileUpload(id)
	if err != nil {
		t.Fatalf("finish upload: %v", err)
	}
	if got := fmt.Sprint(finished["size_bytes"]); got != fmt.Sprint(len(raw)) {
		t.Fatalf("size = %s, want %d", got, len(raw))
	}
	if fmt.Sprint(finished["checksum"]) == "" {
		t.Fatal("finished document should carry a completion marker")
	}

	meta, err := st.PatientFileContent(id)
	if err != nil {
		t.Fatalf("read content: %v", err)
	}
	if tooLarge, _ := meta["too_large"].(bool); tooLarge {
		t.Fatal("small document should be previewable")
	}
	decoded, err := base64.StdEncoding.DecodeString(fmt.Sprint(meta["content"]))
	if err != nil {
		t.Fatalf("decode preview: %v", err)
	}
	if !bytes.Equal(decoded, raw) {
		t.Fatal("preview content differs from the uploaded document")
	}

	var streamed bytes.Buffer
	if err := st.WritePatientFileTo(id, &streamed); err != nil {
		t.Fatalf("stream content: %v", err)
	}
	if !bytes.Equal(streamed.Bytes(), raw) {
		t.Fatal("streamed content differs from the uploaded document")
	}

	// Finishing twice is safe, and an abort after completion must not delete it.
	if _, err := st.FinishPatientFileUpload(id); err != nil {
		t.Fatalf("repeat finish: %v", err)
	}
	if err := st.AbortPatientFileUpload(id); err != nil {
		t.Fatalf("abort completed upload: %v", err)
	}
	if _, err := st.PatientFileByID(id); err != nil {
		t.Fatalf("completed document was removed: %v", err)
	}
}

func TestIncompletePatientFileUploadIsRejected(t *testing.T) {
	st := testStore(t)
	patient, err := st.CreatePatient(PatientInput{FirstName: "Omar", LastName: "Hassan"})
	if err != nil {
		t.Fatalf("create patient: %v", err)
	}
	header, err := st.BeginPatientFileUpload(PatientFileInput{
		PatientID: fmt.Sprint(patient["id"]), Category: "other", FileName: "letter.pdf",
	})
	if err != nil {
		t.Fatalf("begin upload: %v", err)
	}
	id := fmt.Sprint(header["id"])
	if err := st.AppendPatientFileChunk(id, 0, base64.StdEncoding.EncodeToString([]byte("hello"))); err != nil {
		t.Fatalf("append first chunk: %v", err)
	}
	if err := st.AppendPatientFileChunk(id, 2, base64.StdEncoding.EncodeToString([]byte("world"))); err != nil {
		t.Fatalf("append third chunk: %v", err)
	}
	if _, err := st.FinishPatientFileUpload(id); err == nil {
		t.Fatal("a document with a missing part must not finish")
	}
	if err := st.AbortPatientFileUpload(id); err != nil {
		t.Fatalf("abort upload: %v", err)
	}
	if _, err := st.PatientFileByID(id); !errors.Is(err, ErrNotFound) {
		t.Fatalf("aborted document should stay hidden, got %v", err)
	}
}

func testStore(t *testing.T) *Store {
	t.Helper()
	st, err := Open(filepath.Join(t.TempDir(), "aster.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	if _, err := st.EnsureClinic("Test Clinic", "Dr. Test", "local"); err != nil {
		t.Fatalf("ensure clinic: %v", err)
	}
	st.SetSyncMode(ModeClient)
	return st
}
