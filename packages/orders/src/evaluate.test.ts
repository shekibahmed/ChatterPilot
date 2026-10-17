import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type EvalCase, evaluate, validateEvalCases } from "./evaluate.ts";
import { syntheticCatalogue } from "./fixtures.ts";

const catalogue = syntheticCatalogue();
const c = (over: Partial<EvalCase>): EvalCase => ({
  id: "t",
  lang: "en",
  tags: [],
  text: "",
  kind: "order",
  customer: null,
  lines: [],
  ...over,
});

describe("evaluate", () => {
  it("scores exact lines, wrong quantities, abstentions and spurious lines", () => {
    const report = evaluate(
      [
        c({ id: "a", text: "40 bags cement", lines: [{ product: "CEM-UB50", baseQuantity: 40 }] }),
        c({ id: "b", text: "40 bags cement", lines: [{ product: "CEM-UB50", baseQuantity: 45 }] }),
        c({
          id: "c",
          text: "10 boxes 2x2 tiles",
          lines: [{ product: "AMBIGUOUS", baseQuantity: null }],
        }),
        c({ id: "d", text: "payment done for 40 bags cement", kind: "non_order" }),
        c({ id: "e", text: "40 bags cement", kind: "non_order" }),
      ],
      catalogue,
    );
    const outcomes = report.cases.map((r) => r.lines.map((l) => l.outcome));
    expect(outcomes).toEqual([["exact"], ["wrong_quantity"], ["abstained"], [], ["spurious"]]);
    expect(report.overall).toMatchObject({
      exact: 1,
      silentErrors: 2,
      abstained: 1,
      nonOrderDetection: { nonOrders: 2, rejected: 1 },
    });
    expect(report.overall.recall).toBe(0.5);
  });

  it("validates labels against the catalogue", () => {
    const { problems } = validateEvalCases(
      [c({ id: "x", text: "a", lines: [{ product: "NOPE", baseQuantity: -1 }], customer: "ZZ" })],
      catalogue,
    );
    expect(problems.join(" ")).toMatch(
      /unknown customer ZZ.*unknown product NOPE.*positive number/,
    );
  });
});

describe("synthetic evaluation set (development split)", () => {
  // Written and label-checked by separate agents that never saw the drafting code (docs/evaluation.md).
  // These floors only move up: a change that lowers them needs a recorded reason.
  const raw = JSON.parse(
    readFileSync(new URL("../../../fixtures/eval/order-messages.json", import.meta.url), "utf8"),
  );
  const { cases, problems } = validateEvalCases(raw, catalogue);
  const { overall } = evaluate(cases, catalogue);

  it("has valid labels", () => {
    expect(problems).toEqual([]);
    expect(cases.length).toBeGreaterThanOrEqual(100);
  });

  it("does not regress", () => {
    expect(overall.recall ?? 0).toBeGreaterThanOrEqual(0.817);
    expect(overall.precision ?? 0).toBeGreaterThanOrEqual(0.85);
    expect(overall.silentErrors).toBeLessThanOrEqual(11);
  });
});
