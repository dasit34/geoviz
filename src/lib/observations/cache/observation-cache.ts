/**
 * In-memory LRU cache for observation results.
 *
 * Used by `executeObservation` so back-to-back invocations against
 * the same `(provider, websiteUrl, probe)` triple don't double-count
 * mock cost or trigger duplicate (future) API calls.
 *
 * Pure in-process — no Redis, no disk, no external dependency.
 * Capacity 100 entries; TTL 60 minutes. Both override-able for tests.
 */

import type { ObservationProviderId, ObservationResult } from "../types";

const DEFAULT_CAPACITY = 100;
const DEFAULT_TTL_MS = 60 * 60_000; // 60 minutes

type Entry = {
  value: ObservationResult;
  expiresAt: number;
};

export class ObservationCache {
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly store: Map<string, Entry>;

  constructor(opts: { capacity?: number; ttlMs?: number } = {}) {
    this.capacity = opts.capacity ?? DEFAULT_CAPACITY;
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.store = new Map();
  }

  static keyFor(
    provider: ObservationProviderId,
    websiteUrl: string,
    probe: string | undefined,
  ): string {
    return `${provider}::${websiteUrl}::${probe ?? ""}`;
  }

  get(key: string): ObservationResult | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // Touch — re-insert to move to most-recent position (Map preserves
    // insertion order, so re-set acts as access-order eviction).
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: ObservationResult): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
    while (this.store.size > this.capacity) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Process-wide singleton — every call to `executeObservation` shares
 * this cache. Tests that need isolation can instantiate their own
 * `new ObservationCache(...)`.
 */
export const observationCache = new ObservationCache();
