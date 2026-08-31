/**
 * Enrichment provider registry — empty in Phase 1 by design. See
 * `src/lib/enrichment/types.ts` and the lead-gen plan's §5: Hunter.io
 * is the recommended first provider when enrichment is actually
 * built, but no provider file is implemented yet, so this array
 * stays empty and `find-contact` always reports "not configured."
 * Adding a real provider later is a one-line addition here plus a
 * new file under `./providers/` — no other code changes.
 */

import type { ContactEnrichmentProvider } from "./types";

export const ENRICHMENT_PROVIDER_REGISTRY: readonly ContactEnrichmentProvider[] = [];

export function getEnrichmentProvider(
  name: string,
): ContactEnrichmentProvider | null {
  return ENRICHMENT_PROVIDER_REGISTRY.find((p) => p.name === name) ?? null;
}
