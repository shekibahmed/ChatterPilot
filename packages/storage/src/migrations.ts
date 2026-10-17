/**
 * Ordered schema migrations; index + 1 is the resulting `PRAGMA user_version`.
 * Never edit an applied migration; append a new one.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE workspace_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  -- One accepted source file. Raw evidence: the chat text bytes are kept in the blob store.
  CREATE TABLE import_batch (
    id TEXT PRIMARY KEY,
    source_sha256 TEXT NOT NULL UNIQUE,
    source_name TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('txt', 'zip')),
    chat_text_sha256 TEXT NOT NULL,
    chat_entry_name TEXT,
    parser_version TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    encoding TEXT NOT NULL,
    had_bom INTEGER NOT NULL,
    line_count INTEGER NOT NULL,
    detected_date_order TEXT NOT NULL,
    applied_date_order TEXT NOT NULL CHECK (applied_date_order IN ('dmy', 'mdy', 'ymd')),
    first_local_datetime TEXT,
    last_local_datetime TEXT,
    unattached_start_line INTEGER,
    unattached_end_line INTEGER,
    unattached_text TEXT,
    warnings_json TEXT NOT NULL
  ) STRICT;

  CREATE TABLE message (
    id TEXT PRIMARY KEY,
    import_batch_id TEXT NOT NULL REFERENCES import_batch (id),
    position INTEGER NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('android', 'ios')),
    timestamp_text TEXT NOT NULL,
    local_datetime TEXT,
    status TEXT NOT NULL CHECK (status IN ('ok', 'needs_date_order', 'invalid_timestamp')),
    author TEXT,
    body TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('text', 'media', 'system', 'deleted')),
    edited INTEGER NOT NULL,
    media_state TEXT CHECK (media_state IN ('attached', 'omitted')),
    media_file_name TEXT,
    media_type TEXT,
    UNIQUE (import_batch_id, position)
  ) STRICT;
  CREATE INDEX message_by_time ON message (local_datetime);

  CREATE TABLE attachment (
    id TEXT PRIMARY KEY,
    import_batch_id TEXT NOT NULL REFERENCES import_batch (id),
    file_name TEXT NOT NULL,
    blob_sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    content_check TEXT NOT NULL CHECK (content_check IN ('match', 'mismatch', 'unchecked')),
    message_id TEXT REFERENCES message (id),
    link_method TEXT CHECK (link_method IN ('exact_file_name')),
    UNIQUE (import_batch_id, file_name)
  ) STRICT;

  CREATE TABLE skipped_entry (
    import_batch_id TEXT NOT NULL REFERENCES import_batch (id),
    name TEXT NOT NULL,
    reason TEXT NOT NULL
  ) STRICT;
  `,
  `
  -- Owner catalogue versions; files are kept as blobs so every draft can be re-derived.
  CREATE TABLE catalogue_version (
    version TEXT PRIMARY KEY,
    loaded_at TEXT NOT NULL,
    maintainer TEXT,
    products_sha256 TEXT NOT NULL,
    customers_sha256 TEXT NOT NULL,
    meta_sha256 TEXT
  ) STRICT;

  CREATE TABLE order_draft (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    catalogue_version TEXT NOT NULL REFERENCES catalogue_version (version),
    source_message_ids_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'rejected')),
    status_at TEXT NOT NULL
  ) STRICT;

  -- Append-only review history: every human decision with reviewer, time and reason.
  CREATE TABLE draft_decision (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id TEXT NOT NULL REFERENCES order_draft (id),
    at TEXT NOT NULL,
    reviewer TEXT NOT NULL,
    action TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    reason TEXT NOT NULL
  ) STRICT;
  CREATE INDEX draft_decision_by_draft ON draft_decision (draft_id, seq);

  CREATE TRIGGER draft_decision_no_update BEFORE UPDATE ON draft_decision
  BEGIN SELECT RAISE(ABORT, 'review history is append-only'); END;
  CREATE TRIGGER draft_decision_no_delete BEFORE DELETE ON draft_decision
  BEGIN SELECT RAISE(ABORT, 'review history is append-only'); END;
  `,
];
