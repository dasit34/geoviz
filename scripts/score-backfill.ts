/* eslint-disable no-console */
/**
 * scripts/score-backfill.ts
 *
 * One-shot backfill: re-scores every `AuditIntelligence` row that
 * predates `scoring@1.0.0` (or never received a deterministic score)
 * using the evidence already stored on the row.
 *
 *   npm run score:backfill            # write
 *   npm run score:backfill -- --dry-run  # print, no writes
 *
 * Behavior:
 *   • Only touches rows where `preflightSignals IS NOT NULL` — rows
 *     that predate the V2 preflight layer can't be re-scored without
 *     re-fetching the site.
 *   • Reconstructs an `IntelligenceIngestResult` shape from the
 *     already-extracted ingest columns (cmsDetected, frameworkDetected,
 *     aiReadabilityScore, contentDensity, …).
 *   • Reconstructs a `RenderIntelligenceResult` shape from the stored
 *     render* columns when render was attempted.
 *   • Fetches the last 5 prior audits for the same website (with a
 *     deterministic score present) for the stability index.
 *   • Updates `deterministicScore`, `scoringVersion = "scoring@1.0.0"`,
 *     `overallScore`, and `confidenceLevel`.
 *   • Never touches `reportMarkdown`, `reportStatus`, operator notes,
 *     or the corresponding `AuditOrder` row.
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

import type { IntelligenceIngestResult } from "../src/lib/intelligence/intelligenceIngest";
import type { PreflightSignals } from "../src/lib/intelligence/preflight/types";
import type { RenderIntelligenceResult } from "../src/lib/intelligence/render/renderProvider";
import { scoreAudit, SCORING_VERSION } from "../src/lib/scoring";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Parse `--batch=N` (rows per loop) and `--pause=Ns` (seconds between
 * batches). Sensible defaults if absent or malformed.
 */
function parseFlag(name: string, defaultValue: number): number {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!flag) return defaultValue;
  const raw = flag.slice(`--${name}=`.length).replace(/s$/, "");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}
const BATCH_SIZE = parseFlag("batch", 25);
const PAUSE_SEC = parseFlag("pause", 2);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type CandidateRow = {
  id: string;
  auditOrderId: string;
  websiteUrl: string;
  createdAt: Date;
  scoringVersion: string;
  preflightSignals: unknown;
  cmsDetected: string | null;
  frameworkDetected: string | null;
  schemaTypes: unknown;
  aiReadabilityScore: number | null;
  contentDensity: number | null;
  renderRequired: boolean | null;
  renderAttempted: boolean | null;
  renderSuccessful: boolean | null;
  renderEngineVersion: string | null;
  renderDurationMs: number | null;
  renderedHtmlLength: number | null;
  renderedTextLength: number | null;
  renderedSchemaTypes: unknown;
  hydrationDetected: boolean | null;
  blankShellRisk: boolean | null;
  clientOnlyContentDetected: boolean | null;
  renderConfidence: string | null;
  renderFailureReason: string | null;
  rawTextLength: number | null;
  rawSchemaTypes: unknown;
  schemaDeltaDetected: boolean | null;
  contentDeltaDetected: boolean | null;
  benchmarkTags: unknown;
  extractedEntities: unknown;
  scoreProvenance: unknown;
};

function reconstructIngest(row: CandidateRow): IntelligenceIngestResult {
  return {
    cmsDetected: row.cmsDetected,
    frameworkDetected: row.frameworkDetected,
    schemaTypes: row.schemaTypes as string[] | null,
    aiReadabilityScore: row.aiReadabilityScore,
    contentDensity: row.contentDensity,
    renderRequired: row.renderRequired,
    renderAttempted: row.renderAttempted,
    renderSuccessful: row.renderSuccessful,
    renderEngineVersion: row.renderEngineVersion,
    benchmarkTags: row.benchmarkTags as string[] | null,
    extractedEntities: row.extractedEntities as string[] | null,
    scoreProvenance: row.scoreProvenance as IntelligenceIngestResult["scoreProvenance"],
  };
}

function reconstructRender(row: CandidateRow): RenderIntelligenceResult | null {
  if (row.renderAttempted === null && row.rawTextLength === null) {
    return null;
  }
  const renderConfidence =
    row.renderConfidence === "low" ||
    row.renderConfidence === "medium" ||
    row.renderConfidence === "high"
      ? row.renderConfidence
      : null;
  return {
    renderAttempted: row.renderAttempted,
    renderSuccessful: row.renderSuccessful,
    renderEngineVersion: row.renderEngineVersion,
    renderFailureReason: row.renderFailureReason,
    renderDurationMs: row.renderDurationMs,
    renderedHtmlLength: row.renderedHtmlLength,
    renderedTextLength: row.renderedTextLength,
    renderedSchemaTypes: row.renderedSchemaTypes as string[] | null,
    hydrationDetected: row.hydrationDetected,
    blankShellRisk: row.blankShellRisk,
    clientOnlyContentDetected: row.clientOnlyContentDetected,
    renderConfidence,
    rawTextLength: row.rawTextLength,
    rawSchemaTypes: row.rawSchemaTypes as string[] | null,
    schemaDeltaDetected: row.schemaDeltaDetected,
    contentDeltaDetected: row.contentDeltaDetected,
  };
}

function looksLikePreflight(v: unknown): v is PreflightSignals {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return "engineVersion" in obj && "fetchOk" in obj;
}

const CANDIDATE_SELECT = {
  id: true,
  auditOrderId: true,
  websiteUrl: true,
  createdAt: true,
  scoringVersion: true,
  preflightSignals: true,
  cmsDetected: true,
  frameworkDetected: true,
  schemaTypes: true,
  aiReadabilityScore: true,
  contentDensity: true,
  renderRequired: true,
  renderAttempted: true,
  renderSuccessful: true,
  renderEngineVersion: true,
  renderDurationMs: true,
  renderedHtmlLength: true,
  renderedTextLength: true,
  renderedSchemaTypes: true,
  hydrationDetected: true,
  blankShellRisk: true,
  clientOnlyContentDetected: true,
  renderConfidence: true,
  renderFailureReason: true,
  rawTextLength: true,
  rawSchemaTypes: true,
  schemaDeltaDetected: true,
  contentDeltaDetected: true,
  benchmarkTags: true,
  extractedEntities: true,
  scoreProvenance: true,
} as const;

async function processRow(
  prisma: PrismaClient,
  row: CandidateRow,
): Promise<"upgraded" | "skipped" | "failed"> {
  if (!looksLikePreflight(row.preflightSignals)) {
    console.warn(
      `[backfill] skip orderId=${row.auditOrderId} reason=preflight_shape_mismatch`,
    );
    return "skipped";
  }

  try {
    const history = await prisma.auditIntelligence.findMany({
      where: {
        websiteUrl: row.websiteUrl,
        auditOrderId: { not: row.auditOrderId },
        NOT: { deterministicScore: { equals: Prisma.JsonNull } },
        overallScore: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { createdAt: true, overallScore: true },
    });
    const historyForScorer = history
      .filter(
        (h): h is { createdAt: Date; overallScore: number } =>
          typeof h.overallScore === "number",
      )
      .map((h) => ({
        computed_at: h.createdAt.toISOString(),
        overall_score: h.overallScore,
      }));

    const deterministic = scoreAudit({
      preflightSignals: row.preflightSignals,
      intelligenceIngest: reconstructIngest(row),
      renderResult: reconstructRender(row),
      history: historyForScorer,
      nowIso: row.createdAt.toISOString(),
    });

    if (DRY_RUN) {
      console.log(
        `[backfill] would-upgrade orderId=${row.auditOrderId} ${row.scoringVersion} → ${SCORING_VERSION} overall=${deterministic.overall_score} band=${deterministic.band} confidence=${deterministic.confidence_level}`,
      );
    } else {
      await prisma.auditIntelligence.update({
        where: { id: row.id },
        data: {
          deterministicScore: deterministic as unknown as Prisma.InputJsonValue,
          scoringVersion: SCORING_VERSION,
          overallScore: deterministic.overall_score,
          confidenceLevel: deterministic.confidence_level,
        },
      });
      console.log(
        `[backfill] upgraded orderId=${row.auditOrderId} ${row.scoringVersion} → ${SCORING_VERSION} overall=${deterministic.overall_score} band=${deterministic.band}`,
      );
    }
    return "upgraded";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[backfill] failed orderId=${row.auditOrderId} reason=${msg}`,
    );
    return "failed";
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const totalStart = Date.now();
  console.log(
    `[backfill] starting ${DRY_RUN ? "(DRY RUN)" : "(WRITE)"} — target=${SCORING_VERSION} batch=${BATCH_SIZE} pause=${PAUSE_SEC}s`,
  );

  // Total candidate count — for progress reporting.
  const totalCandidates = await prisma.auditIntelligence.count({
    where: {
      OR: [
        { scoringVersion: { not: SCORING_VERSION } },
        { deterministicScore: { equals: Prisma.JsonNull } },
      ],
      NOT: { preflightSignals: { equals: Prisma.JsonNull } },
    },
  });
  console.log(`[backfill] ${totalCandidates} candidate rows`);

  let upgraded = 0;
  let skipped = 0;
  let failed = 0;
  let batchNum = 0;

  while (true) {
    batchNum += 1;
    const batchStart = Date.now();

    // Pull the NEXT batch by filtering rows still NOT at scoring@1.0.0.
    // After each write-batch, processed rows drop out of the filter,
    // so we can use `take: BATCH_SIZE` without cursor bookkeeping.
    // For dry-run, no rows actually flip, so we order by createdAt and
    // skip to keep the candidate window moving.
    const rows = (await prisma.auditIntelligence.findMany({
      where: {
        OR: [
          { scoringVersion: { not: SCORING_VERSION } },
          { deterministicScore: { equals: Prisma.JsonNull } },
        ],
        NOT: { preflightSignals: { equals: Prisma.JsonNull } },
      },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      skip: DRY_RUN ? (batchNum - 1) * BATCH_SIZE : 0,
      select: CANDIDATE_SELECT,
    })) as CandidateRow[];

    if (rows.length === 0) break;

    let batchUpgraded = 0;
    let batchSkipped = 0;
    let batchFailed = 0;
    for (const row of rows) {
      const outcome = await processRow(prisma, row);
      if (outcome === "upgraded") batchUpgraded += 1;
      else if (outcome === "skipped") batchSkipped += 1;
      else batchFailed += 1;
    }
    upgraded += batchUpgraded;
    skipped += batchSkipped;
    failed += batchFailed;

    const batchMs = Date.now() - batchStart;
    const avgMs = Math.round(batchMs / rows.length);
    console.log(
      `[backfill] batch=${batchNum} size=${rows.length} upgraded=${batchUpgraded} skipped=${batchSkipped} failed=${batchFailed} avgMs=${avgMs} totalMs=${batchMs} cum=${upgraded + skipped + failed}/${totalCandidates}`,
    );

    if (rows.length < BATCH_SIZE) break;

    if (PAUSE_SEC > 0) {
      console.log(`[backfill] pausing ${PAUSE_SEC}s before next batch`);
      await sleep(PAUSE_SEC * 1000);
    }

    // Belt-and-suspenders: hard safety stop. If somehow the filter
    // returns the same rows twice (dry-run mode without skip, or a
    // transient DB lag), bail rather than loop forever.
    if (batchNum > Math.ceil(totalCandidates / BATCH_SIZE) + 5) {
      console.warn(
        `[backfill] safety-stop after ${batchNum} batches (expected ~${Math.ceil(totalCandidates / BATCH_SIZE)})`,
      );
      break;
    }
  }

  await prisma.$disconnect();

  const totalMs = Date.now() - totalStart;
  const total = upgraded + skipped + failed;
  const avgMsPerRow = total > 0 ? Math.round(totalMs / total) : 0;
  console.log("");
  console.log(
    `[backfill] ${DRY_RUN ? "DRY-RUN " : ""}summary: upgraded=${upgraded} skipped=${skipped} failed=${failed} total=${total}`,
  );
  console.log(
    `[backfill] timing: total=${(totalMs / 1000).toFixed(1)}s avg=${avgMsPerRow}ms/row batches=${batchNum}`,
  );
  console.log(
    `[backfill] cost:   $0.00 (deterministic — no API calls)`,
  );
}

main().catch((err) => {
  console.error("[backfill] fatal error:", err);
  process.exitCode = 1;
});
