/**
 * API keys live only in this process's memory by default. They are never serialised, logged or
 * exported; `forget` removes them immediately.
 */
export class KeyVault {
  #keys = new Map<string, string>();

  set(providerId: string, key: string): void {
    if (!key.trim()) throw new Error("Empty API key.");
    this.#keys.set(providerId, key.trim());
  }

  has(providerId: string): boolean {
    return this.#keys.has(providerId);
  }

  /** Only the runner uses this, at call time. */
  use(providerId: string): string | null {
    return this.#keys.get(providerId) ?? null;
  }

  forget(providerId?: string): void {
    if (providerId) this.#keys.delete(providerId);
    else this.#keys.clear();
  }

  toJSON(): Record<string, string> {
    return Object.fromEntries([...this.#keys.keys()].map((id) => [id, "[redacted]"]));
  }

  /** Node's console/inspect output also stays redacted. */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `KeyVault(${[...this.#keys.keys()].join(", ") || "empty"})`;
  }
}
