package store

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

// MaxPatientFileBytes is the largest document the workspace accepts. Large
// files are split into patient_file_chunks rows so every replication change
// stays well below the transport limits.
const MaxPatientFileBytes = 200 << 20

// PatientFileChunkBytes is the raw size of one stored chunk. Base64 adds about
// a third, keeping each replicated change comfortably below the batch limit.
const PatientFileChunkBytes = 1 << 20

// MaxPatientFileChunkBytes leaves room for a differently sliced client while
// still rejecting runaway payloads.
const MaxPatientFileChunkBytes = 2 << 20

// Documents above this size are not returned to the in-app preview: decoding
// them into one base64 string would exhaust browser memory. They open in the
// default application instead.
const maxPatientFilePreviewBytes = 12 << 20

// PatientFileCategories are the document types the clinic files documents
// under. Values are stable codes; the interface supplies the labels.
var PatientFileCategories = map[string]bool{
	"lab": true, "imaging": true, "consent": true, "insurance": true,
	"referral": true, "identity": true, "prescription": true, "other": true,
}

// Files that can execute code or launch a browser when opened by the default
// application are rejected. Documents are meant to be read, not run.
var blockedFileTypes = map[string]bool{
	".bat": true, ".cmd": true, ".com": true, ".cpl": true, ".dll": true,
	".exe": true, ".hta": true, ".htm": true, ".html": true, ".jar": true,
	".js": true, ".jse": true, ".lnk": true, ".msc": true, ".msi": true,
	".ps1": true, ".psm1": true, ".reg": true, ".scr": true, ".shtml": true,
	".svg": true, ".vbe": true, ".vbs": true, ".wsf": true, ".wsh": true,
	".xhtml": true, ".xml": true,
}

// PatientFileInput is one uploaded document. DataBase64 is used by the legacy
// single-call upload; the bridge uploads large files part by part instead.
type PatientFileInput struct {
	PatientID   string `json:"patient_id"`
	EncounterID string `json:"encounter_id"`
	Category    string `json:"category"`
	Title       string `json:"title"`
	FileName    string `json:"file_name"`
	Mime        string `json:"mime"`
	Notes       string `json:"notes"`
	ExpiresOn   string `json:"expires_on"`
	DataBase64  string `json:"data_base64"`
}

const patientFileColumns = `f.id, f.patient_id, f.encounter_id, f.category, f.title,
	f.file_name, f.mime, f.size_bytes, f.checksum, f.notes, f.expires_on,
	f.uploaded_by, f.uploaded_by_name, f.location_id, f.created_at, f.updated_at,
	p.first_name, p.last_name, p.preferred_name, p.mrn, p.sex, p.date_of_birth,
	p.phone`

// ListPatientFiles returns document metadata without the stored content.
// Passing an empty patient id lists documents across the workspace. Rows that
// are still uploading have no checksum and stay hidden.
func (s *Store) ListPatientFiles(patientID, query, category string, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	args := []any{}
	q := `SELECT ` + patientFileColumns + `
		FROM patient_files f JOIN patients p ON p.id=f.patient_id
		WHERE f.deleted_at IS NULL AND f.checksum<>'' AND p.deleted_at IS NULL`
	if strings.TrimSpace(patientID) != "" {
		q += ` AND f.patient_id=?`
		args = append(args, patientID)
	}
	if c := strings.TrimSpace(category); c != "" && c != "all" {
		q += ` AND f.category=?`
		args = append(args, c)
	}
	if text := strings.TrimSpace(query); text != "" {
		like := "%" + text + "%"
		q += ` AND (f.title LIKE ? OR f.file_name LIKE ? OR f.notes LIKE ?
			OR (p.first_name||' '||p.last_name) LIKE ? OR p.mrn LIKE ?)`
		args = append(args, like, like, like, like, like)
	}
	q += ` ORDER BY f.created_at DESC, f.title COLLATE NOCASE LIMIT ?`
	args = append(args, limit)
	return s.queryMaps(q, args...)
}

// RecentPatientFiles lists the newest documents for the dashboard.
func (s *Store) RecentPatientFiles(limit int) ([]map[string]any, error) {
	return s.ListPatientFiles("", "", "", limit)
}

// PatientFileByID returns metadata for one completed document.
func (s *Store) PatientFileByID(id string) (map[string]any, error) {
	rows, err := s.queryMaps(`SELECT `+patientFileColumns+`
		FROM patient_files f JOIN patients p ON p.id=f.patient_id
		WHERE f.id=? AND f.deleted_at IS NULL AND f.checksum<>'' AND p.deleted_at IS NULL`, id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrNotFound
	}
	return rows[0], nil
}

// PatientFileContent returns the stored base64 payload together with the
// metadata needed to write it to disk or show a preview. Very large documents
// report too_large instead of exhausting memory.
func (s *Store) PatientFileContent(id string) (map[string]any, error) {
	var content, fileName, mime, title, checksum string
	var size int64
	err := s.db.QueryRow(`SELECT content, file_name, mime, title, size_bytes, checksum
		FROM patient_files WHERE id=? AND deleted_at IS NULL`, id).
		Scan(&content, &fileName, &mime, &title, &size, &checksum)
	if err != nil || checksum == "" {
		return nil, ErrNotFound
	}
	out := map[string]any{
		"id": id, "content": content, "file_name": fileName, "mime": mime,
		"title": title, "size_bytes": size, "too_large": false,
	}
	if size > maxPatientFilePreviewBytes {
		out["content"] = ""
		out["too_large"] = true
		return out, nil
	}
	if content == "" && size > 0 {
		data, err := s.PatientFileBytes(id)
		if err != nil {
			return nil, err
		}
		out["content"] = base64.StdEncoding.EncodeToString(data)
	}
	return out, nil
}

// PatientFileExportInfo returns the name, type and size needed before a
// document is streamed to disk. It rejects rows that are still uploading.
func (s *Store) PatientFileExportInfo(id string) (name, mime string, size int64, err error) {
	var checksum string
	err = s.db.QueryRow(`SELECT file_name, mime, size_bytes, checksum
		FROM patient_files WHERE id=? AND deleted_at IS NULL`, id).
		Scan(&name, &mime, &size, &checksum)
	if err != nil || checksum == "" {
		return "", "", 0, ErrNotFound
	}
	return name, mime, size, nil
}

// PatientFileBytes assembles a document in memory. It is used for previews and
// stays safe because callers only use it below maxPatientFilePreviewBytes.
func (s *Store) PatientFileBytes(id string) ([]byte, error) {
	var content, checksum string
	err := s.db.QueryRow(`SELECT content, checksum FROM patient_files
		WHERE id=? AND deleted_at IS NULL`, id).Scan(&content, &checksum)
	if err != nil || checksum == "" {
		return nil, ErrNotFound
	}
	if content != "" {
		raw := content
		if i := strings.Index(raw, ","); strings.HasPrefix(raw, "data:") && i > 0 {
			raw = raw[i+1:]
		}
		data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(raw))
		if err != nil {
			return nil, errors.New("the stored document could not be read")
		}
		return data, nil
	}
	var buf bytes.Buffer
	if err := s.WritePatientFileTo(id, &buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// WritePatientFileTo streams a document to w one chunk at a time, so opening
// or saving a 200 MB file never needs a 200 MB allocation.
func (s *Store) WritePatientFileTo(id string, w io.Writer) error {
	var content, checksum string
	err := s.db.QueryRow(`SELECT content, checksum FROM patient_files
		WHERE id=? AND deleted_at IS NULL`, id).Scan(&content, &checksum)
	if err != nil || checksum == "" {
		return ErrNotFound
	}
	if content != "" {
		raw := content
		if i := strings.Index(raw, ","); strings.HasPrefix(raw, "data:") && i > 0 {
			raw = raw[i+1:]
		}
		data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(raw))
		if err != nil {
			return errors.New("the stored document could not be read")
		}
		_, err = w.Write(data)
		return err
	}
	rows, err := s.db.Query(`SELECT data FROM patient_file_chunks
		WHERE file_id=? AND deleted_at IS NULL ORDER BY chunk_index ASC`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var encoded string
		if err := rows.Scan(&encoded); err != nil {
			return err
		}
		chunk, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return errors.New("the stored document could not be read")
		}
		if _, err := w.Write(chunk); err != nil {
			return err
		}
	}
	return rows.Err()
}

// FilesOverview summarises document volume for headers and the dashboard.
func (s *Store) FilesOverview() (map[string]any, error) {
	var count, bytes, expiring, expired int64
	if err := s.db.Get(&count, `SELECT COUNT(1) FROM patient_files
		WHERE deleted_at IS NULL AND checksum<>''`); err != nil {
		return nil, err
	}
	if err := s.db.Get(&bytes, `SELECT COALESCE(SUM(size_bytes),0) FROM patient_files
		WHERE deleted_at IS NULL AND checksum<>''`); err != nil {
		return nil, err
	}
	_ = s.db.Get(&expiring, `SELECT COUNT(1) FROM patient_files
		WHERE deleted_at IS NULL AND checksum<>'' AND expires_on<>'' AND expires_on>=date('now')
		AND expires_on<=date('now','+30 day')`)
	_ = s.db.Get(&expired, `SELECT COUNT(1) FROM patient_files
		WHERE deleted_at IS NULL AND checksum<>'' AND expires_on<>'' AND expires_on<date('now')`)
	return map[string]any{
		"documents": count, "bytes": bytes, "expiring": expiring, "expired": expired,
	}, nil
}

// BeginPatientFileUpload validates the document metadata and creates the
// hidden header row. Chunks follow, then FinishPatientFileUpload makes it part
// of the patient record.
func (s *Store) BeginPatientFileUpload(in PatientFileInput) (map[string]any, error) {
	patientID := strings.TrimSpace(in.PatientID)
	if patientID == "" {
		return nil, errors.New("choose a patient for this document")
	}
	if _, err := s.GetPatient(patientID); err != nil {
		return nil, errors.New("the patient record could not be found")
	}

	name := cleanFileName(in.FileName)
	ext := strings.ToLower(filepath.Ext(name))
	if blockedFileTypes[ext] {
		return nil, errors.New("this file type cannot be stored as a patient document")
	}

	category := strings.TrimSpace(strings.ToLower(in.Category))
	if category == "" {
		category = "other"
	}
	if !PatientFileCategories[category] {
		return nil, errors.New("unknown document category")
	}

	expires := strings.TrimSpace(in.ExpiresOn)
	if expires != "" {
		if _, err := time.Parse("2006-01-02", expires); err != nil {
			return nil, errors.New("the expiry date is not valid")
		}
	}

	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = strings.TrimSuffix(name, filepath.Ext(name))
	}
	if title == "" {
		title = "Document"
	}
	if len(title) > 160 {
		title = title[:160]
	}

	mime := strings.TrimSpace(in.Mime)
	if mime == "" {
		mime = "application/octet-stream"
	}

	fields := map[string]any{
		"patient_id": patientID, "encounter_id": strings.TrimSpace(in.EncounterID),
		"category": category, "title": title, "file_name": name,
		"mime": mime, "size_bytes": 0, "checksum": "", "content": "",
		"notes": strings.TrimSpace(in.Notes), "expires_on": expires,
		"uploaded_by": s.actor.ID, "uploaded_by_name": s.actor.Name,
	}
	row, err := s.CreateRecord("patient_files", fields, nil)
	if err != nil {
		return nil, err
	}
	return patientFileMeta(row), nil
}

// AppendPatientFileChunk stores one encoded part. Retrying the same part is
// idempotent so a dropped bridge call never corrupts the upload.
func (s *Store) AppendPatientFileChunk(id string, index int, dataBase64 string) error {
	if strings.TrimSpace(id) == "" || index < 0 {
		return errors.New("the document part is not valid")
	}
	var checksum, patientID string
	err := s.db.QueryRow(`SELECT checksum, patient_id FROM patient_files
		WHERE id=? AND deleted_at IS NULL`, id).Scan(&checksum, &patientID)
	if err != nil {
		return ErrNotFound
	}
	if checksum != "" {
		return errors.New("this document is already complete")
	}

	raw := strings.TrimSpace(dataBase64)
	if i := strings.Index(raw, ","); strings.HasPrefix(raw, "data:") && i > 0 {
		raw = raw[i+1:]
	}
	data, err := base64.StdEncoding.DecodeString(raw)
	if err != nil || len(data) == 0 {
		return errors.New("the selected file could not be read")
	}
	if len(data) > MaxPatientFileChunkBytes {
		return errors.New("a document part is too large")
	}
	encoded := base64.StdEncoding.EncodeToString(data)
	chunkID := patientFileChunkID(id, index)

	var existing string
	err = s.db.Get(&existing, `SELECT data FROM patient_file_chunks
		WHERE id=? AND deleted_at IS NULL`, chunkID)
	if err == nil {
		if strings.TrimSpace(existing) == encoded {
			return nil
		}
		return errors.New("this part of the document was already uploaded")
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	var total int64
	_ = s.db.Get(&total, `SELECT COALESCE(SUM(size_bytes),0) FROM patient_file_chunks
		WHERE file_id=? AND deleted_at IS NULL`, id)
	if total+int64(len(data)) > MaxPatientFileBytes {
		return fmt.Errorf("documents must be %d MB or smaller", MaxPatientFileBytes>>20)
	}

	fields := map[string]any{
		"id": chunkID, "file_id": id, "patient_id": patientID,
		"chunk_index": index, "size_bytes": len(data), "data": encoded,
	}
	tx := s.db.MustBegin()
	if _, _, err := s.createInTx(tx, "patient_file_chunks", fields, nil); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// FinishPatientFileUpload checks that every part arrived and marks the header
// complete, which is what makes the document visible to the clinic.
func (s *Store) FinishPatientFileUpload(id string) (map[string]any, error) {
	var checksum, title, patientID string
	err := s.db.QueryRow(`SELECT checksum, title, patient_id FROM patient_files
		WHERE id=? AND deleted_at IS NULL`, id).Scan(&checksum, &title, &patientID)
	if err != nil {
		return nil, ErrNotFound
	}
	if checksum == "" {
		var count, total, firstIndex, lastIndex int64
		if err := s.db.QueryRow(`SELECT COUNT(1), COALESCE(SUM(size_bytes),0),
			COALESCE(MIN(chunk_index),-1), COALESCE(MAX(chunk_index),-1)
			FROM patient_file_chunks WHERE file_id=? AND deleted_at IS NULL`, id).
			Scan(&count, &total, &firstIndex, &lastIndex); err != nil {
			return nil, err
		}
		if count == 0 {
			return nil, errors.New("the document has no content")
		}
		if firstIndex != 0 || lastIndex != count-1 {
			return nil, errors.New("the document upload is incomplete")
		}
		if total <= 0 || total > MaxPatientFileBytes {
			return nil, fmt.Errorf("documents must be %d MB or smaller", MaxPatientFileBytes>>20)
		}
		patientName := ""
		if patient, err := s.GetPatient(patientID); err == nil {
			patientName = strings.TrimSpace(fmt.Sprint(patient["first_name"]) + " " + fmt.Sprint(patient["last_name"]))
		}
		if _, err := s.UpdateRecord("patient_files", id, map[string]any{
			"size_bytes": total, "checksum": fmt.Sprintf("chunks:%d", total), "content": "",
		}, &Audit{
			Action:  "patient.file_uploaded",
			Summary: "Uploaded document " + title + " for " + patientName,
			Detail:  map[string]any{"size_bytes": total},
		}); err != nil {
			return nil, err
		}
	}
	return s.PatientFileByID(id)
}

// AbortPatientFileUpload removes a half-finished upload. A document that
// already finished is left untouched, so a lost response cannot delete it.
func (s *Store) AbortPatientFileUpload(id string) error {
	var checksum string
	if err := s.db.Get(&checksum, `SELECT checksum FROM patient_files
		WHERE id=? AND deleted_at IS NULL`, id); err != nil {
		return nil
	}
	if checksum != "" {
		return nil
	}
	rows, err := s.db.Query(`SELECT id FROM patient_file_chunks
		WHERE file_id=? AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var chunkID string
		if err := rows.Scan(&chunkID); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, chunkID)
	}
	rows.Close()
	for _, chunkID := range ids {
		if err := s.Archive("patient_file_chunks", chunkID, nil); err != nil {
			return err
		}
	}
	return s.Archive("patient_files", id, &Audit{
		Action: "patient.file_upload_aborted", Summary: "Aborted an unfinished document upload",
	})
}

// CreatePatientFile stores an uploaded document in one call. It is kept for
// small bridges and imports; the interface uploads large files part by part.
func (s *Store) CreatePatientFile(in PatientFileInput) (map[string]any, error) {
	raw := strings.TrimSpace(in.DataBase64)
	if i := strings.Index(raw, ","); strings.HasPrefix(raw, "data:") && i > 0 {
		raw = raw[i+1:]
	}
	data, err := base64.StdEncoding.DecodeString(raw)
	if err != nil || len(data) == 0 {
		return nil, errors.New("the selected file could not be read")
	}
	if len(data) > MaxPatientFileBytes {
		return nil, fmt.Errorf("documents must be %d MB or smaller", MaxPatientFileBytes>>20)
	}

	sniffLen := len(data)
	if sniffLen > 512 {
		sniffLen = 512
	}
	sniffed := http.DetectContentType(data[:sniffLen])
	if in.Mime == "" || in.Mime == "application/octet-stream" {
		in.Mime = sniffed
	}

	row, err := s.BeginPatientFileUpload(in)
	if err != nil {
		return nil, err
	}
	id := fmt.Sprint(row["id"])
	for offset, index := 0, 0; offset < len(data); offset, index = offset+PatientFileChunkBytes, index+1 {
		end := offset + PatientFileChunkBytes
		if end > len(data) {
			end = len(data)
		}
		if err := s.AppendPatientFileChunk(id, index, base64.StdEncoding.EncodeToString(data[offset:end])); err != nil {
			return nil, err
		}
	}
	return s.FinishPatientFileUpload(id)
}

// UpdatePatientFile changes document metadata only; the stored content stays
// untouched so a rename never resends the file.
func (s *Store) UpdatePatientFile(id string, fields map[string]any) (map[string]any, error) {
	patch := map[string]any{}
	if v, ok := fields["title"]; ok {
		title := strings.TrimSpace(fmt.Sprint(v))
		if title == "" {
			return nil, errors.New("a document title is required")
		}
		if len(title) > 160 {
			title = title[:160]
		}
		patch["title"] = title
	}
	if v, ok := fields["category"]; ok {
		category := strings.ToLower(strings.TrimSpace(fmt.Sprint(v)))
		if !PatientFileCategories[category] {
			return nil, errors.New("unknown document category")
		}
		patch["category"] = category
	}
	if v, ok := fields["notes"]; ok {
		patch["notes"] = strings.TrimSpace(fmt.Sprint(v))
	}
	if v, ok := fields["expires_on"]; ok {
		expires := strings.TrimSpace(fmt.Sprint(v))
		if expires != "" {
			if _, err := time.Parse("2006-01-02", expires); err != nil {
				return nil, errors.New("the expiry date is not valid")
			}
		}
		patch["expires_on"] = expires
	}
	if len(patch) == 0 {
		return s.PatientFileByID(id)
	}
	row, err := s.UpdateRecord("patient_files", id, patch, &Audit{
		Action: "patient.file_updated", Summary: "Updated document details",
	})
	if err != nil {
		return nil, err
	}
	return patientFileMeta(row), nil
}

// ArchivePatientFile hides a document from the patient record while keeping
// its metadata and content in the audit history.
func (s *Store) ArchivePatientFile(id string) error {
	meta, err := s.PatientFileByID(id)
	if err != nil {
		return err
	}
	return s.Archive("patient_files", id, &Audit{
		Action:  "patient.file_archived",
		Summary: "Archived document " + fmt.Sprint(meta["title"]),
	})
}

func patientFileChunkID(fileID string, index int) string {
	return fmt.Sprintf("%s:%06d", fileID, index)
}

func patientFileMeta(row map[string]any) map[string]any {
	out := make(map[string]any, len(row))
	for k, v := range row {
		switch k {
		case "content", "field_revs", "origin_node":
			continue
		}
		out[k] = v
	}
	return out
}

func cleanFileName(name string) string {
	name = strings.ReplaceAll(strings.TrimSpace(name), "\\", "/")
	name = filepath.Base(name)
	name = strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`<>:"/\\|?*`, r) {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if name == "" || name == "." {
		name = "document"
	}
	if len(name) > 180 {
		name = name[:180]
	}
	return name
}
