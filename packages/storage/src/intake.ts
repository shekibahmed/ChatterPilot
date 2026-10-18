import type Database from "better-sqlite3";

export interface EnvelopeRecord {
  readonly id: string;
  readonly updateId: number;
  readonly chatId: number;
  readonly messageId: number;
  readonly senderId: number;
  readonly receivedAt: string;
  readonly forwardOrigin: string | null;
  readonly forwardDate: string | null;
  readonly text: string;
  readonly contentHash: string;
  readonly status: "accepted" | "possible_repeat" | "edit" | "media_only";
  readonly repeatOf: string | null;
  readonly editOf: string | null;
}

const SELECT = `SELECT id, update_id AS updateId, chat_id AS chatId, message_id AS messageId,
  sender_id AS senderId, received_at AS receivedAt, forward_origin AS forwardOrigin,
  forward_date AS forwardDate, text, content_hash AS contentHash, status, repeat_of AS repeatOf,
  edit_of AS editOf FROM intake_envelope`;

/** Raw persistence for Telegram intake; rules live in @chatterpilot/telegram-intake. */
export class IntakeStore {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Highest update_id handled (accepted or refused), or null before the first update. */
  offset(): number | null {
    const row = this.db.prepare("SELECT value FROM intake_state WHERE key = 'offset'").get() as
      | { value: string }
      | undefined;
    return row ? Number(row.value) : null;
  }

  lastSeenAt(): string | null {
    const row = this.db
      .prepare("SELECT value FROM intake_state WHERE key = 'last_seen_at'")
      .get() as { value: string } | undefined;
    return row?.value ?? null;
  }

  private advance(updateId: number, at: string): void {
    const set = this.db.prepare(
      "INSERT INTO intake_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    );
    const current = this.offset();
    if (current === null || updateId > current) set.run("offset", String(updateId));
    set.run("last_seen_at", at);
  }

  seen(updateId: number): boolean {
    return (
      this.db.prepare("SELECT 1 FROM intake_envelope WHERE update_id = ?").get(updateId) !==
        undefined ||
      this.db.prepare("SELECT 1 FROM intake_log WHERE update_id = ?").get(updateId) !== undefined
    );
  }

  /** Store an envelope and advance the offset in one transaction (crash-safe). */
  accept(record: EnvelopeRecord, at: string): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO intake_envelope (id, update_id, chat_id, message_id, sender_id, received_at,
             forward_origin, forward_date, text, content_hash, status, repeat_of, edit_of)
           VALUES (@id, @updateId, @chatId, @messageId, @senderId, @receivedAt, @forwardOrigin,
             @forwardDate, @text, @contentHash, @status, @repeatOf, @editOf)`,
        )
        .run(record);
      this.advance(record.updateId, at);
    })();
  }

  /** Record an update handled without storing its content, and advance the offset. */
  log(
    updateId: number,
    at: string,
    outcome: "refused" | "callback_valid" | "callback_refused",
    note: string,
  ): void {
    this.db.transaction(() => {
      this.db
        .prepare("INSERT INTO intake_log (update_id, at, outcome, note) VALUES (?, ?, ?, ?)")
        .run(updateId, at, outcome, note);
      this.advance(updateId, at);
    })();
  }

  byHash(contentHash: string): EnvelopeRecord | null {
    return (
      (this.db
        .prepare(`${SELECT} WHERE content_hash = ? ORDER BY update_id LIMIT 1`)
        .get(contentHash) as EnvelopeRecord | undefined) ?? null
    );
  }

  byMessage(chatId: number, messageId: number): EnvelopeRecord | null {
    return (
      (this.db
        .prepare(`${SELECT} WHERE chat_id = ? AND message_id = ? AND status <> 'edit' LIMIT 1`)
        .get(chatId, messageId) as EnvelopeRecord | undefined) ?? null
    );
  }

  envelopes(): EnvelopeRecord[] {
    return this.db.prepare(`${SELECT} ORDER BY update_id`).all() as EnvelopeRecord[];
  }

  logEntries(): { updateId: number; at: string; outcome: string; note: string }[] {
    return this.db
      .prepare("SELECT update_id AS updateId, at, outcome, note FROM intake_log ORDER BY update_id")
      .all() as { updateId: number; at: string; outcome: string; note: string }[];
  }
}
