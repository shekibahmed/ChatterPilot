import { type ExecutionPayload, payloadHash } from "./payload.ts";

/** Actions a connector can take. Sending a document to a customer is not one of them. */
export type ConnectorAction = "prepare_draft" | "submit";

export interface Target {
  readonly connectorId: string;
  readonly origin: string;
  readonly account: string;
}

/**
 * A person's permission for one action on one exact payload in one target, until it expires.
 * Any material change (payload, catalogue/prices, target, operator, action) invalidates it.
 */
export interface Approval {
  readonly id: string;
  readonly operator: string;
  readonly target: Target;
  readonly action: ConnectorAction;
  readonly documentType: "proforma";
  readonly counterpartyId: string;
  readonly payloadHash: string;
  readonly catalogueVersion: string;
  readonly approvedAt: string;
  readonly expiresAt: string;
}

export type ApprovalCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[] };

export interface ApprovalContext {
  readonly operator: string;
  readonly target: Target;
  readonly action: ConnectorAction;
  readonly payload: ExecutionPayload;
  /** The workspace's current catalogue version: a newer one means prices may have changed. */
  readonly currentCatalogueVersion: string;
  readonly now: Date;
}

/** Maximum approval lifetime; shorter is allowed. */
export const MAX_APPROVAL_MINUTES = 60;

export function createApproval(input: {
  id: string;
  operator: string;
  target: Target;
  action: ConnectorAction;
  payload: ExecutionPayload;
  now: Date;
  minutes: number;
}): Approval {
  if (!input.operator.trim()) throw new Error("An approval needs a named operator.");
  if (input.minutes <= 0 || input.minutes > MAX_APPROVAL_MINUTES) {
    throw new Error(`Approval lifetime must be between 1 and ${MAX_APPROVAL_MINUTES} minutes.`);
  }
  return {
    id: input.id,
    operator: input.operator.trim(),
    target: input.target,
    action: input.action,
    documentType: input.payload.documentType,
    counterpartyId: input.payload.customerId,
    payloadHash: payloadHash(input.payload),
    catalogueVersion: input.payload.catalogueVersion,
    approvedAt: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + input.minutes * 60_000).toISOString(),
  };
}

/** Code, not a model or a chat message, decides whether an action is allowed. */
export function checkApproval(approval: Approval, ctx: ApprovalContext): ApprovalCheck {
  const reasons: string[] = [];
  if (approval.operator !== ctx.operator) reasons.push("operator differs from the approver");
  if (approval.action !== ctx.action)
    reasons.push(`approval is for "${approval.action}", not "${ctx.action}"`);
  if (
    approval.target.connectorId !== ctx.target.connectorId ||
    approval.target.origin !== ctx.target.origin ||
    approval.target.account !== ctx.target.account
  ) {
    reasons.push("target app, address or account differs");
  }
  if (approval.payloadHash !== payloadHash(ctx.payload))
    reasons.push("the document changed after approval");
  if (approval.counterpartyId !== ctx.payload.customerId) reasons.push("customer differs");
  if (approval.catalogueVersion !== ctx.currentCatalogueVersion) {
    reasons.push("the catalogue (prices) changed after approval");
  }
  if (ctx.now.toISOString() >= approval.expiresAt) reasons.push("approval expired");
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
