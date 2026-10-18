// MockBooks form logic (synthetic test fixture).
const master = await (await fetch("/api/master")).json();
const $ = (sel) => document.querySelector(sel);
const half = (n, d) => (n * 2n + d) / (d * 2n);
const money = (m) => `${m / 100n}.${String(m % 100n).padStart(2, "0")}`;
const milli = (text) => {
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return null;
  const [w, f = ""] = text.split(".");
  return BigInt(w) * 1000n + BigInt(f.padEnd(3, "0") || "0");
};
let savedId = null;

for (const c of master.customers) $("#customer").append(new Option(c.name, c.id));

function addLine() {
  const row = document.createElement("tr");
  row.setAttribute("data-testid", "line-row");
  const qtyLabel = master.layout === "v2" ? "Qty" : "Quantity";
  row.innerHTML = `
    <td><label>Product <select class="product"><option value="">choose…</option></select></label></td>
    <td><label>${qtyLabel} <input class="qty" inputmode="decimal" /></label></td>
    <td><label>Unit <select class="unit"></select></label></td>
    <td><output data-testid="unit-price"></output></td>
    <td><output data-testid="amount"></output></td>
    <td><output data-testid="tax"></output></td>`;
  for (const p of master.products) row.querySelector(".product").append(new Option(p.name, p.id));
  row.querySelector(".product").addEventListener("change", () => {
    const p = master.products.find((x) => x.id === row.querySelector(".product").value);
    const unit = row.querySelector(".unit");
    unit.replaceChildren(
      ...(p ? [p.unit, ...Object.keys(p.altUnits)] : []).map((u) => new Option(u, u)),
    );
    recalc();
  });
  row.querySelector(".qty").addEventListener("input", recalc);
  row.querySelector(".unit").addEventListener("change", recalc);
  $("#lines").append(row);
}

function recalc() {
  let subtotal = 0n;
  let tax = 0n;
  for (const row of document.querySelectorAll('[data-testid="line-row"]')) {
    const p = master.products.find((x) => x.id === row.querySelector(".product").value);
    const q = milli(row.querySelector(".qty").value.trim());
    const unit = row.querySelector(".unit").value;
    const out = (id, v) => {
      row.querySelector(`[data-testid="${id}"]`).value = v;
    };
    if (!p || q === null) {
      out("unit-price", "");
      out("amount", "");
      out("tax", "");
      continue;
    }
    const factor = unit === p.unit ? 1000 : (p.altUnits[unit] ?? 0);
    const amount = half(half(q * BigInt(factor), 1000n) * BigInt(p.priceMinor), 1000n);
    const lineTax = half(amount * BigInt(p.taxRateMilli), 100000n);
    subtotal += amount;
    tax += lineTax;
    out("unit-price", money(BigInt(p.priceMinor)));
    out("amount", money(amount));
    out("tax", money(lineTax));
  }
  $('[data-testid="subtotal"]').value = money(subtotal);
  $('[data-testid="tax-total"]').value = money(tax);
  $('[data-testid="total"]').value = money(subtotal + tax);
}

$("#add").addEventListener("click", addLine);
$("#save").addEventListener("click", async () => {
  const lines = [...document.querySelectorAll('[data-testid="line-row"]')].map((row) => ({
    productId: row.querySelector(".product").value,
    quantity: row.querySelector(".qty").value.trim(),
    unit: row.querySelector(".unit").value,
  }));
  try {
    const res = await fetch("/api/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: $("#customer").value,
        orderDate: $("#date").value,
        reference: $("#reference").value,
        lines,
      }),
    });
    savedId = (await res.json()).id;
    $("#status").textContent = `Draft ${savedId} saved`;
  } catch {
    $("#status").textContent =
      "Could not confirm the save. Check the drafts list before trying again.";
  }
});
$("#submit").addEventListener("click", async () => {
  if (!savedId) return;
  await fetch(`/api/drafts/${savedId}/submit`, { method: "POST" });
  $("#status").textContent = `Proforma ${savedId} submitted`;
});
addLine();
recalc();
