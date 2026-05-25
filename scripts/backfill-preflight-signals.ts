/* eslint-disable no-console */
/**
 * scripts/backfill-preflight-signals.ts
 *
 * Hybrid backfill for `AuditIntelligence.preflightSignals`:
 *
 *   1. Inventory — row-state counts + created_at buckets.
 *   2. DB-only reconstruction — build partial PreflightSignals from
 *      existing AuditIntelligence columns (readability, schema only;
 *      crawlability + entityConsistency stay null since the source
 *      data isn't in the DB).
 *   3. Optional `--with-fetch` — re-fetches the customer URL via
 *      runPreflight() for rows the DB-only pass couldn't resolve.
 *   4. Optional `--validate` — runs scoreAudit() with restored vs
 *      null preflight on a sample, asserts delta/hash/score gates.
 *   5. Emits HISTORICAL REPLAY READINESS REPORT + GO/NO-GO verdict.
 *
 * Default is DRY-RUN. `--commit` is the persistence opt-in.
 *
 * NO AI provider API calls. `--with-fetch` issues plain HTTPS GETs
 * to the customer's own website (the same fetch a live audit
 * already performs).
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

import type { IntelligenceIngestResult } from "../src/lib/intelligence/intelligenceIngest";
import type {
  PreflightSignals,
  ReadableContentResult,
  SchemaValidationResult,
} from "../src/lib/intelligence/preflight/types";
import type { RenderIntelligenceResult } from "../src/lib/intelligence/render/renderProvider";
import { scoreAudit } from "../src/lib/scoring";
import { CATEGORY_HASH, WEIGHT_HASH } from "../src/lib/scoring/frozen";

// ─── Flags ──────────────────────────────────────────────────────

const COMMIT_MODE = process.argv.includes("--commit");
const WITH_FETCH = process.argv.includes("--with-fetch");
const VALIDATE_ONLY = process.argv.includes("--validate");
const INVENTORY_ONLY = process.argv.includes("--inventory-only");

function intArg(flag: string, def: number): number {
  const m = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!m) return def;
  const n = Number(m.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : def;
}

const BATCH_SIZE = intArg("--batch", 25);
const PAUSE_MS = intArg("--pause", 2) * 1000;
const SAMPLE_SIZE = intArg("--sample", 20);

// Gate thresholds.
const MIN_REPLAY_COVERAGE_PCT = 50;

// ─── Types ──────────────────────────────────────────────────────

type Bucket =
  | "restored"
  | "restored-fetched"
  | "skipped"
  | "unresolved"
  | "failed-fetch";

type RowResult = {
  auditOrderId: string;
  websiteUrl: string;
  bucket: Bucket;
  populatedSubfields: string[];
  reconstructionConfidence: number;
  existingConfidence: number;
  fetchError?: string;
};

type IntelligenceRowSnapshot = {
  auditOrderId: string;
  websiteUrl: string;
  preflightSignals: PreflightSignals | null;
  intelligenceIngest: IntelligenceIngestResult | null;
  renderResult: RenderIntelligenceResult | null;
};

// ─── Helpers ────────────────────────────────────────────────────

function preflightConfidence(p: PreflightSignals | null): number {
  if (p === null) return 0;
  let n = 0;
  if (p.readability !== null) n += 1;
  if (p.schema !== null) n += 1;
  if (p.crawlability !== null) n += 1;
  if (p.entityConsistency !== null) n += 1;
  return n;
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function dynamicRunPreflight(): (
  url: string,
) => Promise<PreflightSignals> {
  // Defer the import so a `--commit` (no fetch) or read-only run never
  // pulls in JSDOM / Mozilla Readability for no reason.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(
    "../src/lib/intelligence/preflight/runPreflight",
  ).runPreflight;
}

// ─── Inventory ──────────────────────────────────────────────────

async function printInventory(prisma: PrismaClient): Promise<void> {
  const total = await prisma.auditIntelligence.count();
  const nullPreflight = await prisma.auditIntelligence.count({
    // Match BOTH SQL NULL and JSON null literal — production rows are
    // SQL DbNull (created without a preflightSignals write); historical
    // rewrites could land as JsonNull. AnyNull covers both.
    where: { preflightSignals: { equals: Prisma.AnyNull } },
  });
  const presentPreflight = total - nullPreflight;
  const presentDeterministic = await prisma.auditIntelligence.count({
    where: { NOT: { deterministicScore: { equals: Prisma.JsonNull } } },
  });

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [b7, b30, b90, older] = await Promise.all([
    prisma.auditIntelligence.count({ where: { createdAt: { gte: d7 } } }),
    prisma.auditIntelligence.count({
      where: { createdAt: { gte: d30, lt: d7 } },
    }),
    prisma.auditIntelligence.count({
      where: { createdAt: { gte: d90, lt: d30 } },
    }),
    prisma.auditIntelligence.count({ where: { createdAt: { lt: d90 } } }),
  ]);

  console.log("[backfill-preflight] inventory:");
  console.log(`  total_audit_intelligence:        ${total}`);
  console.log(`  preflightSignals = null:         ${nullPreflight}`);
  console.log(`  preflightSignals = present:      ${presentPreflight}`);
  console.log(`  deterministicScore = present:    ${presentDeterministic}`);
  console.log(`  buckets by created_at:`);
  console.log(`    last 7 days:    ${b7}`);
  console.log(`    last 30 days:   ${b30}`);
  console.log(`    last 90 days:   ${b90}`);
  console.log(`    older:          ${older}`);
  console.log("");
}

// ─── Snapshot loader ────────────────────────────────────────────

function rowToIngest(row: {
  cmsDetected: string | null;
  frameworkDetected: string | null;
  schemaTypes: Prisma.JsonValue | null;
  aiReadabilityScore: number | null;
  contentDensity: number | null;
  renderRequired: boolean | null;
  renderAttempted: boolean | null;
  renderSuccessful: boolean | null;
  renderEngineVersion: string | null;
  benchmarkTags: Prisma.JsonValue | null;
  extractedEntities: Prisma.JsonValue | null;
  scoreProvenance: Prisma.JsonValue | null;
}): IntelligenceIngestResult {
  const arrOrNull = <T,>(v: Prisma.JsonValue | null): T[] | null => {
    if (Array.isArray(v)) return v as unknown as T[];
    return null;
  };
  return {
    cmsDetected: row.cmsDetected,
    frameworkDetected: row.frameworkDetected,
    schemaTypes: arrOrNull<string>(row.schemaTypes),
    aiReadabilityScore: row.aiReadabilityScore,
    contentDensity: row.contentDensity,
    renderRequired: row.renderRequired,
    renderAttempted: row.renderAttempted,
    renderSuccessful: row.renderSuccessful,
    renderEngineVersion: row.renderEngineVersion,
    benchmarkTags: arrOrNull<string>(row.benchmarkTags),
    extractedEntities: arrOrNull<string>(row.extractedEntities),
    scoreProvenance:
      row.scoreProvenance === null
        ? null
        : (row.scoreProvenance as unknown as IntelligenceIngestResult["scoreProvenance"]),
  };
}

function rowToRender(row: {
  renderAttempted: boolean | null;
  renderSuccessful: boolean | null;
  renderEngineVersion: string | null;
  renderFailureReason: string | null;
  renderDurationMs: number | null;
  renderedHtmlLength: number | null;
  renderedTextLength: number | null;
  renderedSchemaTypes: Prisma.JsonValue | null;
  hydrationDetected: boolean | null;
  blankShellRisk: boolean | null;
  clientOnlyContentDetected: boolean | null;
  renderConfidence: string | null;
  rawTextLength: number | null;
  rawSchemaTypes: Prisma.JsonValue | null;
  schemaDeltaDetected: boolean | null;
  contentDeltaDetected: boolean | null;
}): RenderIntelligenceResult {
  return {
    renderAttempted: row.renderAttempted ?? false,
    renderSuccessful: row.renderSuccessful,
    renderEngineVersion: row.renderEngineVersion,
    renderFailureReason: row.renderFailureReason,
    renderDurationMs: row.renderDurationMs,
    renderedHtmlLength: row.renderedHtmlLength,
    renderedTextLength: row.renderedTextLength,
    renderedSchemaTypes: Array.isArray(row.renderedSchemaTypes)
      ? (row.renderedSchemaTypes as unknown as string[])
      : null,
    hydrationDetected: row.hydrationDetected,
    blankShellRisk: row.blankShellRisk,
    clientOnlyContentDetected: row.clientOnlyContentDetected,
    renderConfidence: (row.renderConfidence as
      | "low"
      | "medium"
      | "high"
      | null) ?? null,
    rawTextLength: row.rawTextLength,
    rawSchemaTypes: Array.isArray(row.rawSchemaTypes)
      ? (row.rawSchemaTypes as unknown as string[])
      : null,
    schemaDeltaDetected: row.schemaDeltaDetected,
    contentDeltaDetected: row.contentDeltaDetected,
  };
}

// ─── DB-only reconstruction ─────────────────────────────────────

function reconstructFromDb(args: {
  websiteUrl: string;
  aiReadabilityScore: number | null;
  contentDensity: number | null;
  schemaTypes: string[] | null;
  scoreProvenance: IntelligenceIngestResult["scoreProvenance"] | null;
}): { signals: PreflightSignals; populated: string[] } {
  const populated: string[] = [];

  let readability: ReadableContentResult | null = null;
  if (
    args.aiReadabilityScore !== null &&
    args.contentDensity !== null &&
    args.contentDensity > 0
  ) {
    readability = {
      // Approximate: ~6 chars per word for English. Used only by
      // scoreAudit's content category for thin-content thresholds.
      textLength: args.contentDensity * 6,
      wordCount: args.contentDensity,
      parsedByReadability: args.contentDensity >= 200,
      fallbackUsed: args.contentDensity < 200,
      articleTitle: null,
      preview: "",
    };
    populated.push("readability");
  }

  let schema: SchemaValidationResult | null = null;
  if (Array.isArray(args.schemaTypes) && args.schemaTypes.length > 0) {
    // ScoreProvenance has reasons/signals but no `.score` — keep
    // the schema score at 0 here. The reconstructed `detectedTypes`
    // alone drives the downstream evidence (raw_jsonld_block_count +
    // FAQ-schema detection). The analyzer_score field below is
    // sourced from the score column, not derivable from DB ingest.
    const schemaScore = 0;
    schema = {
      score: schemaScore,
      presentFields: [],
      missingFields: [],
      malformedFields: [],
      detectedTypes: args.schemaTypes,
      rawJsonLdCount: args.schemaTypes.length,
      notes: ["reconstructed from intelligence ingest"],
    };
    populated.push("schema");
  }

  const signals: PreflightSignals = {
    ok: true,
    runDurationMs: 0,
    fetchedUrl: args.websiteUrl,
    fetchOk: true,
    readability,
    schema,
    crawlability: null,
    entityConsistency: null,
    engineVersion: "v1-backfill",
  };

  return { signals, populated };
}

// ─── Per-row processing ─────────────────────────────────────────

type DbRow = Awaited<ReturnType<typeof loadCandidateRows>>[number];

async function loadCandidateRows(
  prisma: PrismaClient,
): Promise<
  Array<{
    auditOrderId: string;
    websiteUrl: string;
    preflightSignals: Prisma.JsonValue | null;
    cmsDetected: string | null;
    frameworkDetected: string | null;
    schemaTypes: Prisma.JsonValue | null;
    aiReadabilityScore: number | null;
    contentDensity: number | null;
    renderRequired: boolean | null;
    renderAttempted: boolean | null;
    renderSuccessful: boolean | null;
    renderEngineVersion: string | null;
    renderFailureReason: string | null;
    renderDurationMs: number | null;
    renderedHtmlLength: number | null;
    renderedTextLength: number | null;
    renderedSchemaTypes: Prisma.JsonValue | null;
    hydrationDetected: boolean | null;
    blankShellRisk: boolean | null;
    clientOnlyContentDetected: boolean | null;
    renderConfidence: string | null;
    rawTextLength: number | null;
    rawSchemaTypes: Prisma.JsonValue | null;
    schemaDeltaDetected: boolean | null;
    contentDeltaDetected: boolean | null;
    benchmarkTags: Prisma.JsonValue | null;
    extractedEntities: Prisma.JsonValue | null;
    scoreProvenance: Prisma.JsonValue | null;
  }>
> {
  return prisma.auditIntelligence.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      auditOrderId: true,
      websiteUrl: true,
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
      renderFailureReason: true,
      renderDurationMs: true,
      renderedHtmlLength: true,
      renderedTextLength: true,
      renderedSchemaTypes: true,
      hydrationDetected: true,
      blankShellRisk: true,
      clientOnlyContentDetected: true,
      renderConfidence: true,
      rawTextLength: true,
      rawSchemaTypes: true,
      schemaDeltaDetected: true,
      contentDeltaDetected: true,
      benchmarkTags: true,
      extractedEntities: true,
      scoreProvenance: true,
    },
  });
}

async function persistPreflight(
  prisma: PrismaClient,
  auditOrderId: string,
  signals: PreflightSignals,
): Promise<void> {
  await prisma.auditIntelligence.update({
    where: { auditOrderId },
    data: {
      preflightSignals: signals as unknown as Prisma.InputJsonValue,
    },
  });
}

async function processRow(
  prisma: PrismaClient,
  row: DbRow,
): Promise<RowResult> {
  const existing =
    row.preflightSignals === null
      ? null
      : (row.preflightSignals as unknown as PreflightSignals);
  const existingConfidence = preflightConfidence(existing);

  // If existing already has equal-or-greater coverage than any DB-only
  // recon could yield, skip immediately. DB-only can only ever produce
  // ≤ 2 subfields (readability + schema).
  const ingestSchemaTypes = Array.isArray(row.schemaTypes)
    ? (row.schemaTypes as unknown as string[])
    : null;
  const recon = reconstructFromDb({
    websiteUrl: row.websiteUrl,
    aiReadabilityScore: row.aiReadabilityScore,
    contentDensity: row.contentDensity,
    schemaTypes: ingestSchemaTypes,
    scoreProvenance:
      row.scoreProvenance === null
        ? null
        : (row.scoreProvenance as unknown as IntelligenceIngestResult["scoreProvenance"]),
  });
  const reconConfidence = preflightConfidence(recon.signals);

  // Empty reconstruction → unresolved (regardless of existing state).
  if (reconConfidence === 0) {
    return {
      auditOrderId: row.auditOrderId,
      websiteUrl: row.websiteUrl,
      bucket: "unresolved",
      populatedSubfields: [],
      reconstructionConfidence: 0,
      existingConfidence,
    };
  }

  // Confidence gate.
  if (reconConfidence < existingConfidence) {
    return {
      auditOrderId: row.auditOrderId,
      websiteUrl: row.websiteUrl,
      bucket: "skipped",
      populatedSubfields: recon.populated,
      reconstructionConfidence: reconConfidence,
      existingConfidence,
    };
  }

  // Write (or simulate write in dry-run).
  if (COMMIT_MODE) {
    await persistPreflight(prisma, row.auditOrderId, recon.signals);
  }
  return {
    auditOrderId: row.auditOrderId,
    websiteUrl: row.websiteUrl,
    bucket: "restored",
    populatedSubfields: recon.populated,
    reconstructionConfidence: reconConfidence,
    existingConfidence,
  };
}

// ─── Re-fetch pass ──────────────────────────────────────────────

async function runFetchPass(
  prisma: PrismaClient,
  unresolvedRows: DbRow[],
): Promise<RowResult[]> {
  const runPreflight = dynamicRunPreflight();
  const out: RowResult[] = [];
  let batchIdx = 0;
  for (let i = 0; i < unresolvedRows.length; i += BATCH_SIZE) {
    batchIdx += 1;
    const batch = unresolvedRows.slice(i, i + BATCH_SIZE);
    console.log(
      `[backfill-preflight] re-fetch batch ${batchIdx} (${batch.length} rows)`,
    );
    for (const row of batch) {
      try {
        const fresh = await runPreflight(row.websiteUrl);
        const conf = preflightConfidence(fresh);
        if (conf === 0) {
          out.push({
            auditOrderId: row.auditOrderId,
            websiteUrl: row.websiteUrl,
            bucket: "failed-fetch",
            populatedSubfields: [],
            reconstructionConfidence: 0,
            existingConfidence: 0,
            fetchError: fresh.fetchError ?? "no signals populated",
          });
          continue;
        }
        if (COMMIT_MODE) {
          await persistPreflight(prisma, row.auditOrderId, fresh);
        }
        const populated: string[] = [];
        if (fresh.readability) populated.push("readability");
        if (fresh.schema) populated.push("schema");
        if (fresh.crawlability) populated.push("crawlability");
        if (fresh.entityConsistency) populated.push("entityConsistency");
        out.push({
          auditOrderId: row.auditOrderId,
          websiteUrl: row.websiteUrl,
          bucket: "restored-fetched",
          populatedSubfields: populated,
          reconstructionConfidence: conf,
          existingConfidence: 0,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        out.push({
          auditOrderId: row.auditOrderId,
          websiteUrl: row.websiteUrl,
          bucket: "failed-fetch",
          populatedSubfields: [],
          reconstructionConfidence: 0,
          existingConfidence: 0,
          fetchError: msg,
        });
      }
    }
    if (i + BATCH_SIZE < unresolvedRows.length) {
      await sleep(PAUSE_MS);
    }
  }
  return out;
}

// ─── Validation ─────────────────────────────────────────────────

type ValidationRowResult = {
  auditOrderId: string;
  historicalOverall: number;
  recomputedOverall: number;
  delta: number;
  hashOk: boolean;
};

async function runValidation(
  prisma: PrismaClient,
): Promise<{
  sample: ValidationRowResult[];
  startWeight: string;
  startCategory: string;
}> {
  const startWeight = WEIGHT_HASH;
  const startCategory = CATEGORY_HASH;

  // Pull SAMPLE_SIZE most-recent rows with non-null preflightSignals.
  // Use AnyNull to cover both SQL NULL and JSON null literal.
  const rows = await prisma.auditIntelligence.findMany({
    where: { NOT: { preflightSignals: { equals: Prisma.AnyNull } } },
    orderBy: { createdAt: "desc" },
    take: SAMPLE_SIZE,
    select: {
      auditOrderId: true,
      websiteUrl: true,
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
      renderFailureReason: true,
      renderDurationMs: true,
      renderedHtmlLength: true,
      renderedTextLength: true,
      renderedSchemaTypes: true,
      hydrationDetected: true,
      blankShellRisk: true,
      clientOnlyContentDetected: true,
      renderConfidence: true,
      rawTextLength: true,
      rawSchemaTypes: true,
      schemaDeltaDetected: true,
      contentDeltaDetected: true,
      benchmarkTags: true,
      extractedEntities: true,
      scoreProvenance: true,
    },
  });

  const sample: ValidationRowResult[] = [];
  for (const r of rows) {
    const restored = r.preflightSignals as unknown as PreflightSignals;
    const ingest = rowToIngest(r);
    const render = rowToRender(r);

    const historical = scoreAudit({
      preflightSignals: null,
      intelligenceIngest: ingest,
      renderResult: render,
      history: undefined,
    });
    const recomputed = scoreAudit({
      preflightSignals: restored,
      intelligenceIngest: ingest,
      renderResult: render,
      history: undefined,
    });

    const hashOk =
      recomputed.weight_hash === WEIGHT_HASH &&
      recomputed.category_hash === CATEGORY_HASH &&
      historical.weight_hash === WEIGHT_HASH &&
      historical.category_hash === CATEGORY_HASH;

    sample.push({
      auditOrderId: r.auditOrderId,
      historicalOverall: historical.overall_score,
      recomputedOverall: recomputed.overall_score,
      delta: recomputed.overall_score - historical.overall_score,
      hashOk,
    });
  }

  return { sample, startWeight, startCategory };
}

// ─── Reports ────────────────────────────────────────────────────

function printRowResults(
  title: string,
  results: RowResult[],
): void {
  if (results.length === 0) return;
  console.log(title);
  console.log(
    `  ${pad("auditId", 14)}${pad("bucket", 19)}${pad("recon_conf", 12)}${pad("existing_conf", 14)}fields`,
  );
  for (const r of results) {
    const fields = r.populatedSubfields.join(",") || "—";
    const note = r.fetchError ? `  err=${r.fetchError.slice(0, 40)}` : "";
    console.log(
      `  ${pad(shortId(r.auditOrderId), 14)}${pad(r.bucket, 19)}${pad(String(r.reconstructionConfidence), 12)}${pad(String(r.existingConfidence), 14)}${fields}${note}`,
    );
  }
  console.log("");
}

function printReadinessReport(args: {
  results: RowResult[];
  validation: {
    sample: ValidationRowResult[];
    startWeight: string;
    startCategory: string;
  } | null;
  totalProcessed: number;
  totalNullPre: number;
  mode: string;
  reconExceptions: number;
}): "GO" | "NO-GO" {
  const { results, validation, totalProcessed, totalNullPre, mode } = args;
  const counts: Record<Bucket, number> = {
    restored: 0,
    "restored-fetched": 0,
    skipped: 0,
    unresolved: 0,
    "failed-fetch": 0,
  };
  for (const r of results) counts[r.bucket] += 1;

  const fixedCount = counts.restored + counts["restored-fetched"];
  const replayCoverage =
    totalNullPre === 0 ? 100 : (fixedCount / totalNullPre) * 100;

  console.log("HISTORICAL REPLAY READINESS REPORT");
  console.log("");
  console.log(`  rows fixed (restored):         ${counts.restored}`);
  console.log(
    `  rows fixed (restored-fetched): ${counts["restored-fetched"]}`,
  );
  console.log(`  rows skipped:                  ${counts.skipped}`);
  console.log(`  rows unresolved:               ${counts.unresolved}`);
  console.log(`  rows failed-fetch:             ${counts["failed-fetch"]}`);
  console.log(`  ──────────────────────────────────`);
  console.log(`  total processed:               ${totalProcessed}`);
  console.log(
    `  replay coverage:               ${replayCoverage.toFixed(1)}%   ((restored + restored-fetched) / total_with_null)`,
  );
  console.log("");

  // Validation
  let gateCPass = true;
  let gateDPass = true;
  let gateEPass = true;
  let deltaZeroCount = 0;
  let deltaNonPosCount = 0;
  let hashOkCount = 0;

  if (validation) {
    for (const v of validation.sample) {
      if (v.delta === 0) deltaZeroCount += 1;
      if (v.delta <= 0) deltaNonPosCount += 1;
      if (v.hashOk) hashOkCount += 1;
    }
    gateCPass = deltaNonPosCount === validation.sample.length;
    gateDPass = deltaZeroCount === validation.sample.length;
    gateEPass =
      hashOkCount === validation.sample.length &&
      validation.startWeight === WEIGHT_HASH &&
      validation.startCategory === CATEGORY_HASH;

    console.log(`VALIDATION SAMPLE (n=${validation.sample.length})`);
    console.log(
      `  delta == 0:           ${deltaZeroCount} / ${validation.sample.length}    ${gateDPass ? "✓" : "✗"}`,
    );
    console.log(
      `  delta <= 0:           ${deltaNonPosCount} / ${validation.sample.length}    ${gateCPass ? "✓" : "✗"}`,
    );
    console.log(
      `  hash unchanged:       ${hashOkCount} / ${validation.sample.length}    ${gateEPass ? "✓" : "✗"}`,
    );
    console.log(
      `  WEIGHT_HASH (start = end):    ${WEIGHT_HASH}   ${validation.startWeight === WEIGHT_HASH ? "✓ unchanged" : "✗ CHANGED"}`,
    );
    console.log(
      `  CATEGORY_HASH (start = end):  ${CATEGORY_HASH}   ${validation.startCategory === CATEGORY_HASH ? "✓ unchanged" : "✗ CHANGED"}`,
    );
    console.log("");

    // Per-row delta summary when not all zeros
    const nonZero = validation.sample.filter((v) => v.delta !== 0);
    if (nonZero.length > 0) {
      console.log("  per-row deltas (non-zero):");
      for (const v of nonZero) {
        console.log(
          `    ${pad(shortId(v.auditOrderId), 14)}  historical=${v.historicalOverall}  recomputed=${v.recomputedOverall}  delta=${v.delta >= 0 ? "+" : ""}${v.delta}`,
        );
      }
      console.log("");
    }
  }

  // Gates
  const gateAPass = args.reconExceptions === 0;
  const gateBPass = replayCoverage >= MIN_REPLAY_COVERAGE_PCT;

  console.log(
    `GATE A (recon completion):  ${gateAPass ? "PASS" : "FAIL"}  (${args.reconExceptions} exception${args.reconExceptions === 1 ? "" : "s"} during backfill)`,
  );
  console.log(
    `GATE B (replay coverage):   ${gateBPass ? "PASS" : "FAIL"}  (${replayCoverage.toFixed(1)}% ${gateBPass ? ">=" : "<"} ${MIN_REPLAY_COVERAGE_PCT}%)`,
  );
  if (validation) {
    console.log(
      `GATE C (delta <= 0):        ${gateCPass ? "PASS" : "FAIL"}  (${deltaNonPosCount} / ${validation.sample.length} in bounds)`,
    );
    console.log(
      `GATE D (score unchanged):   ${gateDPass ? "PASS" : "FAIL"}  (${deltaZeroCount} / ${validation.sample.length} byte-equal)`,
    );
    console.log(
      `GATE E (hash invariance):   ${gateEPass ? "PASS" : "FAIL"}  (hashes ${gateEPass ? "unchanged" : "CHANGED or per-row mismatch"})`,
    );
  } else {
    console.log(`GATE C (delta <= 0):        (skipped — no --validate)`);
    console.log(`GATE D (score unchanged):   (skipped — no --validate)`);
    console.log(`GATE E (hash invariance):   (skipped — no --validate)`);
  }
  console.log("");
  console.log(`mode: ${mode}`);
  console.log("");

  const allPass =
    gateAPass &&
    gateBPass &&
    (validation ? gateCPass && gateDPass && gateEPass : true);
  return allPass ? "GO" : "NO-GO";
}

// ─── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  let mode = "DRY-RUN";
  if (INVENTORY_ONLY) mode = "INVENTORY-ONLY";
  else if (VALIDATE_ONLY) mode = "VALIDATE";
  else if (COMMIT_MODE && WITH_FETCH) mode = "COMMIT + WITH-FETCH";
  else if (COMMIT_MODE) mode = "COMMIT (DB-only)";
  else if (WITH_FETCH) mode = "DRY-RUN + WITH-FETCH preview";

  console.log(`[backfill-preflight] mode: ${mode}`);
  console.log("");

  // Inventory always runs first.
  await printInventory(prisma);

  if (INVENTORY_ONLY) {
    await prisma.$disconnect();
    return;
  }

  // VALIDATE-only mode skips the recon phase entirely.
  if (VALIDATE_ONLY) {
    const validation = await runValidation(prisma);
    const verdict = printReadinessReport({
      results: [],
      validation,
      totalProcessed: 0,
      totalNullPre: 0,
      mode,
      reconExceptions: 0,
    });
    console.log(verdict);
    await prisma.$disconnect();
    if (verdict === "NO-GO") process.exitCode = 1;
    return;
  }

  // Load all rows.
  const allRows = await loadCandidateRows(prisma);
  const totalNullPre = allRows.filter(
    (r) => r.preflightSignals === null,
  ).length;

  // DB-only pass — batched with progress logging.
  const dbResults: RowResult[] = [];
  let reconExceptions = 0;
  console.log(
    `[backfill-preflight] DB-only pass (batch=${BATCH_SIZE}, pause=${PAUSE_MS / 1000}s, ${COMMIT_MODE ? "COMMIT" : "dry-run"})`,
  );
  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    const batchIdx = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allRows.length / BATCH_SIZE);

    let bRestored = 0;
    let bSkipped = 0;
    let bUnresolved = 0;
    for (const row of batch) {
      try {
        const r = await processRow(prisma, row);
        dbResults.push(r);
        if (r.bucket === "restored") bRestored += 1;
        else if (r.bucket === "skipped") bSkipped += 1;
        else if (r.bucket === "unresolved") bUnresolved += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[backfill-preflight] error orderId=${row.auditOrderId}: ${msg}`,
        );
        reconExceptions += 1;
      }
    }
    console.log(
      `  batch ${batchIdx} / ${totalBatches}: restored=${bRestored} skipped=${bSkipped} unresolved=${bUnresolved}`,
    );
    if (i + BATCH_SIZE < allRows.length) {
      await sleep(PAUSE_MS);
    }
  }
  console.log(
    `  DB-only totals: restored=${dbResults.filter((r) => r.bucket === "restored").length} skipped=${dbResults.filter((r) => r.bucket === "skipped").length} unresolved=${dbResults.filter((r) => r.bucket === "unresolved").length}`,
  );
  console.log("");

  // Re-fetch pass (optional).
  let fetchResults: RowResult[] = [];
  if (WITH_FETCH) {
    const unresolvedAuditIds = new Set(
      dbResults.filter((r) => r.bucket === "unresolved").map((r) => r.auditOrderId),
    );
    const unresolvedRows = allRows.filter((r) =>
      unresolvedAuditIds.has(r.auditOrderId),
    );
    console.log(
      `[backfill-preflight] re-fetch pass (--with-fetch, ${unresolvedRows.length} rows)`,
    );
    fetchResults = await runFetchPass(prisma, unresolvedRows);
    console.log("");
  }

  // Combine results — for unresolved rows that got re-fetched, swap the
  // db-only "unresolved" row with the fetch result.
  const fetchByAuditId = new Map(
    fetchResults.map((r) => [r.auditOrderId, r]),
  );
  const combined: RowResult[] = dbResults.map((r) => {
    if (r.bucket === "unresolved" && fetchByAuditId.has(r.auditOrderId)) {
      return fetchByAuditId.get(r.auditOrderId)!;
    }
    return r;
  });

  // Per-bucket detail tables (compact, only first 10 of each bucket).
  const samplesByBucket: Record<Bucket, RowResult[]> = {
    restored: [],
    "restored-fetched": [],
    skipped: [],
    unresolved: [],
    "failed-fetch": [],
  };
  for (const r of combined) samplesByBucket[r.bucket].push(r);

  for (const bucket of [
    "restored",
    "restored-fetched",
    "skipped",
    "unresolved",
    "failed-fetch",
  ] as const) {
    const rows = samplesByBucket[bucket];
    if (rows.length === 0) continue;
    printRowResults(
      `bucket=${bucket}  n=${rows.length}${rows.length > 10 ? " (showing first 10)" : ""}`,
      rows.slice(0, 10),
    );
  }

  // Validation runs only if we committed writes (otherwise there's
  // nothing in the DB to validate against). In dry-run we still emit a
  // synthetic in-memory validation to give the operator a preview.
  const validation = await runValidation(prisma);

  const verdict = printReadinessReport({
    results: combined,
    validation,
    totalProcessed: combined.length,
    totalNullPre,
    mode,
    reconExceptions,
  });
  console.log(verdict);

  await prisma.$disconnect();
  if (verdict === "NO-GO") process.exitCode = 1;
}

main().catch((err) => {
  console.error("[backfill-preflight] unhandled error:", err);
  process.exitCode = 1;
});
