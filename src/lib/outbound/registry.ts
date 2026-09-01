/**
 * Outbound-provider registry — declarative list the admin "Send to
 * Instantly" UI (and any future outbound provider) reads from.
 * Mirrors `src/lib/discovery/registry.ts` exactly. A provider
 * appearing here does NOT mean it's active — `enabled()` gates on its
 * own API key being set. Adding a second outbound provider later is a
 * one-line addition here plus a new file under `./providers/` — no
 * other code changes.
 */

import { InstantlyProvider } from "./providers/instantly";
import type { OutboundProvider } from "./types";

export const OUTBOUND_PROVIDER_REGISTRY: readonly OutboundProvider[] = [
  InstantlyProvider,
];

export function getOutboundProvider(name: string): OutboundProvider | null {
  return OUTBOUND_PROVIDER_REGISTRY.find((p) => p.name === name) ?? null;
}
