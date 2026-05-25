/**
 * Self-contained replay snapshot per audit.
 *
 * Captures everything `scoreAudit()` saw and produced, so a future
 * caller can call `scoreAudit({...bundle.inputs})` and recover a
 * byte-equal score even if any of the input columns
 * (`preflightSignals`, ingest, render) later migrates.
 *
 * Pure builder. Same inputs → same bundle (modulo `computed_at`,
 * which is supplied by the caller). Never throws.
 *
 * Stamps `weight_hash` + `category_hash` + `scoring_version` from
 * the freeze contract so the bundle carries its own evidence that
 * scoring was canonical at write time.
 */

import type { IntelligenceIngestResult } from "@/lib/intelligence/intelligenceIngest";
import type { PreflightSignals } from "@/lib/intelligence/preflight/types";
import type { RenderIntelligenceResult } from "@/lib/intelligence/render/renderProvider";

import { CATEGORY_HASH, WEIGHT_HASH } from "./frozen";
import type { DeterministicScore, Evidence } from "./types";
import { SCORING_VERSION } from "./version";

export const REPLAY_BUNDLE_VERSION = "replay@1" as const;

export type ReplayBundleInputs = {
  preflightSignals: PreflightSignals | null;
  intelligenceIngest: IntelligenceIngestResult | null;
  renderResult: RenderIntelligenceResult | null;
  history: Array<{ computed_at: string; overall_score: number }> | null;
};

export type ReplayBundle = {
  bundle_version: typeof REPLAY_BUNDLE_VERSION;
  scoring_version: string;
  weight_hash: string;
  category_hash: string;
  inputs: ReplayBundleInputs;
  evidence: Evidence;
  output: DeterministicScore;
  /** ISO 8601 — when this scoring run completed. */
  computed_at: string;
};

export function buildReplayBundle(args: {
  preflightSignals: PreflightSignals | null;
  intelligenceIngest: IntelligenceIngestResult | null;
  renderResult: RenderIntelligenceResult | null;
  history:
    | Array<{ computed_at: string; overall_score: number }>
    | undefined
    | null;
  evidence: Evidence;
  deterministic: DeterministicScore;
  computedAt: Date;
}): ReplayBundle {
  return {
    bundle_version: REPLAY_BUNDLE_VERSION,
    scoring_version: SCORING_VERSION,
    weight_hash: WEIGHT_HASH,
    category_hash: CATEGORY_HASH,
    inputs: {
      preflightSignals: args.preflightSignals,
      intelligenceIngest: args.intelligenceIngest,
      renderResult: args.renderResult,
      history: args.history ?? null,
    },
    evidence: args.evidence,
    output: args.deterministic,
    computed_at: args.computedAt.toISOString(),
  };
}
