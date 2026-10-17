import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCsv } from "@chatterpilot/core";
import { buildOrderDraft, loadCatalogue } from "@chatterpilot/orders";
import { describe, expect, it } from "vitest";
import { type ExportMap, ExportRefused, erpnextCsv, tallyXml, ublOrder, zohoCsv } from "./index.ts";
import type { AcceptedOrder } from "./types.ts";

const PRODUCTS = `product_id,name,aliases,unit,alt_units,price,currency,price_effective_from,price_confirmed_on,tax_rate_percent
CEM,Cement 50kg,cement,bag,,410.00,INR,2026-01-01,2026-01-10,28
TIL,Tile 2x2 White,white tiles,sqft,box:16,52.00,INR,2026-01-01,2026-01-10,18
`;
const CUSTOMERS = `customer_id,name,aliases
KB,Kumar Builders,kumar builders
EV,"Evil <b>&amp; Co ]]>",evil co
`;
const { catalogue } = loadCatalogue({
  products: PRODUCTS,
  customers: CUSTOMERS,
  meta: '{"maintainer":"T"}',
});
if (!catalogue) throw new Error("catalogue");

function order(body: string, id: string): AcceptedOrder {
  const draft = buildOrderDraft(
    [
      {
        id: `${id}-m`,
        startLine: 1,
        endLine: 1,
        timestampText: "x",
        localDateTime: "2026-01-12T10:00:00",
        body,
      },
    ],
    catalogue as NonNullable<typeof catalogue>,
  );
  if (draft.issues.length > 0) throw new Error(JSON.stringify(draft.issues));
  return {
    id,
    acceptedAt: "2026-01-12T11:00:00Z",
    acceptedBy: "Anita",
    snapshotSha256: `${id}`.padEnd(64, "a"),
    draft,
  };
}
const A = order("For Kumar Builders 40 bags cement, 5 boxes white tiles", "0123456789");
const B = order("For evil co 2 bags cement", "fedcba9876");
const MAP: ExportMap = {
  customers: { KB: "Kumar Builders (Debtors)", EV: "Evil & Co" },
  products: { CEM: "CEMENT-50", TIL: "TILE-WHITE-2X2" },
  units: { bag: "Bag", sqft: "SqFt" },
  seller: "Sunrise Hardware (synthetic)",
  tallyCompany: "Demo Co",
};

const wellFormed = (content: string) => {
  const dir = mkdtempSync(join(tmpdir(), "cp-xml-"));
  const file = join(dir, "x.xml");
  writeFileSync(file, content);
  try {
    execFileSync("xmllint", ["--noout", file], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const hasXmllint = existsSync("/usr/bin/xmllint") || existsSync("/usr/local/bin/xmllint");

describe("Tally XML", () => {
  it("refuses to export without explicit master names (fails closed)", () => {
    expect(() => tallyXml.render([A])).toThrow(ExportRefused);
    try {
      tallyXml.render([A]);
    } catch (err) {
      expect((err as ExportRefused).problems[0]).toContain("customer KB, product CEM, product TIL");
    }
  });

  it("writes one Sales Order voucher per order with mapped names and base-unit quantities", () => {
    const { files, warnings } = tallyXml.render([A, B], MAP);
    const xml = files[0]?.content ?? "";
    expect(xml).toContain("<TALLYREQUEST>Import Data</TALLYREQUEST>");
    expect(xml).toContain("<SVCURRENTCOMPANY>Demo Co</SVCURRENTCOMPANY>");
    expect(xml).toContain('<VOUCHER VCHTYPE="Sales Order" ACTION="Create">');
    expect(xml).toContain("<VOUCHERNUMBER>CP-0123456789</VOUCHERNUMBER>");
    expect(xml).toContain("<PARTYLEDGERNAME>Kumar Builders (Debtors)</PARTYLEDGERNAME>");
    expect(xml).toContain("<BILLEDQTY>80 SqFt</BILLEDQTY>"); // 5 boxes × 16 sq ft
    expect(xml).toContain("<RATE>52.00/SqFt</RATE>");
    expect(xml).toContain("<AMOUNT>4160.00</AMOUNT>");
    expect(xml).toContain("<PARTYLEDGERNAME>Evil &amp; Co</PARTYLEDGERNAME>");
    expect(xml.match(/<VOUCHER /g)).toHaveLength(2);
    expect(warnings.join(" ")).toContain("Experimental");
    if (hasXmllint) expect(wellFormed(xml)).toBe(true);
  });

  it("refuses unit symbols Tally cannot accept", () => {
    expect(() => tallyXml.render([A], { ...MAP, units: { bag: "Bag 50", sqft: "SqFt" } })).toThrow(
      /spaces/,
    );
  });
});

describe("ERPNext and Zoho CSV", () => {
  it("puts item rows under the order with blank parent columns, as Data Import expects", () => {
    const parsed = parseCsv(erpnextCsv.render([A], MAP).files[0]?.content ?? "");
    if (!parsed.ok) throw new Error("csv");
    expect(parsed.rows).toEqual([
      [
        "ID",
        "Customer",
        "Date",
        "Delivery Date",
        "Series",
        "PO No",
        "Item Code (Items)",
        "Quantity (Items)",
        "Rate (Items)",
        "UOM (Items)",
      ],
      [
        "",
        "Kumar Builders (Debtors)",
        "2026-01-12",
        "2026-01-12",
        "SAL-ORD-.YYYY.-",
        "CP-0123456789",
        "CEMENT-50",
        "40",
        "410.00",
        "Bag",
      ],
      ["", "", "", "", "", "", "TILE-WHITE-2X2", "80", "52.00", "SqFt"],
    ]);
  });

  it("writes one Zoho row per line with tax rate and currency", () => {
    const parsed = parseCsv(zohoCsv.render([A], MAP).files[0]?.content ?? "");
    if (!parsed.ok) throw new Error("csv");
    expect(parsed.rows[1]).toEqual([
      "CP-0123456789",
      "0123456789",
      "2026-01-12",
      "Kumar Builders (Debtors)",
      "CEMENT-50",
      "40",
      "Bag",
      "410.00",
      "INR",
      "28",
    ]);
  });

  it("warns when catalogue names stand in for target names", () => {
    expect(zohoCsv.render([A]).warnings.join(" ")).toContain(
      "must match the target system's names exactly",
    );
  });
});

describe("UBL 2.1 Order", () => {
  it("writes one well-formed document per order with UN/ECE unit codes", () => {
    const { files } = ublOrder.render([A, B], MAP);
    expect(files.map((f) => f.fileName)).toEqual([
      "chatterpilot-order-CP-0123456789.ubl.xml",
      "chatterpilot-order-CP-FEDCBA9876.ubl.xml",
    ]);
    const doc = files[0]?.content ?? "";
    expect(doc).toContain('<cbc:Quantity unitCode="BG">40</cbc:Quantity>');
    expect(doc).toContain('<cbc:Quantity unitCode="FTK">80</cbc:Quantity>');
    expect(doc).toContain('<cbc:PayableAmount currencyID="INR">');
    expect(doc).toContain("<cbc:Name>Sunrise Hardware (synthetic)</cbc:Name>");
    if (hasXmllint) for (const f of files) expect(wellFormed(f.content)).toBe(true);
  });

  it("escapes hostile names instead of breaking the document", () => {
    const { files } = ublOrder.render([B]);
    const doc = files[0]?.content ?? "";
    expect(doc).toContain("Evil &lt;b&gt;&amp;amp; Co ]]&gt;");
    if (hasXmllint) expect(wellFormed(doc)).toBe(true);
  });
});

describe("refusals", () => {
  it("refuses orders with unknown values", () => {
    const broken: AcceptedOrder = {
      ...A,
      draft: { ...A.draft, customer: { value: null, status: "unknown", evidence: [] } },
    };
    expect(() => zohoCsv.render([broken], MAP)).toThrow(ExportRefused);
  });
});
