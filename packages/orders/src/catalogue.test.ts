import { describe, expect, it } from "vitest";
import { loadCatalogue } from "./catalogue.ts";
import { read } from "./fixtures.ts";

const HEADER =
  "product_id,name,aliases,unit,alt_units,price,currency,price_effective_from,price_confirmed_on,tax_rate_percent";
const CUSTOMERS = "customer_id,name,aliases\nC1,Some Customer,\n";
const META = '{"maintainer":"Test"}';
const load = (rows: string[], customers = CUSTOMERS) =>
  loadCatalogue({ products: [HEADER, ...rows].join("\n"), customers, meta: META });
const codes = (rows: string[]) =>
  load(rows).issues.map((i) => `${i.severity}:${i.code}:${i.row ?? "-"}`);

describe("loadCatalogue: synthetic fixture", () => {
  const { catalogue, issues } = loadCatalogue({
    products: read("products.csv"),
    customers: read("customers.csv"),
    meta: read("catalogue.json"),
  });

  it("loads with a content version, maintainer and policy", () => {
    expect(catalogue).not.toBeNull();
    expect(catalogue?.products).toHaveLength(9);
    expect(catalogue?.customers).toHaveLength(3);
    expect(catalogue?.version).toMatch(/^[0-9a-f]{16}$/);
    expect(catalogue).toMatchObject({
      maintainer: "Anita, Sunrise Hardware (synthetic)",
      stalePriceDays: 30,
    });
  });

  it("reports only the intended warnings", () => {
    expect(issues.map((i) => `${i.severity}:${i.code}:${i.row ?? i.column}`).sort()).toEqual([
      "warning:price_missing:8",
      "warning:shared_alias:aliases",
      "warning:tax_rate_missing:10",
    ]);
    expect(issues.find((i) => i.code === "shared_alias")?.message).toContain("TIL-22W, TIL-22I");
  });

  it("parses units, conversions, prices and tax exactly", () => {
    const tiles = catalogue?.products.find((p) => p.id === "TIL-22W");
    expect(tiles).toMatchObject({
      unit: "sqft",
      altUnits: [{ unit: "box", factorMilli: 16000 }],
      priceMinor: 5200,
      taxRateMilli: 18000,
    });
    const paint = catalogue?.products.find((p) => p.id === "PNT-WE20");
    expect(paint).toMatchObject({
      name: "Wall Emulsion, White",
      unit: "litre",
      priceMinor: 16525,
      taxRateMilli: null,
    });
    expect(catalogue?.products.find((p) => p.id === "SND-RV")?.priceMinor).toBeNull();
  });

  it("changes version when any file changes", () => {
    const changed = loadCatalogue({
      products: read("products.csv").replace("410.00", "415.00"),
      customers: read("customers.csv"),
      meta: read("catalogue.json"),
    });
    expect(changed.catalogue?.version).not.toBe(catalogue?.version);
  });
});

describe("loadCatalogue: validation", () => {
  const good = "P1,Thing,thing,bag,,10.00,INR,2026-01-01,2026-01-02,18";

  it("accepts a minimal valid row", () => {
    expect(load([good]).catalogue?.products).toHaveLength(1);
  });

  it.each([
    ["duplicate id", [good, good], "error:duplicate_id:3"],
    ["bad id", ["P 1,Thing,,bag,,10,INR,,,"], "error:invalid_id:2"],
    ["unknown unit", ["P1,Thing,,crate,,10,INR,,,"], "error:invalid_unit:2"],
    ["negative price", ["P1,Thing,,bag,,-10,INR,,,"], "error:invalid_price:2"],
    ["price with symbol", ["P1,Thing,,bag,,₹10,INR,,,"], "error:invalid_price:2"],
    ["three decimals", ["P1,Thing,,bag,,10.005,INR,,,"], "error:invalid_price:2"],
    ["bad currency", ["P1,Thing,,bag,,10,Rs,,,"], "error:invalid_currency:2"],
    ["bad date", ["P1,Thing,,bag,,10,INR,12/01/2026,,"], "error:invalid_date:2"],
    ["impossible date", ["P1,Thing,,bag,,10,INR,2026-02-30,,"], "error:invalid_date:2"],
    ["bad alt unit", ["P1,Thing,,bag,box,10,INR,,,"], "error:invalid_alt_unit:2"],
    ["alt unit same as base", ["P1,Thing,,bag,bags:2,10,INR,,,"], "error:invalid_alt_unit:2"],
    ["tax over 100", ["P1,Thing,,bag,,10,INR,,,120"], "error:invalid_tax_rate:2"],
    ["wrong field count", ["P1,Thing,,bag,,10,INR"], "error:row_width:2"],
    ["unconfirmed price", ["P1,Thing,,bag,,10,INR,,,18"], "warning:price_unconfirmed:2"],
  ])("%s", (_name, rows, code) => {
    expect(codes(rows)).toContain(code);
  });

  it("blocks drafting when there is any error", () => {
    expect(load([good, good]).catalogue).toBeNull();
  });

  it("reports missing columns and malformed CSV", () => {
    const missing = loadCatalogue({
      products: "product_id,name\nP1,Thing\n",
      customers: CUSTOMERS,
      meta: META,
    });
    expect(missing.issues.filter((i) => i.code === "missing_column").map((i) => i.column)).toEqual([
      "unit",
      "price",
      "currency",
    ]);
    const malformed = loadCatalogue({
      products: `${HEADER}\nP1,"Thing,`,
      customers: CUSTOMERS,
      meta: META,
    });
    expect(malformed.issues[0]?.code).toBe("csv_malformed");
  });

  it("validates customers and settings", () => {
    const result = loadCatalogue({
      products: [HEADER, good].join("\n"),
      customers: "customer_id,name,aliases\nC1,A,\nC1,B,\nC2,,\n",
      meta: '{"stalePriceDays": 0}',
    });
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["duplicate_id", "missing_value", "invalid_setting"]),
    );
  });
});
