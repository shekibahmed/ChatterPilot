import { createHash } from "node:crypto";
import { formatMinor } from "@chatterpilot/core";
import type { OrderDraft } from "@chatterpilot/orders";

/**
 * The exact document a connector may write to a target app, derived only from an accepted
 * (frozen, fingerprinted) draft. Quantities and money are decimal strings so nothing is re-rounded.
 */
export interface ExecutionPayload {
  readonly documentType: "proforma";
  readonly sourceDraftId: string;
  readonly snapshotSha256: string;
  readonly catalogueVersion: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly orderDate: string;
  readonly currency: string;
  readonly lines: readonly {
    readonly productId: string;
    readonly productName: string;
    readonly quantity: string;
    readonly unit: string;
    readonly unitPrice: string;
    readonly amount: string;
    readonly tax: string;
  }[];
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly total: string;
}

export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadError";
  }
}

const qty = (milli: number) => formatMinor(milli, 3).replace(/\.?0+$/, "");

/** Build a payload from an accepted draft. Any unknown critical value refuses the payload. */
export function payloadFromAcceptedDraft(input: {
  draftId: string;
  status: string;
  snapshotSha256: string | null;
  draft: OrderDraft;
}): ExecutionPayload {
  const { draft } = input;
  if (input.status !== "accepted" || !input.snapshotSha256) {
    throw new PayloadError("Only accepted drafts can be sent to another system.");
  }
  if (draft.issues.length > 0) throw new PayloadError("The draft still has open issues.");
  const need = <T>(value: T | null, what: string): T => {
    if (value === null) throw new PayloadError(`${what} is unknown.`);
    return value;
  };
  const customer = need(draft.customer.value, "Customer");
  const lines = draft.lines
    .filter((l) => !l.excluded)
    .map((l, i) => {
      const product = need(l.product.value, `Line ${i + 1} product`);
      return {
        productId: product.productId,
        productName: product.name,
        quantity: qty(need(l.quantity.value, `Line ${i + 1} quantity`).milli),
        unit: need(l.unit.value, `Line ${i + 1} unit`),
        unitPrice: formatMinor(need(l.unitPrice.value, `Line ${i + 1} price`)),
        amount: formatMinor(need(l.amount.value, `Line ${i + 1} amount`)),
        tax: formatMinor(need(l.tax.value, `Line ${i + 1} tax`)),
      };
    });
  if (lines.length === 0) throw new PayloadError("The draft has no lines.");
  return {
    documentType: "proforma",
    sourceDraftId: input.draftId,
    snapshotSha256: input.snapshotSha256,
    catalogueVersion: draft.catalogueVersion,
    customerId: customer.customerId,
    customerName: customer.name,
    orderDate: need(draft.orderDate.value, "Order date"),
    currency: need(draft.currency.value, "Currency"),
    lines,
    subtotal: formatMinor(need(draft.subtotal.value, "Subtotal")),
    taxTotal: formatMinor(need(draft.taxTotal.value, "Tax")),
    total: formatMinor(need(draft.total.value, "Total")),
  };
}

/** Stable JSON (sorted keys) so the same payload always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const payloadHash = (payload: ExecutionPayload) =>
  createHash("sha256").update(canonicalJson(payload)).digest("hex");
