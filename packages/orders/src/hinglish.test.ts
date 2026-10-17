import { describe, expect, it } from "vitest";
import { loadCatalogue } from "./catalogue.ts";
import { buildOrderDraft, type SourceMessage } from "./draft.ts";
import { looksLikeNonOrder } from "./extract.ts";
import { syntheticCatalogue } from "./fixtures.ts";
import { compileLexicon } from "./lexicon.ts";

// Synthetic catalogue with generic (non-brand) products sold by Indian distributors.
const PRODUCTS = `product_id,name,aliases,unit,alt_units,price,currency,price_effective_from,price_confirmed_on,tax_rate_percent
CEM,Cement 50kg,cement|siment,bag,,400.00,INR,2026-01-01,2026-01-10,28
SOAP,Neem Soap 100g,soap|sabun|साबुन,piece,case:48,30.00,INR,2026-01-01,2026-01-10,18
WIRE,Copper Wire 1.5mm,wire|taar,metre,roll:90,20.00,INR,2026-01-01,2026-01-10,18
SW,Switch 6A,switch,piece,,45.00,INR,2026-01-01,2026-01-10,18
PCM,Paracetamol 500mg,paracetamol|pcm,strip,,15.00,INR,2026-01-01,2026-01-10,12
RICE,Rice 25kg,rice|chawal,bag,,1200.00,INR,2026-01-01,2026-01-10,5
PEN,Ball Pen,pen,piece,,10.00,INR,2026-01-01,2026-01-10,18
FAB,Cotton Fabric,cotton|fabric,than,,900.00,INR,2026-01-01,2026-01-10,5
`;
const CUSTOMERS = "customer_id,name,aliases\nC1,Sharma Stores,sharma\n";

function catalogue(lexicon?: string) {
  const { catalogue, issues } = loadCatalogue({
    products: lexicon ? PRODUCTS : PRODUCTS.replace(/\nFAB,.*\n/, "\n"),
    customers: CUSTOMERS,
    meta: '{"maintainer":"Test"}',
    ...(lexicon ? { lexicon } : {}),
  });
  if (!catalogue) throw new Error(JSON.stringify(issues));
  return catalogue;
}
const msg = (body: string): SourceMessage => ({
  id: "m",
  startLine: 1,
  endLine: 1,
  timestampText: "12/01/26",
  localDateTime: "2026-01-12T10:00:00",
  body,
});
const lines = (body: string, cat = catalogue()) => {
  const d = buildOrderDraft([msg(body)], cat);
  return d.lines.map((l, i) => [
    l.product.value?.productId ?? null,
    l.quantity.value?.milli ?? null,
    l.unit.value,
    l.baseQuantity.value?.milli ?? null,
    d.issues.filter((x) => x.field.startsWith(`lines[${i}]`)).map((x) => x.code),
  ]);
};

describe("Hinglish and Indian-script order lines", () => {
  it.each([
    ["cement 50 bori kal bhej dena", [["CEM", 50000, "bag", 50000, []]]],
    ["do bori cement", [["CEM", 2000, "bag", 2000, ["quantity_in_words"]]]],
    ["chawal 3 bori", [["RICE", 3000, "bag", 3000, []]]],
    [
      "2 peti sabun aur ek coil taar",
      [
        ["SOAP", 2000, "case", 96000, []],
        ["WIRE", 1000, "roll", 90000, ["quantity_in_words"]],
      ],
    ],
    ["२ पेटी साबुन", [["SOAP", 2000, "case", 96000, []]]],
    [
      "bees nag switch, pachas mtr wire",
      [
        ["SW", 20000, "piece", 20000, ["quantity_in_words"]],
        ["WIRE", 50000, "metre", 50000, ["quantity_in_words"]],
      ],
    ],
    ["dedh dozen pen", [["PEN", 1500, "dozen", 18000, ["quantity_in_words"]]]],
    ["2 dozen pen", [["PEN", 2000, "dozen", 24000, []]]],
    ["paracetamol 10 strip", [["PCM", 10000, "strip", 10000, []]]],
    ["5m wire", [["WIRE", 5000, "metre", 5000, []]]],
    ["siment 10 bori pls", [["CEM", 10000, "bag", 10000, []]]],
  ])("%j", (body, expected) => {
    expect(lines(body)).toEqual(expected);
  });

  it("keeps the original Devanagari digits in the evidence text", () => {
    const d = buildOrderDraft([msg("२ पेटी साबुन")], catalogue());
    expect(d.lines[0]?.quantity.evidence[0]).toMatchObject({ kind: "message", text: "२ पेटी साबुन" });
  });

  it("does not treat verbs or references as quantities", () => {
    expect(lines("kal wala maal bhej do")).toEqual([]);
    expect(lines("jaldi bhej do bhai")).toEqual([]);
  });

  it.each([
    ["bhai cement ka rate kya hai?", true],
    ["Rate kya chal raha hai aaj", true],
    ["payment kar diya 5000", true],
    ["kal wala maal bhej do", true],
    ["10 bori cement bhej do", false],
  ])("non-order detection: %j -> %s", (body, expected) => {
    expect(looksLikeNonOrder(body, compileLexicon(catalogue().lexicon))).toBe(expected);
  });
});

describe("business lexicon.json", () => {
  const LEXICON = JSON.stringify({
    units: { than: ["than", "thaan"] },
    nonOrderPhrases: ["sample bhejo"],
  });

  it("adds the business's own unit words", () => {
    expect(lines("3 than cotton", catalogue(LEXICON))).toEqual([["FAB", 3000, "than", 3000, []]]);
  });

  it("is part of the catalogue version", () => {
    expect(catalogue(LEXICON).version).not.toBe(
      catalogue(JSON.stringify({ units: { than: ["than"] } })).version,
    );
  });

  it("reports invalid lexicon files as catalogue errors", () => {
    const bad = loadCatalogue({
      products: PRODUCTS,
      customers: CUSTOMERS,
      lexicon: JSON.stringify({ units: { "Bad Code": "nope" }, numbers: { x: "two" } }),
    });
    expect(bad.catalogue).toBeNull();
    expect(bad.issues.filter((i) => i.file === "lexicon.json").map((i) => i.code)).toEqual([
      "invalid_lexicon",
      "invalid_lexicon",
      "invalid_lexicon",
    ]);
  });

  it("can mark extra phrases as not orders", () => {
    expect(
      looksLikeNonOrder(
        "2 than cotton ka sample bhejo",
        compileLexicon(catalogue(LEXICON).lexicon),
      ),
    ).toBe(true);
  });
});

describe("customers named in another script", () => {
  it("resolves and cites a Devanagari customer name", () => {
    const { catalogue } = loadCatalogue({
      products: PRODUCTS.replace(/\nFAB,.*\n/, "\n"),
      customers: "customer_id,name,aliases\nC2,शर्मा स्टोर्स,sharma stores\n",
      meta: '{"maintainer":"Test"}',
    });
    if (!catalogue) throw new Error("catalogue failed");
    const d = buildOrderDraft([msg("शर्मा स्टोर्स के लिए 2 पेटी साबुन")], catalogue);
    expect(d.customer.value?.customerId).toBe("C2");
    expect(d.customer.evidence[0]).toMatchObject({ kind: "message", text: "शर्मा स्टोर्स" });
  });
});

describe("synthetic Hinglish chat export", () => {
  it("drafts every order line and skips rate questions and payment notes", async () => {
    const { readFileSync } = await import("node:fs");
    const { scanExport } = await import("@chatterpilot/import-whatsapp");
    const cat = syntheticCatalogue();
    const text = readFileSync(
      new URL("../../../fixtures/synthetic/chats/android-hinglish-orders.txt", import.meta.url),
      "utf8",
    );
    const rows = scanExport(text).messages.map((m) => {
      const d = buildOrderDraft(
        [
          {
            id: `m${m.index}`,
            startLine: m.startLine,
            endLine: m.endLine,
            timestampText: m.timestampText,
            localDateTime: m.localDateTime,
            body: m.body,
          },
        ],
        cat,
      );
      return [
        m.startLine,
        looksLikeNonOrder(m.body, compileLexicon(cat.lexicon)),
        d.lines.map((l) => [
          l.product.value?.productId ?? null,
          l.baseQuantity.value?.milli ?? null,
        ]),
        d.customer.value?.customerId ?? null,
      ];
    });
    expect(rows).toEqual([
      [1, false, [["CEM-UB50", 20000]], "KB-01"],
      [2, false, [["PVC-E1", 50000]], null],
      [3, false, [], null],
      [4, false, [["CEM-UB50", 4000]], "SI-01"],
      [5, true, [], null],
      [6, true, [], null],
      [7, false, [["PVC-E1", 18000]], null],
    ]);
  });
});

describe("orders versus questions, reports and complaints", () => {
  it.each([
    "40 bori cement bhej doge kya?",
    "can you send 40 bags cement?",
    "kal tak 20 bag rockset bhej sakte ho?",
  ])("still drafts the polite order %j", (text) => {
    expect(looksLikeNonOrder(text)).toBe(false);
  });

  it("known limit: a new order in the same message as a delivery report is not suggested", () => {
    // Documented in docs/evaluation.md; a person can still draft the message by hand.
    expect(looksLikeNonOrder("last order mil gaya, ab 5 box white tiles bhejo")).toBe(true);
  });

  it.each([
    "do you have 50 bags ultrabond in stock?",
    "kal 40 bag bheje the but sirf 35 mile",
    "2 box tile toot gaye delivery me",
    "pichle hafte 10 bori ultrabond bheja tha wo bill chahiye",
    "क्या ५० बोरी रॉकसेट मिल जाएगी आज?",
  ])("does not suggest %j as a new order", (text) => {
    expect(looksLikeNonOrder(text)).toBe(true);
  });
});

describe("corrections, partial matches and lists", () => {
  const cat = syntheticCatalogue();
  const draft = (body: string) =>
    buildOrderDraft(
      [
        {
          id: "m",
          startLine: 1,
          endLine: 1,
          timestampText: "x",
          localDateTime: "2026-01-12T10:00:00",
          body,
        },
      ],
      cat,
    );
  const codes = (d: ReturnType<typeof draft>) => d.issues.map((i) => i.code);

  it("applies a later 'make it N' to a single line, cites it, and asks a person to confirm", () => {
    const d = draft("40 bags ultrabond cement\nmake it 45");
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]?.quantity).toMatchObject({ value: { milli: 45000 }, status: "needs_review" });
    expect(d.lines[0]?.quantity.evidence[0]).toMatchObject({
      kind: "message",
      text: "45",
      startLine: 2,
    });
    expect(codes(d)).toContain("correction_in_message");
  });

  it("reads 'nahi nahi 15 kar do' as a correction, not a new line", () => {
    const d = draft("10 bori ultrabond bhejna\nnahi nahi 15 kar do");
    expect(d.lines.map((l) => l.quantity.value?.milli)).toEqual([15000]);
  });

  it("flags every line when a multi-line message cancels something", () => {
    const d = draft("20 bags rockset\n50 elbows\nactually cancel the elbows");
    expect(d.lines).toHaveLength(2);
    expect(d.issues.filter((i) => i.code === "correction_in_message")).toHaveLength(2);
  });

  it("keeps an apology before the line as part of the line", () => {
    expect(codes(draft("Sorry make it 45 bags cement"))).not.toContain("correction_in_message");
  });

  it("flags a product match that leaves words unexplained", () => {
    const d = draft("10 bori white cement chahiye");
    expect(d.lines[0]?.product).toMatchObject({
      value: { productId: "CEM-UB50" },
      status: "needs_review",
    });
    expect(codes(d)).toContain("product_partial");
    expect(codes(draft("10 bori ultrabond cement chahiye"))).not.toContain("product_partial");
  });

  it("splits product-first lists and treats '8 mm' like '8mm'", () => {
    const d = draft("white tiles 10 box, ivory tiles 4 box");
    expect(d.lines.map((l) => [l.product.value?.productId, l.baseQuantity.value?.milli])).toEqual([
      ["TIL-22W", 160000],
      ["TIL-22I", 64000],
    ]);
    expect(draft("tmt 8 mm 200 kg").lines[0]?.product.value?.productId).toBe("TMT-08");
  });
});
