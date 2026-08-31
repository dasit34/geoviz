/**
 * Enrichment provider registry. Phase 3 adds the first real provider
 * (Outscraper Emails & Contacts) — inert until OUTSCRAPER_API_KEY is
 * set, same gating pattern as the discovery registry.
 */

import { OutscraperEnrichmentProvider } from "./providers/outscraper";
import type { ContactEnrichmentProvider } from "./types";

export const ENRICHMENT_PROVIDER_REGISTRY: readonly ContactEnrichmentProvider[] = [
  OutscraperEnrichmentProvider,
];

export function getEnrichmentProvider(
  name: string,
): ContactEnrichmentProvider | null {
  return ENRICHMENT_PROVIDER_REGISTRY.find((p) => p.name === name) ?? null;
}
