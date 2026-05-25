/**
 * Observation provider registry.
 *
 * Single source of truth for provider lookup + per-provider env-key
 * presence. Used by `executeObservation` + the CLI smoke tests.
 *
 * Today the four providers all return deterministic mocks. Real
 * provider wiring (Anthropic Messages API, OpenAI Responses API,
 * Gemini, Perplexity) is gated by both `ENABLE_OBSERVATION=true`
 * AND the relevant API key being set.
 */

import { claudeProvider } from "./providers/claude";
import { geminiProvider } from "./providers/gemini";
import { openaiProvider } from "./providers/openai";
import { perplexityProvider } from "./providers/perplexity";
import type { ObservationProvider, ObservationProviderId } from "./types";

export const OBSERVATION_PROVIDERS: Record<
  ObservationProviderId,
  ObservationProvider
> = {
  claude: claudeProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  perplexity: perplexityProvider,
};

/**
 * Per-provider env-key check. Claude reuses `ANTHROPIC_API_KEY`
 * (already required by the worker). The other three providers each
 * have a dedicated key.
 *
 * Returns false when the env var is absent OR set to an empty string.
 */
export function hasProviderKey(id: ObservationProviderId): boolean {
  const ENV_KEYS: Record<ObservationProviderId, string> = {
    claude: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
  };
  const key = ENV_KEYS[id];
  return Boolean(process.env[key]?.trim());
}

/** All four provider ids in stable order. */
export const ALL_PROVIDERS: ObservationProviderId[] = [
  "claude",
  "openai",
  "gemini",
  "perplexity",
];
