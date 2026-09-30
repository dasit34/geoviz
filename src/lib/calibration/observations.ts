/**
 * Calibration Engine — learning-loop observations.
 *
 * LANGUAGE RULE — DETERMINISTIC EVIDENCE ONLY. Matches the rule
 * already documented and enforced in
 * `src/components/OperatorInsightsPanel.tsx`: every string here is a
 * printf-style template populated from already-computed data. No
 * LLM, no "may benefit from" / "consider" / "suggest" / "could
 * improve" tone. When an input is null, the function returns an
 * "Insufficient data (...)" string — no fallback prose.
 *
 * Output is DISPLAY-ONLY. Nothing in this file writes to any
 * scoring/weighting table — these strings feed the dashboard panel
 * and the generated CALIBRATION_REPORT markdown, never the audit
 * pipeline. This satisfies the "never auto-changes scoring"
 * constraint by construction: there is no write path here at all.
 */

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds - minutes * 60);
  return `${minutes}m ${rem}s`;
}

export function recommendationFrequencyObservation(input: {
  recommendationId: string;
  count: number;
  batchSize: number;
  batchNumber: number;
}): string {
  if (input.batchSize === 0) {
    return "Insufficient data (no audits in this batch).";
  }
  const pct = Math.round((100 * input.count) / input.batchSize);
  return `"${input.recommendationId}" appeared in ${pct}% of audits in batch #${input.batchNumber} (n=${input.count}).`;
}

export function industryWeaknessObservation(input: {
  industry: string;
  avgScore: number;
  corpusAvg: number;
  count: number;
}): string {
  const delta = input.corpusAvg - input.avgScore;
  if (delta <= 0) {
    return `Insufficient data (${input.industry} is not below the corpus average).`;
  }
  return `${input.industry} consistently scores lower than average (${input.avgScore.toFixed(1)} vs corpus avg ${input.corpusAvg.toFixed(1)}, n=${input.count}).`;
}

export function scoreDriftObservation(input: {
  batchNumber: number;
  currentAvg: number | null;
  previousAvg: number | null;
}): string {
  if (input.currentAvg === null) {
    return "Insufficient data (batch has no scored audits).";
  }
  if (input.previousAvg === null) {
    return `Batch #${input.batchNumber} avg score is ${input.currentAvg.toFixed(1)} (no prior batch to compare).`;
  }
  const delta = input.currentAvg - input.previousAvg;
  const direction = delta > 0 ? "higher" : delta < 0 ? "lower" : "unchanged";
  return `Batch #${input.batchNumber} avg score (${input.currentAvg.toFixed(1)}) is ${Math.abs(delta).toFixed(1)} points ${direction} than batch #${input.batchNumber - 1}.`;
}

export function modelAgreementObservation(input: {
  batchNumber: number;
  currentPct: number | null;
  previousPct: number | null;
}): string {
  if (input.currentPct === null) {
    return "Insufficient data (no consensus data in this batch).";
  }
  if (input.previousPct === null) {
    return `Model agreement was ${input.currentPct.toFixed(0)}% in batch #${input.batchNumber} (no prior batch to compare).`;
  }
  const delta = input.currentPct - input.previousPct;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "unchanged";
  return `Model agreement was ${input.currentPct.toFixed(0)}% in batch #${input.batchNumber}, ${direction} from ${input.previousPct.toFixed(0)}% in batch #${input.batchNumber - 1}.`;
}

export function reviewQueueObservation(input: {
  batchNumber: number;
  needsReviewCount: number;
  reasonCounts: Record<string, number>;
}): string {
  if (input.needsReviewCount === 0) {
    return `No audits in batch #${input.batchNumber} were auto-flagged for review.`;
  }
  const breakdown = Object.entries(input.reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason.replace(/_/g, " ")} (${count})`)
    .join(", ");
  return `${input.needsReviewCount} audits in batch #${input.batchNumber} were auto-flagged for review (${breakdown}).`;
}

export function costRuntimeObservation(input: {
  batchNumber: number;
  avgCostUsd: number | null;
  avgRuntimeMs: number | null;
  previousAvgCostUsd: number | null;
  previousAvgRuntimeMs: number | null;
}): string {
  if (input.avgCostUsd === null || input.avgRuntimeMs === null) {
    return "Insufficient data (no cost/runtime telemetry in this batch).";
  }
  const costStr = `$${input.avgCostUsd.toFixed(4)}`;
  const runtimeStr = formatDuration(input.avgRuntimeMs);
  if (input.previousAvgCostUsd === null || input.previousAvgRuntimeMs === null) {
    return `Avg cost/runtime in batch #${input.batchNumber}: ${costStr} / ${runtimeStr} (no prior batch to compare).`;
  }
  const costDelta = input.avgCostUsd - input.previousAvgCostUsd;
  const runtimeDelta = input.avgRuntimeMs - input.previousAvgRuntimeMs;
  const costDir = costDelta > 0 ? "up" : costDelta < 0 ? "down" : "unchanged";
  const runtimeDir = runtimeDelta > 0 ? "up" : runtimeDelta < 0 ? "down" : "unchanged";
  return `Avg cost/runtime in batch #${input.batchNumber}: ${costStr} / ${runtimeStr} (cost ${costDir}, runtime ${runtimeDir} vs batch #${input.batchNumber - 1}).`;
}
