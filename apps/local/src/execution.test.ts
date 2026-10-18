import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Connector,
  ConnectorError,
  closeAttempt,
  createApproval,
  type ExecutionPayload,
  PayloadError,
  payloadFromAcceptedDraft,
  prepareApprovedDraft,
  type ReadBack,
  storeApproval,
  submitApproved,
} from "@chatterpilot/order-automation";
import { Workspace } from "@chatterpilot/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importExport } from "./import.ts";
import {
  activeCatalogue,
  createDraft,
  decide,
  getDraft,
  loadCatalogueIntoWorkspace,
  suggestions,
} from "./review.ts";

const FIXTURES = new URL("../../../fixtures/synthetic/", import.meta.url).pathname;
const TARGET = { connectorId: "fake-books", origin: "http://127.0.0.1:9", account: "demo" };

/** In-memory stand-in for a target app, with switchable faults. */
class FakeTarget implements Connector {
  readonly id = "fake-books";
  readonly version = "test";
  readonly origin = TARGET.origin;
  readonly account = "demo";
  readonly provenance = "hand-written" as const;
  readonly capabilities = {
    documentTypes: ["proforma"] as const,
    sideEffects: {
      prepareDraft: "creates a draft",
      readBack: "none",
      findByReference: "none",
      submit: "not available",
    } as const,
  };
  drafts = new Map<string, ExecutionPayload>();
  submissions = 0;
  fault: "none" | "layout" | "price-drift" | "lost-response" | "tamper" = "none";

  async prepareDraft(p: ExecutionPayload) {
    if (this.fault === "layout")
      throw new ConnectorError('Field "Quantity" not found; layout changed.', false);
    if (this.fault === "price-drift") {
      throw new ConnectorError("Target prices differ", false, [
        { field: "lines[0].unitPrice", expected: p.lines[0]?.unitPrice ?? null, actual: "399.00" },
      ]);
    }
    const ref = `DR-${this.drafts.size + 1}`;
    this.drafts.set(ref, p);
    if (this.fault === "lost-response")
      throw new ConnectorError("No confirmation after Save", true);
    return { remoteRef: ref };
  }
  async readBack(ref: string): Promise<ReadBack> {
    const p = this.drafts.get(ref);
    if (!p) throw new Error("not found");
    return {
      remoteRef: ref,
      status: "draft",
      reference: p.sourceDraftId,
      customerId: p.customerId,
      orderDate: p.orderDate,
      lines: p.lines.map((l, i) => ({
        ...l,
        quantity: this.fault === "tamper" && i === 0 ? "1" : l.quantity,
      })),
      subtotal: p.subtotal,
      taxTotal: p.taxTotal,
      total: p.total,
    };
  }
  async findByReference(reference: string) {
    return [...this.drafts].filter(([, p]) => p.sourceDraftId === reference).map(([ref]) => ref);
  }
}

let dir: string;
let ws: Workspace;
let target: FakeTarget;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "chatterpilot-exec-"));
  ws = Workspace.create(join(dir, "ws"), { name: "Test", timezone: "Asia/Kolkata" });
  await loadCatalogueIntoWorkspace(ws, join(FIXTURES, "catalogue"));
  await importExport(ws, join(FIXTURES, "chats/android-dmy-hardware-orders.txt"));
  target = new FakeTarget();
});
afterEach(() => {
  ws.close();
  rmSync(dir, { recursive: true, force: true });
});

function acceptedPayload(position = 0): ExecutionPayload {
  const message = suggestions(ws)[position];
  if (!message) throw new Error("no suggestion");
  const view = createDraft(ws, [message.id], "Anita");
  if (view.draft.issues.length > 0) {
    decide(
      ws,
      view.record.id,
      { action: "set_customer", customerId: "KB-01" },
      "Anita",
      "Known customer",
    );
  }
  const accepted = decide(ws, view.record.id, { action: "accept" }, "Anita", undefined);
  return payloadFromAcceptedDraft({
    draftId: accepted.record.id,
    status: accepted.record.status,
    snapshotSha256: accepted.acceptedSnapshotSha256,
    draft: accepted.draft,
  });
}

function approve(
  payload: ExecutionPayload,
  action: "prepare_draft" | "submit" = "prepare_draft",
  id = "ap1",
) {
  const approval = createApproval({
    id,
    operator: "Anita",
    target: TARGET,
    action,
    payload,
    now: new Date(),
    minutes: 15,
  });
  storeApproval(ws, approval, payload.sourceDraftId, payload);
  return approval;
}

const run = (approvalId = "ap1", operator = "Anita") =>
  prepareApprovedDraft({
    ws,
    approvalId,
    operator,
    connector: target,
    currentCatalogueVersion: activeCatalogue(ws)?.version ?? "",
  });

const states = (attemptId: string | null) =>
  attemptId ? ws.executions.events(attemptId).map((e) => e.toState) : [];

describe("preparing an approved draft in a target app", () => {
  it("only accepts accepted drafts", () => {
    const [m] = suggestions(ws);
    const open = createDraft(ws, [m?.id ?? ""], "Anita");
    expect(() =>
      payloadFromAcceptedDraft({
        draftId: open.record.id,
        status: "open",
        snapshotSha256: null,
        draft: getDraft(ws, open.record.id).draft,
      }),
    ).toThrow(PayloadError);
  });

  it("prepares, reads back and stops before submission", async () => {
    const payload = acceptedPayload();
    approve(payload);
    const result = await run();
    expect(result).toMatchObject({
      state: "awaiting_submit_approval",
      remoteRef: "DR-1",
      diff: [],
    });
    expect(states(result.attemptId)).toEqual([
      "approved_for_draft",
      "preparing_draft",
      "draft_readback",
      "awaiting_submit_approval",
    ]);
    expect(target.submissions).toBe(0);
  });

  it("never sends the same document twice", async () => {
    approve(acceptedPayload());
    await run();
    const again = await run();
    expect(again.message).toMatch(/already has an attempt/);
    expect(target.drafts.size).toBe(1);
  });

  it("refuses a different operator and records why", async () => {
    approve(acceptedPayload());
    const result = await run("ap1", "Ravi");
    expect(result.state).toBe("rejected");
    expect(result.message).toContain("operator differs");
    expect(target.drafts.size).toBe(0);
  });

  it("invalidates the approval when the catalogue (prices) changes", async () => {
    approve(acceptedPayload());
    const changed = mkdtempSync(join(dir, "cat-"));
    const fs = await import("node:fs");
    for (const f of ["customers.csv", "catalogue.json"])
      fs.copyFileSync(join(FIXTURES, "catalogue", f), join(changed, f));
    fs.writeFileSync(
      join(changed, "products.csv"),
      fs.readFileSync(join(FIXTURES, "catalogue/products.csv"), "utf8").replace("410.00", "425.00"),
    );
    await loadCatalogueIntoWorkspace(ws, changed);
    const result = await run();
    expect(result.state).toBe("rejected");
    expect(result.message).toContain("the catalogue (prices) changed after approval");
    expect(target.drafts.size).toBe(0);
  });

  it("blocks without saving when target prices differ", async () => {
    approve(acceptedPayload());
    target.fault = "price-drift";
    const result = await run();
    expect(result.state).toBe("blocked");
    expect(result.diff).toEqual([
      { field: "lines[0].unitPrice", expected: "410.00", actual: "399.00" },
    ]);
    expect(target.drafts.size).toBe(0);
  });

  it("stops on a changed layout and allows a later retry", async () => {
    approve(acceptedPayload());
    target.fault = "layout";
    expect((await run()).state).toBe("failed_before_side_effect");
    target.fault = "none";
    expect((await run()).state).toBe("awaiting_submit_approval");
    expect(target.drafts.size).toBe(1);
  });

  it("reconciles a lost response by reference instead of saving again", async () => {
    approve(acceptedPayload());
    target.fault = "lost-response";
    const result = await run();
    expect(result).toMatchObject({ state: "awaiting_submit_approval", remoteRef: "DR-1" });
    expect(states(result.attemptId)).toEqual([
      "approved_for_draft",
      "preparing_draft",
      "submitted_unknown",
      "draft_readback",
      "awaiting_submit_approval",
    ]);
    expect(target.drafts.size).toBe(1);
  });

  it("leaves an unknown outcome for a person when nothing can be found", async () => {
    approve(acceptedPayload());
    target.fault = "lost-response";
    target.findByReference = async () => [];
    const result = await run();
    expect(result.state).toBe("submitted_unknown");
    expect(result.message).toContain("A person must check the target");
    // The document is still locked: no automatic retry can create a duplicate.
    target.fault = "none";
    expect((await run()).message).toMatch(/already has an attempt/);
  });

  it("blocks when the saved draft reads back differently", async () => {
    approve(acceptedPayload());
    target.fault = "tamper";
    const result = await run();
    expect(result.state).toBe("blocked");
    expect(result.diff).toEqual([{ field: "lines[0].quantity", expected: "40", actual: "1" }]);
  });

  it("refuses to submit, even with a submit approval", () => {
    const payload = acceptedPayload();
    approve(payload, "prepare_draft", "ap1");
    approve(payload, "submit", "ap2");
    const input = {
      ws,
      operator: "Anita",
      connector: target,
      currentCatalogueVersion: activeCatalogue(ws)?.version ?? "",
    };
    expect(submitApproved({ ...input, approvalId: "ap1" }).message).toContain(
      'approval is for "prepare_draft", not "submit"',
    );
    expect(submitApproved({ ...input, approvalId: "ap2" }).message).toContain(
      "not enabled in this release",
    );
    expect(target.submissions).toBe(0);
  });

  it("keeps execution history append-only", async () => {
    approve(acceptedPayload());
    await run();
    expect(() => ws.db.prepare("DELETE FROM execution_event").run()).toThrow(/append-only/);
  });
});

describe("review fixes: approvals follow the draft", () => {
  it("voids an approval when the draft is reopened after approval", async () => {
    const payload = acceptedPayload();
    approve(payload);
    decide(ws, payload.sourceDraftId, { action: "reopen" }, "Anita", "Customer called back");
    const result = await run();
    expect(result.state).toBe("rejected");
    expect(result.message).toContain("the draft is no longer accepted in the approved version");
    expect(target.drafts.size).toBe(0);
  });

  it("refuses to store an approval for a payload that is not the current accepted version", () => {
    const payload = acceptedPayload();
    expect(() => approve({ ...payload, snapshotSha256: "0".repeat(64) })).toThrow(
      /current accepted version/,
    );
  });

  it("blocks a read-back whose target record is no longer a draft", async () => {
    approve(acceptedPayload());
    const readBack = target.readBack.bind(target);
    target.readBack = async (ref) => ({ ...(await readBack(ref)), status: "submitted" });
    const result = await run();
    expect(result.state).toBe("blocked");
    expect(result.diff).toContainEqual({ field: "status", expected: "draft", actual: "submitted" });
  });

  it("lets a person close a blocked attempt so a new approved attempt can run", async () => {
    approve(acceptedPayload());
    target.fault = "price-drift";
    const blocked = await run();
    expect(blocked.state).toBe("blocked");
    expect(
      closeAttempt(ws, blocked.attemptId ?? "", "Anita", "Checked MockBooks: nothing saved"),
    ).toBe(true);
    target.fault = "none";
    expect((await run()).state).toBe("awaiting_submit_approval");
    expect(() => closeAttempt(ws, blocked.attemptId ?? "", "Anita", " ")).toThrow();
  });
});
