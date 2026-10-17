import { createHash } from "node:crypto";
import { type ExtractionItem, type Provider, ProviderError } from "./contract.ts";
import type { KeyVault } from "./keys.ts";
import { type ValidatedExtraction, validateExtraction } from "./validate.ts";

/**
 * A person's consent to send exactly these items to exactly this provider and model, shown with the
 * recipient, what is sent and the estimated cost. A different item set needs a new consent.
 */
export interface BatchConsent {
  readonly providerId: string;
  readonly model: string;
  readonly recipient: string;
  readonly itemsHash: string;
  readonly fieldsSent: readonly string[];
  readonly estimatedMicros: number;
  readonly approvedBy: string;
  readonly approvedAt: string;
}

export const itemsHash = (items: readonly ExtractionItem[]) =>
  createHash("sha256")
    .update(JSON.stringify(items.map((i) => [i.id, i.text])))
    .digest("hex");

/** Spend limit with reservations made before calls, so concurrent batches cannot overshoot. */
export class Budget {
  readonly limitMicros: number;
  #reserved = 0;
  #spent = 0;
  #uncertain = 0;

  constructor(limitMicros: number) {
    this.limitMicros = limitMicros;
  }

  get spentMicros(): number {
    return this.#spent;
  }
  get reservedMicros(): number {
    return this.#reserved;
  }
  /** Amount that may or may not have been charged (unknown outcomes). */
  get uncertainMicros(): number {
    return this.#uncertain;
  }

  reserve(micros: number): boolean {
    if (this.#spent + this.#reserved + this.#uncertain + micros > this.limitMicros) return false;
    this.#reserved += micros;
    return true;
  }

  settle(reservedMicros: number, outcome: "charged" | "not_charged" | "unknown"): void {
    this.#reserved -= reservedMicros;
    if (outcome === "charged") this.#spent += reservedMicros;
    if (outcome === "unknown") this.#uncertain += reservedMicros;
  }
}

export type BatchOutcome =
  | { readonly status: "completed"; readonly results: readonly ValidatedExtraction[] }
  | { readonly status: "refused"; readonly reason: string }
  | {
      readonly status: "failed";
      readonly kind: string;
      readonly outcomeKnown: boolean;
      /** True only when the provider documents safe retries and the outcome is known not to have happened. */
      readonly retrySafe: boolean;
      readonly message: string;
    };

export interface RunBatchInput {
  readonly provider: Provider;
  readonly items: readonly ExtractionItem[];
  readonly consent: BatchConsent | null;
  readonly vault: KeyVault;
  readonly budget: Budget;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
}

/** Run one consented batch. Never falls back to another provider and never retries by itself. */
export async function runExtractionBatch(input: RunBatchInput): Promise<BatchOutcome> {
  const { provider, items, consent } = input;
  if (!provider.capabilities.extraction)
    return { status: "refused", reason: "provider cannot extract" };
  if (!consent) return { status: "refused", reason: "no consent for this batch" };
  if (
    consent.providerId !== provider.id ||
    consent.model !== provider.model ||
    consent.recipient !== provider.recipient
  ) {
    return {
      status: "refused",
      reason: "consent was given for a different provider, model or recipient",
    };
  }
  if (consent.itemsHash !== itemsHash(items)) {
    return { status: "refused", reason: "consent was given for different messages" };
  }
  const key = input.vault.use(provider.id);
  if (!key) return { status: "refused", reason: "no API key in memory for this provider" };
  const estimate = provider.estimate(items);
  if (estimate.amountMicros > consent.estimatedMicros) {
    return { status: "refused", reason: "the cost estimate is higher than the consented amount" };
  }
  if (!input.budget.reserve(estimate.amountMicros)) {
    return { status: "refused", reason: "the spend limit would be exceeded" };
  }
  if (input.signal.aborted) {
    input.budget.settle(estimate.amountMicros, "not_charged");
    return { status: "refused", reason: "cancelled before sending" };
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new ProviderError("timeout", "timed out", false)),
    input.timeoutMs,
  );
  const onCancel = () =>
    controller.abort(new ProviderError("cancelled", "cancelled while in progress", false));
  input.signal.addEventListener("abort", onCancel, { once: true });
  try {
    const raw = await Promise.race([
      provider.extract(items, { signal: controller.signal, key }),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {
          once: true,
        }),
      ),
    ]);
    input.budget.settle(estimate.amountMicros, "charged");
    return { status: "completed", results: validateExtraction(items, raw) };
  } catch (err) {
    const e =
      err instanceof ProviderError ? err : new ProviderError("provider_error", String(err), false);
    input.budget.settle(estimate.amountMicros, e.outcomeKnown ? "not_charged" : "unknown");
    return {
      status: "failed",
      kind: e.kind,
      outcomeKnown: e.outcomeKnown,
      retrySafe: e.outcomeKnown || provider.idempotentRequests,
      message: e.outcomeKnown
        ? e.message
        : `${e.message}. The provider may have processed (and charged for) this batch; ask before retrying.`,
    };
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", onCancel);
  }
}
