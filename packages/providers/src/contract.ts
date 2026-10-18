/**
 * Optional AI providers (PLAN §3, P4). The core never needs one. A provider may only PROPOSE order
 * lines as spans of the user's own message text; products, prices, units and totals are still
 * resolved by deterministic catalogue code, and every proposal is validated against the source.
 */

export interface ExtractionItem {
  readonly id: string;
  /** Untrusted chat text. Sent as data, never as instructions. */
  readonly text: string;
}

export interface ProposedSpan {
  readonly start: number;
  readonly end: number;
}

export interface ProposedLine {
  readonly quantity: ProposedSpan;
  readonly unit: ProposedSpan | null;
  readonly product: ProposedSpan;
}

/** Raw provider output for one item, before validation. */
export interface RawExtraction {
  readonly id: string;
  readonly lines: unknown;
}

export interface CostEstimate {
  /** Micro-units of the provider's billing currency (1 USD = 1,000,000). */
  readonly amountMicros: number;
  readonly currency: string;
  readonly basis: string;
  /** True when the provider cannot know the final charge in advance. */
  readonly uncertain: boolean;
}

export type FailureKind =
  | "invalid_credentials"
  | "rate_limited"
  | "budget_exhausted"
  | "timeout"
  | "cancelled"
  | "provider_error";

/** A failed call. `outcomeKnown: false` means the provider may have done (and billed) the work. */
export class ProviderError extends Error {
  readonly kind: FailureKind;
  readonly outcomeKnown: boolean;
  constructor(kind: FailureKind, message: string, outcomeKnown: boolean) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.outcomeKnown = outcomeKnown;
  }
}

export interface Provider {
  readonly id: string;
  /** Exact model id from settings. Never guessed or defaulted silently. */
  readonly model: string;
  /** Where data goes, shown to the user before consent. */
  readonly recipient: string;
  readonly capabilities: { readonly extraction: boolean; readonly transcription: boolean };
  /** Whether the provider documents idempotent requests that are safe to retry. */
  readonly idempotentRequests: boolean;
  estimate(items: readonly ExtractionItem[]): CostEstimate;
  extract(
    items: readonly ExtractionItem[],
    options: { readonly signal: AbortSignal; readonly key: string },
  ): Promise<RawExtraction[]>;
}
