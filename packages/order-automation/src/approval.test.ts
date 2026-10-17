import { describe, expect, it } from "vitest";
import { checkApproval, createApproval } from "./approval.ts";
import type { ExecutionPayload } from "./payload.ts";
import { canonicalJson, payloadHash } from "./payload.ts";
import { canTransition } from "./runner.ts";

const payload: ExecutionPayload = {
  documentType: "proforma",
  sourceDraftId: "d1",
  snapshotSha256: "a".repeat(64),
  catalogueVersion: "cat-1",
  customerId: "KB-01",
  customerName: "Kumar Builders",
  orderDate: "2026-01-12",
  currency: "INR",
  lines: [
    {
      productId: "CEM-UB50",
      productName: "UltraBond",
      quantity: "45",
      unit: "bag",
      unitPrice: "410.00",
      amount: "18450.00",
      tax: "5166.00",
    },
  ],
  subtotal: "18450.00",
  taxTotal: "5166.00",
  total: "23616.00",
};
const target = { connectorId: "mockbooks", origin: "http://127.0.0.1:4330", account: "demo" };
const now = new Date("2026-01-12T12:00:00Z");
const approval = createApproval({
  id: "a1",
  operator: "Anita",
  target,
  action: "prepare_draft",
  payload,
  now,
  minutes: 15,
});
const ctx = {
  operator: "Anita",
  target,
  action: "prepare_draft" as const,
  payload,
  currentCatalogueVersion: "cat-1",
  now,
};

describe("approval binding", () => {
  it("allows exactly the approved action", () => {
    expect(checkApproval(approval, ctx)).toEqual({ ok: true });
  });

  it.each([
    ["another operator", { operator: "Ravi" }, "operator differs from the approver"],
    [
      "a different action",
      { action: "submit" as const },
      'approval is for "prepare_draft", not "submit"',
    ],
    [
      "another account",
      { target: { ...target, account: "live" } },
      "target app, address or account differs",
    ],
    [
      "another address",
      { target: { ...target, origin: "http://evil.example" } },
      "target app, address or account differs",
    ],
    [
      "a changed quantity",
      { payload: { ...payload, total: "1.00" } },
      "the document changed after approval",
    ],
    ["a changed customer", { payload: { ...payload, customerId: "SI-01" } }, "customer differs"],
    [
      "a newer catalogue",
      { currentCatalogueVersion: "cat-2" },
      "the catalogue (prices) changed after approval",
    ],
    ["expiry", { now: new Date("2026-01-12T12:15:00Z") }, "approval expired"],
  ])("refuses %s", (_name, change, reason) => {
    const result = checkApproval(approval, { ...ctx, ...change });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.reasons).toContain(reason);
  });

  it("caps approval lifetime and requires a named operator", () => {
    expect(() =>
      createApproval({
        id: "x",
        operator: "Anita",
        target,
        action: "submit",
        payload,
        now,
        minutes: 600,
      }),
    ).toThrow();
    expect(() =>
      createApproval({
        id: "x",
        operator: " ",
        target,
        action: "submit",
        payload,
        now,
        minutes: 5,
      }),
    ).toThrow();
  });

  it("hashes payloads independently of key order", () => {
    const reordered = JSON.parse(canonicalJson(payload)) as ExecutionPayload;
    expect(payloadHash(reordered)).toBe(payloadHash(payload));
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });
});

describe("state machine", () => {
  it.each([
    ["approved_for_draft", "preparing_draft", true],
    ["preparing_draft", "draft_readback", true],
    ["draft_readback", "awaiting_submit_approval", true],
    ["submitted_unknown", "draft_readback", true],
    ["approved_for_draft", "submitting", false],
    ["awaiting_submit_approval", "submitting", false],
    ["blocked", "awaiting_submit_approval", false],
    ["verified_complete", "submitting", false],
  ])("%s → %s allowed: %s", (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });
});
