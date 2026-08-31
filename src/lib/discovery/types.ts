/**
 * Business-discovery provider contract.
 *
 * Mirrors `src/lib/validators/types.ts`'s `AiValidator` pattern: each
 * provider gates on its own API-key presence via `enabled()`, so the
 * code ships fully built and inert until a key is manually added —
 * nothing is purchased/activated by writing or deploying this code.
 *
 * `NormalizedBusinessRecord` is the ONLY thing a provider file is
 * allowed to produce — a faithful translation of that provider's raw
 * response into GeoViz's own field names, with zero normalization or
 * derived data. No provider-specific field name, ID shape, category
 * vocabulary, or rating scale may leak past the provider adapter.
 * The shared normalization/dedup layer (`src/lib/leads/`) is the only
 * code allowed to turn this into a `Lead` row — see that module's
 * doc comments for the normalization + dedup pipeline.
 */

export interface NormalizedBusinessRecord {
  /** Matches the emitting provider's `name`, e.g. "google_places". */
  provider: string;
  /** That provider's own unique id for this business. */
  providerId: string;
  businessName: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  /** Provider's own category/type vocabulary — NEVER assumed canonical. */
  categoryRaw: string | null;
  /** Provider's own rating scale — NEVER assumed to be 1–5 stars. */
  rating: number | null;
  reviewCount: number | null;
  // Phase 3 additions — optional so existing providers (e.g. Google
  // Places) need zero changes; a provider that can't supply one just
  // omits it (treated as null downstream).
  zip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Google Maps listing URL, distinct from `website`. */
  mapsUrl?: string | null;
  /** Optional verbatim payload, debugging only — never rendered in the UI. */
  raw?: unknown;
}

export interface DiscoveryInput {
  category: string;
  city: string;
  state?: string;
  radiusMiles?: number;
  limit: number;
}

export interface DiscoveryResult {
  records: NormalizedBusinessRecord[];
  /** For the LeadDiscoveryRun cost/audit row — not the same as records.length. */
  providerRequestCount: number;
  error?: string;
}

export interface BusinessDiscoveryProvider {
  /** Matches the `provider` value it emits on every record. */
  name: string;
  enabled(): boolean;
  requiredEnvVars: readonly string[];
  discoverBusinesses(input: DiscoveryInput): Promise<DiscoveryResult>;
}
