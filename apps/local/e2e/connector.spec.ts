import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createApproval,
  type ExecutionPayload,
  MockBooksConnector,
  payloadFromAcceptedDraft,
  prepareApprovedDraft,
  storeApproval,
  submitApproved,
} from "@chatterpilot/order-automation";
import { Workspace } from "@chatterpilot/storage";
import { expect, type Page, test } from "@playwright/test";
import { importExport } from "../src/import.ts";
import {
  activeCatalogue,
  createDraft,
  decide,
  loadCatalogueIntoWorkspace,
  suggestions,
} from "../src/review.ts";

const FIXTURES = new URL("../../../fixtures/synthetic/", import.meta.url).pathname;
const target = (port: number) => `http://127.0.0.1:${port}`;
const stats = async (port: number) =>
  (await (await fetch(`${target(port)}/api/stats`)).json()) as {
    drafts: number;
    submissions: number;
  };

async function workspace(): Promise<Workspace> {
  const ws = Workspace.create(join(mkdtempSync(join(tmpdir(), "chatterpilot-oa0-")), "ws"), {
    name: "OA0",
    timezone: "Asia/Kolkata",
  });
  await loadCatalogueIntoWorkspace(ws, join(FIXTURES, "catalogue"));
  await importExport(ws, join(FIXTURES, "chats/android-dmy-hardware-orders.txt"));
  return ws;
}

/** Kumar Builders order with the 45-bag correction linked and the old line excluded (2 lines). */
function kumarOrder(ws: Workspace): ExecutionPayload {
  const [order, correction] = suggestions(ws);
  const view = createDraft(ws, [order?.id ?? ""], "Anita");
  const id = view.record.id;
  decide(
    ws,
    id,
    { action: "link_message", messageId: correction?.id ?? "" },
    "Anita",
    "Customer corrected the quantity",
  );
  decide(
    ws,
    id,
    { action: "exclude_line", line: 0, excluded: true },
    "Anita",
    "Superseded by the correction",
  );
  const accepted = decide(ws, id, { action: "accept" }, "Anita", undefined);
  return payloadFromAcceptedDraft({
    draftId: id,
    status: accepted.record.status,
    snapshotSha256: accepted.acceptedSnapshotSha256,
    draft: accepted.draft,
  });
}

/** Shah Interiors enquiry (1 line). */
function shahOrder(ws: Workspace): ExecutionPayload {
  const shah = suggestions(ws).find((m) => m.body.includes("Shah Interiors"));
  const view = createDraft(ws, [shah?.id ?? ""], "Anita");
  const accepted = decide(ws, view.record.id, { action: "accept" }, "Anita", undefined);
  return payloadFromAcceptedDraft({
    draftId: view.record.id,
    status: accepted.record.status,
    snapshotSha256: accepted.acceptedSnapshotSha256,
    draft: accepted.draft,
  });
}

async function run(
  ws: Workspace,
  page: Page,
  port: number,
  payload: ExecutionPayload,
  approvalId: string,
) {
  const connector = new MockBooksConnector({ page, origin: target(port), account: "demo" });
  const approval = createApproval({
    id: approvalId,
    operator: "Anita",
    target: { connectorId: connector.id, origin: connector.origin, account: "demo" },
    action: "prepare_draft",
    payload,
    now: new Date(),
    minutes: 15,
  });
  storeApproval(ws, approval, payload.sourceDraftId, payload);
  const result = await prepareApprovedDraft({
    ws,
    approvalId,
    operator: "Anita",
    connector,
    currentCatalogueVersion: activeCatalogue(ws)?.version ?? "",
  });
  return { result, connector };
}

test.describe.configure({ mode: "serial" });

test("prepares two different orders with different line counts and stops before Submit", async ({
  page,
}) => {
  const ws = await workspace();
  const before = await stats(4330);
  const a = await run(ws, page, 4330, kumarOrder(ws), "a1");
  expect(a.result, a.result.message).toMatchObject({ state: "awaiting_submit_approval", diff: [] });
  const rbA = await a.connector.readBack(a.result.remoteRef ?? "");
  expect(rbA.lines.map((l) => [l.productId, l.quantity, l.unit, l.amount])).toEqual([
    ["TIL-22W", "120", "sqft", "6240.00"],
    ["CEM-UB50", "45", "bag", "18450.00"],
  ]);
  expect(rbA.total).toBe("30979.20");

  const shah = shahOrder(ws);
  const b = await run(ws, page, 4330, shah, "b1");
  expect(b.result.state).toBe("awaiting_submit_approval");
  expect((await b.connector.readBack(b.result.remoteRef ?? "")).lines).toHaveLength(1);

  const after = await stats(4330);
  expect(after.drafts - before.drafts).toBe(2);
  expect(after.submissions).toBe(0);

  // Submitting is refused even with a submit approval, and the Submit button was never used.
  const payload = shah;
  const connector = new MockBooksConnector({ page, origin: target(4330), account: "demo" });
  storeApproval(
    ws,
    createApproval({
      id: "s1",
      operator: "Anita",
      target: { connectorId: "mockbooks", origin: target(4330), account: "demo" },
      action: "submit",
      payload,
      now: new Date(),
      minutes: 5,
    }),
    payload.sourceDraftId,
    payload,
  );
  const refused = submitApproved({
    ws,
    approvalId: "s1",
    operator: "Anita",
    connector,
    currentCatalogueVersion: activeCatalogue(ws)?.version ?? "",
  });
  expect(refused.message).toContain("not enabled in this release");
  expect((await stats(4330)).submissions).toBe(0);
  ws.close();
});

test("waits for lists the target loads after the page (regression: CI flake on a0c25e7b)", async ({
  page,
}) => {
  const ws = await workspace();
  const { result } = await run(ws, page, 4335, kumarOrder(ws), "w1");
  expect(result.state, result.message).toBe("awaiting_submit_approval");
  ws.close();
});

test("blocks before saving when the target's prices differ", async ({ page }) => {
  const ws = await workspace();
  const before = await stats(4331);
  const { result } = await run(ws, page, 4331, kumarOrder(ws), "d1");
  expect(result.state).toBe("blocked");
  expect(result.diff).toContainEqual({
    field: "lines[1].unitPrice",
    expected: "410.00",
    actual: "415.00",
  });
  expect((await stats(4331)).drafts).toBe(before.drafts);
  ws.close();
});

test("stops when the form layout changed, without saving anything", async ({ page }) => {
  const ws = await workspace();
  const before = await stats(4332);
  const { result } = await run(ws, page, 4332, kumarOrder(ws), "l1");
  expect(result.state).toBe("failed_before_side_effect");
  expect(result.message).toContain('Field "Quantity" not found');
  expect((await stats(4332)).drafts).toBe(before.drafts);
  ws.close();
});

test("reconciles a lost save response instead of saving twice", async ({ page }) => {
  const ws = await workspace();
  const before = await stats(4333);
  const { result } = await run(ws, page, 4333, kumarOrder(ws), "r1");
  expect(result.state, result.message).toBe("awaiting_submit_approval");
  expect(ws.executions.events(result.attemptId ?? "").map((e) => e.toState)).toContain(
    "submitted_unknown",
  );
  expect((await stats(4333)).drafts - before.drafts).toBe(1);
  ws.close();
});

test("stops for a person when the target may hold duplicate drafts", async ({ page }) => {
  // Dropping the connection after a save makes browsers retry the POST, so the target can end up
  // with two drafts. Reconciliation must not pick one: it leaves the outcome unknown for a person.
  const ws = await workspace();
  const { result } = await run(ws, page, 4334, kumarOrder(ws), "u1");
  expect(result.state, result.message).toBe("submitted_unknown");
  expect(result.message).toMatch(/must check the target/);
  ws.close();
});

test("the fill-form command shows the document, needs --approve, and stops before Submit", async () => {
  const ws = await workspace();
  const payload = shahOrder(ws);
  const dir = ws.dir;
  ws.close();
  const { execFileSync } = await import("node:child_process");
  const cli = (extra: string[]) =>
    execFileSync(
      process.execPath,
      [
        "apps/local/src/cli.ts",
        "fill-form",
        "--draft",
        payload.sourceDraftId,
        "--operator",
        "Anita",
        "--workspace",
        dir,
        "--target",
        target(4330),
        ...extra,
      ],
      {
        cwd: new URL("../../../", import.meta.url).pathname,
        encoding: "utf8",
      },
    );
  const before = await stats(4330);
  expect(cli([])).toContain("Nothing sent. Re-run with --approve");
  expect((await stats(4330)).drafts).toBe(before.drafts);
  const out = cli(["--approve"]);
  expect(out).toContain("Result: awaiting_submit_approval");
  const after = await stats(4330);
  expect(after.drafts - before.drafts).toBe(1);
  expect(after.submissions).toBe(0);
});

test("cannot reach any address outside the approved target", async ({ page }) => {
  const connector = new MockBooksConnector({ page, origin: target(4330), account: "demo" });
  await connector.guard();
  await expect(page.goto(`${target(4331)}/`)).rejects.toThrow();
});
