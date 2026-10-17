import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCsv } from "@chatterpilot/core";
import { Workspace } from "@chatterpilot/storage";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importExport } from "./import.ts";
import { loadCatalogueIntoWorkspace } from "./review.ts";
import { createApp, safeFileName } from "./server.ts";

const FIXTURES = new URL("../../../fixtures/synthetic/", import.meta.url).pathname;
const BASE = "http://127.0.0.1:4317";
const JSON_HEADERS = { "content-type": "application/json", "x-chatterpilot": "1", origin: BASE };

let dir: string;
let ws: Workspace;
let app: Hono;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "chatterpilot-server-"));
  ws = Workspace.create(join(dir, "ws"), { name: "Test", timezone: "Asia/Kolkata" });
  await loadCatalogueIntoWorkspace(ws, join(FIXTURES, "catalogue"));
  await importExport(ws, join(FIXTURES, "chats/android-dmy-hardware-orders.txt"));
  app = createApp(ws, { port: 4317 });
});
afterEach(() => {
  ws.close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (path: string) => app.request(`${BASE}${path}`);
const post = (path: string, body: unknown, headers: Record<string, string> = JSON_HEADERS) =>
  app.request(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;

describe("local server security", () => {
  it("refuses non-loopback Host headers (DNS rebinding)", async () => {
    const res = await app.request("http://evil.example:4317/api/status");
    expect(res.status).toBe(403);
    const spoofed = await app.request(`${BASE}/api/status`, { headers: { host: "evil.example" } });
    expect(spoofed.status).toBe(403);
  });

  it("requires the custom header for state changes", async () => {
    const res = await post(
      "/api/drafts",
      { messageIds: [], reviewer: "x" },
      { "content-type": "application/json" },
    );
    expect(res.status).toBe(403);
  });

  it("refuses cross-origin and cross-site requests even with the header", async () => {
    const evil = await post("/api/drafts", {}, { ...JSON_HEADERS, origin: "http://evil.example" });
    expect(evil.status).toBe(403);
    const site = await post("/api/drafts", {}, { ...JSON_HEADERS, "sec-fetch-site": "cross-site" });
    expect(site.status).toBe(403);
  });

  it("sends security headers and no CORS headers", async () => {
    const res = await get("/api/status");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("never turns an upload name into a path", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("..\\..\\x.txt")).toBe("x.txt");
    expect(safeFileName("WhatsApp Chat with Ravi <script>.txt")).toBe(
      "WhatsApp Chat with Ravi _script_.txt",
    );
    expect(safeFileName("....")).toBe("upload");
  });
});

interface View {
  record: { id: string; status: string };
  draft: {
    issues: { code: string }[];
    lines: { sourceText: string; excluded: boolean; quantity: { evidence: { kind: string }[] } }[];
    total: { value: number | null };
  };
  decisions: { action: string; reviewer: string; reason: string }[];
  acceptedSnapshotSha256: string | null;
}

describe("review workflow over HTTP", () => {
  it("reports status, imports and catalogue", async () => {
    const status = await json<{ imports: unknown[]; catalogue: { products: number } }>(
      get("/api/status"),
    );
    expect(status.imports).toHaveLength(1);
    expect(status.catalogue.products).toBe(9);
  });

  it("uploads an export, asking for the date order when ambiguous", async () => {
    const form = (text: string, order?: string) => {
      const f = new FormData();
      f.set("file", new File([text], "WhatsApp Chat with Test.txt"));
      if (order) f.set("dateOrder", order);
      return f;
    };
    const headers = { "x-chatterpilot": "1", origin: BASE };
    const ambiguous = "01/02/24, 10:00 - Meera: 10 bags cement\n";
    const first = await app.request(`${BASE}/api/imports`, {
      method: "POST",
      headers,
      body: form(ambiguous),
    });
    expect(first.status).toBe(400);
    expect(await first.json()).toMatchObject({
      code: "date_order_required",
      detectedDateOrder: "ambiguous",
    });
    const second = await app.request(`${BASE}/api/imports`, {
      method: "POST",
      headers,
      body: form(ambiguous, "dmy"),
    });
    expect(await second.json()).toMatchObject({ status: "imported" });
    expect(ws.importSummaries()).toHaveLength(2);
  });

  it("drafts, corrects, accepts and exports an order with full history", async () => {
    const suggested = await json<{ id: string; startLine: number }[]>(get("/api/suggestions"));
    expect(suggested.map((m) => m.startLine)).toEqual([6, 12, 18]);
    const [order, correction] = suggested;
    if (!order || !correction) throw new Error("fixture changed");

    const created = await post("/api/drafts", { messageIds: [order.id], reviewer: "Anita" });
    expect(created.status).toBe(201);
    const draft = await json<View>(created);
    const id = draft.record.id;
    expect(draft.draft.issues).toEqual([]);

    // A decision needs a reason.
    const noReason = await post(`/api/drafts/${id}/decisions`, {
      decision: { action: "link_message", messageId: correction.id },
      reviewer: "Anita",
    });
    expect(noReason.status).toBe(400);

    let view = await json<View>(
      post(`/api/drafts/${id}/decisions`, {
        decision: { action: "link_message", messageId: correction.id },
        reviewer: "Anita",
        reason: "Customer corrected the cement quantity",
      }),
    );
    expect(view.draft.lines.map((l) => l.sourceText)).toEqual([
      "40 bags cement",
      "120 sq ft tiles 2x2 white",
      "45 bags cement",
    ]);
    view = await json<View>(
      post(`/api/drafts/${id}/decisions`, {
        decision: { action: "exclude_line", line: 0, excluded: true },
        reviewer: "Anita",
        reason: "Superseded by the 45-bag correction",
      }),
    );
    expect(view.draft.total.value).toBe(1845000 + 516600 + 624000 + 112320);

    // Linked messages are no longer suggested.
    const after = await json<{ id: string }[]>(get("/api/suggestions"));
    expect(after.map((m) => m.id)).not.toContain(correction.id);

    // Invalid edits are refused and not recorded.
    const badUnit = await post(`/api/drafts/${id}/decisions`, {
      decision: { action: "set_line", line: 1, field: "unit", value: "crates" },
      reviewer: "Anita",
      reason: "x",
    });
    expect(badUnit.status).toBe(400);

    const accepted = await json<View>(
      post(`/api/drafts/${id}/decisions`, { decision: { action: "accept" }, reviewer: "Anita" }),
    );
    expect(accepted.record.status).toBe("accepted");
    expect(accepted.acceptedSnapshotSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(accepted.decisions.map((d) => d.action)).toEqual([
      "link_message",
      "exclude_line",
      "accept",
    ]);

    // Accepted drafts are frozen until reopened.
    const locked = await post(`/api/drafts/${id}/decisions`, {
      decision: { action: "exclude_line", line: 1, excluded: true },
      reviewer: "Anita",
      reason: "x",
    });
    expect(locked.status).toBe(409);

    const csvRes = await get("/api/export/orders.csv");
    expect(csvRes.headers.get("content-disposition")).toContain("attachment");
    const parsed = parseCsv(await csvRes.text());
    if (!parsed.ok) throw new Error("export is not valid CSV");
    const [header, ...rows] = parsed.rows;
    const col = (name: string) => header?.indexOf(name) ?? -1;
    expect(
      rows.map((r) => [
        r[col("line_no")],
        r[col("product_id")],
        r[col("quantity")],
        r[col("amount")],
      ]),
    ).toEqual([
      ["1", "TIL-22W", "120.000", "6240.00"],
      ["2", "CEM-UB50", "45.000", "18450.00"],
    ]);
    expect(rows[0]?.[col("customer_id")]).toBe("KB-01");
    expect(rows[1]?.[col("chat_source")]).toBe(
      "android-dmy-hardware-orders.txt line 12: 45 bags cement",
    );

    const exported = await json<{ drafts: { snapshotSha256: string; decisions: unknown[] }[] }>(
      get("/api/export/orders.json"),
    );
    expect(exported.drafts[0]?.snapshotSha256).toBe(accepted.acceptedSnapshotSha256);
    expect(exported.drafts[0]?.decisions).toHaveLength(3);
  });

  it("will not accept a draft with open issues, and rejects need a reason", async () => {
    const [, correction] = await json<{ id: string }[]>(get("/api/suggestions"));
    const draft = await json<View>(
      post("/api/drafts", { messageIds: [correction?.id], reviewer: "Anita" }),
    );
    expect(draft.draft.issues.map((i) => i.code)).toEqual(["customer_unresolved"]);
    const accept = await post(`/api/drafts/${draft.record.id}/decisions`, {
      decision: { action: "accept" },
      reviewer: "Anita",
    });
    expect(accept.status).toBe(409);
    const reject = await post(`/api/drafts/${draft.record.id}/decisions`, {
      decision: { action: "reject" },
      reviewer: "Anita",
    });
    expect(reject.status).toBe(400);
    const rejected = await json<View>(
      post(`/api/drafts/${draft.record.id}/decisions`, {
        decision: { action: "reject" },
        reviewer: "Anita",
        reason: "Duplicate of the Kumar Builders order",
      }),
    );
    expect(rejected.record.status).toBe("rejected");
  });

  it("neutralises formula injection that arrives through chat text", async () => {
    await loadCatalogueIntoWorkspace(ws, join(FIXTURES, "catalogue"));
    const f = new FormData();
    f.set(
      "file",
      new File(
        ["15/01/2026, 10:00 - =HYPERLINK(1): For Kumar Builders 2 bags cement\n"],
        "evil.txt",
      ),
    );
    await app.request(`${BASE}/api/imports`, {
      method: "POST",
      headers: { "x-chatterpilot": "1" },
      body: f,
    });
    const evil = (await json<{ id: string; body: string }[]>(get("/api/suggestions"))).find((m) =>
      m.body.includes("2 bags"),
    );
    if (!evil) throw new Error("not suggested");
    const draft = await json<View>(
      post("/api/drafts", { messageIds: [evil.id], reviewer: "=cmd|calc" }),
    );
    await post(`/api/drafts/${draft.record.id}/decisions`, {
      decision: { action: "accept" },
      reviewer: "=cmd|calc",
      reason: "+SUM(1)",
    });
    expect((await json<View>(get(`/api/drafts/${draft.record.id}`))).record.status).toBe(
      "accepted",
    );
    const csv = await (await get("/api/export/orders.csv")).text();
    expect(csv).toContain('"\'=cmd|calc"');
    expect(csv).not.toMatch(/(^|,)"[=+\-@]/m);
  });
});

describe("review history integrity", () => {
  it("cannot be edited or deleted, even directly in SQLite", async () => {
    const [order] = await json<{ id: string }[]>(get("/api/suggestions"));
    const draft = await json<View>(
      post("/api/drafts", { messageIds: [order?.id], reviewer: "Anita" }),
    );
    await post(`/api/drafts/${draft.record.id}/decisions`, {
      decision: { action: "accept" },
      reviewer: "Anita",
    });
    expect(() => ws.db.prepare("UPDATE draft_decision SET reason = 'forged'").run()).toThrow(
      /append-only/,
    );
    expect(() => ws.db.prepare("DELETE FROM draft_decision").run()).toThrow(/append-only/);
  });

  it("keeps the catalogue files that each draft was priced with", async () => {
    const status = await json<{ catalogue: { version: string } }>(get("/api/status"));
    const record = ws.reviews.catalogueVersion(status.catalogue.version);
    expect(readFileSync(ws.blobs.pathFor(record?.productsSha256 ?? ""), "utf8")).toBe(
      readFileSync(join(FIXTURES, "catalogue/products.csv"), "utf8"),
    );
  });
});

describe("dashboard API", () => {
  it("defaults money metrics to accepted orders and states coverage", async () => {
    const [order] = await json<{ id: string }[]>(get("/api/suggestions"));
    const draft = await json<View>(
      post("/api/drafts", { messageIds: [order?.id], reviewer: "Anita" }),
    );
    await post(`/api/drafts/${draft.record.id}/decisions`, {
      decision: { action: "accept" },
      reviewer: "Anita",
    });

    interface Dash {
      scope: string;
      coverage: { window: { from: string; to: string }; value: { coveredDays: number } };
      pipeline: { value: Record<string, number> };
      orderValueByDay: { value: { date: string; totalMinor: number }[] };
      weekComparison: { value: { status: string } };
    }
    const dash = await json<Dash>(get("/api/dashboard"));
    expect(dash.scope).toBe("accepted");
    expect(dash.coverage.window).toEqual({ from: "2026-01-12", to: "2026-01-15" });
    expect(dash.coverage.value.coveredDays).toBe(4);
    expect(dash.pipeline.value).toEqual({ suggested: 2, open: 0, accepted: 1, rejected: 0 });
    expect(dash.orderValueByDay.value).toMatchObject([{ date: "2026-01-12", totalMinor: 2835520 }]);
    expect(dash.weekComparison.value.status).toBe("insufficient");
    expect((await json<Dash>(get("/api/dashboard?scope=all"))).scope).toBe("all");
  });
});

describe("export targets API", () => {
  it("lists targets and prepares files only from accepted orders, refusing Tally without a map", async () => {
    const targets = await json<{ id: string; maturity: string }[]>(get("/api/exports"));
    expect(targets.map((t) => [t.id, t.maturity])).toEqual([
      ["tally-xml", "experimental"],
      ["erpnext-csv", "experimental"],
      ["zoho-csv", "experimental"],
      ["ubl-order", "experimental"],
    ]);
    const none = await get("/api/exports/zoho-csv");
    expect(none.status).toBe(400);

    const [order] = await json<{ id: string }[]>(get("/api/suggestions"));
    const draft = await json<View>(
      post("/api/drafts", { messageIds: [order?.id], reviewer: "Anita" }),
    );
    await post(`/api/drafts/${draft.record.id}/decisions`, {
      decision: { action: "accept" },
      reviewer: "Anita",
    });

    const zoho = await json<{ files: { index: number; fileName: string }[]; warnings: string[] }>(
      get("/api/exports/zoho-csv"),
    );
    expect(zoho.files).toEqual([{ index: 0, fileName: "chatterpilot-sales-orders-zoho.csv" }]);
    const file = await get("/api/exports/zoho-csv/0");
    expect(file.headers.get("content-disposition")).toContain("chatterpilot-sales-orders-zoho.csv");
    expect(await file.text()).toContain('"Kumar Builders"');

    const tally = await json<{ error: string }>(get("/api/exports/tally-xml"));
    expect(tally.error).toMatch(/export-map.json/);
    const unknown = await get("/api/exports/sap-idoc");
    expect(unknown.status).toBe(400);
  });
});

describe("export-map.json validation", () => {
  it("rejects names that are not text", async () => {
    const { exportMapProblems } = await import("./ops.ts");
    expect(exportMapProblems({ customers: { KB: 5 } })).toEqual([
      '"customers.KB" must be a non-empty name.',
    ]);
    expect(exportMapProblems({ seller: ["a"] })).toEqual(['"seller" must be a non-empty name.']);
    expect(exportMapProblems([])).toEqual(["It must be a JSON object."]);
    expect(exportMapProblems({ units: { bag: "Bag" }, seller: "S" })).toEqual([]);
  });
});
