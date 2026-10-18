import type Database from "better-sqlite3";

export interface ApprovalRecord {
  readonly id: string;
  readonly draftId: string;
  readonly operator: string;
  readonly connectorId: string;
  readonly origin: string;
  readonly account: string;
  readonly action: "prepare_draft" | "submit";
  readonly documentType: string;
  readonly counterpartyId: string;
  readonly payloadHash: string;
  readonly catalogueVersion: string;
  readonly approvedAt: string;
  readonly expiresAt: string;
  readonly payloadJson: string;
}

export interface AttemptRecord {
  readonly id: string;
  readonly approvalId: string;
  readonly idempotencyKey: string;
  readonly state: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly remoteRef: string | null;
  readonly readbackJson: string | null;
  readonly diffJson: string | null;
  readonly error: string | null;
}

export interface ExecutionEventRecord {
  readonly seq: number;
  readonly attemptId: string;
  readonly at: string;
  readonly fromState: string | null;
  readonly toState: string;
  readonly note: string;
}

const ATTEMPT_SELECT = `SELECT id, approval_id AS approvalId, idempotency_key AS idempotencyKey, state,
  created_at AS createdAt, updated_at AS updatedAt, remote_ref AS remoteRef,
  readback_json AS readbackJson, diff_json AS diffJson, error FROM execution_attempt`;

/** Raw persistence for the execution ledger; the state machine lives in order-automation. */
export class ExecutionStore {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  insertApproval(record: ApprovalRecord): void {
    this.db
      .prepare(
        `INSERT INTO connector_approval (id, draft_id, operator, connector_id, origin, account, action,
           document_type, counterparty_id, payload_hash, catalogue_version, approved_at, expires_at, payload_json)
         VALUES (@id, @draftId, @operator, @connectorId, @origin, @account, @action, @documentType,
           @counterpartyId, @payloadHash, @catalogueVersion, @approvedAt, @expiresAt, @payloadJson)`,
      )
      .run(record);
  }

  approval(id: string): ApprovalRecord | null {
    return (
      (this.db
        .prepare(
          `SELECT id, draft_id AS draftId, operator, connector_id AS connectorId, origin, account, action,
             document_type AS documentType, counterparty_id AS counterpartyId, payload_hash AS payloadHash,
             catalogue_version AS catalogueVersion, approved_at AS approvedAt, expires_at AS expiresAt,
             payload_json AS payloadJson
           FROM connector_approval WHERE id = ?`,
        )
        .get(id) as ApprovalRecord | undefined) ?? null
    );
  }

  /**
   * Claim a new attempt for a business document. Returns null when a live attempt already exists
   * for the same idempotency key (duplicate or concurrent run).
   */
  claimAttempt(input: {
    id: string;
    approvalId: string;
    idempotencyKey: string;
    state: string;
    at: string;
    note: string;
  }): AttemptRecord | null {
    try {
      this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO execution_attempt (id, approval_id, idempotency_key, state, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(input.id, input.approvalId, input.idempotencyKey, input.state, input.at, input.at);
        this.db
          .prepare(
            "INSERT INTO execution_event (attempt_id, at, from_state, to_state, note) VALUES (?, ?, NULL, ?, ?)",
          )
          .run(input.id, input.at, input.state, input.note);
      })();
    } catch (err) {
      if (err instanceof Error && /UNIQUE constraint failed/.test(err.message)) return null;
      throw err;
    }
    return this.attempt(input.id);
  }

  attempt(id: string): AttemptRecord | null {
    return (
      (this.db.prepare(`${ATTEMPT_SELECT} WHERE id = ?`).get(id) as AttemptRecord | undefined) ??
      null
    );
  }

  liveAttempt(idempotencyKey: string): AttemptRecord | null {
    return (
      (this.db
        .prepare(
          `${ATTEMPT_SELECT} WHERE idempotency_key = ? AND state NOT IN ('failed_before_side_effect', 'rejected')`,
        )
        .get(idempotencyKey) as AttemptRecord | undefined) ?? null
    );
  }

  /**
   * Compare-and-set a state change. Returns false (and changes nothing) if the attempt is no longer
   * in `from`, so two runners can never both perform the same step.
   */
  transition(
    id: string,
    from: string,
    to: string,
    at: string,
    note: string,
    fields: { remoteRef?: string; readbackJson?: string; diffJson?: string; error?: string } = {},
  ): boolean {
    return this.db.transaction(() => {
      const result = this.db
        .prepare(
          `UPDATE execution_attempt SET state = @to, updated_at = @at,
             remote_ref = COALESCE(@remoteRef, remote_ref),
             readback_json = COALESCE(@readbackJson, readback_json),
             diff_json = COALESCE(@diffJson, diff_json),
             error = COALESCE(@error, error)
           WHERE id = @id AND state = @from`,
        )
        .run({
          id,
          from,
          to,
          at,
          remoteRef: fields.remoteRef ?? null,
          readbackJson: fields.readbackJson ?? null,
          diffJson: fields.diffJson ?? null,
          error: fields.error ?? null,
        });
      if (result.changes !== 1) return false;
      this.db
        .prepare(
          "INSERT INTO execution_event (attempt_id, at, from_state, to_state, note) VALUES (?, ?, ?, ?, ?)",
        )
        .run(id, at, from, to, note);
      return true;
    })();
  }

  events(attemptId: string): ExecutionEventRecord[] {
    return this.db
      .prepare(
        `SELECT seq, attempt_id AS attemptId, at, from_state AS fromState, to_state AS toState, note
         FROM execution_event WHERE attempt_id = ? ORDER BY seq`,
      )
      .all(attemptId) as ExecutionEventRecord[];
  }
}
