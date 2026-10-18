import { createHash } from "node:crypto";
import type {
  CostEstimate,
  ExtractionItem,
  Provider,
  ProviderError,
  RawExtraction,
} from "./contract.ts";

/**
 * Deterministic offline provider for tests and demos: answers come from a fixture table keyed by
 * the SHA-256 of each message text. It never contacts anything.
 */
export class FixtureProvider implements Provider {
  readonly id = "fixture";
  readonly model = "fixture-v1";
  readonly recipient = "this computer (no network)";
  readonly capabilities = { extraction: true, transcription: false };
  readonly idempotentRequests = false;
  readonly calls: string[][] = [];
  failure: ProviderError | null = null;
  delayMs = 0;
  private readonly table: Map<string, unknown>;

  constructor(table: Record<string, unknown>) {
    this.table = new Map(Object.entries(table));
  }

  static key(text: string): string {
    return createHash("sha256").update(text).digest("hex");
  }

  estimate(items: readonly ExtractionItem[]): CostEstimate {
    const chars = items.reduce((n, i) => n + i.text.length, 0);
    return {
      amountMicros: chars * 10,
      currency: "USD",
      basis: "10 micro-USD per character (fixture)",
      uncertain: false,
    };
  }

  async extract(
    items: readonly ExtractionItem[],
    options: { signal: AbortSignal; key: string },
  ): Promise<RawExtraction[]> {
    this.calls.push(items.map((i) => i.id));
    if (this.delayMs > 0) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, this.delayMs);
        options.signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(options.signal.reason);
        });
      });
    }
    if (this.failure) throw this.failure;
    return items.map((i) => ({
      id: i.id,
      lines: this.table.get(FixtureProvider.key(i.text)) ?? [],
    }));
  }
}
