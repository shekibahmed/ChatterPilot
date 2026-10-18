import type { Locator, Page } from "playwright";
import { type Connector, ConnectorError, type FieldDiff, type ReadBack } from "../connector.ts";
import type { ExecutionPayload } from "../payload.ts";

/**
 * Connector for MockBooks, the synthetic local proforma form in fixtures/mock-order-app.
 *
 * Provenance: HAND-WRITTEN. PLAN OA0 asks for a connector derived from a genuine Playwright Codegen
 * recording of a person using the form; that recording must be made by the owner (see
 * fixtures/mock-order-app/recording/README.md). Until it exists this connector is labelled
 * "hand-written" and must not be described as recorded.
 *
 * Safety: requests outside the approved origin are blocked; locators use visible labels and roles
 * with exact matching, so a renamed or missing field stops the run instead of guessing; the form's
 * own computed values are compared with the approved document BEFORE saving; the "Submit
 * proforma" button is never clicked.
 */
export class MockBooksConnector implements Connector {
  readonly id = "mockbooks";
  readonly version = "1";
  readonly provenance = "hand-written" as const;
  readonly capabilities = {
    documentTypes: ["proforma"] as const,
    sideEffects: {
      prepareDraft: "creates one draft proforma in MockBooks (not submitted)",
      readBack: "none",
      findByReference: "none",
      submit: "not implemented: release 1 never submits",
    } as const,
  };
  readonly origin: string;
  readonly account: string;
  private readonly page: Page;
  private guarded = false;

  constructor(options: { page: Page; origin: string; account: string }) {
    this.page = options.page;
    this.origin = new URL(options.origin).origin;
    this.account = options.account;
  }

  /** Abort any request that leaves the approved origin. */
  async guard(): Promise<void> {
    if (this.guarded) return;
    await this.page.context().route("**/*", (route) => {
      const url = route.request().url();
      return url.startsWith(`${this.origin}/`) ? route.continue() : route.abort("blockedbyclient");
    });
    this.guarded = true;
  }

  private async open(path: string): Promise<void> {
    await this.guard();
    await this.page.goto(`${this.origin}${path}`);
    if (new URL(this.page.url()).origin !== this.origin) {
      throw new ConnectorError("Navigation left the approved target.", false);
    }
  }

  /**
   * Exactly one match, allowing a short time for content the page fills in after loading (lists
   * of customers, products and units come from the target's own API). Absent still means absent.
   */
  private async exactlyOne(locator: Locator, timeout = 5000): Promise<boolean> {
    try {
      await locator.first().waitFor({ state: "attached", timeout });
    } catch {
      return false;
    }
    return (await locator.count()) === 1;
  }

  private async field(locator: Locator, name: string) {
    if ((await locator.count()) !== 1) {
      throw new ConnectorError(
        `Field "${name}" not found exactly once; the form layout changed.`,
        false,
      );
    }
    return locator;
  }

  async prepareDraft(payload: ExecutionPayload): Promise<{ remoteRef: string }> {
    await this.open("/");
    const page = this.page;
    if (!(await this.exactlyOne(page.getByRole("heading", { name: "MockBooks — new proforma" })))) {
      throw new ConnectorError("This is not the expected MockBooks form.", false);
    }
    const customer = await this.field(
      page.getByRole("combobox", { name: "Customer", exact: true }),
      "Customer",
    );
    if (!(await this.exactlyOne(customer.locator(`option[value="${payload.customerId}"]`)))) {
      throw new ConnectorError(
        `Customer ${payload.customerId} does not exist in the target.`,
        false,
      );
    }
    await customer.selectOption(payload.customerId);
    await (await this.field(page.getByLabel("Order date", { exact: true }), "Order date")).fill(
      payload.orderDate,
    );
    await (await this.field(page.getByLabel("Reference", { exact: true }), "Reference")).fill(
      payload.sourceDraftId,
    );

    const rows = page.getByTestId("line-row");
    for (const [i, line] of payload.lines.entries()) {
      if ((await rows.count()) < i + 1)
        await page.getByRole("button", { name: "Add line", exact: true }).click();
      const row = rows.nth(i);
      const product = row.getByRole("combobox", { name: "Product", exact: true });
      if (
        !(await this.exactlyOne(product)) ||
        !(await this.exactlyOne(product.locator(`option[value="${line.productId}"]`)))
      ) {
        throw new ConnectorError(
          `Product ${line.productId} cannot be selected on line ${i + 1}.`,
          false,
        );
      }
      await product.selectOption(line.productId);
      await (
        await this.field(row.getByRole("textbox", { name: "Quantity", exact: true }), "Quantity")
      ).fill(line.quantity);
      const unit = await this.field(
        row.getByRole("combobox", { name: "Unit", exact: true }),
        "Unit",
      );
      if (!(await this.exactlyOne(unit.locator(`option[value="${line.unit}"]`)))) {
        throw new ConnectorError(`Unit ${line.unit} is not offered for ${line.productId}.`, false);
      }
      await unit.selectOption(line.unit);
    }
    if ((await rows.count()) !== payload.lines.length) {
      throw new ConnectorError(
        "The form has a different number of lines than the document.",
        false,
      );
    }

    // Check the target's own calculation before anything is saved.
    const value = async (testid: string, scope = page.locator("body")) =>
      ((await scope.getByTestId(testid).first().textContent()) ?? "").trim() || null;
    const diff: FieldDiff[] = [];
    const check = (field: string, expected: string, actual: string | null) => {
      if (expected !== actual) diff.push({ field, expected, actual });
    };
    for (const [i, line] of payload.lines.entries()) {
      const row = rows.nth(i);
      check(`lines[${i}].unitPrice`, line.unitPrice, await value("unit-price", row));
      check(`lines[${i}].amount`, line.amount, await value("amount", row));
      check(`lines[${i}].tax`, line.tax, await value("tax", row));
    }
    check("total", payload.total, await value("total"));
    if (diff.length > 0) {
      throw new ConnectorError(
        "The target calculates different values; nothing was saved.",
        false,
        diff,
      );
    }

    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    const status = page.getByRole("status");
    try {
      await status.filter({ hasText: /Draft DR-\d+ saved/ }).waitFor({ timeout: 5000 });
    } catch {
      throw new ConnectorError("Saving was not confirmed; the draft may or may not exist.", true);
    }
    const ref = /Draft (DR-\d+) saved/.exec((await status.textContent()) ?? "")?.[1];
    if (!ref) throw new ConnectorError("Could not read the saved draft number.", true);
    return { remoteRef: ref };
  }

  async readBack(remoteRef: string): Promise<ReadBack> {
    await this.open(`/draft.html?id=${encodeURIComponent(remoteRef)}`);
    await this.page.locator('body[data-loaded="true"]').waitFor({ timeout: 5000 });
    const text = async (testid: string, scope = this.page.locator("body")) =>
      (await scope.getByTestId(testid).first().textContent())?.trim() || null;
    const rows = this.page.getByTestId("draft-line");
    const lines = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const row = rows.nth(i);
      lines.push({
        productId: await text("product-id", row),
        quantity: await text("quantity", row),
        unit: await text("unit", row),
        unitPrice: await text("unit-price", row),
        amount: await text("amount", row),
        tax: await text("tax", row),
      });
    }
    return {
      remoteRef: (await text("draft-id")) ?? remoteRef,
      status: (await text("status")) ?? "unknown",
      reference: await text("reference"),
      customerId: await text("customer-id"),
      orderDate: await text("order-date"),
      lines,
      subtotal: await text("subtotal"),
      taxTotal: await text("tax-total"),
      total: await text("total"),
    };
  }

  async findByReference(reference: string): Promise<string[]> {
    await this.open(`/drafts.html?ref=${encodeURIComponent(reference)}`);
    await this.page.locator('body[data-loaded="true"]').waitFor({ timeout: 5000 });
    return this.page.getByTestId("draft-id").allTextContents();
  }
}
