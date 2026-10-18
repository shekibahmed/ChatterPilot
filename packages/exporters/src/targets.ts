import { toCsv } from "@chatterpilot/core";
import { compactDate, flatten, namer, xml } from "./common.ts";
import {
  type AcceptedOrder,
  type ExportMap,
  ExportRefused,
  type ExportResult,
  type ExportTarget,
  orderReference,
} from "./types.ts";

/**
 * Tally Prime: XML "Import Data" envelope with one Sales Order voucher per accepted order.
 * EXPERIMENTAL: the envelope follows Tally's published XML message format; the Sales Order
 * inventory tags follow third-party descriptions. Test with a sample company first.
 * Fails closed: without explicit master names, an import could silently drop lines.
 */
export const tallyXml: ExportTarget = {
  id: "tally-xml",
  label: "Tally Prime (XML, Sales Order)",
  maturity: "experimental",
  notes:
    "Import via Gateway of Tally > Import > Vouchers. Requires an active Sales Order voucher type, and ledgers, stock items and units that already exist with exactly the mapped names. Tally creates duplicates if the same file is imported twice.",
  render(orders: readonly AcceptedOrder[], map?: ExportMap): ExportResult {
    const flat = flatten(orders, orderReference);
    const missing: string[] = [];
    for (const o of flat) {
      if (!map?.customers?.[o.customerId]) missing.push(`customer ${o.customerId}`);
      for (const l of o.lines)
        if (!map?.products?.[l.productId]) missing.push(`product ${l.productId}`);
    }
    if (missing.length > 0) {
      throw new ExportRefused([
        `Tally needs the exact ledger and stock-item names; add these to export-map.json: ${[...new Set(missing)].join(", ")}.`,
      ]);
    }
    const warnings: string[] = [
      "Experimental format: import into a test company first and compare totals.",
      "Order due date is set to the order date; change it in Tally if needed.",
      "Re-importing the same file creates duplicate vouchers in Tally; the voucher number (CP-…) identifies each accepted order.",
    ];
    const names = namer(map, warnings);
    const company = map?.tallyCompany;
    const voucherType = map?.tallyVoucherType ?? "Sales Order";
    const vouchers = flat
      .map((o) => {
        const date = compactDate(o.orderDate);
        const lines = o.lines
          .map((l) => {
            const unit = names.unit(l.baseUnit);
            if (/[\s/]/.test(unit)) {
              throw new ExportRefused([
                `Tally unit symbols cannot contain spaces or "/": "${unit}". Map it in export-map.json.`,
              ]);
            }
            return [
              "      <ALLINVENTORYENTRIES.LIST>",
              `       <STOCKITEMNAME>${xml(names.product(l))}</STOCKITEMNAME>`,
              `       <RATE>${l.unitPrice}/${xml(unit)}</RATE>`,
              `       <BILLEDQTY>${l.baseQuantity} ${xml(unit)}</BILLEDQTY>`,
              `       <ACTUALQTY>${l.baseQuantity} ${xml(unit)}</ACTUALQTY>`,
              `       <AMOUNT>${l.amount}</AMOUNT>`,
              `       <ORDERDUEDATE>${date}</ORDERDUEDATE>`,
              "      </ALLINVENTORYENTRIES.LIST>",
            ].join("\n");
          })
          .join("\n");
        return [
          `     <VOUCHER VCHTYPE="${xml(voucherType)}" ACTION="Create">`,
          `      <DATE>${date}</DATE>`,
          `      <VOUCHERTYPENAME>${xml(voucherType)}</VOUCHERTYPENAME>`,
          `      <VOUCHERNUMBER>${o.reference}</VOUCHERNUMBER>`,
          `      <PARTYLEDGERNAME>${xml(names.customer(o))}</PARTYLEDGERNAME>`,
          `      <NARRATION>${xml(`ChatterPilot ${o.reference}, accepted ${o.order.acceptedAt ?? ""} by ${o.order.acceptedBy ?? ""}`)}</NARRATION>`,
          lines,
          "     </VOUCHER>",
        ].join("\n");
      })
      .join("\n");
    names.finish();
    const content = [
      "<ENVELOPE>",
      " <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
      " <BODY>",
      "  <IMPORTDATA>",
      "   <REQUESTDESC>",
      "    <REPORTNAME>Vouchers</REPORTNAME>",
      company
        ? `    <STATICVARIABLES><SVCURRENTCOMPANY>${xml(company)}</SVCURRENTCOMPANY></STATICVARIABLES>`
        : null,
      "   </REQUESTDESC>",
      "   <REQUESTDATA>",
      '    <TALLYMESSAGE xmlns:UDF="TallyUDF">',
      vouchers,
      "    </TALLYMESSAGE>",
      "   </REQUESTDATA>",
      "  </IMPORTDATA>",
      " </BODY>",
      "</ENVELOPE>",
      "",
    ]
      .filter((l) => l !== null)
      .join("\n");
    return {
      files: [
        { fileName: "chatterpilot-sales-orders-tally.xml", mediaType: "application/xml", content },
      ],
      warnings,
    };
  },
};

/** ERPNext / Frappe Data Import: Sales Order with item rows on their own lines; imported as Draft. */
export const erpnextCsv: ExportTarget = {
  id: "erpnext-csv",
  label: "ERPNext / Frappe (Data Import CSV, Sales Order)",
  maturity: "experimental",
  notes:
    "Data Import > Sales Order > Insert New Records. Leave 'Submit After Import' off so orders stay Draft. Column labels follow ERPNext's template; export a template from your own instance and compare.",
  render(orders, map) {
    const flat = flatten(orders, orderReference);
    const warnings = [
      "Experimental format: compare these column headers with a template exported from your own ERPNext.",
      "Keep 'Submit After Import' off so the orders arrive as Draft for a final check.",
    ];
    const names = namer(map, warnings);
    const rows: (string | number | null)[][] = [
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
    ];
    for (const o of flat) {
      o.lines.forEach((l, i) => {
        const head = i === 0;
        rows.push([
          "",
          head ? names.customer(o) : "",
          head ? o.orderDate : "",
          head ? o.orderDate : "",
          head ? (map?.erpnextSeries ?? "SAL-ORD-.YYYY.-") : "",
          head ? o.reference : "",
          names.product(l),
          l.baseQuantity,
          l.unitPrice,
          names.unit(l.baseUnit),
        ]);
      });
    }
    names.finish();
    return {
      files: [
        {
          fileName: "chatterpilot-sales-orders-erpnext.csv",
          mediaType: "text/csv",
          content: toCsv(rows),
        },
      ],
      warnings,
    };
  },
};

/** Zoho Books: readable CSV to map in Sales Orders > Import (Map Fields step). */
export const zohoCsv: ExportTarget = {
  id: "zoho-csv",
  label: "Zoho Books (Sales Order import CSV)",
  maturity: "experimental",
  notes:
    "Sales > Sales Orders > More > Import Sales Orders; map the columns once and save the mapping.",
  render(orders, map) {
    const flat = flatten(orders, orderReference);
    const warnings = [
      "Experimental format: map these columns in Zoho's Map Fields step and save the mapping.",
    ];
    const names = namer(map, warnings);
    const rows: (string | number | null)[][] = [
      [
        "Sales Order Number",
        "Reference Number",
        "Sales Order Date",
        "Customer Name",
        "Item Name",
        "Quantity",
        "Usage unit",
        "Item Price",
        "Currency Code",
        "Item Tax %",
      ],
    ];
    for (const o of flat) {
      for (const l of o.lines) {
        rows.push([
          o.reference,
          o.order.id,
          o.orderDate,
          names.customer(o),
          names.product(l),
          l.baseQuantity,
          names.unit(l.baseUnit),
          l.unitPrice,
          o.currency,
          l.taxRate,
        ]);
      }
    }
    names.finish();
    return {
      files: [
        {
          fileName: "chatterpilot-sales-orders-zoho.csv",
          mediaType: "text/csv",
          content: toCsv(rows),
        },
      ],
      warnings,
    };
  },
};

/** UN/ECE Recommendation 20 codes for the units ChatterPilot knows; others fall back to "C62". */
const UNECE: Record<string, string> = {
  piece: "H87",
  kg: "KGM",
  gram: "GRM",
  ton: "TNE",
  quintal: "DTN",
  metre: "MTR",
  foot: "FOT",
  sqft: "FTK",
  litre: "LTR",
  ml: "MLT",
  pair: "PR",
  set: "SET",
  dozen: "DZN",
  bag: "BG",
  box: "BX",
  case: "CS",
  roll: "RO",
  bundle: "BE",
  sheet: "ST",
  pack: "PK",
  bottle: "BO",
  tin: "CA",
  strip: "SR",
};

/** OASIS UBL 2.1 Order documents, one file per accepted order. */
export const ublOrder: ExportTarget = {
  id: "ubl-order",
  label: "UBL 2.1 Order (XML)",
  maturity: "experimental",
  notes:
    "Open standard (OASIS UBL 2.1). One <Order> per accepted order. Validate against UBL-Order-2.1.xsd before sending to another system.",
  render(orders, map) {
    const flat = flatten(orders, orderReference);
    const warnings = [
      "Experimental: validate against the official UBL-Order-2.1.xsd; unknown units use UN/ECE code C62 (one).",
    ];
    if (!map?.seller)
      warnings.push("No seller name in export-map.json; the seller party is left as 'Seller'.");
    const names = namer(map, warnings);
    const docs = flat.map((o) => {
      const lines = o.lines
        .map(
          (l, i) => `  <cac:OrderLine>
    <cac:LineItem>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:Quantity unitCode="${UNECE[l.baseUnit] ?? "C62"}">${l.baseQuantity}</cbc:Quantity>
      <cbc:LineExtensionAmount currencyID="${xml(o.currency)}">${l.amount}</cbc:LineExtensionAmount>
      <cac:Price><cbc:PriceAmount currencyID="${xml(o.currency)}">${l.unitPrice}</cbc:PriceAmount></cac:Price>
      <cac:Item>
        <cbc:Name>${xml(names.product(l))}</cbc:Name>
        <cac:SellersItemIdentification><cbc:ID>${xml(l.productId)}</cbc:ID></cac:SellersItemIdentification>
      </cac:Item>
    </cac:LineItem>
  </cac:OrderLine>`,
        )
        .join("\n");
      return `<?xml version="1.0" encoding="UTF-8"?>
<Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>${o.reference}</cbc:ID>
  <cbc:IssueDate>${o.orderDate}</cbc:IssueDate>
  <cbc:Note>${xml(`ChatterPilot draft ${o.order.id}, accepted ${o.order.acceptedAt ?? ""}`)}</cbc:Note>
  <cbc:DocumentCurrencyCode>${xml(o.currency)}</cbc:DocumentCurrencyCode>
  <cac:BuyerCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID>${xml(o.customerId)}</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>${xml(names.customer(o))}</cbc:Name></cac:PartyName>
  </cac:Party></cac:BuyerCustomerParty>
  <cac:SellerSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>${xml(map?.seller ?? "Seller")}</cbc:Name></cac:PartyName>
  </cac:Party></cac:SellerSupplierParty>
  <cac:AnticipatedMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${xml(o.currency)}">${o.subtotal}</cbc:LineExtensionAmount>
    <cbc:PayableAmount currencyID="${xml(o.currency)}">${o.total ?? o.subtotal}</cbc:PayableAmount>
  </cac:AnticipatedMonetaryTotal>
${lines}
</Order>`;
    });
    names.finish();
    return {
      files: docs.map((content, i) => ({
        fileName: `chatterpilot-order-${flat[i]?.reference ?? i}.ubl.xml`,
        mediaType: "application/xml",
        content: `${content}\n`,
      })),
      warnings,
    };
  },
};

export const TARGETS: readonly ExportTarget[] = [tallyXml, erpnextCsv, zohoCsv, ublOrder];

export function targetById(id: string): ExportTarget | null {
  return TARGETS.find((t) => t.id === id) ?? null;
}
