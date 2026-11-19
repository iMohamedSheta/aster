package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	syncerr "aster/internal/sync"
)

func NewID() string {
	id, err := uuid.NewV7()
	if err != nil {
		return uuid.NewString()
	}
	return id.String()
}

// ShortCode returns a human-friendly, unambiguous code with a prefix.
func ShortCode(prefix string) string {
	const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	u := strings.ReplaceAll(uuid.NewString(), "-", "")
	var b strings.Builder
	for i := 0; i < 7; i++ {
		n := 0
		fmt.Sscanf(u[i*2:i*2+2], "%x", &n)
		b.WriteByte(alphabet[n%len(alphabet)])
	}
	if prefix != "" {
		return prefix + "-" + b.String()
	}
	return b.String()
}

// Change is one replication envelope. Fields contains only the columns the
// device actually changed, which is what enables column-level merging.
type Change struct {
	ChangeID string         `json:"changeId"`
	Entity   string         `json:"entity"`
	EntityID string         `json:"entityId"`
	Fields   map[string]any `json:"fields,omitempty"`
	Deleted  bool           `json:"deleted"`
	HLC      string         `json:"hlc"`
}

type RejectedField struct {
	Field  string `json:"field"`
	Local  any    `json:"local"`
	Remote any    `json:"remote"`
}

type PushResult struct {
	ChangeID string          `json:"changeId"`
	Entity   string          `json:"entity"`
	EntityID string          `json:"entityId"`
	Status   string          `json:"status"`
	Row      map[string]any  `json:"row,omitempty"`
	Rejected []RejectedField `json:"rejected,omitempty"`
	Message  string          `json:"message,omitempty"`
}

type ChangeRow struct {
	Seq    int64          `json:"seq"`
	Entity string         `json:"entity"`
	ID     string         `json:"id"`
	Row    map[string]any `json:"row"`
}

// ChangesSince returns current row snapshots for changes after a cursor.
// maxBytes bounds the approximate serialised size so a batch of documents
// cannot overflow the client's response limit. Rows are read a page at a time:
// loading all 500 before applying the budget would hold hundreds of megabytes
// of chunk data in memory.
func (s *Store) ChangesSince(clinicID string, since int64, limit, maxBytes int) ([]ChangeRow, int64, bool, error) {
	if limit <= 0 || limit > 1000 {
		limit = 500
	}
	if maxBytes <= 0 {
		maxBytes = 24 << 20
	}
	type meta struct {
		Seq      int64  `db:"seq"`
		Entity   string `db:"entity"`
		EntityID string `db:"entity_id"`
	}
	const pageSize = 16
	cursor := since
	out := make([]ChangeRow, 0, 32)
	size := 0
	for len(out) < limit {
		want := limit - len(out)
		fetch := pageSize
		if want < fetch {
			fetch = want
		}
		var metas []meta
		if err := s.db.Select(&metas, `SELECT seq, entity, entity_id FROM _server_changes
			WHERE clinic_id=? AND seq>? ORDER BY seq ASC LIMIT ?`, clinicID, cursor, fetch+1); err != nil {
			return nil, since, false, err
		}
		if len(metas) == 0 {
			return out, cursor, false, nil
		}
		extra := false
		if len(metas) > fetch {
			metas = metas[:fetch]
			extra = true
		}
		// Group IDs per entity so pulling a page stays a handful of queries.
		idsByEntity := map[string][]string{}
		for _, m := range metas {
			idsByEntity[m.Entity] = append(idsByEntity[m.Entity], m.EntityID)
		}
		rowsByEntity := map[string]map[string]map[string]any{}
		for entity, ids := range idsByEntity {
			table, ok := Entities[entity]
			if !ok {
				continue
			}
			placeholders := make([]string, len(ids))
			args := make([]any, len(ids))
			for i, id := range ids {
				placeholders[i] = "?"
				args[i] = id
			}
			q := fmt.Sprintf("SELECT * FROM %q WHERE id IN (%s)", table, strings.Join(placeholders, ","))
			rows, err := s.db.Query(q, args...)
			if err != nil {
				return nil, since, false, err
			}
			rowsByEntity[entity] = map[string]map[string]any{}
			for rows.Next() {
				m, err := scanRowMap(rows)
				if err != nil {
					rows.Close()
					return nil, since, false, err
				}
				rowsByEntity[entity][fmt.Sprint(m["id"])] = m
			}
			rows.Close()
		}
		for _, m := range metas {
			row := rowsByEntity[m.Entity][m.EntityID]
			if row == nil {
				cursor = m.Seq
				continue
			}
			rowBytes := estimateRowBytes(row)
			if len(out) > 0 && size+rowBytes > maxBytes {
				return out, cursor, true, nil
			}
			out = append(out, ChangeRow{Seq: m.Seq, Entity: m.Entity, ID: m.EntityID, Row: row})
			size += rowBytes
			cursor = m.Seq
		}
		if extra {
			return out, cursor, true, nil
		}
	}
	var more int
	_ = s.db.Get(&more, `SELECT COUNT(1) FROM (SELECT 1 FROM _server_changes
		WHERE clinic_id=? AND seq>? LIMIT 1)`, clinicID, cursor)
	return out, cursor, more > 0, nil
}

// estimateRowBytes is a cheap approximation of the JSON size of one row. It
// mainly exists to account for base64 document content without marshalling
// every row twice.
func estimateRowBytes(row map[string]any) int {
	total := 2
	for k, v := range row {
		total += len(k) + 4
		switch x := v.(type) {
		case string:
			total += len(x)
		case []byte:
			total += len(x)
		case nil:
		default:
			total += 24
		}
	}
	return total
}

// LatestSeq returns the newest server change sequence for a workspace.
func (s *Store) LatestSeq(clinicID string) (int64, error) {
	var seq int64
	err := s.db.Get(&seq, "SELECT COALESCE(MAX(seq),0) FROM _server_changes WHERE clinic_id=?", clinicID)
	return seq, err
}

// ApplyIncoming applies a client batch on the authoritative workspace store.
// It returns per-change results. The same transaction also records the
// idempotency keys and the outgoing change stream.
func (s *Store) ApplyIncoming(clinicID string, changes []Change) ([]PushResult, int64, error) {
	results := make([]PushResult, 0, len(changes))
	tx := s.db.MustBegin()
	defer tx.Rollback()
	var latestSeq int64
	_ = tx.Get(&latestSeq, "SELECT COALESCE(MAX(seq),0) FROM _server_changes WHERE clinic_id=?", clinicID)

	for _, ch := range changes {
		res := PushResult{ChangeID: ch.ChangeID, Entity: ch.Entity, EntityID: ch.EntityID, Status: "applied"}
		if ch.ChangeID == "" {
			ch.ChangeID = NewID()
		}
		// Idempotency: retried changes return the current row.
		var seen int
		_ = tx.Get(&seen, "SELECT COUNT(1) FROM _server_applied WHERE change_id=?", ch.ChangeID)
		if seen > 0 {
			if table, ok := Entities[ch.Entity]; ok {
				if row, err := s.rowMapTx(tx, table, ch.EntityID); err == nil {
					res.Row = row
				}
			}
			res.Status = "duplicate"
			results = append(results, res)
			continue
		}
		info, table, err := s.table(ch.Entity)
		if err != nil {
			res.Status = "rejected"
			res.Message = err.Error()
			results = append(results, res)
			continue
		}
		fields := cleanFields(info, ch.Fields)
		if ch.Entity == "clinics" && ch.EntityID != clinicID {
			res.Status = "rejected"
			res.Message = "clinic row does not match workspace"
			results = append(results, res)
			continue
		}
		if ch.HLC == "" {
			res.Status = "rejected"
			res.Message = "missing clock"
			results = append(results, res)
			continue
		}
		s.clock.Observe(ch.HLC)
		old, getErr := s.rowMapTx(tx, table, ch.EntityID)
		if getErr != nil && getErr != ErrNotFound {
			return nil, latestSeq, getErr
		}
		if getErr == ErrNotFound {
			if ch.Deleted {
				// Deleting a record this workspace has never seen is a no-op.
				_ = s.markAppliedTx(tx, ch.ChangeID, clinicID, 0)
				res.Status = "ignored"
				results = append(results, res)
				continue
			}
			seq, err := s.insertIncomingTx(tx, clinicID, ch, table, fields)
			if err != nil {
				return nil, latestSeq, err
			}
			latestSeq = seq
			res.Status = "applied"
			row, _ := s.rowMapTx(tx, table, ch.EntityID)
			res.Row = row
			_ = s.markAppliedTx(tx, ch.ChangeID, clinicID, seq)
			results = append(results, res)
			continue
		}

		// Existing row: merge per column using the HLC carried with the change.
		revs := decodeRevs(fmt.Sprint(old["field_revs"]))
		existingDeleted := fmt.Sprint(old["deleted_at"]) != ""
		if existingDeleted && !ch.Deleted {
			res.Status = "conflict"
			res.Row = old
			res.Message = "record was deleted in the workspace"
			_ = s.markAppliedTx(tx, ch.ChangeID, clinicID, 0)
			results = append(results, res)
			continue
		}
		if ch.Deleted {
			if syncerr.Compare(ch.HLC, revs["__deleted__"]) > 0 {
				nowS := revTime(ch.HLC)
				revs["__deleted__"] = ch.HLC
				revJSON, _ := json.Marshal(revs)
				if _, err := tx.Exec(fmt.Sprintf("UPDATE %q SET deleted_at=?, updated_at=?, rev=?, field_revs=?, origin_node=? WHERE id=?", table),
					nowS, nowS, ch.HLC, string(revJSON), nodeFromHLC(ch.HLC), ch.EntityID); err != nil {
					return nil, latestSeq, err
				}
				seq, err := s.recordServerTx(tx, clinicID, ch, ch.HLC)
				if err != nil {
					return nil, latestSeq, err
				}
				latestSeq = seq
				res.Status = "deleted"
				row, _ := s.rowMapTx(tx, table, ch.EntityID)
				res.Row = row
				_ = s.markAppliedTx(tx, ch.ChangeID, clinicID, seq)
			} else {
				res.Status = "conflict"
				res.Row = old
			}
			results = append(results, res)
			continue
		}

		applied := map[string]any{}
		for field, value := range fields {
			if syncerr.Compare(ch.HLC, revs[field]) > 0 {
				applied[field] = value
				revs[field] = ch.HLC
			} else if !equalValue(old[field], value) {
				res.Rejected = append(res.Rejected, RejectedField{Field: field, Local: value, Remote: old[field]})
			}
		}
		if len(applied) == 0 {
			res.Status = "conflict"
			res.Row = old
			_ = s.markAppliedTx(tx, ch.ChangeID, clinicID, 0)
			results = append(results, res)
			continue
		}
		revJSON, _ := json.Marshal(revs)
		set := make([]string, 0, len(applied)+4)
		args := make([]any, 0, len(applied)+5)
		for k, v := range applied {
			set = append(set, fmt.Sprintf("%q=?", k))
			args = append(args, v)
		}
		set = append(set, "updated_at=?", "rev=?", "field_revs=?", "origin_node=?")
		args = append(args, revTime(ch.HLC), ch.HLC, string(revJSON), nodeFromHLC(ch.HLC))
		args = append(args, ch.EntityID)
		if _, err := tx.Exec(fmt.Sprintf("UPDATE %q SET %s WHERE id=?", table, strings.Join(set, ",")), args...); err != nil {
			return nil, latestSeq, err
		}
		seq, err := s.recordServerTx(tx, clinicID, ch, ch.HLC)
		if err != nil {
			return nil, latestSeq, err
		}
		latestSeq = seq
		if len(res.Rejected) > 0 {
			res.Status = "conflict"
		}
		row, _ := s.rowMapTx(tx, table, ch.EntityID)
		res.Row = row
		_ = s.markAppliedTx(tx, ch.ChangeID, clinicID, seq)
		results = append(results, res)
	}
	// Chunk rows are large and already identical on the sending device. Sending
	// them back would double the push response without telling the client
	// anything it does not already have.
	for i := range results {
		if results[i].Entity == "patient_file_chunks" {
			results[i].Row = nil
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, latestSeq, err
	}
	return results, latestSeq, nil
}

func nodeFromHLC(hlc string) string {
	parts := strings.Split(hlc, ":")
	if len(parts) == 3 {
		return parts[2]
	}
	return ""
}

func (s *Store) insertIncomingTx(tx *sqlx.Tx, clinicID string, ch Change, table string, fields map[string]any) (int64, error) {
	revs := map[string]string{}
	for k := range fields {
		revs[k] = ch.HLC
	}
	if ch.Deleted {
		revs["__deleted__"] = ch.HLC
	}
	revJSON, _ := json.Marshal(revs)
	nowS := revTime(ch.HLC)
	cols := []string{"id", "clinic_id", "created_at", "updated_at", "rev", "field_revs", "origin_node"}
	vals := []any{ch.EntityID, clinicID, nowS, nowS, ch.HLC, string(revJSON), nodeFromHLC(ch.HLC)}
	if ch.Deleted {
		cols = append(cols, "deleted_at")
		vals = append(vals, nowS)
	}
	for k, v := range fields {
		cols = append(cols, k)
		vals = append(vals, v)
	}
	ph := make([]string, len(cols))
	for i := range cols {
		ph[i] = "?"
	}
	q := fmt.Sprintf("INSERT INTO %q (%s) VALUES (%s)", table, strings.Join(cols, ","), strings.Join(ph, ","))
	if _, err := tx.Exec(q, vals...); err != nil {
		return 0, fmt.Errorf("insert incoming %s: %w", ch.Entity, err)
	}
	return s.recordServerTx(tx, clinicID, ch, ch.HLC)
}

func (s *Store) recordServerTx(tx *sqlx.Tx, clinicID string, ch Change, rev string) (int64, error) {
	res, err := tx.Exec(`INSERT INTO _server_changes(clinic_id,entity,entity_id,rev,at) VALUES(?,?,?,?,?)`,
		clinicID, ch.Entity, ch.EntityID, rev, now())
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) markAppliedTx(tx *sqlx.Tx, changeID, clinicID string, seq int64) error {
	_, err := tx.Exec(`INSERT OR IGNORE INTO _server_applied(change_id,clinic_id,seq,at) VALUES(?,?,?,?)`,
		changeID, clinicID, seq, now())
	return err
}

// ApplyRemoteRow merges one authoritative row into the local replica. Only
// fields whose server clock is newer are taken, so unsent local edits survive.
func (s *Store) ApplyRemoteRow(entity string, row map[string]any) (bool, error) {
	info, table, err := s.table(entity)
	if err != nil {
		return false, err
	}
	id := fmt.Sprint(row["id"])
	if id == "" {
		return false, nil
	}
	remoteRevs := map[string]string{}
	switch v := row["field_revs"].(type) {
	case string:
		remoteRevs = decodeRevs(v)
	case map[string]any:
		for k, val := range v {
			remoteRevs[k] = fmt.Sprint(val)
		}
	case []byte:
		remoteRevs = decodeRevs(string(v))
	}
	remoteClinic := fmt.Sprint(row["clinic_id"])
	if entity == "clinics" {
		if local := s.ClinicID(); local != "" && local != id {
			s.mu.Lock()
			s.clinic = id
			s.mu.Unlock()
			s.metaSet("clinic_id", id)
			_, _ = s.db.Exec("DELETE FROM clinics WHERE id<>?", id)
		}
	}

	local, getErr := s.Row(entity, id)
	if getErr == ErrNotFound {
		if fmt.Sprint(row["deleted_at"]) != "" {
			return false, nil
		}
		rev := fmt.Sprint(row["rev"])
		nowS := revTime(rev)
		cols := []string{"id", "clinic_id", "created_at", "updated_at", "rev", "field_revs", "origin_node"}
		vals := []any{id, remoteClinic, fmt.Sprint(row["created_at"]), fmt.Sprint(row["updated_at"]), rev,
			fieldsJSON(remoteRevs), fmt.Sprint(row["origin_node"])}
		keys := make([]string, 0, len(info.Columns))
		for _, k := range info.Columns {
			if metaColumns[k] {
				continue
			}
			keys = append(keys, k)
		}
		for _, k := range keys {
			cols = append(cols, k)
			vals = append(vals, normalize(info.Types[k], row[k]))
		}
		ph := make([]string, len(cols))
		for i := range cols {
			ph[i] = "?"
		}
		q := fmt.Sprintf("INSERT INTO %q (%s) VALUES (%s)", table, strings.Join(cols, ","), strings.Join(ph, ","))
		if _, err := s.db.Exec(q, vals...); err != nil {
			return false, fmt.Errorf("apply remote insert %s: %w", entity, err)
		}
		_ = nowS
		s.emit(entity, id)
		return true, nil
	}
	if getErr != nil {
		return false, getErr
	}
	localRevs := decodeRevs(fmt.Sprint(local["field_revs"]))
	applied := map[string]any{}
	for _, k := range info.Columns {
		if metaColumns[k] {
			continue
		}
		if syncerr.Compare(remoteRevs[k], localRevs[k]) > 0 {
			applied[k] = normalize(info.Types[k], row[k])
		}
	}
	remoteDeleted := fmt.Sprint(row["deleted_at"]) != ""
	localDeleted := fmt.Sprint(local["deleted_at"]) != ""
	deletedChanged := false
	if remoteDeleted != localDeleted && syncerr.Compare(remoteRevs["__deleted__"], localRevs["__deleted__"]) > 0 {
		deletedChanged = true
		if remoteDeleted {
			localRevs["__deleted__"] = remoteRevs["__deleted__"]
		} else {
			delete(localRevs, "__deleted__")
		}
	}
	if len(applied) == 0 && !deletedChanged {
		return false, nil
	}
	for k := range applied {
		localRevs[k] = remoteRevs[k]
	}
	rev := fmt.Sprint(local["rev"])
	if syncerr.Compare(fmt.Sprint(row["rev"]), rev) > 0 {
		rev = fmt.Sprint(row["rev"])
	}
	revJSON, _ := json.Marshal(localRevs)
	set := []string{"rev=?", "field_revs=?", "updated_at=?"}
	args := []any{rev, string(revJSON), fmt.Sprint(row["updated_at"])}
	keys := make([]string, 0, len(applied))
	for k := range applied {
		keys = append(keys, k)
	}
	for _, k := range keys {
		set = append(set, fmt.Sprintf("%q=?", k))
		args = append(args, applied[k])
	}
	if deletedChanged {
		set = append(set, "deleted_at=?")
		if remoteDeleted {
			args = append(args, fmt.Sprint(row["deleted_at"]))
		} else {
			args = append(args, "")
		}
	}
	args = append(args, id)
	if _, err := s.db.Exec(fmt.Sprintf("UPDATE %q SET %s WHERE id=?", table, strings.Join(set, ",")), args...); err != nil {
		return false, fmt.Errorf("apply remote update %s: %w", entity, err)
	}
	s.emit(entity, id)
	return true, nil
}

// ---- Outbox --------------------------------------------------------------

func (s *Store) OutboxCount() (int, error) {
	var n int
	err := s.db.Get(&n, "SELECT COUNT(1) FROM sync_outbox")
	return n, err
}

func (s *Store) OutboxBatch(limit int) ([]Change, []string, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	type rec struct {
		ChangeID string `db:"change_id"`
		Entity   string `db:"entity"`
		EntityID string `db:"entity_id"`
		Deleted  int    `db:"deleted"`
		HLC      string `db:"hlc"`
		Size     int64  `db:"size"`
	}
	var recs []rec
	// Read sizes first: a batch of 200 chunk rows would otherwise load hundreds
	// of megabytes only to discard most of them after the byte check.
	if err := s.db.Select(&recs, `SELECT change_id,entity,entity_id,deleted,hlc,
		LENGTH(fields) AS size FROM sync_outbox ORDER BY created_at LIMIT ?`, limit); err != nil {
		return nil, nil, err
	}
	// Keep one push under the server's request ceiling. A single change is
	// always included so an oversized record can never stall the outbox.
	const maxBatchBytes = 8 << 20
	total := int64(0)
	chosen := make([]rec, 0, len(recs))
	for _, r := range recs {
		if len(chosen) > 0 && total+r.Size > maxBatchBytes {
			break
		}
		total += r.Size
		chosen = append(chosen, r)
	}
	if len(chosen) == 0 {
		return nil, nil, nil
	}
	ids := make([]string, len(chosen))
	placeholders := make([]string, len(chosen))
	args := make([]any, len(chosen))
	for i, r := range chosen {
		ids[i] = r.ChangeID
		placeholders[i] = "?"
		args[i] = r.ChangeID
	}
	type fieldRow struct {
		ChangeID string `db:"change_id"`
		Fields   string `db:"fields"`
	}
	var fieldRows []fieldRow
	if err := s.db.Select(&fieldRows, `SELECT change_id,fields FROM sync_outbox
		WHERE change_id IN (`+strings.Join(placeholders, ",")+`)`, args...); err != nil {
		return nil, nil, err
	}
	fieldsByID := make(map[string]string, len(fieldRows))
	for _, r := range fieldRows {
		fieldsByID[r.ChangeID] = r.Fields
	}
	changes := make([]Change, 0, len(chosen))
	for _, r := range chosen {
		changes = append(changes, Change{
			ChangeID: r.ChangeID, Entity: r.Entity, EntityID: r.EntityID,
			Fields: decodeStringMap(fieldsByID[r.ChangeID]), Deleted: r.Deleted == 1, HLC: r.HLC,
		})
	}
	return changes, ids, nil
}

func (s *Store) MarkOutboxDone(changeIDs []string) error {
	if len(changeIDs) == 0 {
		return nil
	}
	tx := s.db.MustBegin()
	for _, id := range changeIDs {
		if _, err := tx.Exec("DELETE FROM sync_outbox WHERE change_id=?", id); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) MarkOutboxError(changeIDs []string, message string) error {
	if len(changeIDs) == 0 {
		return nil
	}
	tx := s.db.MustBegin()
	for _, id := range changeIDs {
		if _, err := tx.Exec("UPDATE sync_outbox SET attempts=attempts+1,last_error=? WHERE change_id=?", message, id); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// ---- Conflict review -----------------------------------------------------

func (s *Store) RecordConflicts(entity string, results []PushResult) error {
	for _, res := range results {
		for _, c := range res.Rejected {
			label := res.EntityID
			if row := res.Row; row != nil {
				label = rowLabel(res.Entity, row)
			}
			if _, err := s.db.Exec(`INSERT INTO sync_conflicts
				(id,entity,entity_id,entity_label,field,local_value,remote_value,remote_hlc,detected_at)
				VALUES(?,?,?,?,?,?,?,?,?)`,
				NewID(), res.Entity, res.EntityID, label, c.Field,
				fmt.Sprint(c.Local), fmt.Sprint(c.Remote), "", now()); err != nil {
				return err
			}
		}
	}
	return nil
}

func rowLabel(entity string, row map[string]any) string {
	switch entity {
	case "patients":
		return strings.TrimSpace(fmt.Sprint(row["first_name"]) + " " + fmt.Sprint(row["last_name"]))
	case "appointments":
		return fmt.Sprint(row["start_at"])
	case "encounters":
		return "Visit " + fmt.Sprint(row["started_at"])
	case "invoices":
		return fmt.Sprint(row["number"])
	}
	return fmt.Sprint(row["id"])
}

func (s *Store) OpenConflicts() ([]map[string]any, error) {
	rows, err := s.db.Query("SELECT * FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY detected_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMapRows(rows)
}

func (s *Store) ResolveConflict(id, resolution string) error {
	_, err := s.db.Exec("UPDATE sync_conflicts SET resolved_at=?, resolution=? WHERE id=?", now(), resolution, id)
	return err
}

func (s *Store) CountOpenConflicts() int {
	var n int
	_ = s.db.Get(&n, "SELECT COUNT(1) FROM sync_conflicts WHERE resolved_at IS NULL")
	return n
}

// LogActivity writes a bounded local sync journal entry.
func (s *Store) LogActivity(kind, status, message, detail string) {
	_, _ = s.db.Exec(`INSERT INTO sync_activity(at,kind,status,message,detail) VALUES(?,?,?,?,?)`,
		now(), kind, status, message, detail)
	_, _ = s.db.Exec(`DELETE FROM sync_activity WHERE id NOT IN (SELECT id FROM sync_activity ORDER BY id DESC LIMIT 300)`)
}

func (s *Store) Activity(limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 300 {
		limit = 60
	}
	rows, err := s.db.Query("SELECT * FROM sync_activity ORDER BY id DESC LIMIT ?", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMapRows(rows)
}

func (s *Store) ClearActivity() error {
	_, err := s.db.Exec("DELETE FROM sync_activity")
	return err
}

func scanMapRows(rows *sql.Rows) ([]map[string]any, error) {
	out := []map[string]any{}
	for rows.Next() {
		m, err := scanRowMap(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

// WipeForWorkspace removes local business rows and prepares the replica for a
// full pull from a workspace.
func (s *Store) WipeForWorkspace(workspaceID string) error {
	tx := s.db.MustBegin()
	defer tx.Rollback()
	for entity, table := range Entities {
		if entity == "clinics" {
			continue
		}
		if _, err := tx.Exec(fmt.Sprintf("DELETE FROM %q", table)); err != nil {
			return err
		}
	}
	if _, err := tx.Exec("DELETE FROM clinics"); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM sync_outbox"); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM sync_conflicts"); err != nil {
		return err
	}
	if _, err := tx.Exec("INSERT INTO sync_state(key,value) VALUES('cursor','0') ON CONFLICT(key) DO UPDATE SET value='0'"); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.SetClinicID(workspaceID)
	return nil
}

// SetCursor stores the last processed server sequence.
func (s *Store) SetCursor(seq int64) { s.metaSet("cursor", fmt.Sprint(seq)) }

func (s *Store) Cursor() int64 {
	v := s.metaGet("cursor")
	var seq int64
	fmt.Sscanf(v, "%d", &seq)
	return seq
}

// UpdateClinicName is used by workspace creation.
func (s *Store) UpdateClinicName(name string) error {
	_, err := s.db.Exec("UPDATE clinics SET name=? WHERE clinic_id=?", name, s.ClinicID())
	return err
}

// EnsureClinic creates the local clinic and owner staff on first run.
func (s *Store) EnsureClinic(name, ownerName, mode string) (string, error) {
	if s.ClinicID() != "" {
		var n int
		_ = s.db.Get(&n, "SELECT COUNT(1) FROM clinics WHERE id=?", s.ClinicID())
		if n > 0 {
			return s.ClinicID(), nil
		}
	}
	id := NewID()
	fields := map[string]any{
		"name": name, "legal_name": name, "currency": "EGP", "currency_symbol": "E£",
		"timezone": "Africa/Cairo", "opening_time": "08:00", "closing_time": "18:00",
		"slot_minutes": 30, "work_days": "1,2,3,4,5",
	}
	// The clinic row's id is the workspace id; create it directly so clinic_id
	// matches before the store is marked as initialized.
	rev := s.nextRev()
	nowS := revTime(rev)
	revs := map[string]string{}
	for k := range fields {
		revs[k] = rev
	}
	revJSON, _ := json.Marshal(revs)
	tx := s.db.MustBegin()
	_, err := tx.Exec(`INSERT INTO clinics(id,clinic_id,name,legal_name,currency,currency_symbol,timezone,
		opening_time,closing_time,slot_minutes,work_days,created_at,updated_at,rev,field_revs,origin_node)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, id, name, name, "EGP", "E£", "Africa/Cairo", "08:00", "18:00", 30, "1,2,3,4,5",
		nowS, nowS, rev, string(revJSON), s.node)
	if err != nil {
		tx.Rollback()
		return "", err
	}
	ownerID := NewID()
	ownerRevs := map[string]string{}
	for _, k := range []string{"full_name", "role", "title", "active"} {
		ownerRevs[k] = rev
	}
	ownerRevJSON, _ := json.Marshal(ownerRevs)
	_, err = tx.Exec(`INSERT INTO staff(id,clinic_id,full_name,role,title,active,created_at,updated_at,rev,field_revs,origin_node)
		VALUES(?,?,?,?,?,?,?,?,?,?,?)`, ownerID, id, ownerName, "owner", "Clinic owner", 1,
		nowS, nowS, rev, string(ownerRevJSON), s.node)
	if err != nil {
		tx.Rollback()
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	s.SetClinicID(id)
	s.SetActor(Actor{ID: ownerID, Name: ownerName})
	return id, nil
}
