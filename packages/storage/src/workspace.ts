import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { reconcileSequences } from "@chatterpilot/core";
import Database from "better-sqlite3";
import { BlobStore, type StoredBlob } from "./blobs.ts";
import { MIGRATIONS } from "./migrations.ts";
import { ReviewStore } from "./reviews.ts";

export interface WorkspaceInfo {
  readonly name: string;
  readonly timezone: string;
  readonly createdAt: string;
  readonly schemaVersion: number;
}

/** Structural shape of a scanned message (see @chatterpilot/import-whatsapp ScannedMessage). */
export interface MessageInput {
  readonly index: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly format: "android" | "ios";
  readonly timestampText: string;
  readonly localDateTime: string | null;
  readonly status: "ok" | "needs_date_order" | "invalid_timestamp";
  readonly author: string | null;
  readonly body: string;
  readonly kind: "text" | "media" | "system" | "deleted";
  readonly edited: boolean;
  readonly media: {
    readonly state: "attached" | "omitted";
    readonly fileName: string | null;
    readonly mediaType: string;
  } | null;
}

export interface AttachmentInput {
  readonly name: string;
  readonly mediaType: string;
  readonly contentCheck: "match" | "mismatch" | "unchecked";
  readonly blob: StoredBlob;
}

export interface RecordImportInput {
  /** Identity of the chat this export belongs to; overlap is only checked within one chat. */
  readonly chatKey: string;
  readonly sourceSha256: string;
  readonly sourceName: string;
  readonly sourceKind: "txt" | "zip";
  readonly chatTextSha256: string;
  readonly chatEntryName: string | null;
  readonly parserVersion: string;
  readonly importedAt: string;
  readonly encoding: string;
  readonly hadByteOrderMark: boolean;
  readonly lineCount: number;
  readonly detectedDateOrder: string;
  readonly appliedDateOrder: "dmy" | "mdy" | "ymd";
  readonly unattached: {
    readonly startLine: number;
    readonly endLine: number;
    readonly text: string;
  } | null;
  readonly warnings: readonly string[];
  readonly messages: readonly MessageInput[];
  readonly attachments: readonly AttachmentInput[];
  readonly skipped: readonly { readonly name: string; readonly reason: string }[];
}

export interface ImportSummary {
  readonly batchId: string;
  readonly sourceName: string;
  readonly importedAt: string;
  readonly lineCount: number;
  readonly messages: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly coverage: { readonly first: string | null; readonly last: string | null };
  readonly media: {
    readonly linked: number;
    /** Files in the archive that no message references unambiguously. */
    readonly unlinkedFiles: number;
    /** Messages naming a file that is not in the export. */
    readonly missingFiles: number;
    /** Messages where WhatsApp left media out of the export. */
    readonly omitted: number;
  };
  readonly skippedEntries: number;
  readonly chatKey: string;
  /** How this import's messages relate to messages already stored for the same chat. */
  readonly overlap: {
    readonly new: number;
    readonly duplicate: number;
    readonly uncertain: number;
  };
  readonly warnings: readonly string[];
}

const DB_FILE = "workspace.db";

/** Content fingerprint of a message (who, when, what); not unique on its own. */
export function messageFingerprint(m: {
  author: string | null;
  localDateTime: string | null;
  timestampText: string;
  kind: string;
  body: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([m.author, m.localDateTime ?? m.timestampText, m.kind, m.body]))
    .digest("hex");
}

/** Normalise an export's file name into a chat identity ("WhatsApp Chat with X (1).zip" -> "x"). */
export function chatKeyFromName(name: string): string {
  return name
    .replace(/\.(txt|zip)$/i, "")
    .replace(/\s*\(\d+\)$/, "")
    .replace(/^WhatsApp Chat (?:with |- )/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function migrate(db: Database.Database): number {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current > MIGRATIONS.length) {
    throw new Error(
      `workspace schema v${current} is newer than this ChatterPilot (v${MIGRATIONS.length})`,
    );
  }
  MIGRATIONS.slice(current).forEach((sql, i) => {
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${current + i + 1}`);
    })();
  });
  return MIGRATIONS.length;
}

/** Fill chat keys and fingerprints for rows created before schema v3. */
function backfill(db: Database.Database): void {
  const batches = db
    .prepare("SELECT id, source_name FROM import_batch WHERE chat_key = ''")
    .all() as {
    id: string;
    source_name: string;
  }[];
  const setKey = db.prepare("UPDATE import_batch SET chat_key = ? WHERE id = ?");
  const rows = db
    .prepare(
      `SELECT id, author, local_datetime AS localDateTime, timestamp_text AS timestampText, kind, body
       FROM message WHERE fingerprint = ''`,
    )
    .all() as {
    id: string;
    author: string | null;
    localDateTime: string | null;
    timestampText: string;
    kind: string;
    body: string;
  }[];
  const setFp = db.prepare("UPDATE message SET fingerprint = ? WHERE id = ?");
  db.transaction(() => {
    for (const b of batches) setKey.run(chatKeyFromName(b.source_name), b.id);
    for (const r of rows) setFp.run(messageFingerprint(r), r.id);
  })();
}

function connect(dir: string): Database.Database {
  const db = new Database(join(dir, DB_FILE));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}

/** A local workspace directory: one SQLite database plus a content-addressed blob store. */
export class Workspace {
  readonly dir: string;
  readonly db: Database.Database;
  readonly blobs: BlobStore;
  readonly reviews: ReviewStore;

  private constructor(dir: string, db: Database.Database) {
    this.dir = dir;
    this.db = db;
    this.blobs = new BlobStore(join(dir, "blobs"));
    this.reviews = new ReviewStore(db);
  }

  static exists(dir: string): boolean {
    return existsSync(join(dir, DB_FILE));
  }

  static create(dir: string, options: { name: string; timezone: string; now?: Date }): Workspace {
    if (!isValidTimeZone(options.timezone))
      throw new Error(`unknown time zone: ${options.timezone}`);
    if (Workspace.exists(dir)) throw new Error(`a workspace already exists in ${dir}`);
    mkdirSync(dir, { recursive: true });
    const db = connect(dir);
    migrate(db);
    const insert = db.prepare("INSERT INTO workspace_meta (key, value) VALUES (?, ?)");
    db.transaction(() => {
      insert.run("name", options.name);
      insert.run("timezone", options.timezone);
      insert.run("created_at", (options.now ?? new Date()).toISOString());
    })();
    return new Workspace(dir, db);
  }

  static open(dir: string): Workspace {
    if (!Workspace.exists(dir)) throw new Error(`no workspace in ${dir}`);
    const db = connect(dir);
    migrate(db);
    backfill(db);
    return new Workspace(dir, db);
  }

  info(): WorkspaceInfo {
    const rows = this.db.prepare("SELECT key, value FROM workspace_meta").all() as {
      key: string;
      value: string;
    }[];
    const meta = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      name: meta.name ?? "",
      timezone: meta.timezone ?? "",
      createdAt: meta.created_at ?? "",
      schemaVersion: this.db.pragma("user_version", { simple: true }) as number,
    };
  }

  findImportBySourceHash(sourceSha256: string): { id: string; importedAt: string } | null {
    const row = this.db
      .prepare("SELECT id, imported_at AS importedAt FROM import_batch WHERE source_sha256 = ?")
      .get(sourceSha256) as { id: string; importedAt: string } | undefined;
    return row ?? null;
  }

  /** True if any stored record points at this blob. */
  isBlobReferenced(sha256: string): boolean {
    return (
      this.db
        .prepare(
          `SELECT 1 FROM import_batch WHERE chat_text_sha256 = @sha
           UNION ALL SELECT 1 FROM attachment WHERE blob_sha256 = @sha
           UNION ALL SELECT 1 FROM catalogue_version
             WHERE @sha IN (products_sha256, customers_sha256, meta_sha256)
           LIMIT 1`,
        )
        .get({ sha: sha256 }) !== undefined
    );
  }

  /** Store one import atomically: batch, messages, attachments, links and skipped entries. */
  recordImport(input: RecordImportInput): ImportSummary {
    const batchId = randomUUID();
    const messageId = (position: number) => `${batchId}:${position}`;
    const times = input.messages.flatMap((m) => (m.localDateTime ? [m.localDateTime] : [])).sort();

    // Link by exact exported file name, only when exactly one message names the file.
    const referencedBy = new Map<string, number[]>();
    for (const m of input.messages) {
      if (m.media?.state === "attached" && m.media.fileName) {
        referencedBy.set(m.media.fileName, [
          ...(referencedBy.get(m.media.fileName) ?? []),
          m.index,
        ]);
      }
    }
    const warnings = [...input.warnings];
    for (const [fileName, positions] of referencedBy) {
      if (positions.length > 1) {
        warnings.push(
          `${fileName} is named by ${positions.length} messages; left unlinked for review.`,
        );
      }
    }

    // Align with messages already stored for this chat (canonical ones only).
    const fingerprints = input.messages.map((m) => messageFingerprint(m));
    const stored = this.db
      .prepare(
        `SELECT m.id, m.fingerprint, m.local_datetime AS time
         FROM message m JOIN import_batch b ON b.id = m.import_batch_id
         WHERE b.chat_key = ? AND m.duplicate_of IS NULL
         ORDER BY m.local_datetime, b.imported_at, b.rowid, m.position`,
      )
      .all(input.chatKey) as { id: string; fingerprint: string; time: string | null }[];
    const reconciled = reconcileSequences(
      stored,
      input.messages.map((m, i) => ({
        fingerprint: fingerprints[i] as string,
        time: m.localDateTime,
      })),
    );
    // A renamed file would hide the overlap: warn when most messages already exist in another chat.
    const otherChat = this.db.prepare(
      `SELECT b.chat_key AS chatKey FROM message m JOIN import_batch b ON b.id = m.import_batch_id
       WHERE m.fingerprint = ? AND b.chat_key <> ? AND m.duplicate_of IS NULL LIMIT 1`,
    );
    const elsewhere = new Map<string, number>();
    for (const fp of fingerprints) {
      const hit = otherChat.get(fp, input.chatKey) as { chatKey: string } | undefined;
      if (hit) elsewhere.set(hit.chatKey, (elsewhere.get(hit.chatKey) ?? 0) + 1);
    }
    for (const [chatKey, n] of elsewhere) {
      if (n >= 5 && n >= fingerprints.length / 2) {
        warnings.push(
          `${n} of ${fingerprints.length} messages already exist in the chat "${chatKey}". If this is the same chat under another file name, re-import it with the chat name "${chatKey}" so the overlap is counted once.`,
        );
      }
    }

    const uncertain = reconciled.filter((r) => r.status === "uncertain").length;
    if (uncertain > 0) {
      warnings.push(
        `${uncertain} message(s) overlap an earlier export of this chat but do not match it exactly (edited or deleted?); both versions are kept for review.`,
      );
    }

    const insertBatch = this.db.prepare(`
      INSERT INTO import_batch (
        id, source_sha256, source_name, source_kind, chat_text_sha256, chat_entry_name, parser_version,
        imported_at, encoding, had_bom, line_count, detected_date_order, applied_date_order,
        first_local_datetime, last_local_datetime, unattached_start_line, unattached_end_line,
        unattached_text, warnings_json, chat_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertMessage = this.db.prepare(`
      INSERT INTO message (
        id, import_batch_id, position, start_line, end_line, format, timestamp_text, local_datetime,
        status, author, body, kind, edited, media_state, media_file_name, media_type,
        fingerprint, overlap, duplicate_of
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertAttachment = this.db.prepare(`
      INSERT INTO attachment (
        id, import_batch_id, file_name, blob_sha256, size_bytes, media_type, content_check,
        message_id, link_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertSkipped = this.db.prepare(
      "INSERT INTO skipped_entry (import_batch_id, name, reason) VALUES (?, ?, ?)",
    );

    this.db.transaction(() => {
      insertBatch.run(
        batchId,
        input.sourceSha256,
        input.sourceName,
        input.sourceKind,
        input.chatTextSha256,
        input.chatEntryName,
        input.parserVersion,
        input.importedAt,
        input.encoding,
        input.hadByteOrderMark ? 1 : 0,
        input.lineCount,
        input.detectedDateOrder,
        input.appliedDateOrder,
        times[0] ?? null,
        times.at(-1) ?? null,
        input.unattached?.startLine ?? null,
        input.unattached?.endLine ?? null,
        input.unattached?.text ?? null,
        JSON.stringify(warnings),
        input.chatKey,
      );
      input.messages.forEach((m, i) => {
        const r = reconciled[i] ?? { status: "new" as const };
        insertMessage.run(
          messageId(m.index),
          batchId,
          m.index,
          m.startLine,
          m.endLine,
          m.format,
          m.timestampText,
          m.localDateTime,
          m.status,
          m.author,
          m.body,
          m.kind,
          m.edited ? 1 : 0,
          m.media?.state ?? null,
          m.media?.fileName ?? null,
          m.media?.mediaType ?? null,
          fingerprints[i] as string,
          r.status,
          r.status === "duplicate" ? r.of : null,
        );
      });
      for (const a of input.attachments) {
        const positions = referencedBy.get(a.name) ?? [];
        const linked = positions.length === 1 ? messageId(positions[0] as number) : null;
        insertAttachment.run(
          randomUUID(),
          batchId,
          a.name,
          a.blob.sha256,
          a.blob.sizeBytes,
          a.mediaType,
          a.contentCheck,
          linked,
          linked ? "exact_file_name" : null,
        );
      }
      for (const s of input.skipped) insertSkipped.run(batchId, s.name, s.reason);
    })();

    return this.importSummary(batchId);
  }

  importSummaries(): ImportSummary[] {
    const ids = this.db
      .prepare("SELECT id FROM import_batch ORDER BY imported_at, rowid")
      .all() as {
      id: string;
    }[];
    return ids.map((r) => this.importSummary(r.id));
  }

  importSummary(batchId: string): ImportSummary {
    const batch = this.db
      .prepare(
        `SELECT source_name AS sourceName, imported_at AS importedAt, line_count AS lineCount,
                first_local_datetime AS first, last_local_datetime AS last, warnings_json AS warnings,
                chat_key AS chatKey
         FROM import_batch WHERE id = ?`,
      )
      .get(batchId) as
      | {
          sourceName: string;
          importedAt: string;
          lineCount: number;
          first: string | null;
          last: string | null;
          warnings: string;
          chatKey: string;
        }
      | undefined;
    if (!batch) throw new Error(`unknown import batch ${batchId}`);
    const grouped = (column: "kind" | "status") =>
      Object.fromEntries(
        (
          this.db
            .prepare(
              `SELECT ${column} AS k, COUNT(*) AS n FROM message WHERE import_batch_id = ? GROUP BY ${column}`,
            )
            .all(batchId) as { k: string; n: number }[]
        ).map((r) => [r.k, r.n]),
      );
    const count = (sql: string) =>
      (this.db.prepare(sql).get({ batch: batchId }) as { n: number }).n;
    const overlapCount = (status: string) =>
      (
        this.db
          .prepare("SELECT COUNT(*) AS n FROM message WHERE import_batch_id = ? AND overlap = ?")
          .get(batchId, status) as { n: number }
      ).n;
    const byKind = grouped("kind");
    return {
      batchId,
      sourceName: batch.sourceName,
      importedAt: batch.importedAt,
      lineCount: batch.lineCount,
      messages: Object.values(byKind).reduce((a, b) => a + b, 0),
      byKind,
      byStatus: grouped("status"),
      coverage: { first: batch.first, last: batch.last },
      media: {
        linked: count(
          "SELECT COUNT(*) AS n FROM attachment WHERE import_batch_id = @batch AND message_id IS NOT NULL",
        ),
        unlinkedFiles: count(
          "SELECT COUNT(*) AS n FROM attachment WHERE import_batch_id = @batch AND message_id IS NULL",
        ),
        missingFiles: count(`
          SELECT COUNT(*) AS n FROM message m
          WHERE m.import_batch_id = @batch AND m.media_state = 'attached'
            AND NOT EXISTS (SELECT 1 FROM attachment a
                            WHERE a.import_batch_id = @batch AND a.file_name = m.media_file_name)`),
        omitted: count(
          "SELECT COUNT(*) AS n FROM message WHERE import_batch_id = @batch AND media_state = 'omitted'",
        ),
      },
      skippedEntries: count(
        "SELECT COUNT(*) AS n FROM skipped_entry WHERE import_batch_id = @batch",
      ),
      chatKey: batch.chatKey,
      overlap: {
        new: overlapCount("new"),
        duplicate: overlapCount("duplicate"),
        uncertain: overlapCount("uncertain"),
      },
      warnings: JSON.parse(batch.warnings) as string[],
    };
  }

  close(): void {
    this.db.close();
  }
}
