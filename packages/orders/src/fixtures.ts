// Test helper: load the synthetic catalogue fixture.
import { readFileSync } from "node:fs";
import { type Catalogue, loadCatalogue } from "./catalogue.ts";

const dir = new URL("../../../fixtures/synthetic/catalogue/", import.meta.url);
export const read = (name: string) => readFileSync(new URL(name, dir), "utf8");

export function syntheticCatalogue(): Catalogue {
  const { catalogue, issues } = loadCatalogue({
    products: read("products.csv"),
    customers: read("customers.csv"),
    meta: read("catalogue.json"),
  });
  if (!catalogue) throw new Error(JSON.stringify(issues));
  return catalogue;
}
