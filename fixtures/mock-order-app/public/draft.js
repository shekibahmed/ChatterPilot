// Read-only draft view (synthetic test fixture).
const id = new URLSearchParams(location.search).get("id") ?? "";
const res = await fetch(`/api/drafts/${encodeURIComponent(id)}`);
const set = (testid, value, root = document) => {
  root.querySelector(`[data-testid="${testid}"]`).textContent = value;
};
if (res.ok) {
  const d = await res.json();
  set("draft-id", d.id);
  set("status", d.status);
  set("reference", d.reference);
  set("customer-id", d.customerId);
  set("order-date", d.orderDate);
  for (const l of d.lines) {
    const row = document.createElement("tr");
    row.setAttribute("data-testid", "draft-line");
    for (const key of ["productId", "quantity", "unit", "unitPrice", "amount", "tax"]) {
      const cell = document.createElement("td");
      cell.setAttribute(
        "data-testid",
        key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
      );
      cell.textContent = l[key];
      row.append(cell);
    }
    document.querySelector("#lines").append(row);
  }
  set("subtotal", d.subtotal);
  set("tax-total", d.taxTotal);
  set("total", d.total);
  document.body.dataset.loaded = "true";
} else {
  document.body.dataset.loaded = "missing";
}
