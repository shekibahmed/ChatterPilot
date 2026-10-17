import type Database from "better-sqlite3";

export interface CatalogueVersionRecord {
  readonly version: string;
  readonly loadedAt: string;
  readonly maintainer: string | null;
  readonly productsSha256: string;
  readonly customersSha256: string;
  readonly metaSha256: string | null;
  readonly lexiconSha256: string | null;
}

export type DraftStatus = "open" | "accepted" | "rejected";

export interface DraftRecord {
  readonly id: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly catalogueVersion: string;
  readonly sourceMessageIds: readonly string[];
  readonly status: DraftStatus;
  readonly statusAt: string;
}

export interface DecisionRecord {
  readonly seq: number;
  readonly draftId: string;
  readonly at: string;
  readonly reviewer: string;
  readonly action: string;
  readonly payload: unknown;
  readonly reason: string;
}

export interface StoredMessage {
  readonly id: string;
  readonly importBatchId: string;
  readonly sourceName: string;
  readonly position: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly timestampText: string;
  readonly localDateTime: string | null;
  readonly status: string;
  readonly author: string | null;
  readonly body: string;
  readonly kind: string;
  readonly edited: boolean;
  readonly mediaState: string | null;
  readonly mediaFileName: string | null;
  readonly mediaType: string | null;
  readonly attachmentId: string | null;
  /** "duplicate" = same message as one from an earlier export of this chat (see duplicateOf). */
  readonly overlap: "new" | "duplicate" | "uncertain";
  readonly duplicateOf: string | null;
  /** Latest transcript of a voice-note message, if one was added. */
  readonly transcriptId: string | null;
  readonly transcriptText: string | null;
  readonly transcriptOrigin: "manual" | "provider" | null;
}

const MESSAGE_SELECT = `
  SELECT m.id, m.import_batch_id AS importBatchId, b.source_name AS sourceName, m.position,
         m.start_line AS startLine, m.end_line AS endLine, m.timestamp_text AS timestampText,
         m.local_datetime AS localDateTime, m.status, m.author, m.body, m.kind, m.edited,
         m.media_state AS mediaState, m.media_file_name AS mediaFileName, m.media_type AS mediaType,
         a.id AS attachmentId, m.overlap, m.duplicate_of AS duplicateOf,
         t.id AS transcriptId, t.text AS transcriptText, t.origin AS transcriptOrigin
  FROM message m
  JOIN import_batch b ON b.id = m.import_batch_id
  LEFT JOIN attachment a ON a.message_id = m.id
  LEFT JOIN transcript t ON t.message_id = m.id
    AND t.version = (SELECT MAX(version) FROM transcript WHERE message_id = m.id)`;

type MessageRow = Omit<StoredMessage, "edited"> & { edited: number };
const toMessage = (r: MessageRow): StoredMessage => ({ ...r, edited: r.edited === 1 });

/** Review-side records: catalogue versions, drafts and the append-only decision log. */
export class ReviewStore {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  saveCatalogueVersion(record: CatalogueVersionRecord): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO catalogue_version
           (version, loaded_at, maintainer, products_sha256, customers_sha256, meta_sha256, lexicon_sha256)
         VALUES (@version, @loadedAt, @maintainer, @productsSha256, @customersSha256, @metaSha256,
           @lexiconSha256)`,
      )
      .run(record);
  }

  catalogueVersion(version: string): CatalogueVersionRecord | null {
    return (
      (this.db
        .prepare(
          `SELECT version, loaded_at AS loadedAt, maintainer, products_sha256 AS productsSha256,
                  customers_sha256 AS customersSha256, meta_sha256 AS metaSha256,
                  lexicon_sha256 AS lexiconSha256
           FROM catalogue_version WHERE version = ?`,
        )
        .get(version) as CatalogueVersionRecord | undefined) ?? null
    );
  }

  /** The most recently loaded catalogue version. */
  latestCatalogueVersion(): CatalogueVersionRecord | null {
    const row = this.db
      .prepare("SELECT version FROM catalogue_version ORDER BY loaded_at DESC, rowid DESC LIMIT 1")
      .get() as { version: string } | undefined;
    return row ? this.catalogueVersion(row.version) : null;
  }

  messages(ids: readonly string[]): StoredMessage[] {
    const stmt = this.db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`);
    return ids.flatMap((id) => {
      const row = stmt.get(id) as MessageRow | undefined;
      return row ? [toMessage(row)] : [];
    });
  }

  batchMessages(importBatchId: string): StoredMessage[] {
    return (
      this.db
        .prepare(`${MESSAGE_SELECT} WHERE m.import_batch_id = ? ORDER BY m.position`)
        .all(importBatchId) as MessageRow[]
    ).map(toMessage);
  }

  /** Canonical messages that can be drafted: typed text, and voice notes that have a transcript. */
  allTextMessages(): StoredMessage[] {
    return (
      this.db
        .prepare(
          `${MESSAGE_SELECT} WHERE m.duplicate_of IS NULL
             AND (m.kind = 'text' OR (m.kind = 'media' AND t.id IS NOT NULL))
           ORDER BY b.imported_at, m.position`,
        )
        .all() as MessageRow[]
    ).map(toMessage);
  }

  insertDraft(record: Omit<DraftRecord, "status" | "statusAt">): void {
    this.db
      .prepare(
        `INSERT INTO order_draft
           (id, created_at, created_by, catalogue_version, source_message_ids_json, status, status_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?)`,
      )
      .run(
        record.id,
        record.createdAt,
        record.createdBy,
        record.catalogueVersion,
        JSON.stringify(record.sourceMessageIds),
        record.createdAt,
      );
  }

  private draftFromRow(row: Record<string, unknown>): DraftRecord {
    return {
      id: row.id as string,
      createdAt: row.created_at as string,
      createdBy: row.created_by as string,
      catalogueVersion: row.catalogue_version as string,
      sourceMessageIds: JSON.parse(row.source_message_ids_json as string) as string[],
      status: row.status as DraftStatus,
      statusAt: row.status_at as string,
    };
  }

  draft(id: string): DraftRecord | null {
    const row = this.db.prepare("SELECT * FROM order_draft WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.draftFromRow(row) : null;
  }

  drafts(): DraftRecord[] {
    return (
      this.db.prepare("SELECT * FROM order_draft ORDER BY created_at, rowid").all() as Record<
        string,
        unknown
      >[]
    ).map((r) => this.draftFromRow(r));
  }

  /** Append a decision; status-changing actions update the draft in the same transaction. */
  appendDecision(
    decision: Omit<DecisionRecord, "seq">,
    newStatus: DraftStatus | null = null,
  ): DecisionRecord {
    return this.db.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO draft_decision (draft_id, at, reviewer, action, payload_json, reason)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          decision.draftId,
          decision.at,
          decision.reviewer,
          decision.action,
          JSON.stringify(decision.payload),
          decision.reason,
        );
      if (newStatus) {
        this.db
          .prepare("UPDATE order_draft SET status = ?, status_at = ? WHERE id = ?")
          .run(newStatus, decision.at, decision.draftId);
      }
      return { ...decision, seq: Number(result.lastInsertRowid) };
    })();
  }

  decisions(draftId: string): DecisionRecord[] {
    return (
      this.db
        .prepare(
          `SELECT seq, draft_id AS draftId, at, reviewer, action, payload_json AS payload, reason
           FROM draft_decision WHERE draft_id = ? ORDER BY seq`,
        )
        .all(draftId) as (Omit<DecisionRecord, "payload"> & { payload: string })[]
    ).map((r) => ({ ...r, payload: JSON.parse(r.payload) as unknown }));
  }
}
