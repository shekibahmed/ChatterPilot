import { randomUUID } from "node:crypto";
import type { Workspace } from "@chatterpilot/storage";
import {
  type Approval,
  type ApprovalCheck,
  type ConnectorAction,
  checkApproval,
} from "./approval.ts";
import {
  type Connector,
  ConnectorError,
  diffReadBack,
  type FieldDiff,
  type ReadBack,
} from "./connector.ts";
import type { ExecutionPayload } from "./payload.ts";

/** PLAN §16 state machine. Transitions not listed here are refused. */
export const TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  received: ["validated", "rejected"],
  validated: ["needs_review", "rejected"],
  needs_review: ["approved_for_draft", "rejected"],
  approved_for_draft: ["preparing_draft", "cancelled_before_submit"],
  preparing_draft: ["draft_readback", "blocked", "failed_before_side_effect", "submitted_unknown"],
  draft_readback: ["awaiting_submit_approval", "blocked"],
  awaiting_submit_approval: ["approved_to_submit", "cancelled_before_submit"],
  approved_to_submit: ["submitting", "cancelled_before_submit"],
  submitting: ["verified_complete", "submitted_unknown", "failed_before_side_effect"],
  submitted_unknown: ["draft_readback", "verified_complete", "rejected"],
  // A person may close a stuck attempt after checking the target; this frees the document key.
  blocked: ["rejected"],
  cancelled_before_submit: ["rejected"],
};

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface RunResult {
  readonly attemptId: string | null;
  readonly state: string;
  readonly remoteRef: string | null;
  readonly diff: readonly FieldDiff[];
  readonly message: string;
}

function approvalFromRecord(
  ws: Workspace,
  approvalId: string,
): { approval: Approval; payload: ExecutionPayload; draftId: string } {
  const r = ws.executions.approval(approvalId);
  if (!r) throw new Error(`Unknown approval ${approvalId}.`);
  return {
    draftId: r.draftId,
    payload: JSON.parse(r.payloadJson) as ExecutionPayload,
    approval: {
      id: r.id,
      operator: r.operator,
      target: { connectorId: r.connectorId, origin: r.origin, account: r.account },
      action: r.action,
      documentType: "proforma",
      counterpartyId: r.counterpartyId,
      payloadHash: r.payloadHash,
      catalogueVersion: r.catalogueVersion,
      approvedAt: r.approvedAt,
      expiresAt: r.expiresAt,
    },
  };
}

/** Workspace + target account + document type + business reference. */
export const idempotencyKey = (connector: Connector, payload: ExecutionPayload) =>
  `${connector.id}|${connector.account}|${payload.documentType}|${payload.sourceDraftId}`;

/** The accepted snapshot hash a draft currently has, or null if it is not accepted. */
export function currentAcceptedSnapshot(ws: Workspace, draftId: string): string | null {
  if (ws.reviews.draft(draftId)?.status !== "accepted") return null;
  const accept = [...ws.reviews.decisions(draftId)].reverse().find((d) => d.action === "accept");
  return (accept?.payload as { snapshotSha256?: string } | undefined)?.snapshotSha256 ?? null;
}

export function storeApproval(
  ws: Workspace,
  approval: Approval,
  draftId: string,
  payload: ExecutionPayload,
): void {
  if (
    payload.sourceDraftId !== draftId ||
    currentAcceptedSnapshot(ws, draftId) !== payload.snapshotSha256
  ) {
    throw new Error("The payload does not match the draft's current accepted version.");
  }
  ws.executions.insertApproval({
    id: approval.id,
    draftId,
    operator: approval.operator,
    connectorId: approval.target.connectorId,
    origin: approval.target.origin,
    account: approval.target.account,
    action: approval.action,
    documentType: approval.documentType,
    counterpartyId: approval.counterpartyId,
    payloadHash: approval.payloadHash,
    catalogueVersion: approval.catalogueVersion,
    approvedAt: approval.approvedAt,
    expiresAt: approval.expiresAt,
    payloadJson: JSON.stringify(payload),
  });
}

interface RunInput {
  readonly ws: Workspace;
  readonly approvalId: string;
  readonly operator: string;
  readonly connector: Connector;
  readonly currentCatalogueVersion: string;
  readonly now?: () => Date;
}

function verify(
  input: RunInput,
  action: ConnectorAction,
): { check: ApprovalCheck; payload: ExecutionPayload; draftId: string; approval: Approval } {
  const { approval, payload, draftId } = approvalFromRecord(input.ws, input.approvalId);
  const check = checkApproval(approval, {
    operator: input.operator,
    target: {
      connectorId: input.connector.id,
      origin: input.connector.origin,
      account: input.connector.account,
    },
    action,
    payload,
    currentCatalogueVersion: input.currentCatalogueVersion,
    now: (input.now ?? (() => new Date()))(),
  });
  // The approval covers one accepted version; reopening, editing or rejecting the draft voids it.
  if (currentAcceptedSnapshot(input.ws, draftId) !== payload.snapshotSha256) {
    const reasons = [
      ...(check.ok ? [] : check.reasons),
      "the draft is no longer accepted in the approved version",
    ];
    return { check: { ok: false, reasons }, payload, draftId, approval };
  }
  return { check, payload, draftId, approval };
}

/**
 * Close a blocked, cancelled or unknown attempt after a person has checked the target. Recorded with
 * the operator and reason; frees the document so a new, separately approved attempt can run.
 */
export function closeAttempt(
  ws: Workspace,
  attemptId: string,
  operator: string,
  reason: string,
): boolean {
  if (!operator.trim() || !reason.trim())
    throw new Error("Closing an attempt needs an operator and a reason.");
  const attempt = ws.executions.attempt(attemptId);
  if (!attempt || !canTransition(attempt.state, "rejected")) return false;
  return ws.executions.transition(
    attemptId,
    attempt.state,
    "rejected",
    new Date().toISOString(),
    `Closed by ${operator.trim()}: ${reason.trim()}`,
  );
}

/**
 * Prepare an approved draft in the target and stop before submission:
 * approved_for_draft → preparing_draft → draft_readback → awaiting_submit_approval.
 * Any approval problem, duplicate run, layout change or read-back difference stops the run.
 */
export async function prepareApprovedDraft(input: RunInput): Promise<RunResult> {
  const { ws, connector } = input;
  const at = () => (input.now ?? (() => new Date()))().toISOString();
  const { check, payload } = verify(input, "prepare_draft");
  const key = idempotencyKey(connector, payload);

  if (!check.ok) {
    // Recorded for audit; a rejected attempt does not hold the business key.
    const rejected = ws.executions.claimAttempt({
      id: randomUUID(),
      approvalId: input.approvalId,
      idempotencyKey: key,
      state: "rejected",
      at: at(),
      note: `Approval check failed: ${check.reasons.join("; ")}`,
    });
    return {
      attemptId: rejected?.id ?? null,
      state: "rejected",
      remoteRef: null,
      diff: [],
      message: `Not allowed: ${check.reasons.join("; ")}.`,
    };
  }

  const attempt = ws.executions.claimAttempt({
    id: randomUUID(),
    approvalId: input.approvalId,
    idempotencyKey: key,
    state: "approved_for_draft",
    at: at(),
    note: `Approved by ${input.operator}; connector ${connector.id}@${connector.version} (${connector.provenance})`,
  });
  if (!attempt) {
    const live = ws.executions.liveAttempt(key);
    return {
      attemptId: live?.id ?? null,
      state: live?.state ?? "unknown",
      remoteRef: live?.remoteRef ?? null,
      diff: [],
      message:
        "This document already has an attempt in progress or finished; it was not sent again.",
    };
  }
  const id = attempt.id;
  const move = (
    from: string,
    to: string,
    note: string,
    fields?: Parameters<typeof ws.executions.transition>[5],
  ) => {
    if (!canTransition(from, to)) throw new Error(`Illegal transition ${from} → ${to}`);
    if (!ws.executions.transition(id, from, to, at(), note, fields)) {
      throw new Error(`Attempt ${id} was changed by another run (expected ${from}).`);
    }
  };

  move("approved_for_draft", "preparing_draft", "Filling the target form");
  let remoteRef: string;
  let state = "preparing_draft";
  try {
    remoteRef = (await connector.prepareDraft(payload)).remoteRef;
  } catch (err) {
    const e = err instanceof ConnectorError ? err : new ConnectorError(String(err), true);
    if (e.diff.length > 0) {
      move("preparing_draft", "blocked", `Target values differ before saving: ${e.message}`, {
        diffJson: JSON.stringify(e.diff),
        error: e.message,
      });
      return { attemptId: id, state: "blocked", remoteRef: null, diff: e.diff, message: e.message };
    }
    if (!e.sideEffectPossible) {
      move("preparing_draft", "failed_before_side_effect", e.message, { error: e.message });
      return {
        attemptId: id,
        state: "failed_before_side_effect",
        remoteRef: null,
        diff: [],
        message: e.message,
      };
    }
    // The save may or may not have happened: never resend; look it up by our reference.
    move("preparing_draft", "submitted_unknown", `Outcome unknown: ${e.message}`, {
      error: e.message,
    });
    state = "submitted_unknown";
    const found = await connector.findByReference(payload.sourceDraftId).catch(() => []);
    if (found.length !== 1 || !found[0]) {
      return {
        attemptId: id,
        state,
        remoteRef: null,
        diff: [],
        message:
          found.length === 0
            ? "Outcome unknown and no matching draft was found. A person must check the target before anything is retried."
            : "Several matching drafts were found. A person must check the target.",
      };
    }
    remoteRef = found[0];
  }

  move(
    state,
    "draft_readback",
    `Draft ${remoteRef} saved${state === "submitted_unknown" ? " (found by reference)" : ""}`,
    {
      remoteRef,
    },
  );
  let rb: ReadBack;
  try {
    rb = await connector.readBack(remoteRef);
  } catch (err) {
    const message = `Read-back failed: ${err instanceof Error ? err.message : String(err)}`;
    move("draft_readback", "blocked", message, { error: message });
    return { attemptId: id, state: "blocked", remoteRef, diff: [], message };
  }
  const diff = diffReadBack(payload, rb);
  if (diff.length > 0) {
    move("draft_readback", "blocked", "Saved draft differs from the approved document", {
      readbackJson: JSON.stringify(rb),
      diffJson: JSON.stringify(diff),
    });
    return {
      attemptId: id,
      state: "blocked",
      remoteRef,
      diff,
      message: "The saved draft differs from the approved document.",
    };
  }
  move(
    "draft_readback",
    "awaiting_submit_approval",
    "Read-back matches; stopped before submission",
    {
      readbackJson: JSON.stringify(rb),
    },
  );
  return {
    attemptId: id,
    state: "awaiting_submit_approval",
    remoteRef,
    diff: [],
    message: "Draft prepared and verified. Stopped before submission.",
  };
}

/**
 * Submission is deliberately not available in release 1 (PLAN §16): even a valid "submit" approval
 * is refused here. The approval is still checked first so misuse is reported precisely.
 */
export function submitApproved(input: RunInput): RunResult {
  const { check } = verify(input, "submit");
  const reasons = check.ok ? [] : check.reasons;
  return {
    attemptId: null,
    state: "refused",
    remoteRef: null,
    diff: [],
    message: [
      ...reasons.map((r) => `Not allowed: ${r}.`),
      "Submitting to a real or test target is not enabled in this release.",
    ].join(" "),
  };
}
