import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export interface TranscriptRecord {
  readonly id: string;
  readonly messageId: string;
  readonly version: number;
  readonly text: string;
  readonly language: string | null;
  readonly origin: "manual" | "provider";
  readonly provider: string | null;
  readonly model: string | null;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly note: string | null;
}

const SELECT = `SELECT id, message_id AS messageId, version, text, language, origin, provider, model,
  created_at AS createdAt, created_by AS createdBy, note FROM transcript`;

/** Versioned transcripts of voice-note messages. */
export class TranscriptStore {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  add(input: {
    messageId: string;
    text: string;
    language: string | null;
    origin: "manual" | "provider";
    provider?: string | null;
    model?: string | null;
    createdBy: string;
    note?: string | null;
    at: string;
  }): TranscriptRecord {
    const id = randomUUID();
    this.db.transaction(() => {
      const next = (
        this.db
          .prepare("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM transcript WHERE message_id = ?")
          .get(input.messageId) as { v: number }
      ).v;
      this.db
        .prepare(
          `INSERT INTO transcript (id, message_id, version, text, language, origin, provider, model,
             created_at, created_by, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.messageId,
          next,
          input.text,
          input.language,
          input.origin,
          input.provider ?? null,
          input.model ?? null,
          input.at,
          input.createdBy,
          input.note ?? null,
        );
    })();
    return this.byId(id) as TranscriptRecord;
  }

  byId(id: string): TranscriptRecord | null {
    return (
      (this.db.prepare(`${SELECT} WHERE id = ?`).get(id) as TranscriptRecord | undefined) ?? null
    );
  }

  latest(messageId: string): TranscriptRecord | null {
    return (
      (this.db
        .prepare(`${SELECT} WHERE message_id = ? ORDER BY version DESC LIMIT 1`)
        .get(messageId) as TranscriptRecord | undefined) ?? null
    );
  }

  versions(messageId: string): TranscriptRecord[] {
    return this.db
      .prepare(`${SELECT} WHERE message_id = ? ORDER BY version`)
      .all(messageId) as TranscriptRecord[];
  }
}
