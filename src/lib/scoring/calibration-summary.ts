/**
 * Calibration summary — programmatic JSON aggregator.
 *
 * Pulls every `AuditIntelligence` row carrying a deterministic score
 * and returns a single JSON payload suitable for dashboards, alerts,
 * or operator triage. No prose, no formatting decisions — emit JSON,
 * let the caller render.
 *
 * Read-only. Safe to call against production.
 *
 * Used by:
 *   - `scripts/scoring-calibration-report.ts` (CLI, --json flag)
 *   - future admin dashboard / Slack alert / scheduled report
 */

import { PrismaClient } from "@prisma/client";

import {
  bandLabelForOverall,
  parseReportScoreBreakdown,
} from "@/lib/parse-report";
import { CATEGORY_HASH, WEIGHT_HASH } from "./frozen";
import type {
  CategoryKey,
  ConfidenceLevel,
  DeterministicScore,
  PublicBucketKey,
} from "./types";
import { SCORING_VERSION } from "./version";

const CATEGORY_KEYS: CategoryKey[] = [
  "schema",
  "crawler",
  "trust",
  "content",
  "brand",
  "tech",
];
const BUCKET_KEYS: PublicBucketKey[] = [
  "understanding",
  "retrieval",
  "trust",
  "recommendation",
];

export type CalibrationSummary = {
  scoring_version: string;
  weight_hash: string;
  category_hash: string;
  sample_size: number;
  computed_at: string;

  avg_score: number | null;
  median: number | null;
  std_dev: number | null;
  confidence_distribution: Record<ConfidenceLevel, number>;
  /** Mean bucket percentage across audits, per bucket. */
  bucket_distribution: Record<PublicBucketKey, number>;
  /** Mean category points across audits, per category. */
  category_distribution: Record<CategoryKey, number>;
  /**
   * Max |deterministic - legacy| across rows that have BOTH
   * (legacy comes from `parseReportScoreBreakdown`).
   */
  largest_delta: number | null;
  /** Mean |deterministic - legacy| where both exist. */
  mean_abs_delta: number | null;
  /** Count of rows where the legacy band differs from the deterministic band. */
  band_migrations: number;
  /** Most-common top-3 finding ids, ranked. */
  top_findings_frequency: Array<{ id: string; count: number }>;
};

type IntelRow = {
  deterministicScore: unknown;
  auditOrder: { reportMarkdown: string | null };
};

function isDeterministic(v: unknown): v is DeterministicScore {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.overall_score === "number" &&
    typeof obj.scoring_version === "string"
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number | null {
  if (values.length === 0) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, x) => s + (x - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function emptySummary(): CalibrationSummary {
  return {
    scoring_version: SCORING_VERSION,
    weight_hash: WEIGHT_HASH,
    category_hash: CATEGORY_HASH,
    sample_size: 0,
    computed_at: new Date().toISOString(),
    avg_score: null,
    median: null,
    std_dev: null,
    confidence_distribution: { low: 0, moderate: 0, high: 0 },
    bucket_distribution: {
      understanding: 0,
      retrieval: 0,
      trust: 0,
      recommendation: 0,
    },
    category_distribution: {
      schema: 0,
      crawler: 0,
      trust: 0,
      content: 0,
      brand: 0,
      tech: 0,
    },
    largest_delta: null,
    mean_abs_delta: null,
    band_migrations: 0,
    top_findings_frequency: [],
  };
}

/**
 * Pull every `AuditIntelligence` row with a `deterministicScore`
 * payload and aggregate into a single calibration summary.
 *
 * `prisma` can be passed in by tests or reused by long-running
 * callers; if omitted, a fresh client is created and disconnected.
 */
export async function scoreCalibrationSummary(args?: {
  prisma?: PrismaClient;
}): Promise<CalibrationSummary> {
  const prisma = args?.prisma ?? new PrismaClient();
  const ownsClient = !args?.prisma;

  try {
    const rows = (await prisma.auditIntelligence.findMany({
      where: {
        scoringVersion: SCORING_VERSION,
      },
      select: {
        deterministicScore: true,
        auditOrder: { select: { reportMarkdown: true } },
      },
    })) as IntelRow[];

    const scored = rows
      .map((r) =>
        isDeterministic(r.deterministicScore)
          ? { score: r.deterministicScore, markdown: r.auditOrder.reportMarkdown }
          : null,
      )
      .filter(
        (r): r is { score: DeterministicScore; markdown: string | null } =>
          r !== null,
      );

    if (scored.length === 0) {
      return emptySummary();
    }

    const overallScores = scored.map((r) => r.score.overall_score);

    const confDist: Record<ConfidenceLevel, number> = {
      low: 0,
      moderate: 0,
      high: 0,
    };
    for (const r of scored) confDist[r.score.confidence_level] += 1;

    const bucketSums: Record<PublicBucketKey, number> = {
      understanding: 0,
      retrieval: 0,
      trust: 0,
      recommendation: 0,
    };
    for (const r of scored) {
      for (const k of BUCKET_KEYS) {
        bucketSums[k] += r.score.public_bucket_scores[k].percentage;
      }
    }
    const bucketDistribution = Object.fromEntries(
      BUCKET_KEYS.map((k) => [k, bucketSums[k] / scored.length]),
    ) as Record<PublicBucketKey, number>;

    const categorySums: Record<CategoryKey, number> = {
      schema: 0,
      crawler: 0,
      trust: 0,
      content: 0,
      brand: 0,
      tech: 0,
    };
    for (const r of scored) {
      for (const k of CATEGORY_KEYS) {
        categorySums[k] += r.score.category_scores[k].score;
      }
    }
    const categoryDistribution = Object.fromEntries(
      CATEGORY_KEYS.map((k) => [k, categorySums[k] / scored.length]),
    ) as Record<CategoryKey, number>;

    // Legacy delta — only for rows with markdown.
    let largestDelta: number | null = null;
    const absDeltas: number[] = [];
    let bandMigrations = 0;
    for (const r of scored) {
      if (!r.markdown) continue;
      const legacy = parseReportScoreBreakdown(r.markdown);
      if (typeof legacy.overall !== "number") continue;
      const delta = r.score.overall_score - legacy.overall;
      absDeltas.push(Math.abs(delta));
      if (largestDelta === null || Math.abs(delta) > largestDelta) {
        largestDelta = Math.abs(delta);
      }
      if (bandLabelForOverall(legacy.overall) !== r.score.band) {
        bandMigrations += 1;
      }
    }

    // Top-3 findings frequency — count finding ids across all rows.
    const findingCounts: Record<string, number> = {};
    for (const r of scored) {
      for (const f of r.score.top_3_findings) {
        findingCounts[f.id] = (findingCounts[f.id] ?? 0) + 1;
      }
    }
    const topFindings = Object.entries(findingCounts)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      scoring_version: SCORING_VERSION,
      weight_hash: WEIGHT_HASH,
      category_hash: CATEGORY_HASH,
      sample_size: scored.length,
      computed_at: new Date().toISOString(),
      avg_score: mean(overallScores),
      median: median(overallScores),
      std_dev: stdDev(overallScores),
      confidence_distribution: confDist,
      bucket_distribution: bucketDistribution,
      category_distribution: categoryDistribution,
      largest_delta: largestDelta,
      mean_abs_delta: mean(absDeltas),
      band_migrations: bandMigrations,
      top_findings_frequency: topFindings,
    };
  } finally {
    if (ownsClient) await prisma.$disconnect();
  }
}
