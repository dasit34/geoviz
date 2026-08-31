/**
 * Discovery provider registry — declarative list of business-data
 * providers the admin "Lead Generation" UI can pick from. Mirrors
 * `src/lib/validators/registry.ts`'s `VALIDATOR_REGISTRY` pattern.
 *
 * A provider appearing here does NOT mean it's active — each
 * provider's own `enabled()` gates on its API key being set. Adding a
 * new provider is a one-line addition to this array plus a new file
 * under `./providers/`; no other code changes.
 */

import { GooglePlacesProvider } from "./providers/google-places";
import { OutscraperProvider } from "./providers/outscraper";
import type { BusinessDiscoveryProvider } from "./types";

export const DISCOVERY_PROVIDER_REGISTRY: readonly BusinessDiscoveryProvider[] = [
  GooglePlacesProvider,
  OutscraperProvider,
];

export function getDiscoveryProvider(
  name: string,
): BusinessDiscoveryProvider | null {
  return DISCOVERY_PROVIDER_REGISTRY.find((p) => p.name === name) ?? null;
}
