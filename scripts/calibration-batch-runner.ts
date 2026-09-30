/* eslint-disable no-console */
/**
 * scripts/calibration-batch-runner.ts
 *
 * Manual trigger for the Calibration Engine's learning loop. Run via
 * `npm run calibration:batch`. Gated on
 * GEO_MODULE_CALIBRATION_ENGINE_ENABLED — exits immediately with zero
 * DB writes when the flag is not exactly "true".
 *
 * Two-step, idempotent-safe, read-then-insert only:
 *   1. Snapshot: find completed audits (reportStatus === "generated")
 *      with AuditIntelligence but no AuditSnapshot yet; write one
 *      snapshot per, computing needsReview at write time
 *      (src/lib/calibration/review-flags.ts).
 *   2. Batch: once the count of un-batched snapshots reaches
 *      GEO_CALIBRATION_BATCH_SIZE (default 25), compute + write the
 *      next CalibrationBatch, upsert RecommendationFrequency /
 *      IndustryBenchmarks, generate the markdown report under
 *      tmp/calibration-reports/, and stamp the consumed snapshots
 *      with calibrationBatchNumber.
 *
 * NEVER touches AuditOrder columns beyond reads, never touches
 * AuditIntelligence, report rendering, billing, or worker/queue code.
 * NEVER writes to any scoring/weighting table. Forward-only — does
 * not backfill AuditIntelligence rows completed before this script's
 * first run against a given database (by design; see the approved
 * plan's "Resolved decisions").
 *
 * Production-safe. Safe to re-run — only processes audits/snapshots
 * not yet processed.
 */

import "./lib/require-nonprod-db-or-break-glass";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { buildAuditChain, computeChainDeltas } from "../src/lib/calibration/before-after";
import {
  costRuntimeObservation,
  industryWeaknessObservation,
  modelAgreementObservation,
  recommendationFrequencyObservation,
  reviewQueueObservation,
  scoreDriftObservation,
} from "../src/lib/calibration/observations";
import {
  computeIndustryBenchmarks,
  computeRecommendationFrequency,
  type ScoredRow,
} from "../src/lib/calibration/recommendation-frequency";
import { renderCalibrationReport } from "../src/lib/calibration/report-writer";
import { computeNeedsReview } from "../src/lib/calibration/review-flags";
import type { ConsensusIndex } from "../src/lib/consensus/types";
import type { DeterministicScore } from "../src/lib/scoring/types";
import type { ValidationLayerResult } from "../src/lib/validators/types";

const BATCH_SIZE = Number(process.env.GEO_CALIBRATION_BATCH_SIZE ?? "25") || 25;
const REPORTS_DIR = path.join(process.cwd(), "tmp", "calibration-reports");

function isEnabled(): boolean {
  return process.env.GEO_MODULE_CALIBRATION_ENGINE_ENABLED === "true";
}

function isDeterministicScore(v: unknown): v is DeterministicScore {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.overall_score === "number" && typeof obj.scoring_version === "string";
}

function isConsensusIndex(v: unknown): v is ConsensusIndex {
  return !!v && typeof v === "object" && "model_agreement" in (v as object);
}

function isValidationLayerResult(v: unknown): v is ValidationLayerResult {
  return !!v && typeof v === "object" && "outputs" in (v as object);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function snapshotNewAudits(prisma: PrismaClient): Promise<number> {
  const alreadySnapshotted = await prisma.auditSnapshot.findMany({
    select: { auditOrderId: true },
  });
  const snapshottedIds = new Set(alreadySnapshotted.map((s) => s.auditOrderId));

  const candidates = await prisma.auditOrder.findMany({
    where: {
      reportStatus: "generated",
      intelligence: { isNot: null },
    },
    select: {
      id: true,
      websiteUrl: true,
      businessName: true,
      estimatedCostUsd: true,
      workerRuntimeMs: true,
      intelligence: {
        select: {
          industryCategoryNormalized: true,
          overallScore: true,
          deterministicScore: true,
          consensusIndex: true,
          aiValidations: true,
        },
      },
    },
  });

  const toSnapshot = candidates.filter((c) => !snapshottedIds.has(c.id));
  if (toSnapshot.length === 0) return 0;

  // Corpus mean/stddev for the score-outlier trigger — computed once
  // over this run's snapshottable rows, not recomputed per-row.
  const overallScores = toSnapshot
    .map((c) => c.intelligence?.overallScore)
    .filter((s): s is number => typeof s === "number");
  const corpusMean = average(overallScores);
  const corpusStdDev =
    overallScores.length < 2 || corpusMean === null
      ? null
      : Math.sqrt(
          overallScores.reduce((s, x) => s + (x - corpusMean) ** 2, 0) /
            overallScores.length,
        );

  let count = 0;
  for (const c of toSnapshot) {
    const det = isDeterministicScore(c.intelligence?.deterministicScore)
      ? c.intelligence!.deterministicScore
      : null;
    const consensus = isConsensusIndex(c.intelligence?.consensusIndex)
      ? c.intelligence!.consensusIndex
      : null;
    const validations = isValidationLayerResult(c.intelligence?.aiValidations)
      ? c.intelligence!.aiValidations
      : null;

    const observation = await prisma.observationHistory.findFirst({
      where: { auditId: c.id },
      orderBy: { createdAt: "desc" },
      select: { observationStatus: true },
    });

    // Repeated-failure signal — reuses the websiteUrl-scoped pattern
    // already used for score_stability_index in audit-intelligence.ts.
    const recentOrders = await prisma.auditOrder.findMany({
      where: { websiteUrl: c.websiteUrl, id: { not: c.id } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { retryCount: true },
    });
    const recentFailureCount = recentOrders.filter((o) => o.retryCount > 0).length;

    const topFindingIds = det?.top_3_findings.map((f) => f.id) ?? [];
    const topRecommendationIds = det?.top_3_recommended_fixes.map((f) => f.id) ?? [];
    const hasEmptyEvidence = det
      ? Object.values(det.category_scores).some((cat) => cat.evidence_used.length === 0)
      : false;

    const review = computeNeedsReview({
      confidenceLevel: det?.confidence_level ?? null,
      confidenceBand: consensus?.confidence_band ?? null,
      modelAgreement: consensus?.model_agreement ?? null,
      observationStatus: observation?.observationStatus ?? null,
      overallScore: c.intelligence?.overallScore ?? null,
      corpusMean,
      corpusStdDev,
      recentFailureCount,
      hasEmptyEvidence,
      validatorDropout: consensus !== null && validations === null,
      recommendationIds: [...topFindingIds, ...topRecommendationIds],
    });

    const categoryScores: Record<string, number> = {};
    if (det) {
      for (const [key, cat] of Object.entries(det.category_scores)) {
        categoryScores[key] = cat.score;
      }
    }

    await prisma.auditSnapshot.create({
      data: {
        auditOrderId: c.id,
        businessName: c.businessName,
        websiteUrl: c.websiteUrl,
        industryNormalized: c.intelligence?.industryCategoryNormalized ?? null,
        overallScore: c.intelligence?.overallScore ?? null,
        categoryScores,
        confidenceLevel: det?.confidence_level ?? null,
        modelAgreement: consensus?.model_agreement ?? null,
        costUsd: c.estimatedCostUsd,
        runtimeMs: c.workerRuntimeMs,
        topFindingIds,
        topRecommendationIds,
        needsReview: review.needsReview,
        needsReviewReasons: review.reasons,
        scoringVersion: det?.scoring_version ?? "unknown",
      },
    });
    count += 1;
  }

  return count;
}

async function maybeRunBatch(
  prisma: PrismaClient,
): Promise<{ batchNumber: number; batchSize: number; reportPath: string } | null> {
  const unbatched = await prisma.auditSnapshot.findMany({
    where: { calibrationBatchNumber: null },
    orderBy: { snapshotAt: "asc" },
  });
  if (unbatched.length < BATCH_SIZE) return null;

  const windowRows = unbatched.slice(0, BATCH_SIZE);
  const windowIds = windowRows.map((r) => r.id);
  const windowStart = windowRows[0].snapshotAt;
  const windowEnd = windowRows[windowRows.length - 1].snapshotAt;

  const previousBatch = await prisma.calibrationBatch.findFirst({
    orderBy: { batchNumber: "desc" },
  });
  const batchNumber = (previousBatch?.batchNumber ?? 0) + 1;

  // Reconstruct ScoredRow[] for the recommendation-frequency /
  // industry-benchmark helpers — they need the full DeterministicScore,
  // not the thin frozen category-score snapshot, so re-join.
  const auditOrderIds = windowRows.map((r) => r.auditOrderId);
  const intelRows = await prisma.auditIntelligence.findMany({
    where: { auditOrderId: { in: auditOrderIds } },
    select: {
      auditOrderId: true,
      deterministicScore: true,
      industryCategoryNormalized: true,
    },
  });
  const intelByOrderId = new Map(intelRows.map((r) => [r.auditOrderId, r]));

  const scoredRows: ScoredRow[] = [];
  for (const snap of windowRows) {
    const intel = intelByOrderId.get(snap.auditOrderId);
    const det =
      intel && isDeterministicScore(intel.deterministicScore)
        ? intel.deterministicScore
        : null;
    if (!det) continue;
    scoredRows.push({ score: det, industry: intel?.industryCategoryNormalized ?? null });
  }

  const scores = windowRows
    .map((r) => r.overallScore)
    .filter((s): s is number => s !== null);
  const avgScore = average(scores);
  const medianScore = median(scores);

  const industryDistribution: Record<string, number> = {};
  for (const r of windowRows) {
    if (!r.industryNormalized) continue;
    industryDistribution[r.industryNormalized] =
      (industryDistribution[r.industryNormalized] ?? 0) + 1;
  }

  const categorySums: Record<string, { sum: number; count: number }> = {};
  for (const r of windowRows) {
    const cats = r.categoryScores as unknown as Record<string, number>;
    for (const [key, value] of Object.entries(cats ?? {})) {
      const slot = categorySums[key] ?? { sum: 0, count: 0 };
      slot.sum += value;
      slot.count += 1;
      categorySums[key] = slot;
    }
  }
  const categoryDistribution: Record<string, number> = {};
  for (const [key, { sum, count }] of Object.entries(categorySums)) {
    categoryDistribution[key] = count === 0 ? 0 : sum / count;
  }

  const costs = windowRows
    .map((r) => (r.costUsd !== null ? Number(r.costUsd) : null))
    .filter((v): v is number => v !== null);
  const runtimes = windowRows
    .map((r) => r.runtimeMs)
    .filter((v): v is number => v !== null);
  const avgCostUsd = average(costs);
  const avgRuntimeMsRaw = average(runtimes);
  const avgRuntimeMs = avgRuntimeMsRaw === null ? null : Math.round(avgRuntimeMsRaw);

  const recommendationFrequencyRows = computeRecommendationFrequency(scoredRows);
  const overallRecFreq = recommendationFrequencyRows
    .filter((r) => r.industry === null)
    .map((r) => ({ id: r.recommendationId, count: r.timesGenerated }))
    .sort((a, b) => b.count - a.count);

  const agreementLabels = windowRows
    .map((r) => r.modelAgreement)
    .filter((v): v is string => v !== null);
  const goodAgreement = agreementLabels.filter(
    (l) => l === "Strong" || l === "Moderate",
  ).length;
  const modelAgreementPct =
    agreementLabels.length === 0 ? null : (100 * goodAgreement) / agreementLabels.length;

  const confidenceDistribution: Record<string, number> = {};
  for (const r of windowRows) {
    if (!r.confidenceLevel) continue;
    confidenceDistribution[r.confidenceLevel] =
      (confidenceDistribution[r.confidenceLevel] ?? 0) + 1;
  }

  const needsReviewCount = windowRows.filter((r) => r.needsReview).length;
  const outlierAuditIds = windowRows
    .filter((r) => (r.needsReviewReasons as unknown as string[]).includes("score_outlier"))
    .map((r) => r.auditOrderId);

  const failureCount = await prisma.auditOrder.count({
    where: {
      reportStatus: "failed",
      createdAt: { gte: windowStart, lte: windowEnd },
    },
  });

  // Upsert current-state leaderboards.
  const industryBenchmarkRows = computeIndustryBenchmarks(scoredRows);
  for (const row of industryBenchmarkRows) {
    await prisma.industryBenchmarks.upsert({
      where: { industry: row.industry },
      create: { ...row },
      update: { ...row },
    });
  }
  for (const row of recommendationFrequencyRows) {
    // Not a plain `upsert` — Prisma's compound-unique WhereUniqueInput
    // doesn't accept `null` for a nullable member of `@@unique`
    // (`industry` is null for the all-industries rollup row), so the
    // (recommendationId, industry) pair is looked up manually instead.
    const existing = await prisma.recommendationFrequency.findFirst({
      where: { recommendationId: row.recommendationId, industry: row.industry },
      select: { id: true },
    });
    const data = {
      timesGenerated: row.timesGenerated,
      avgScore: row.avgScore,
      avgConfidence: row.avgConfidence,
    };
    if (existing) {
      await prisma.recommendationFrequency.update({ where: { id: existing.id }, data });
    } else {
      await prisma.recommendationFrequency.create({
        data: { recommendationId: row.recommendationId, industry: row.industry, ...data },
      });
    }
  }

  // Learning-loop observations.
  const observations: string[] = [];
  for (const { id, count } of overallRecFreq.slice(0, 5)) {
    observations.push(
      recommendationFrequencyObservation({
        recommendationId: id,
        count,
        batchSize: windowRows.length,
        batchNumber,
      }),
    );
  }
  for (const row of industryBenchmarkRows) {
    if (row.avgScore === null || avgScore === null) continue;
    observations.push(
      industryWeaknessObservation({
        industry: row.industry,
        avgScore: row.avgScore,
        corpusAvg: avgScore,
        count: row.auditCount,
      }),
    );
  }
  observations.push(
    scoreDriftObservation({
      batchNumber,
      currentAvg: avgScore,
      previousAvg: previousBatch?.avgScore ?? null,
    }),
  );
  observations.push(
    modelAgreementObservation({
      batchNumber,
      currentPct: modelAgreementPct,
      previousPct: previousBatch?.modelAgreementPct ?? null,
    }),
  );
  const reasonCounts: Record<string, number> = {};
  for (const r of windowRows) {
    for (const reason of r.needsReviewReasons as unknown as string[]) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }
  }
  observations.push(reviewQueueObservation({ batchNumber, needsReviewCount, reasonCounts }));
  observations.push(
    costRuntimeObservation({
      batchNumber,
      avgCostUsd,
      avgRuntimeMs,
      previousAvgCostUsd:
        previousBatch?.avgCostUsd !== undefined && previousBatch?.avgCostUsd !== null
          ? Number(previousBatch.avgCostUsd)
          : null,
      previousAvgRuntimeMs: previousBatch?.avgRuntimeMs ?? null,
    }),
  );

  // Before/after chains for businesses with >1 audit inside this window.
  const urlCounts = new Map<string, number>();
  for (const r of windowRows) urlCounts.set(r.websiteUrl, (urlCounts.get(r.websiteUrl) ?? 0) + 1);
  const repeatUrls = [...urlCounts.entries()].filter(([, c]) => c > 1).map(([u]) => u);
  const beforeAfterChains: Array<{
    websiteUrl: string;
    deltas: Array<{ overallDelta: number | null; elapsedMs: number }>;
  }> = [];
  for (const url of repeatUrls) {
    const orders = await prisma.auditOrder.findMany({
      where: { websiteUrl: url },
      orderBy: { createdAt: "asc" },
      include: {
        intelligence: { select: { overallScore: true, deterministicScore: true } },
      },
    });
    const chain = buildAuditChain(orders);
    const deltas = computeChainDeltas(chain);
    if (deltas.length > 0) beforeAfterChains.push({ websiteUrl: url, deltas });
  }

  const reviewQueueRows = windowRows
    .filter((r) => r.needsReview)
    .map((r) => ({
      auditOrderId: r.auditOrderId,
      websiteUrl: r.websiteUrl,
      reasons: r.needsReviewReasons as unknown as string[],
    }));

  // Render + write the report file.
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const reportPath = path.join(REPORTS_DIR, `batch-${batchNumber}-${dateStr}.md`);
  const reportMarkdown = renderCalibrationReport({
    batch: {
      batchNumber,
      batchSize: windowRows.length,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      avgScore,
      medianScore,
      industryDistribution,
      categoryDistribution,
      avgRuntimeMs,
      avgCostUsd,
      recommendationFrequency: overallRecFreq,
      modelAgreementPct,
      confidenceDistribution,
      failureCount,
      warningCount: 0,
      outlierAuditIds,
      needsReviewCount,
    },
    observations,
    reviewQueue: reviewQueueRows,
    beforeAfterChains,
  });
  fs.writeFileSync(reportPath, reportMarkdown, "utf8");
  const relativeReportPath = path.relative(process.cwd(), reportPath);

  await prisma.calibrationBatch.create({
    data: {
      batchNumber,
      batchSize: windowRows.length,
      windowStart,
      windowEnd,
      avgScore,
      medianScore,
      industryDistribution,
      categoryDistribution,
      avgRuntimeMs,
      avgCostUsd,
      recommendationFrequency: overallRecFreq,
      modelAgreementPct,
      confidenceDistribution,
      failureCount,
      warningCount: 0,
      outlierAuditIds,
      needsReviewCount,
      reportPath: relativeReportPath,
    },
  });

  await prisma.auditSnapshot.updateMany({
    where: { id: { in: windowIds } },
    data: { calibrationBatchNumber: batchNumber },
  });

  return { batchNumber, batchSize: windowRows.length, reportPath: relativeReportPath };
}

async function main(): Promise<void> {
  if (!isEnabled()) {
    console.log(
      '[calibration-batch] GEO_MODULE_CALIBRATION_ENGINE_ENABLED is not "true" — exiting, zero writes.',
    );
    return;
  }

  const prisma = new PrismaClient();
  try {
    const snapshotted = await snapshotNewAudits(prisma);
    console.log(`[calibration-batch] snapshotted ${snapshotted} newly-completed audits.`);

    const batch = await maybeRunBatch(prisma);
    if (batch) {
      console.log(
        `[calibration-batch] wrote batch #${batch.batchNumber} (${batch.batchSize} audits) → ${batch.reportPath}`,
      );
    } else {
      console.log("[calibration-batch] no batch threshold reached yet.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[calibration-batch] error:", err);
  process.exitCode = 1;
});
