/**
 * Consensus — signal projection + variance + disagreement detection.
 *
 * Pure. Consumes `ObservationResult` (the v1 mock-or-real provider
 * output) or directly the flat `ProviderSignals` shape. Emits
 * per-dimension variance + the list of dimensions where providers
 * disagree materially.
 *
 * Variance uses population stdev (divide by N, not N-1) so two
 * tightly-clustered providers register as low-variance instead of
 * NaN/0.
 */

import type {
  DisagreementArea,
  ObservationResult,
  ProviderSignals,
  SignalDimension,
} from "../types";

const DIMENSIONS: SignalDimension[] = [
  "retrieval",
  "trust",
  "citation",
  "recommendation",
];

const DEFAULT_DISAGREEMENT_THRESHOLD = 0.15;

/**
 * Adapter — projects the v1 `ObservationResult` (with its nested
 * `signals` object + a `success` flag) onto the flat
 * `ProviderSignals` shape the consensus helpers consume. Failed
 * observations project to all-null signals + confidence 0; the
 * caller decides whether to include them in the consensus pool.
 */
export function projectToSignals(result: ObservationResult): ProviderSignals {
  // Per-provider confidence is implicit in v1 — derive from a
  // success/enabled gate. Real providers will populate this directly.
  const confidence = result.success && result.enabled ? 0.9 : result.success ? 0.5 : 0;
  return {
    provider: result.provider,
    retrieval: result.signals.retrieval ?? null,
    trust: result.signals.trust ?? null,
    citation: result.signals.citation ?? null,
    recommendation: result.signals.recommendation ?? null,
    confidence,
  };
}

/**
 * Per-dimension population stdev across the provider pool. Nulls are
 * skipped (a dimension with one provider missing simply uses the
 * remaining values). All-missing dimensions return stdev 0 — no
 * disagreement when nobody has an opinion.
 */
export function computeSignalVariance(
  signals: ProviderSignals[],
): Record<SignalDimension, number> {
  const out: Record<SignalDimension, number> = {
    retrieval: 0,
    trust: 0,
    citation: 0,
    recommendation: 0,
  };
  for (const dim of DIMENSIONS) {
    const values = signals
      .map((s) => s[dim])
      .filter((v): v is number => typeof v === "number");
    if (values.length === 0) {
      out[dim] = 0;
      continue;
    }
    const m = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, x) => sum + (x - m) ** 2, 0) / values.length;
    out[dim] = Math.sqrt(variance);
  }
  return out;
}

/**
 * Dimensions where stdev across providers exceeds `threshold`,
 * sorted by stdev descending. Each entry carries `min`, `max`, and
 * `spread` for human-readable summaries.
 */
export function findDisagreementAreas(
  signals: ProviderSignals[],
  threshold: number = DEFAULT_DISAGREEMENT_THRESHOLD,
): DisagreementArea[] {
  const variances = computeSignalVariance(signals);
  const areas: DisagreementArea[] = [];
  for (const dim of DIMENSIONS) {
    const v = variances[dim];
    if (v < threshold) continue;
    const values = signals
      .map((s) => s[dim])
      .filter((x): x is number => typeof x === "number");
    if (values.length === 0) continue;
    const min = Math.min(...values);
    const max = Math.max(...values);
    areas.push({
      dimension: dim,
      variance: v,
      min,
      max,
      spread: max - min,
    });
  }
  areas.sort((a, b) => b.variance - a.variance);
  return areas;
}

export { DIMENSIONS, DEFAULT_DISAGREEMENT_THRESHOLD };
