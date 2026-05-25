/**
 * Observation gate — usability-layer wrapper around `detectDrift()`
 * from `consensus/driftDetection.ts`.
 *
 * Pure. Returns a typed `DriftAssessment` with a four-way
 * categorical `level` so dashboards and alerts can switch on a
 * stable label instead of re-deriving thresholds.
 *
 *   0.00 .. 0.10  → none
 *   0.10 .. 0.15  → minor
 *   0.15 .. 0.30  → material
 *   ≥ 0.30        → severe
 */

import { detectDrift } from "../consensus/driftDetection";
import type { DriftReport, ProviderSignals, SignalDimension } from "../types";

export type DriftLevel = "none" | "minor" | "material" | "severe";

export interface DriftAssessment {
  drift: DriftReport;
  level: DriftLevel;
  drifted_provider_count: number;
  largest_overall_delta: number;
  explanation: string;
}

const DIMENSIONS: SignalDimension[] = [
  "retrieval",
  "trust",
  "citation",
  "recommendation",
];

function levelFor(delta: number): DriftLevel {
  if (delta >= 0.30) return "severe";
  if (delta >= 0.15) return "material";
  if (delta >= 0.10) return "minor";
  return "none";
}

export function detectObservationDrift(
  baseline: ProviderSignals[],
  current: ProviderSignals[],
  baselineAt: string,
): DriftAssessment {
  const drift = detectDrift(baseline, current, { baselineAt });

  // Largest delta across all dimensions (max-of-maxes).
  let largest = 0;
  for (const d of DIMENSIONS) {
    if (drift.max_delta_by_dimension[d] > largest) {
      largest = drift.max_delta_by_dimension[d];
    }
  }

  const level = levelFor(largest);
  const explanation =
    level === "none"
      ? `none — largest provider delta ${largest.toFixed(2)} under minor threshold (0.10)`
      : level === "minor"
        ? `minor — largest provider delta ${largest.toFixed(2)} (0.10..0.15)`
        : level === "material"
          ? `material — largest provider delta ${largest.toFixed(2)} (0.15..0.30); inspect ${drift.drifted_providers.length} provider(s)`
          : `severe — largest provider delta ${largest.toFixed(2)} (≥ 0.30); review ${drift.drifted_providers.length} provider(s) for systematic shift`;

  return {
    drift,
    level,
    drifted_provider_count: drift.drifted_providers.length,
    largest_overall_delta: largest,
    explanation,
  };
}
