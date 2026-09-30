/**
 * Calibration Engine — CALIBRATION_REPORT markdown assembly.
 *
 * Pure rendering over already-computed data (a `CalibrationBatch` row
 * shape + the observations feed + review queue + before/after
 * chains). No new computation happens here — see
 * `scripts/calibration-batch-runner.ts` for where this is called and
 * `tmp/calibration-reports/` for where the output lands (gitignored,
 * one file per batch, never overwritten).
 */

import { formatDuration } from "./observations";

export type ReportInput = {
  batch: {
    batchNumber: number;
    batchSize: number;
    windowStart: string;
    windowEnd: string;
    avgScore: number | null;
    medianScore: number | null;
    industryDistribution: Record<string, number>;
    categoryDistribution: Record<string, number>;
    avgRuntimeMs: number | null;
    avgCostUsd: number | null;
    recommendationFrequency: Array<{ id: string; count: number }>;
    modelAgreementPct: number | null;
    confidenceDistribution: Record<string, number>;
    failureCount: number;
    warningCount: number;
    outlierAuditIds: string[];
    needsReviewCount: number;
  };
  observations: string[];
  reviewQueue: Array<{
    auditOrderId: string;
    websiteUrl: string;
    reasons: string[];
  }>;
  beforeAfterChains: Array<{
    websiteUrl: string;
    deltas: Array<{ overallDelta: number | null; elapsedMs: number }>;
  }>;
};

function fmt(n: number | null, digits = 1): string {
  return n === null ? "—" : n.toFixed(digits);
}

export function renderCalibrationReport(input: ReportInput): string {
  const { batch } = input;
  const lines: string[] = [];

  lines.push(`# Calibration Report — Batch #${batch.batchNumber}`);
  lines.push("");
  lines.push(
    `Window: ${batch.windowStart} → ${batch.windowEnd} · ${batch.batchSize} audits`,
  );
  lines.push("");

  lines.push("## 1. Executive Summary");
  lines.push("");
  lines.push(
    batch.avgScore === null
      ? "Insufficient data (no scored audits in this batch)."
      : `Batch #${batch.batchNumber} covered ${batch.batchSize} audits, avg score ${fmt(batch.avgScore)}${batch.medianScore !== null ? ` (median ${fmt(batch.medianScore)})` : ""}. ${batch.needsReviewCount} flagged for manual review, ${batch.failureCount} failed.`,
  );
  lines.push("");

  lines.push("## 2. Score Distribution");
  lines.push("");
  lines.push(`Average: ${fmt(batch.avgScore)} · Median: ${fmt(batch.medianScore)}`);
  lines.push("");

  lines.push("## 3. Industry Breakdown");
  lines.push("");
  const industryEntries = Object.entries(batch.industryDistribution).sort(
    (a, b) => b[1] - a[1],
  );
  if (industryEntries.length === 0) {
    lines.push(
      "Insufficient data (no industry classification on any audit in this batch).",
    );
  } else {
    for (const [industry, count] of industryEntries) {
      lines.push(`- ${industry}: ${count}`);
    }
  }
  lines.push("");

  lines.push("## 4. Most Common Weaknesses");
  lines.push("");
  const catEntries = Object.entries(batch.categoryDistribution).sort(
    (a, b) => a[1] - b[1],
  );
  if (catEntries.length === 0) {
    lines.push("Insufficient data (no category scores in this batch).");
  } else {
    for (const [category, avg] of catEntries) {
      lines.push(`- ${category}: avg ${avg.toFixed(1)}`);
    }
  }
  lines.push("");

  lines.push("## 5. Most Common Recommendations");
  lines.push("");
  if (batch.recommendationFrequency.length === 0) {
    lines.push("Insufficient data (no findings recorded in this batch).");
  } else {
    for (const { id, count } of batch.recommendationFrequency.slice(0, 10)) {
      lines.push(`- ${id}: ${count}`);
    }
  }
  lines.push("");

  lines.push("## 6. Model Agreement");
  lines.push("");
  lines.push(
    batch.modelAgreementPct === null
      ? "Insufficient data (no consensus data in this batch)."
      : `${batch.modelAgreementPct.toFixed(0)}% of audits had Strong/Moderate model agreement.`,
  );
  lines.push("");

  lines.push("## 7. Confidence Analysis");
  lines.push("");
  const confEntries = Object.entries(batch.confidenceDistribution);
  if (confEntries.length === 0) {
    lines.push("Insufficient data (no confidence data in this batch).");
  } else {
    for (const [level, count] of confEntries) lines.push(`- ${level}: ${count}`);
  }
  lines.push("");

  lines.push("## 8. Runtime Analysis");
  lines.push("");
  lines.push(
    `Average runtime: ${batch.avgRuntimeMs === null ? "—" : formatDuration(batch.avgRuntimeMs)}`,
  );
  lines.push("");

  lines.push("## 9. Cost Analysis");
  lines.push("");
  lines.push(
    `Average cost: ${batch.avgCostUsd === null ? "—" : `$${batch.avgCostUsd.toFixed(4)}`}`,
  );
  lines.push("");

  lines.push("## 10. Failed Audits");
  lines.push("");
  lines.push(`${batch.failureCount} failed audits in this batch.`);
  lines.push("");

  lines.push("## 11. Outlier Reports");
  lines.push("");
  if (batch.outlierAuditIds.length === 0) {
    lines.push("No score outliers (beyond 2.5σ of the corpus mean) in this batch.");
  } else {
    for (const id of batch.outlierAuditIds) lines.push(`- ${id}`);
  }
  lines.push("");

  lines.push("## 12. Reports Requiring Manual Review");
  lines.push("");
  if (input.reviewQueue.length === 0) {
    lines.push("No audits auto-flagged for review in this batch.");
  } else {
    for (const row of input.reviewQueue) {
      lines.push(`- ${row.websiteUrl} (${row.auditOrderId}): ${row.reasons.join(", ")}`);
    }
  }
  lines.push("");

  lines.push("## Learning-Loop Observations");
  lines.push("");
  if (input.observations.length === 0) {
    lines.push("Insufficient data (no observations generated for this batch).");
  } else {
    for (const obs of input.observations) lines.push(`- ${obs}`);
  }
  lines.push("");

  if (input.beforeAfterChains.length > 0) {
    lines.push("## Before / After");
    lines.push("");
    for (const chain of input.beforeAfterChains) {
      for (const d of chain.deltas) {
        const deltaStr =
          d.overallDelta === null
            ? "—"
            : d.overallDelta > 0
              ? `+${d.overallDelta}`
              : String(d.overallDelta);
        lines.push(
          `- ${chain.websiteUrl}: ${deltaStr} over ${formatDuration(d.elapsedMs)}`,
        );
      }
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "_Generated by `scripts/calibration-batch-runner.ts`. Deterministic evidence only — no LLM synthesis. Never written back to any scoring/weighting table._",
  );

  return lines.join("\n");
}
