/**
 * Contact-enrichment provider contract.
 *
 * Mirrors `src/lib/discovery/types.ts`'s `BusinessDiscoveryProvider`
 * pattern. Phase 1 ships this interface + an empty registry only —
 * no real provider is implemented, so `POST /api/admin/leads/[id]/
 * find-contact` always returns "no enrichment provider configured"
 * until a provider file + API key are added later. Nothing is
 * purchased/activated by this interface existing.
 */

export interface EnrichmentInput {
  businessName: string;
  domain: string | null;
  website: string | null;
}

export interface NormalizedContactRecord {
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
}

export interface EnrichmentResult {
  contact: NormalizedContactRecord | null;
  error?: string;
}

export interface ContactEnrichmentProvider {
  /** Matches the value stored in `Lead.contactSource` on success. */
  name: string;
  enabled(): boolean;
  requiredEnvVars: readonly string[];
  findContact(input: EnrichmentInput): Promise<EnrichmentResult>;
}
