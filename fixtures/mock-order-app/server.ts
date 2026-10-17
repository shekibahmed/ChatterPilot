// MockBooks: a synthetic proforma form used to test ChatterPilot's order connector.
// Test fixture only. Not a real product. Binds to 127.0.0.1; keeps drafts in memory.
//
//   node fixtures/mock-order-app/server.ts --port 4330 [--drift] [--layout-v2] [--lost-response]
//
// --drift          the target's own price for UltraBond cement differs from the catalogue
// --layout-v2      the quantity field is labelled "Qty" (a layout change the connector must notice)
// --lost-response     saving stores the draft but the confirmation never arrives
// --reset-after-save  saving stores the draft, then the connection drops (browsers may retry the POST)
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { loadCatalogue } from "../../packages/orders/src/index.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "4330" },
    drift: { type: "boolean", default: false },
    "layout-v2": { type: "boolean", default: false },
    "lost-response": { type: "boolean", default: false },
    "reset-after-save": { type: "boolean", default: false },
  },
});

const here = new URL(".", import.meta.url);
const catalogueDir = new URL("../synthetic/catalogue/", import.meta.url);
const { catalogue } = loadCatalogue({
  products: readFileSync(new URL("products.csv", catalogueDir), "utf8"),
  customers: readFileSync(new URL("customers.csv", catalogueDir), "utf8"),
  meta: readFileSync(new URL("catalogue.json", catalogueDir), "utf8"),
});
if (!catalogue) throw new Error("synthetic catalogue failed to load");

const master = {
  layout: values["layout-v2"] ? "v2" : "v1",
  customers: catalogue.customers.map((c) => ({ id: c.id, name: c.name })),
  products: catalogue.products
    .filter((p) => p.priceMinor !== null && p.taxRateMilli !== null)
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      altUnits: Object.fromEntries(p.altUnits.map((a) => [a.unit, a.factorMilli])),
      priceMinor: values.drift && p.id === "CEM-UB50" ? 41500 : p.priceMinor,
      taxRateMilli: p.taxRateMilli,
    })),
};

interface DraftLine {
  productId: string;
  quantity: string;
  unit: string;
}
interface Draft {
  id: string;
  status: "draft" | "submitted";
  reference: string;
  customerId: string;
  orderDate: string;
  lines: DraftLine[];
}
const drafts = new Map<string, Draft>();
let submissions = 0;

const half = (n: bigint, d: bigint) => (n * 2n + d) / (d * 2n);
const money = (minor: bigint) => `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`;
const milli = (text: string) => {
  const [w = "0", f = ""] = text.split(".");
  return BigInt(w) * 1000n + BigInt(f.padEnd(3, "0").slice(0, 3) || "0");
};

/** The target's own pricing: per line round(base quantity × price), tax round(amount × rate). */
function priced(d: Draft) {
  let subtotal = 0n;
  let tax = 0n;
  const lines = d.lines.map((l) => {
    const p = master.products.find((x) => x.id === l.productId);
    const factor = p ? (l.unit === p.unit ? 1000 : (p.altUnits[l.unit] ?? 0)) : 0;
    const base = half(milli(l.quantity) * BigInt(factor), 1000n);
    const amount = p ? half(base * BigInt(p.priceMinor ?? 0), 1000n) : 0n;
    const lineTax = p ? half(amount * BigInt(p.taxRateMilli ?? 0), 100000n) : 0n;
    subtotal += amount;
    tax += lineTax;
    return {
      ...l,
      unitPrice: money(BigInt(p?.priceMinor ?? 0)),
      amount: money(amount),
      tax: money(lineTax),
    };
  });
  return {
    ...d,
    lines,
    subtotal: money(subtotal),
    taxTotal: money(tax),
    total: money(subtotal + tax),
  };
}

const TYPES: Record<string, string> = { html: "text/html", js: "text/javascript", css: "text/css" };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/api/master") return json(200, master);
  if (url.pathname === "/api/stats") return json(200, { drafts: drafts.size, submissions });
  if (url.pathname === "/api/drafts" && req.method === "GET") {
    const ref = url.searchParams.get("ref");
    return json(
      200,
      [...drafts.values()].filter((d) => !ref || d.reference === ref).map((d) => d.id),
    );
  }
  const one = /^\/api\/drafts\/(DR-\d+)(\/submit)?$/.exec(url.pathname);
  if (one && req.method === "GET" && !one[2]) {
    const d = drafts.get(one[1] ?? "");
    return d ? json(200, priced(d)) : json(404, { error: "not found" });
  }
  if (one?.[2] && req.method === "POST") {
    const d = drafts.get(one[1] ?? "");
    if (!d) return json(404, { error: "not found" });
    d.status = "submitted";
    submissions++;
    return json(200, { ok: true });
  }
  if (url.pathname === "/api/drafts" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      const input = JSON.parse(body) as Omit<Draft, "id" | "status">;
      const id = `DR-${String(drafts.size + 1).padStart(4, "0")}`;
      drafts.set(id, { ...input, id, status: "draft" });
      if (values["lost-response"]) return; // stored, but no response is ever sent
      if (values["reset-after-save"]) {
        req.socket.destroy(); // stored, then the connection drops mid-response
        return;
      }
      json(201, { id });
    });
    return;
  }
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (!/^[a-z-]+\.(html|js|css)$/.test(file)) return json(404, { error: "not found" });
  try {
    const text = readFileSync(new URL(`public/${file}`, here));
    res.writeHead(200, { "content-type": TYPES[file.split(".").pop() ?? "html"] ?? "text/plain" });
    res.end(text);
  } catch {
    json(404, { error: "not found" });
  }
});

server.listen(Number(values.port), "127.0.0.1", () => {
  console.log(`MockBooks (synthetic test form) on http://127.0.0.1:${values.port}`);
});
