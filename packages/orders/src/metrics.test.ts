import { describe, expect, it } from "vitest";
import { buildOrderDraft, type OrderDraft } from "./draft.ts";
import { syntheticCatalogue } from "./fixtures.ts";
import { computeDashboard, type DashboardInput } from "./metrics.ts";

const catalogue = syntheticCatalogue();
const draft = (body: string, date: string): OrderDraft =>
  buildOrderDraft(
    [
      {
        id: `m-${date}-${body.length}`,
        startLine: 1,
        endLine: 1,
        timestampText: date,
        localDateTime: `${date}T10:00:00`,
        body,
      },
    ],
    catalogue,
  );

const base: DashboardInput = {
  coverage: [
    { sourceName: "a.txt", first: "2026-01-12T09:02:00", last: "2026-01-15T18:22:00" },
    { sourceName: "b.txt", first: "2026-01-14T08:55:10", last: "2026-01-14T10:05:09" },
  ],
  messagesPerDay: [
    { date: "2026-01-12", count: 6 },
    { date: "2026-01-13", count: 2 },
    { date: "2026-01-14", count: 3 },
    { date: "2026-01-15", count: 3 },
  ],
  pendingSuggestions: 2,
  drafts: [
    // 40 bags cement + 120 sqft white tiles: 16,400 + 4,592 + 6,240 + 1,123.20 = 28,355.20
    {
      id: "d1",
      status: "accepted",
      draft: draft("For Kumar Builders 40 bags cement\n120 sq ft white tiles", "2026-01-12"),
    },
    // 10 bags cement: 4,100 + 1,148 = 5,248.00
    {
      id: "d2",
      status: "accepted",
      draft: draft("For Shah Interiors 10 bags cement", "2026-01-12"),
    },
    // 5 boxes ivory tiles = 80 sqft × 54.50 = 4,360 + 18% 784.80 = 5,144.80 (open: not reviewed)
    {
      id: "d3",
      status: "open",
      draft: draft("For Shah Interiors 5 boxes ivory tiles", "2026-01-14"),
    },
    // no customer → open issue; also unknown-product line
    { id: "d4", status: "open", draft: draft("10 bags gravel", "2026-01-15") },
    {
      id: "d5",
      status: "rejected",
      draft: draft("For Kumar Builders 2 bags cement", "2026-01-13"),
    },
  ],
  scope: "accepted",
};

describe("computeDashboard", () => {
  const dash = computeDashboard(base);

  it("reports coverage as the union of export date ranges", () => {
    expect(dash.coverage.window).toEqual({ from: "2026-01-12", to: "2026-01-15" });
    expect(dash.coverage.value).toMatchObject({ days: 4, coveredDays: 4, gaps: [] });
  });

  it("counts activity per day only on covered days", () => {
    expect(dash.activity.value.map((d) => [d.date, d.messages])).toEqual([
      ["2026-01-12", 6],
      ["2026-01-13", 2],
      ["2026-01-14", 3],
      ["2026-01-15", 3],
    ]);
  });

  it("counts the pipeline", () => {
    expect(dash.pipeline.value).toEqual({ suggested: 2, open: 2, accepted: 2, rejected: 1 });
  });

  it("sums accepted order value exactly and reports what was left out", () => {
    expect(dash.orderValueByDay.value).toEqual([
      {
        date: "2026-01-12",
        currency: "INR",
        totalMinor: 2835520 + 524800,
        orders: 2,
        draftIds: ["d1", "d2"],
      },
    ]);
    expect(dash.orderValueByDay.excluded).toEqual([
      { reason: "open drafts not yet reviewed", count: 2 },
      { reason: "rejected drafts", count: 1 },
    ]);
  });

  it("can include open drafts on request, still excluding unknown totals", () => {
    const all = computeDashboard({ ...base, scope: "all" });
    expect(all.orderValueByDay.value.map((r) => [r.date, r.totalMinor, r.orders])).toEqual([
      ["2026-01-12", 3360320, 2],
      ["2026-01-14", 514480, 1],
    ]);
    expect(all.orderValueByDay.excluded).toEqual([
      { reason: "drafts with an unknown total or date", count: 1 },
      { reason: "rejected drafts", count: 1 },
    ]);
    expect(all.products.excluded).toEqual([
      { reason: "lines with unknown product or quantity", count: 1 },
    ]);
  });

  it("converts product quantities to base units", () => {
    const all = computeDashboard({ ...base, scope: "all" });
    expect(all.products.value.map((p) => [p.productId, p.baseUnit, p.quantityMilli])).toEqual([
      ["CEM-UB50", "bag", 50000],
      ["TIL-22I", "sqft", 80000],
      ["TIL-22W", "sqft", 120000],
    ]);
  });

  it("groups open review work by issue type", () => {
    expect(dash.openIssues.value).toEqual([
      { code: "customer_unresolved", count: 1, draftIds: ["d4"] },
      { code: "product_unresolved", count: 1, draftIds: ["d4"] },
    ]);
  });

  it("counts customers among accepted orders", () => {
    expect(dash.customers.value.map((c) => [c.customerId, c.orders, c.totals])).toEqual([
      ["KB-01", 1, [{ currency: "INR", totalMinor: 2835520 }]],
      ["SI-01", 1, [{ currency: "INR", totalMinor: 524800 }]],
    ]);
  });

  it("refuses a week-on-week comparison without full coverage", () => {
    expect(dash.weekComparison.value).toMatchObject({ status: "insufficient" });
    expect(JSON.stringify(dash.weekComparison.value)).toContain("do not cover every day");
  });

  it("reports gaps between exports", () => {
    const gappy = computeDashboard({
      ...base,
      coverage: [
        { sourceName: "a", first: "2026-01-01T10:00:00", last: "2026-01-02T10:00:00" },
        { sourceName: "b", first: "2026-01-06T10:00:00", last: "2026-01-06T11:00:00" },
      ],
    });
    expect(gappy.coverage.value.gaps).toEqual([{ from: "2026-01-03", to: "2026-01-05" }]);
    expect(gappy.activity.value.filter((a) => !a.covered).map((a) => a.messages)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("compares weeks only with full coverage and enough orders", () => {
    const days = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => `2026-02-${String(from + i).padStart(2, "0")}`);
    const drafts = [...days(1, 3), ...days(8, 4)].map((date, i) => ({
      id: `w${i}`,
      status: "accepted" as const,
      draft: draft("For Kumar Builders 10 bags cement", date),
    }));
    const covered = {
      ...base,
      coverage: [{ sourceName: "x", first: "2026-02-01T00:00:00", last: "2026-02-14T23:00:00" }],
      drafts,
    };
    const result = computeDashboard(covered).weekComparison.value;
    // 3 orders (Feb 1–7) vs 4 orders (Feb 8–14), each 5,248.00
    expect(result).toEqual({
      status: "ok",
      currency: "INR",
      previous: { from: "2026-02-01", to: "2026-02-07", totalMinor: 1574400, orders: 3 },
      current: { from: "2026-02-08", to: "2026-02-14", totalMinor: 2099200, orders: 4 },
      changePercent: 33.3,
    });
    const thin = computeDashboard({ ...covered, drafts: drafts.slice(1) }).weekComparison.value;
    expect(thin).toMatchObject({ status: "insufficient" });
  });
});
