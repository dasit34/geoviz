/**
 * Consensus — material drift between two runs of the same business.
 *
 * Pure. Pairs providers by id between `baseline` and `current`,
 * computes per-dimension deltas, and emits a `DriftReport` listing
 * providers whose max |delta| crossed the material threshold.
 *
 * "Material" defaults to 0.15 — same as the variance threshold for
 * disagreement, so the two telemetry surfaces use a consistent
 * scale. A provider that flipped its retrieval signal from 0.20 to
 * 0.80 (delta 0.60) shows up; a provider that moved from 0.78 to
 * 0.81 (delta 0.03) does not.
 */

import type {
  DriftReport,
  ObservationProviderId,
  ProviderSignals,
  SignalDimension,
} from "../types";
import { DIMENSIONS } from "./compareSignals";

const DEFAULT_MATERIAL_THRESHOLD = 0.15;

function deltaAt(
  a: number | null,
  b: number | null,
): number {
  if (typeof a !== "number" || typeof b !== "number") return 0;
  return Math.abs(a - b);
}

export function detectDrift(
  baseline: ProviderSignals[],
  current: ProviderSignals[],
  opts: { baselineAt: string; materialThreshold?: number },
): DriftReport {
  const threshold = opts.materialThreshold ?? DEFAULT_MATERIAL_THRESHOLD;

  const baselineByProvider = new Map<ObservationProviderId, ProviderSignals>();
  for (const b of baseline) baselineByProvider.set(b.provider, b);

  const drifted: DriftReport["drifted_providers"] = [];
  const maxByDim: Record<SignalDimension, number> = {
    retrieval: 0,
    trust: 0,
    citation: 0,
    recommendation: 0,
  };

  for (const cur of current) {
    const base = baselineByProvider.get(cur.provider);
    if (!base) continue;
    let largest = 0;
    let largestDim: SignalDimension = "retrieval";
    for (const dim of DIMENSIONS) {
      const d = deltaAt(base[dim], cur[dim]);
      if (d > maxByDim[dim]) maxByDim[dim] = d;
      if (d > largest) {
        largest = d;
        largestDim = dim;
      }
    }
    if (largest >= threshold) {
      drifted.push({
        provider: cur.provider,
        largest_delta: largest,
        largest_delta_dimension: largestDim,
      });
    }
  }

  return {
    baseline_at: opts.baselineAt,
    drifted_providers: drifted,
    max_delta_by_dimension: maxByDim,
  };
}

export { DEFAULT_MATERIAL_THRESHOLD };
