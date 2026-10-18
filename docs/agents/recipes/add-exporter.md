# Recipe: add an export format

## Goal

Produce an import file for another billing or accounting tool from accepted orders only. A person
imports the file into that tool; ChatterPilot never writes to it. Patterns:
[4. A person accepts; the record freezes](../../patterns.md#4-a-person-accepts-the-record-freezes)
and [8. Chat text is untrusted input everywhere](../../patterns.md#8-chat-text-is-untrusted-input-everywhere).

There is no plug-in registry. A format is one `ExportTarget` object in the `TARGETS` array.

## Read first

- [docs/exporters.md](../../exporters.md): the existing formats, why they are "experimental", and
  `export-map.json`.
- `packages/exporters/src/types.ts`: `ExportTarget` (`id`, `label`, `maturity`, `notes`,
  `render(orders, map)`), `ExportResult`, `ExportMap`, `ExportRefused`, `orderReference`.
- `packages/exporters/src/common.ts`: `flatten` (throws `ExportRefused` on any unknown value),
  `namer` (target names from the map, with a warning on fallback), `xml` (escaping),
  `compactDate`.
- `packages/exporters/src/targets.ts`: `erpnextCsv` and `zohoCsv` for CSV, `ublOrder` for XML,
  `tallyXml` for a format that refuses without explicit names.
- `packages/exporters/src/exporters.test.ts`: the fixtures `A`, `B` and `MAP` you will reuse.

Base the layout on a template exported from the real tool, filled with synthetic values.

## Steps

1. Add the target in `packages/exporters/src/targets.ts` and append it to `TARGETS`. Build CSV with
   `toCsv` from `@chatterpilot/core`, which quotes cells and neutralises formula injection. Build
   XML with `xml()` around every text value. The names below (`myToolCsv`, `mytool-csv`) are
   placeholders.

   ```ts
   export const myToolCsv: ExportTarget = {
     id: "mytool-csv",
     label: "My Tool (CSV)",
     maturity: "experimental",
     notes: "Built from a template exported from My Tool with synthetic values. Import into a test company first.",
     render(orders, map) {
       const flat = flatten(orders, orderReference); // refuses unknown values
       const warnings = ["Experimental: compare these columns with a template exported from My Tool."];
       const names = namer(map, warnings);
       const rows: (string | number | null)[][] = [
         ["Reference", "Date", "Customer", "Item", "Quantity", "Unit", "Rate", "Currency"],
       ];
       for (const o of flat) {
         for (const l of o.lines) {
           rows.push([o.reference, o.orderDate, names.customer(o), names.product(l),
             l.baseQuantity, names.unit(l.baseUnit), l.unitPrice, o.currency]);
         }
       }
       names.finish();
       return {
         files: [{ fileName: "chatterpilot-orders-mytool.csv", mediaType: "text/csv", content: toCsv(rows) }],
         warnings,
       };
     },
   };

   export const TARGETS: readonly ExportTarget[] = [tallyXml, erpnextCsv, zohoCsv, ublOrder, myToolCsv];
   ```

   `FlatLine` values are already strings: quantities in base units and money formatted from
   integer minor units. Do not convert them to floats.

2. Export it from `packages/exporters/src/index.ts` next to `erpnextCsv` and the others.

3. Update the places that list formats by hand:
   - `apps/local/src/mcp.ts`: the `z.enum([...])` and the description of the `export_orders` tool.
   - `apps/local/src/cli.ts`: the `export --format` line in `USAGE`.
   - `apps/local/src/server.test.ts`: the expected list in "lists targets and prepares files only
     from accepted orders, refusing Tally without a map".
   - [docs/exporters.md](../../exporters.md): the formats table.

   `EXPORT_FORMATS` in `apps/local/src/ops.ts` and the `/api/exports` route in
   `apps/local/src/server.ts` read `TARGETS`, so they need no change.

4. Regenerate the tool list, because the `export_orders` schema changed:

   ```sh
   pnpm agent-reference
   ```

## Test to add

In `packages/exporters/src/exporters.test.ts`, import `myToolCsv` from `./index.ts` and add:

```ts
describe("My Tool CSV", () => {
  it("writes one row per line with mapped names and the CP reference", () => {
    const parsed = parseCsv(myToolCsv.render([A], MAP).files[0]?.content ?? "");
    if (!parsed.ok) throw new Error("csv");
    expect(parsed.rows[1]).toEqual([
      "CP-0123456789", "2026-01-12", "Kumar Builders (Debtors)", "CEMENT-50", "40", "Bag", "410.00", "INR",
    ]);
  });

  it("refuses orders with unknown values", () => {
    const broken: AcceptedOrder = {
      ...A,
      draft: { ...A.draft, customer: { value: null, status: "unknown", evidence: [] } },
    };
    expect(() => myToolCsv.render([broken], MAP)).toThrow(ExportRefused);
  });
});
```

Add a hostile-name case if your format is XML, like "escapes hostile names instead of breaking the
document" (fixture `B` has the customer `Evil <b>&amp; Co ]]>`).

## Done when

```sh
pnpm exec vitest run packages/exporters/src/exporters.test.ts   # exit 0
pnpm exec vitest run apps/local/src/server.test.ts              # exit 0 (target list updated)
pnpm exec vitest run apps/local/src/agent-reference.test.ts     # exit 0 (tools.json regenerated)
pnpm check                                                      # exit 0
```

Optionally, check the command end to end in a new, empty workspace in a scratch folder outside the
repository. The second command exits 1 with `nothing_accepted`:

```sh
dir=$(mktemp -d)
pnpm chatterpilot init --timezone Asia/Kolkata --workspace "$dir/ws"
pnpm chatterpilot export --format mytool-csv --workspace "$dir/ws" --json
```

Once a person has accepted an order in that workspace, the same command prints a file.

## Do not

- Do not read drafts that are not accepted. `render` receives `AcceptedOrder` values only.
- Do not fill a missing name, price, unit or tax. Let `flatten` refuse, or refuse in `render` like
  `tallyXml` does when the target would silently drop lines.
- Do not mark a new format `stable` until it has been imported into the real tool.
- Do not connect to the billing tool, and do not commit a real template's customer or item names.
- Do not drop the `CP-` reference (`orderReference`); it lets a person spot a duplicate import.
