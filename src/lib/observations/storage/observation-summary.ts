/**
 * Pure builder for the v2 telemetry record.
 *
 * Composes an `ObservationSummary` from an `ExecuteObservationResult`
 * + an optional baseline (for drift). No DB write — persistence is
 * the caller's responsibility (a future PR adds the column).
 *
 * Stamps the scoring engine's `WEIGHT_HASH` + `CATEGORY_HASH` from
 * `frozen.ts` on every summary so an analyst can prove scoring was
 * unchanged at the time the row was written.
 */

import { CATEGORY_HASH, WEIGHT_HASH } from "@/lib/scoring/frozen";

import {
  computeSignalVariance,
  findDisagreementAreas,
  projectToSignals,
} from "../consensus/compareSignals";
import { computeAgreement } from "../consensus/computeAgreement";
import { detectDrift } from "../consensus/driftDetection";
import type { ExecuteObservationResult } from "../executeObservation";
import type {
  ObservationSummary,
  ProviderSignals,
} from "../types";
import { OBSERVATION_VERSION } from "../types";

function meanLatency(result: ExecuteObservationResult): number {
  const ok = result.observations.filter((o) => o.success);
  if (ok.length === 0) return 0;
  return Math.round(
    ok.reduce((sum, o) => sum + o.latency_ms, 0) / ok.length,
  );
}

/**
 * Build the v2 telemetry record. Pure except `recorded_at`.
 *
 * - `result` — the orchestrator output for the current run.
 * - `baseline` — optional prior summary for the same business; when
 *   present, populates the `drift` field via `detectDrift`.
 * - `baselineSignals` — optional prior `ProviderSignals[]` snapshot;
 *   when omitted but `baseline` is present, drift is skipped (no
 *   per-provider signal history to compare).
 */
export function buildObservationSummary(args: {
  result: ExecuteObservationResult;
  baseline?: ObservationSummary | null;
  baselineSignals?: ProviderSignals[] | null;
}): ObservationSummary {
  const { result, baseline, baselineSignals } = args;

  const signals = result.observations
    .filter((o) => o.success)
    .map(projectToSignals);

  const variance = computeSignalVariance(signals);
  const disagreement = findDisagreementAreas(signals);
  const { score: agreementScore, band: agreementBand } =
    computeAgreement(signals);

  const summary: ObservationSummary = {
    observation_version: OBSERVATION_VERSION,
    scoring_weight_hash: WEIGHT_HASH,
    scoring_category_hash: CATEGORY_HASH,
    providers_run: signals.map((s) => s.provider),
    agreement_score: agreementScore,
    agreement_band: agreementBand,
    disagreement_areas: disagreement,
    signal_variance: variance,
    estimated_cost_usd: result.total_cost_usd,
    avg_latency_ms: meanLatency(result),
    recorded_at: new Date().toISOString(),
  };

  if (baseline && baselineSignals && baselineSignals.length > 0) {
    summary.drift = detectDrift(baselineSignals, signals, {
      baselineAt: baseline.recorded_at,
    });
  }

  return summary;
}
