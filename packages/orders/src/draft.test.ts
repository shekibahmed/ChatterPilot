import { readFileSync } from "node:fs";
import { scanExport } from "@chatterpilot/import-whatsapp";
import { describe, expect, it } from "vitest";
import { loadCatalogue } from "./catalogue.ts";
import { buildOrderDraft, type OrderDraft, OverrideError, type SourceMessage } from "./draft.ts";
import { read, syntheticCatalogue } from "./fixtures.ts";

const catalogue = syntheticCatalogue();
const message = (
  body: string,
  localDateTime = "2026-01-12T10:00:00",
  id = "m1",
): SourceMessage => ({
  id,
  startLine: 1,
  endLine: 1 + (body.match(/\n/g)?.length ?? 0),
  timestampText: "12/01/26, 10:00 am",
  localDateTime,
  body,
});
const lineIssues = (draft: OrderDraft, i: number) =>
  draft.issues.filter((x) => x.field.startsWith(`lines[${i}]`)).map((x) => x.code);

type Expected = [
  product: string | null,
  qtyMilli: number | null,
  unit: string | null,
  issues: string[],
];

// 50+ synthetic order lines: aliases, typos, same-name products, unit spellings and conversions,
// stale/missing prices and tax, incompatible units, multi-item lines and non-order chatter.
const CASES: [string, Expected[]][] = [
  ["40 bags cement", [["CEM-UB50", 40000, "bag", []]]],
  ["cement 40 bags", [["CEM-UB50", 40000, "bag", []]]],
  ["cement x 40", [["CEM-UB50", 40000, null, ["unit_missing"]]]],
  ["40 bags of cement please", [["CEM-UB50", 40000, "bag", []]]],
  ["40 bgs cement", [["CEM-UB50", 40000, "bag", []]]],
  ["40 Bags CEMENT", [["CEM-UB50", 40000, "bag", []]]],
  ["10bags cement", [["CEM-UB50", 10000, "bag", []]]],
  ["40 bags cemnt", [["CEM-UB50", 40000, "bag", ["product_fuzzy"]]]],
  ["40 bags rockset cement", [["CEM-RS50", 40000, "bag", []]]],
  ["40 bags rockset", [["CEM-RS50", 40000, "bag", []]]],
  ["40 bags ultrabond", [["CEM-UB50", 40000, "bag", []]]],
  ["40 bags ub cement", [["CEM-UB50", 40000, "bag", []]]],
  ["40 kg cement", [["CEM-UB50", 40000, "kg", ["unit_incompatible"]]]],
  ["40 bags cement 🙏", [["CEM-UB50", 40000, "bag", []]]],
  ["40 bags cement for Shah Interiors", [["CEM-UB50", 40000, "bag", []]]],
  ["120 sq ft tiles 2x2 white", [["TIL-22W", 120000, "sqft", []]]],
  ["120 sqft white tiles", [["TIL-22W", 120000, "sqft", []]]],
  ["120 sq.ft white tiles", [["TIL-22W", 120000, "sqft", []]]],
  ["120 square feet ivory tiles", [["TIL-22I", 120000, "sqft", []]]],
  ["5 boxes white tiles", [["TIL-22W", 5000, "box", []]]],
  ["white tiles - 5 boxes", [["TIL-22W", 5000, "box", []]]],
  ["120 sq ft 2x2 tiles", [[null, 120000, "sqft", ["product_ambiguous"]]]],
  ["120 sq ft tiles 2x2 grey", [[null, 120000, "sqft", ["product_ambiguous"]]]],
  ["120 sq ft tiles", [[null, 120000, "sqft", ["product_unresolved"]]]],
  ["3 rolls PVC pipe 1 inch", [["PVC-P1", 3000, "roll", []]]],
  ["PVC pipe 1 inch 3 rolls", [["PVC-P1", 3000, "roll", []]]],
  ["3 rolls pvc pipe 1in", [["PVC-P1", 3000, "roll", []]]],
  ["3 pvc pipe 1 inch", [["PVC-P1", 3000, null, ["unit_missing"]]]],
  ["25 elbows", [["PVC-E1", 25000, "piece", []]]],
  ["25 pcs elbow", [["PVC-E1", 25000, "piece", []]]],
  ["25 nos elbow", [["PVC-E1", 25000, "piece", []]]],
  ["2 box elbows", [["PVC-E1", 2000, "box", []]]],
  ["25 elbow 1 inch", [["PVC-E1", 25000, "piece", []]]],
  ["2 ton sand", [["SND-RV", 2000, "ton", ["price_missing"]]]],
  ["2 tons river sand", [["SND-RV", 2000, "ton", ["price_missing"]]]],
  ["4 bags sand", [["SND-RV", 4000, "bag", ["unit_incompatible", "price_missing"]]]],
  ["100 kg tmt 8mm", [["TMT-08", 100000, "kg", ["price_stale"]]]],
  ["100 kg 8mm rod", [["TMT-08", 100000, "kg", ["price_stale"]]]],
  ["2 bundle tmt 8mm", [["TMT-08", 2000, "bundle", ["price_stale"]]]],
  ["2.5 kg tmt 8mm", [["TMT-08", 2500, "kg", ["price_stale"]]]],
  ["20 litre white emulsion", [["PNT-WE20", 20000, "litre", ["tax_rate_missing"]]]],
  ["20 ltr emulsion", [["PNT-WE20", 20000, "litre", ["tax_rate_missing"]]]],
  ["10 bags gravel", [[null, 10000, "bag", ["product_unresolved"]]]],
  ["0 bags cement", [["CEM-UB50", null, "bag", ["quantity_invalid"]]]],
  [
    "40 bags cement, 10 bags rockset",
    [
      ["CEM-UB50", 40000, "bag", []],
      ["CEM-RS50", 10000, "bag", []],
    ],
  ],
  [
    "3 rolls PVC pipe 1 inch and 25 elbows",
    [
      ["PVC-P1", 3000, "roll", []],
      ["PVC-E1", 25000, "piece", []],
    ],
  ],
  [
    "40 bags cement + 5 boxes ivory tiles",
    [
      ["CEM-UB50", 40000, "bag", []],
      ["TIL-22I", 5000, "box", []],
    ],
  ],
  ["Sorry make it 45 bags cement <This message was edited>", [["CEM-UB50", 45000, "bag", []]]],
  // Not order lines: prices, payments, references, times, totals, unsupported scripts.
  ["Cement 410 per bag", []],
  ["Paid 10,000 advance by UPI", []],
  ["Order for Kumar Builders site 2:", []],
  ["Deliver tomorrow 11am", []],
  ["Total approx 2,790 before GST", []],
  // Devanagari digits are read as digits (offsets unchanged).
  ["४० bags cement", [["CEM-UB50", 40000, "bag", []]]],
];

describe("buildOrderDraft: adversarial order lines", () => {
  it("covers at least 50 lines", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(50);
  });

  it.each(CASES)("%j", (body, expected) => {
    const draft = buildOrderDraft([message(body)], catalogue);
    const actual = draft.lines.map(
      (line, i): Expected => [
        line.product.value?.productId ?? null,
        line.quantity.value?.milli ?? null,
        line.unit.value,
        lineIssues(draft, i).sort(),
      ],
    );
    expect(actual).toEqual(expected.map(([p, q, u, issues]) => [p, q, u, [...issues].sort()]));
    if (expected.length === 0) expect(draft.issues.map((i) => i.code)).toContain("no_lines");
  });
});

describe("buildOrderDraft: amounts and provenance", () => {
  it("converts alternative units and computes exact amounts", () => {
    const draft = buildOrderDraft([message("5 boxes white tiles\n2 bundle tmt 8mm")], catalogue);
    const [tiles, tmt] = draft.lines;
    expect(tiles?.baseQuantity.value?.milli).toBe(80000); // 5 × 16 sq ft
    expect(tiles?.amount).toMatchObject({ value: 416000, status: "ok" }); // 80 × 52.00
    expect(tmt?.baseQuantity.value?.milli).toBe(94800); // 2 × 47.4 kg
    expect(tmt?.amount).toMatchObject({ value: 649380, status: "needs_review" }); // 94.8 × 68.50, stale price
  });

  it("never invents a price, unit or tax", () => {
    const draft = buildOrderDraft(
      [message("2 ton sand\n3 pvc pipe 1 inch\n20 litre emulsion")],
      catalogue,
    );
    const [sand, pipe, paint] = draft.lines;
    expect(sand?.unitPrice).toEqual({ value: null, status: "unknown", evidence: [] });
    expect(sand?.amount.value).toBeNull();
    expect(pipe?.unit.value).toBeNull();
    expect(pipe?.amount.value).toBeNull();
    expect(paint?.amount.value).toBe(330500);
    expect(paint?.tax.value).toBeNull();
    expect([draft.subtotal.value, draft.taxTotal.value, draft.total.value]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("cites catalogue rows for prices and never a chat message", () => {
    const draft = buildOrderDraft([message("Cement is 999 per bag\n40 bags cement")], catalogue);
    const price = draft.lines[0]?.unitPrice;
    expect(price?.value).toBe(41000);
    expect(price?.evidence).toEqual([
      {
        kind: "catalogue",
        catalogueVersion: catalogue.version,
        table: "products",
        recordId: "CEM-UB50",
        row: 2,
        column: "price",
      },
    ]);
  });

  it("cites the exact message text and source lines for chat-derived fields", () => {
    const body = "Order for Kumar Builders site 2:\n40 bags cement\n120 sq ft tiles 2x2 white";
    const draft = buildOrderDraft([{ ...message(body), startLine: 6, endLine: 8 }], catalogue);
    const [product] = draft.lines[1]?.product.evidence ?? [];
    expect(product).toMatchObject({
      kind: "message",
      startLine: 8,
      endLine: 8,
      text: "tiles 2x2 white",
    });
    const quantity = draft.lines[0]?.quantity.evidence[0];
    expect(quantity).toMatchObject({ kind: "message", startLine: 7, text: "40 bags cement" });
    expect(draft.customer.evidence[0]).toMatchObject({
      kind: "message",
      startLine: 6,
      text: "Kumar Builders site 2",
    });
  });

  it("flags stale and not-yet-effective prices relative to the order date", () => {
    const old = buildOrderDraft([message("40 bags cement", "2025-12-20T10:00:00")], catalogue);
    expect(old.issues.map((i) => i.code)).toContain("price_not_yet_effective");
    const late = buildOrderDraft([message("40 bags cement", "2026-03-01T10:00:00")], catalogue);
    expect(late.issues.map((i) => i.code)).toContain("price_stale");
  });
});

describe("buildOrderDraft: customers and currencies", () => {
  it("resolves the most specific customer name", () => {
    const draft = buildOrderDraft([message("For Kumar Builders: 40 bags cement")], catalogue);
    expect(draft.customer).toMatchObject({ value: { customerId: "KB-01" }, status: "ok" });
  });

  it("leaves the customer unknown when none is named", () => {
    const draft = buildOrderDraft([message("40 bags cement")], catalogue);
    expect(draft.customer.value).toBeNull();
    expect(draft.issues.map((i) => i.code)).toContain("customer_unresolved");
  });

  it("does not pick between same-name customers", () => {
    const { catalogue: withAlias } = loadCatalogue({
      products: read("products.csv"),
      customers:
        "customer_id,name,aliases\nKB-01,Kumar Builders,kumar\nKT-01,Kumar Traders,kumar\n",
      meta: read("catalogue.json"),
    });
    if (!withAlias) throw new Error("catalogue failed to load");
    const draft = buildOrderDraft([message("Kumar ji, 40 bags cement")], withAlias);
    expect(draft.customer.value).toBeNull();
    expect(draft.issues.map((i) => i.code)).toContain("customer_ambiguous");
  });

  it("refuses to total mixed currencies", () => {
    const products = `${read("products.csv")}USD-1,Imported Sealant,sealant,piece,,4.50,USD,2026-01-01,2026-01-10,18\n`;
    const { catalogue: mixed } = loadCatalogue({
      products,
      customers: read("customers.csv"),
      meta: read("catalogue.json"),
    });
    if (!mixed) throw new Error("catalogue failed to load");
    const draft = buildOrderDraft([message("40 bags cement\n2 sealant")], mixed);
    expect(draft.issues.map((i) => i.code)).toContain("mixed_currency");
    expect(draft.total.value).toBeNull();
  });
});

describe("buildOrderDraft: synthetic chat exports end to end", () => {
  const fixture = (name: string) =>
    readFileSync(new URL(`../../../fixtures/synthetic/chats/${name}`, import.meta.url), "utf8");
  const toSource = (m: ReturnType<typeof scanExport>["messages"][number]): SourceMessage => ({
    id: `msg-${m.index}`,
    startLine: m.startLine,
    endLine: m.endLine,
    timestampText: m.timestampText,
    localDateTime: m.localDateTime,
    body: m.body,
  });

  it("drafts the Kumar Builders order with exact totals and no open issues", () => {
    const scan = scanExport(fixture("android-dmy-hardware-orders.txt"));
    const order = scan.messages[5];
    if (!order) throw new Error("fixture changed");
    const draft = buildOrderDraft([toSource(order)], catalogue);
    expect(draft.issues).toEqual([]);
    expect(draft.customer.value).toEqual({ customerId: "KB-01", name: "Kumar Builders" });
    expect(draft.orderDate.value).toBe("2026-01-12");
    expect(
      draft.lines.map((l) => [l.product.value?.productId, l.amount.value, l.tax.value]),
    ).toEqual([
      ["CEM-UB50", 1640000, 459200], // 40 × 410.00; 28%
      ["TIL-22W", 624000, 112320], // 120 × 52.00; 18%
    ]);
    expect([draft.subtotal.value, draft.taxTotal.value, draft.total.value]).toEqual([
      2264000, 571520, 2835520,
    ]);
    expect(draft.total.status).toBe("ok");
  });

  it("drafts the plumbing order and matches the total quoted in the chat", () => {
    const scan = scanExport(fixture("ios-mdy-plumbing-orders.txt"));
    const order = scan.messages[2];
    if (!order) throw new Error("fixture changed");
    const draft = buildOrderDraft([toSource(order)], catalogue);
    // "Total approx 2,790 before GST" in the chat; computed independently from the catalogue.
    expect(draft.subtotal.value).toBe(279000);
    expect(draft.taxTotal.value).toBe(50220);
    expect(draft.issues.map((i) => i.code)).toEqual(["customer_unresolved"]);
  });
});

describe("buildOrderDraft: reviewer overrides", () => {
  const by = { reviewer: "Anita", at: "2026-01-12T12:00:00Z" };

  it("records a quantity correction as human provenance and recomputes totals", () => {
    const draft = buildOrderDraft([message("40 bags cement")], catalogue, {
      lines: {
        0: { quantity: { ...by, value: 45000, reason: "Corrected to 45 in chat line 12" } },
      },
    });
    const qty = draft.lines[0]?.quantity;
    expect(qty?.value).toEqual({ milli: 45000, text: "45" });
    expect(qty?.evidence[0]).toEqual({
      kind: "human",
      reviewer: "Anita",
      at: "2026-01-12T12:00:00Z",
      reason: "Corrected to 45 in chat line 12",
      previous: { milli: 40000, text: "40" },
    });
    expect(qty?.evidence[1]).toMatchObject({ kind: "message", text: "40 bags cement" });
    expect(draft.subtotal.value).toBe(1845000);
  });

  it("resolves ambiguous products and customers by reviewer choice", () => {
    const draft = buildOrderDraft([message("120 sq ft 2x2 tiles")], catalogue, {
      customer: { ...by, value: "SI-01", reason: "Known customer" },
      lines: { 0: { product: { ...by, value: "TIL-22I", reason: "Ivory per phone call" } } },
    });
    expect(draft.issues).toEqual([]);
    expect(draft.lines[0]?.product.value).toEqual({
      productId: "TIL-22I",
      name: "Vitrified Tile 2x2 Ivory",
    });
    expect(draft.lines[0]?.amount.value).toBe(654000); // 120 × 54.50
  });

  it("lets a reviewer confirm a stale price or supply a missing one", () => {
    const draft = buildOrderDraft(
      [message("For Kumar Builders 100 kg tmt 8mm, 2 ton sand")],
      catalogue,
      {
        lines: {
          0: { unitPrice: { ...by, value: 6850, reason: "Supplier reconfirmed today" } },
          1: { unitPrice: { ...by, value: 120000, reason: "Quoted on phone" } },
        },
      },
    );
    expect(draft.issues).toEqual([]);
    expect(draft.lines[1]?.unitPrice.evidence[0]).toMatchObject({ kind: "human", previous: null });
    expect(draft.subtotal.value).toBe(685000 + 240000);
  });

  it("excludes a superseded line from totals but keeps it for audit", () => {
    const body = "For Kumar Builders 40 bags cement\n120 sq ft white tiles";
    const correction = {
      ...message("Sorry make it 45 bags cement", "2026-01-12T11:45:00", "m2"),
      startLine: 12,
      endLine: 12,
    };
    const draft = buildOrderDraft([message(body), correction], catalogue, {
      lines: { 0: { excluded: { ...by, value: true, reason: "Replaced by the correction" } } },
    });
    expect(draft.lines.map((l) => [l.sourceText, l.excluded])).toEqual([
      ["40 bags cement", true],
      ["120 sq ft white tiles", false],
      ["45 bags cement", false],
    ]);
    expect(draft.subtotal.value).toBe(624000 + 1845000);
  });

  it("does not let a reviewer sell by a unit the catalogue does not define", () => {
    const draft = buildOrderDraft([message("For Shah Interiors 40 bags cement")], catalogue, {
      lines: { 0: { unit: { ...by, value: "kg", reason: "typo" } } },
    });
    expect(draft.issues.map((i) => i.code)).toEqual(["unit_incompatible"]);
    expect(draft.total.value).toBeNull();
  });

  it("rejects overrides that reference unknown records", () => {
    expect(() =>
      buildOrderDraft([message("40 bags cement")], catalogue, {
        lines: { 0: { product: { ...by, value: "NOPE", reason: "x" } } },
      }),
    ).toThrow(OverrideError);
  });
});

describe("buildOrderDraft: review fixes", () => {
  it("reports an absurd quantity as an issue instead of crashing", () => {
    const draft = buildOrderDraft(
      [message("For Kumar Builders 9000000000000 bags cement")],
      catalogue,
    );
    expect(draft.lines[0]?.amount.value).toBeNull();
    expect(draft.issues.map((i) => i.code)).toContain("amount_out_of_range");
    expect(draft.total.value).toBeNull();
  });

  it("cites the catalogue column that actually matched", () => {
    const byAlias = buildOrderDraft([message("40 bags cement")], catalogue).lines[0]?.product
      .evidence[1];
    const byName = buildOrderDraft([message("120 sq ft Vitrified Tile 2x2 White")], catalogue)
      .lines[0]?.product.evidence[1];
    expect(byAlias).toMatchObject({ kind: "catalogue", column: "aliases" });
    expect(byName).toMatchObject({ kind: "catalogue", recordId: "TIL-22W", column: "name" });
  });
});
