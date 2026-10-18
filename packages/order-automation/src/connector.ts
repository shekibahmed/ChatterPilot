import type { ExecutionPayload } from "./payload.ts";

/** What a connector reads back from the target after preparing a document. */
export interface ReadBack {
  readonly remoteRef: string;
  readonly status: string;
  readonly reference: string | null;
  readonly customerId: string | null;
  readonly orderDate: string | null;
  readonly lines: readonly {
    readonly productId: string | null;
    readonly quantity: string | null;
    readonly unit: string | null;
    readonly unitPrice: string | null;
    readonly amount: string | null;
    readonly tax: string | null;
  }[];
  readonly subtotal: string | null;
  readonly taxTotal: string | null;
  readonly total: string | null;
}

/**
 * Connector contract. Every method declares whether it can change the target. Connectors stop on
 * anything unexpected (missing field, changed layout, unknown option) instead of guessing.
 */
export interface Connector {
  readonly id: string;
  readonly version: string;
  readonly origin: string;
  readonly account: string;
  /** "recorded" only when derived from a genuine recording of a person using the target. */
  readonly provenance: "recorded" | "hand-written";
  readonly capabilities: {
    readonly documentTypes: readonly "proforma"[];
    readonly sideEffects: {
      readonly prepareDraft: string;
      readonly readBack: "none";
      readonly findByReference: "none";
      readonly submit: string;
    };
  };
  /** Fill the target form, check it, then save a draft. Side effect: creates a draft record. */
  prepareDraft(payload: ExecutionPayload): Promise<{ remoteRef: string }>;
  /** Read a saved draft. No side effect. */
  readBack(remoteRef: string): Promise<ReadBack>;
  /** Find drafts by our reference, for reconciliation after an unknown outcome. No side effect. */
  findByReference(reference: string): Promise<string[]>;
}

/** A connector failure, with whether the target may already have been changed. */
export class ConnectorError extends Error {
  readonly sideEffectPossible: boolean;
  readonly diff: readonly FieldDiff[];
  constructor(message: string, sideEffectPossible: boolean, diff: readonly FieldDiff[] = []) {
    super(message);
    this.name = "ConnectorError";
    this.sideEffectPossible = sideEffectPossible;
    this.diff = diff;
  }
}

export interface FieldDiff {
  readonly field: string;
  readonly expected: string | null;
  readonly actual: string | null;
}

/** Compare what the target holds with what was approved. Any difference blocks the attempt. */
export function diffReadBack(
  payload: ExecutionPayload,
  rb: Omit<ReadBack, "remoteRef">,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const check = (field: string, expected: string | null, actual: string | null) => {
    if (expected !== actual) diffs.push({ field, expected, actual });
  };
  // Only an unsubmitted draft is acceptable: a record someone already submitted must not pass.
  check("status", "draft", rb.status);
  check("reference", payload.sourceDraftId, rb.reference);
  check("customerId", payload.customerId, rb.customerId);
  check("orderDate", payload.orderDate, rb.orderDate);
  check("lineCount", String(payload.lines.length), String(rb.lines.length));
  payload.lines.forEach((line, i) => {
    const actual = rb.lines[i];
    check(`lines[${i}].productId`, line.productId, actual?.productId ?? null);
    check(`lines[${i}].quantity`, line.quantity, actual?.quantity ?? null);
    check(`lines[${i}].unit`, line.unit, actual?.unit ?? null);
    check(`lines[${i}].unitPrice`, line.unitPrice, actual?.unitPrice ?? null);
    check(`lines[${i}].amount`, line.amount, actual?.amount ?? null);
    check(`lines[${i}].tax`, line.tax, actual?.tax ?? null);
  });
  check("subtotal", payload.subtotal, rb.subtotal);
  check("taxTotal", payload.taxTotal, rb.taxTotal);
  check("total", payload.total, rb.total);
  return diffs;
}
