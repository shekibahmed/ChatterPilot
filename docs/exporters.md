# Import files for other tools

Accepted orders can leave ChatterPilot as a file that another tool imports. Nothing is written to
the other tool directly: a person imports the file there, so they can check it first.

| Format (`--format`) | For | Maturity | Import it via |
|---|---|---|---|
| `csv`, `json` | Spreadsheets, your own code | stable | — (ChatterPilot's own formats, with provenance) |
| `tally-xml` | Tally Prime | experimental | Gateway of Tally → Import → Vouchers |
| `erpnext-csv` | ERPNext / Frappe | experimental | Data Import → Sales Order → Insert New Records (leave "Submit After Import" off) |
| `zoho-csv` | Zoho Books | experimental | Sales → Sales Orders → Import (map the columns once) |
| `ubl-order` | Any system that reads OASIS UBL 2.1 | experimental | one XML file per order |

```sh
pnpm chatterpilot export --format tally-xml --map export-map.json --output orders.xml
pnpm chatterpilot export --format ubl-order --output ubl/          # one file per order
```

The review app's **Export** tab offers the same files. Agents can call the `export_orders` MCP tool.

## Why "experimental"

These formats were built from each vendor's public documentation and third-party descriptions on
2026-10-17. They have **not** been imported into a real Tally, ERPNext or Zoho account. Notes from
that research:

- **Tally**: the Import Data envelope is documented; the Sales Order inventory tags are not in
  Tally's public samples. Tally can "succeed" while silently dropping lines when a voucher type is
  inactive or a stock item or ledger name does not match exactly, and re-importing a file creates
  duplicates. ChatterPilot therefore **refuses to write a Tally file until every customer and
  product has an explicit name** in `export-map.json`, refuses unit symbols with spaces or `/`, and
  numbers each voucher `CP-<fingerprint>` so a duplicate is easy to spot.
- **ERPNext**: item rows sit on their own lines under the order, as Data Import expects; the exact
  column labels depend on your version and language.
- **Zoho Books**: column names are not published; the file uses readable names that you map once.
- **UBL 2.1**: an open standard; validate against `UBL-Order-2.1.xsd` before sending anywhere.

Always import into a test company or sandbox first and compare the totals with ChatterPilot's.

## export-map.json

Other tools need their own names for customers (ledgers), products (stock items) and units. Put a
map in the workspace folder (`workspaces/<name>/export-map.json`) or pass `--map`:

```json
{
  "seller": "Your business name",
  "tallyCompany": "Company name exactly as in Tally",
  "customers": { "KB-01": "Kumar Builders" },
  "products": { "CEM-UB50": "UltraBond Cement 50kg" },
  "units": { "bag": "Bag", "sqft": "SqFt" }
}
```

Keys on the left are ChatterPilot catalogue ids and unit codes; values are the names in the other
tool. See `fixtures/synthetic/catalogue/export-map.example.json`. Without a map entry, the
ChatterPilot name is used (and you get a warning), except for Tally, which refuses.

## Adapting a format with your agent

The exporters are small, readable functions in `packages/exporters/src/targets.ts`. If your tool's
import differs (another Tally version, a custom ERPNext doctype, Busy, Vyapar, Marg or your own
system), let your coding agent adapt one:

> Export two sample sales orders from our billing tool as an import template. Then, in this
> repository, add an export target in `packages/exporters/src/targets.ts` that produces that exact
> format from ChatterPilot's accepted orders, following the existing targets: refuse when a name is
> missing, escape all text, keep the CP-reference, and add tests with synthetic data in
> `exporters.test.ts`. Run `pnpm check`. Do not connect to the billing tool.

Keep real customer data out of the repository: use your own synthetic fixtures for tests.
