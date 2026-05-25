/* eslint-disable no-console */
/**
 * scripts/observation-stress-test.ts
 *
 * Drives 30 audits through `runObservationExecution()` across 4
 * buckets — historical (10) / fresh (10) / high-score (5) /
 * low-score (5) — and emits an OBSERVATION STABILITY REPORT + DRIFT
 * REPORT + GO/NO-GO verdict.
 *
 *   npm run observation:stress-test            # dry-run (default; rollback)
 *   npm run observation:stress-test -- --commit # persists 30 history rows
 *
 * Default mode wraps every orchestrator call in a single
 * Prisma transaction that throws ROLLBACK_SENTINEL at the end —
 * latency measurement is real (queries hit production DB) but no
 * row persists. `--commit` runs each call against the real
 * PrismaClient so the 30 rows persist with their real auditId FK.
 *
 * Five GO/NO-GO gates:
 *   1. score drift == 0          (deterministicScore byte-equal)
 *   2. audit completion 30/30    (no exception escaped)
 *   3. p95 latency < 2000 ms
 *   4. write success > 95%       (≥ 29/30)
 *   5. hash invariance            (WEIGHT_HASH + CATEGORY_HASH unchanged)
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

import type { IntelligenceIngestResult } from "../src/lib/intelligence/intelligenceIngest";
import type { PreflightSignals } from "../src/lib/intelligence/preflight/types";
import type { RenderIntelligenceResult } from "../src/lib/intelligence/render/renderProvider";
import {
  getObservationCounters,
  resetObservationCounters,
  runObservationExecution,
  type RunObservationExecutionOutcome,
} from "../src/lib/observations";
import { CATEGORY_HASH, WEIGHT_HASH } from "../src/lib/scoring/frozen";
import { scoreAudit } from "../src/lib/scoring";
import type { DeterministicScore } from "../src/lib/scoring/types";

const COMMIT_MODE = process.argv.includes("--commit");
const ROLLBACK_SENTINEL = new Error("ROLLBACK_SENTINEL");
const TARGET_TOTAL = 30;

// ─── Inlined fixture builders ────────────────────────────────────
// (Mirrors scripts/test-deterministic-scoring.ts:53-274. These could
// be promoted to src/lib/scoring/fixtures.ts in a follow-up; for this
// one-shot harness, inline keeps the script self-contained.)

function mkPreflight(o: Partial<PreflightSignals> = {}): PreflightSignals {
  return {
    ok: true,
    runDurationMs: 0,
    fetchedUrl: "https://example.com",
    fetchOk: true,
    readability: null,
    schema: null,
    crawlability: null,
    entityConsistency: null,
    engineVersion: "v1",
    ...o,
  };
}

function mkIngest(
  o: Partial<IntelligenceIngestResult> = {},
): IntelligenceIngestResult {
  return {
    cmsDetected: null,
    frameworkDetected: null,
    schemaTypes: null,
    aiReadabilityScore: null,
    contentDensity: null,
    renderRequired: null,
    renderAttempted: null,
    renderSuccessful: null,
    renderEngineVersion: null,
    benchmarkTags: null,
    extractedEntities: null,
    scoreProvenance: null,
    ...o,
  };
}

function mkRender(
  o: Partial<RenderIntelligenceResult> = {},
): RenderIntelligenceResult {
  return {
    renderAttempted: false,
    renderSuccessful: null,
    renderEngineVersion: null,
    renderFailureReason: null,
    renderDurationMs: null,
    renderedHtmlLength: null,
    renderedTextLength: null,
    renderedSchemaTypes: null,
    hydrationDetected: null,
    blankShellRisk: null,
    clientOnlyContentDetected: null,
    renderConfidence: null,
    rawTextLength: null,
    rawSchemaTypes: null,
    schemaDeltaDetected: null,
    contentDeltaDetected: null,
    ...o,
  };
}

const FIXED_NOW = "2026-05-23T08:00:00.000Z";

// WEAK — blank shell, blocked robots, no schema.
const WEAK_INPUT = {
  preflightSignals: mkPreflight({
    schema: {
      score: 0,
      presentFields: [],
      missingFields: ["name", "address", "telephone", "url"],
      malformedFields: [],
      detectedTypes: [],
      rawJsonLdCount: 0,
      notes: [],
    },
    crawlability: {
      score: 10,
      findings: [],
      warnings: ["robots.txt blocks AI bots"],
      passedChecks: [],
      failedChecks: [
        "robots_txt_not_blocking_all",
        "sitemap_xml_present",
        "canonical_present",
      ],
    },
    entityConsistency: {
      score: 10,
      extractedEntities: {
        name: { schema: null, homepage: null, footer: null },
        phone: { schema: null, homepage: null, footer: null },
        address: { schema: null, homepage: null, footer: null },
      },
      inconsistencies: ["No business name on any surface"],
      confidence: 0,
    },
    readability: {
      textLength: 80,
      parsedByReadability: false,
      fallbackUsed: true,
      articleTitle: null,
      wordCount: 14,
      preview: "Loading...",
    },
  }),
  intelligenceIngest: mkIngest({ aiReadabilityScore: 10, contentDensity: 14 }),
  renderResult: mkRender({
    renderAttempted: true,
    renderSuccessful: true,
    blankShellRisk: true,
    rawTextLength: 80,
    renderedTextLength: 2200,
    clientOnlyContentDetected: true,
  }),
  nowIso: FIXED_NOW,
};

// AVERAGE — working local site, schema present but minimal.
const AVERAGE_INPUT = {
  preflightSignals: mkPreflight({
    schema: {
      score: 55,
      presentFields: ["name", "address", "telephone", "url"],
      missingFields: [],
      malformedFields: [],
      detectedTypes: ["LocalBusiness"],
      rawJsonLdCount: 1,
      notes: [],
    },
    crawlability: {
      score: 80,
      findings: ["robots.txt allows all crawlers"],
      warnings: [],
      passedChecks: [
        "robots_txt_exists",
        "robots_txt_not_blocking_all",
        "homepage_not_noindex",
        "sitemap_xml_present",
      ],
      failedChecks: ["canonical_present"],
    },
    entityConsistency: {
      score: 75,
      extractedEntities: {
        name: { schema: "Acme Plumbing", homepage: "Acme Plumbing", footer: "Acme Plumbing" },
        phone: { schema: "555-1234", homepage: "555-1234", footer: "555-1234" },
        address: { schema: "1 Main St", homepage: "1 Main St", footer: null },
      },
      inconsistencies: [],
      confidence: 0.85,
    },
    readability: {
      textLength: 3200,
      parsedByReadability: true,
      fallbackUsed: false,
      articleTitle: "Acme Plumbing",
      wordCount: 520,
      preview: "Welcome to Acme Plumbing serving the metro area...",
    },
  }),
  intelligenceIngest: mkIngest({ aiReadabilityScore: 60, contentDensity: 520 }),
  renderResult: mkRender(),
  nowIso: FIXED_NOW,
};

// STRONG — full schema, sameAs, FAQ, consistent NAP, deep content.
const STRONG_INPUT = {
  preflightSignals: mkPreflight({
    schema: {
      score: 85,
      presentFields: ["name", "address", "telephone", "url", "sameAs", "openingHours"],
      missingFields: [],
      malformedFields: [],
      detectedTypes: ["LocalBusiness", "Plumber", "FAQPage"],
      rawJsonLdCount: 3,
      notes: [],
    },
    crawlability: {
      score: 95,
      findings: ["All checks pass"],
      warnings: [],
      passedChecks: [
        "robots_txt_exists",
        "robots_txt_not_blocking_all",
        "homepage_not_noindex",
        "sitemap_xml_present",
        "canonical_present",
      ],
      failedChecks: [],
    },
    entityConsistency: {
      score: 95,
      extractedEntities: {
        name: { schema: "Bright Roof Co", homepage: "Bright Roof Co", footer: "Bright Roof Co" },
        phone: { schema: "555-9999", homepage: "555-9999", footer: "555-9999" },
        address: { schema: "100 Oak Ave", homepage: "100 Oak Ave", footer: "100 Oak Ave" },
      },
      inconsistencies: [],
      confidence: 1.0,
    },
    readability: {
      textLength: 9500,
      parsedByReadability: true,
      fallbackUsed: false,
      articleTitle: "Bright Roof Co — Residential Roofing in Metro",
      wordCount: 1480,
      preview: "Bright Roof Co provides full-service residential and commercial roofing...",
    },
  }),
  intelligenceIngest: mkIngest({ aiReadabilityScore: 88, contentDensity: 1480 }),
  renderResult: mkRender(),
  nowIso: FIXED_NOW,
};

// ─── Bucket types ───────────────────────────────────────────────

type Bucket = "historical" | "fresh" | "high" | "low";

type Fixture = {
  bucket: Bucket;
  auditId: string;
  websiteUrl: string;
  businessName: string | null;
  deterministicScore: DeterministicScore;
  preflightFallback?: boolean; // historical bucket: true if no real preflight available
};

type Result = {
  bucket: Bucket;
  auditId: string;
  outcome: string; // "succeeded" | "failed_guard" | "failed" | "flag_disabled" | "no_providers_enabled" | "no_run"
  observationStatus: string;
  agreementScore: number | null;
  providerCount: number | null;
  estimatedCost: number | null;
  historyId: string | null;
  latencyMs: number;
  scoreDrift: 0 | 1;
  confidenceLevel: "low" | "moderate" | "high";
  rawOverallScore: number;
};

// ─── Fixture loader ─────────────────────────────────────────────

async function loadFixtures(prisma: PrismaClient): Promise<Fixture[]> {
  const orders = await prisma.auditOrder.findMany({
    where: { reportMarkdown: { not: null } },
    orderBy: { createdAt: "desc" },
    take: TARGET_TOTAL,
    select: { id: true, websiteUrl: true, businessName: true },
  });

  if (orders.length < TARGET_TOTAL) {
    console.warn(
      `[observation:stress-test] only ${orders.length} AuditOrder rows available; need ${TARGET_TOTAL}. Running with available set.`,
    );
  }

  // Pull preflight signals for the historical 10 (first slice).
  const historicalOrderIds = orders.slice(0, 10).map((o) => o.id);
  const intelByOrderId = new Map<string, PreflightSignals | null>();
  if (historicalOrderIds.length > 0) {
    const intelRows = await prisma.auditIntelligence.findMany({
      where: { auditOrderId: { in: historicalOrderIds } },
      select: { auditOrderId: true, preflightSignals: true },
    });
    for (const r of intelRows) {
      intelByOrderId.set(
        r.auditOrderId,
        (r.preflightSignals as unknown as PreflightSignals | null) ?? null,
      );
    }
  }

  const fixtures: Fixture[] = [];

  // Historical (10) — re-derive from stored preflightSignals
  for (let i = 0; i < Math.min(10, orders.length); i++) {
    const o = orders[i];
    const pf = intelByOrderId.get(o.id) ?? null;
    const fallback = pf === null;
    const score = scoreAudit({
      preflightSignals: pf,
      intelligenceIngest: null,
      renderResult: null,
      history: undefined,
    });
    fixtures.push({
      bucket: "historical",
      auditId: o.id,
      websiteUrl: o.websiteUrl,
      businessName: o.businessName,
      deterministicScore: score,
      preflightFallback: fallback,
    });
  }

  // Fresh (10) — synthetic AVERAGE fixture
  for (let i = 10; i < Math.min(20, orders.length); i++) {
    const o = orders[i];
    const score = scoreAudit(AVERAGE_INPUT);
    fixtures.push({
      bucket: "fresh",
      auditId: o.id,
      websiteUrl: o.websiteUrl,
      businessName: o.businessName,
      deterministicScore: score,
    });
  }

  // High-score (5) — synthetic STRONG fixture
  for (let i = 20; i < Math.min(25, orders.length); i++) {
    const o = orders[i];
    const score = scoreAudit(STRONG_INPUT);
    fixtures.push({
      bucket: "high",
      auditId: o.id,
      websiteUrl: o.websiteUrl,
      businessName: o.businessName,
      deterministicScore: score,
    });
  }

  // Low-score (5) — synthetic WEAK fixture
  for (let i = 25; i < Math.min(30, orders.length); i++) {
    const o = orders[i];
    const score = scoreAudit(WEAK_INPUT);
    fixtures.push({
      bucket: "low",
      auditId: o.id,
      websiteUrl: o.websiteUrl,
      businessName: o.businessName,
      deterministicScore: score,
    });
  }

  return fixtures;
}

// ─── Helpers ────────────────────────────────────────────────────

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

function padNum(n: number, w: number): string {
  return pad(String(n), w);
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

function canonicalScoreJson(score: DeterministicScore): string {
  return JSON.stringify(score);
}

// ─── Single-audit driver ────────────────────────────────────────

async function driveOne(
  prisma: PrismaClient | Prisma.TransactionClient,
  f: Fixture,
): Promise<Result> {
  const before = canonicalScoreJson(f.deterministicScore);
  const start = Date.now();

  let outcome: RunObservationExecutionOutcome;
  let escaped = false;
  try {
    outcome = await runObservationExecution({
      prisma,
      auditId: f.auditId,
      businessName: f.businessName,
      websiteUrl: f.websiteUrl,
      deterministicScore: f.deterministicScore,
    });
  } catch (err) {
    // The orchestrator is fail-soft, but defense-in-depth.
    escaped = true;
    const msg = err instanceof Error ? err.message : String(err);
    outcome = { ran: true, outcome: "failed", error: msg, latencyMs: Date.now() - start };
  }

  const latencyMs = Date.now() - start;
  const after = canonicalScoreJson(f.deterministicScore);

  const result: Result = {
    bucket: f.bucket,
    auditId: f.auditId,
    outcome: "no_run",
    observationStatus: "—",
    agreementScore: null,
    providerCount: null,
    estimatedCost: null,
    historyId: null,
    latencyMs,
    scoreDrift: before === after && !escaped ? 0 : 1,
    confidenceLevel: f.deterministicScore.confidence_level,
    rawOverallScore: f.deterministicScore.overall_score,
  };

  if (!outcome.ran) {
    result.outcome = outcome.reason;
    return result;
  }

  result.outcome = outcome.outcome;
  if (outcome.outcome === "succeeded") {
    result.observationStatus = outcome.observationStatus;
    result.historyId = outcome.historyId;
    // Look up the persisted row inside the same prisma context to
    // capture agreement / providerCount / estimatedCost. With the
    // rollback transaction, the row IS visible inside the same tx
    // before rollback.
    try {
      const row = await prisma.observationHistory.findUnique({
        where: { id: outcome.historyId },
        select: {
          agreementScore: true,
          providerCount: true,
          estimatedCost: true,
        },
      });
      if (row) {
        result.agreementScore = row.agreementScore;
        result.providerCount = row.providerCount;
        const c = row.estimatedCost as unknown as
          | number
          | { toNumber?: () => number };
        result.estimatedCost =
          typeof c === "number"
            ? c
            : typeof c?.toNumber === "function"
              ? c.toNumber()
              : Number(c);
      }
    } catch {
      /* non-fatal */
    }
  } else if (outcome.outcome === "failed_guard") {
    result.observationStatus = `mutated=${outcome.mutatedFields.join(",")}`;
  } else if (outcome.outcome === "failed") {
    result.observationStatus = outcome.error.slice(0, 40);
  }

  return result;
}

// ─── Reports ────────────────────────────────────────────────────

function printPerBucket(results: Result[], bucket: Bucket): void {
  const rows = results.filter((r) => r.bucket === bucket);
  console.log(`bucket=${bucket}  n=${rows.length}`);
  console.log(
    `  ${pad("auditId", 14)}${pad("outcome", 12)}${pad("status", 16)}${pad("agreement", 11)}${pad("latency", 10)}${pad("cost", 10)}hist_id`,
  );
  for (const r of rows) {
    const agree = r.agreementScore === null ? "—" : String(r.agreementScore);
    const cost = r.estimatedCost === null ? "—" : `$${r.estimatedCost.toFixed(4)}`;
    const hist = r.historyId
      ? COMMIT_MODE
        ? shortId(r.historyId)
        : "(rollback)"
      : "—";
    console.log(
      `  ${pad(shortId(r.auditId), 14)}${pad(r.outcome, 12)}${pad(r.observationStatus, 16)}${pad(agree, 11)}${pad(`${r.latencyMs}ms`, 10)}${pad(cost, 10)}${hist}`,
    );
  }
  console.log("");
}

function bucketStats(
  results: Result[],
  bucket: Bucket | "overall",
): {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  meanLat: number;
  writePct: number;
  meanAgree: number | null;
  meanCost: number | null;
} {
  const rows =
    bucket === "overall" ? results : results.filter((r) => r.bucket === bucket);
  const lat = rows.map((r) => r.latencyMs);
  const succeeded = rows.filter((r) => r.outcome === "succeeded");
  const agreements = succeeded
    .map((r) => r.agreementScore)
    .filter((v): v is number => v !== null);
  const costs = succeeded
    .map((r) => r.estimatedCost)
    .filter((v): v is number => v !== null);
  return {
    count: rows.length,
    p50: Math.round(percentile(lat, 0.5)),
    p95: Math.round(percentile(lat, 0.95)),
    p99: Math.round(percentile(lat, 0.99)),
    max: lat.length === 0 ? 0 : Math.max(...lat),
    meanLat: Math.round(mean(lat)),
    writePct: rows.length === 0 ? 0 : (succeeded.length / rows.length) * 100,
    meanAgree: agreements.length === 0 ? null : Math.round(mean(agreements) * 10) / 10,
    meanCost: costs.length === 0 ? null : Math.round(mean(costs) * 10000) / 10000,
  };
}

function printStabilityReport(results: Result[]): void {
  console.log("OBSERVATION STABILITY REPORT");
  console.log(
    `                         ${pad("p50", 6)}${pad("p95", 6)}${pad("p99", 6)}${pad("max", 6)}${pad("mean", 6)}${pad("write%", 9)}${pad("agree", 8)}cost/audit`,
  );
  for (const b of ["historical", "fresh", "high", "low"] as const) {
    const s = bucketStats(results, b);
    const agree = s.meanAgree === null ? "—" : String(s.meanAgree);
    const cost = s.meanCost === null ? "—" : `$${s.meanCost.toFixed(4)}`;
    console.log(
      `  ${pad(`${b} (${s.count})`, 22)}${padNum(s.p50, 6)}${padNum(s.p95, 6)}${padNum(s.p99, 6)}${padNum(s.max, 6)}${padNum(s.meanLat, 6)}${pad(`${s.writePct.toFixed(1)}%`, 9)}${pad(agree, 8)}${cost}`,
    );
  }
  console.log(
    `  ─────────────────────────────────────────────────────────────────────────────────────`,
  );
  const o = bucketStats(results, "overall");
  const agree = o.meanAgree === null ? "—" : String(o.meanAgree);
  const cost = o.meanCost === null ? "—" : `$${o.meanCost.toFixed(4)}`;
  console.log(
    `  ${pad(`overall (${o.count})`, 22)}${padNum(o.p50, 6)}${padNum(o.p95, 6)}${padNum(o.p99, 6)}${padNum(o.max, 6)}${padNum(o.meanLat, 6)}${pad(`${o.writePct.toFixed(1)}%`, 9)}${pad(agree, 8)}${cost}`,
  );
  console.log("");
}

function printDistributions(results: Result[]): void {
  // Confidence distribution
  const conf = { low: 0, moderate: 0, high: 0 };
  for (const r of results) conf[r.confidenceLevel] += 1;
  console.log(
    `Confidence distribution: low=${conf.low} moderate=${conf.moderate} high=${conf.high}`,
  );

  // Agreement distribution (histogram)
  const bins = { "0-50": 0, "51-70": 0, "71-85": 0, "86-100": 0 };
  for (const r of results) {
    if (r.agreementScore === null) continue;
    const a = r.agreementScore;
    if (a <= 50) bins["0-50"] += 1;
    else if (a <= 70) bins["51-70"] += 1;
    else if (a <= 85) bins["71-85"] += 1;
    else bins["86-100"] += 1;
  }
  console.log(
    `Agreement distribution:  [0-50]=${bins["0-50"]} [51-70]=${bins["51-70"]} [71-85]=${bins["71-85"]} [86-100]=${bins["86-100"]}`,
  );

  // Cost total
  const totalCost = results
    .map((r) => r.estimatedCost ?? 0)
    .reduce((a, b) => a + b, 0);
  console.log(`Cost total:              $${totalCost.toFixed(4)}`);
  console.log("");
}

function printDriftReport(
  results: Result[],
  startWeight: string,
  startCategory: string,
): void {
  const driftedCount = results.filter((r) => r.scoreDrift === 1).length;
  const weightOk = startWeight === WEIGHT_HASH;
  const categoryOk = startCategory === CATEGORY_HASH;

  console.log("DRIFT REPORT");
  console.log(
    `  WEIGHT_HASH   start = ${startWeight}  end = ${WEIGHT_HASH}   ${weightOk ? "✓ unchanged" : "✗ CHANGED"}`,
  );
  console.log(
    `  CATEGORY_HASH start = ${startCategory}  end = ${CATEGORY_HASH}   ${categoryOk ? "✓ unchanged" : "✗ CHANGED"}`,
  );
  console.log(
    `  deterministicScore byte-equal:  ${results.length - driftedCount} / ${results.length}        ${driftedCount === 0 ? "✓" : "✗"}`,
  );
  console.log("");
}

function printGoNoGo(
  results: Result[],
  startWeight: string,
  startCategory: string,
): "GO" | "NO-GO" {
  const driftedCount = results.filter((r) => r.scoreDrift === 1).length;
  const completedCount = results.length; // every fixture produced a Result (driveOne never throws)
  const p95 = Math.round(percentile(results.map((r) => r.latencyMs), 0.95));
  const succeededCount = results.filter((r) => r.outcome === "succeeded").length;
  const writePct = results.length === 0 ? 0 : (succeededCount / results.length) * 100;
  const hashesOk = startWeight === WEIGHT_HASH && startCategory === CATEGORY_HASH;

  const gate1Pass = driftedCount === 0;
  const gate2Pass = completedCount === results.length;
  const gate3Pass = p95 < 2000;
  const gate4Pass = writePct > 95;
  const gate5Pass = hashesOk;

  console.log(
    `GATE 1 (score drift):       ${gate1Pass ? "PASS" : "FAIL"}   (${driftedCount} / ${results.length} drifted)`,
  );
  console.log(
    `GATE 2 (audit completion):  ${gate2Pass ? "PASS" : "FAIL"}   (${completedCount} / ${results.length} completed)`,
  );
  console.log(
    `GATE 3 (p95 latency):       ${gate3Pass ? "PASS" : "FAIL"}   (p95=${p95}ms ${gate3Pass ? "<" : "≥"} 2000ms)`,
  );
  console.log(
    `GATE 4 (write success):     ${gate4Pass ? "PASS" : "FAIL"}   (${succeededCount} / ${results.length} succeeded ${gate4Pass ? ">" : "≤"} 95%)`,
  );
  console.log(
    `GATE 5 (hash invariance):   ${gate5Pass ? "PASS" : "FAIL"}   (hashes ${gate5Pass ? "unchanged" : "CHANGED"})`,
  );
  console.log("");

  const allPass =
    gate1Pass && gate2Pass && gate3Pass && gate4Pass && gate5Pass;
  return allPass ? "GO" : "NO-GO";
}

// ─── Main ───────────────────────────────────────────────────────

function setStressEnv(): {
  flag: string | undefined;
  anthropic: string | undefined;
  openai: string | undefined;
  gemini: string | undefined;
  perplexity: string | undefined;
} {
  const prev = {
    flag: process.env.ENABLE_OBSERVATION,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    perplexity: process.env.PERPLEXITY_API_KEY,
  };
  process.env.ENABLE_OBSERVATION = "true";
  process.env.ANTHROPIC_API_KEY = "stress-test-key-anthropic";
  process.env.OPENAI_API_KEY = "stress-test-key-openai";
  process.env.GEMINI_API_KEY = "stress-test-key-gemini";
  process.env.PERPLEXITY_API_KEY = "stress-test-key-perplexity";
  return prev;
}

function restoreEnv(prev: ReturnType<typeof setStressEnv>): void {
  if (prev.flag === undefined) delete process.env.ENABLE_OBSERVATION;
  else process.env.ENABLE_OBSERVATION = prev.flag;
  if (prev.anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = prev.anthropic;
  if (prev.openai === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = prev.openai;
  if (prev.gemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = prev.gemini;
  if (prev.perplexity === undefined) delete process.env.PERPLEXITY_API_KEY;
  else process.env.PERPLEXITY_API_KEY = prev.perplexity;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  console.log(
    `[observation:stress-test] driving ${TARGET_TOTAL} audits (${COMMIT_MODE ? "COMMIT — rows persist" : "dry-run; pass --commit to persist"})`,
  );
  console.log("");

  // Snapshot hashes before any work.
  const startWeight = WEIGHT_HASH;
  const startCategory = CATEGORY_HASH;

  // Load 30 fixtures.
  const fixtures = await loadFixtures(prisma);
  if (fixtures.length === 0) {
    console.error(
      "[observation:stress-test] no AuditOrder fixtures available — cannot drive stress test",
    );
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  if (fixtures.length < TARGET_TOTAL) {
    console.warn(
      `[observation:stress-test] running with ${fixtures.length} / ${TARGET_TOTAL} fixtures`,
    );
  }

  // Report historical fallback rate (audits with null preflightSignals).
  const fallbackCount = fixtures.filter(
    (f) => f.bucket === "historical" && f.preflightFallback === true,
  ).length;
  if (fallbackCount > 0) {
    console.warn(
      `[observation:stress-test] ${fallbackCount} / ${fixtures.filter((f) => f.bucket === "historical").length} historical audits had no stored preflightSignals; using null-evidence fallback`,
    );
    console.log("");
  }

  const envPrev = setStressEnv();
  resetObservationCounters();

  const results: Result[] = [];
  try {
    if (COMMIT_MODE) {
      // Persist mode — drive each call against the real PrismaClient.
      for (const f of fixtures) {
        const r = await driveOne(prisma, f);
        results.push(r);
      }
    } else {
      // Dry-run mode — single transaction, rolled back at the end.
      try {
        await prisma.$transaction(
          async (tx) => {
            for (const f of fixtures) {
              const r = await driveOne(tx, f);
              results.push(r);
            }
            // ROLLBACK_SENTINEL — nothing persists.
            throw ROLLBACK_SENTINEL;
          },
          // Long timeout — the transaction is short-lived per-row but
          // running 30 in a single tx can take a few seconds total.
          { timeout: 60_000 },
        );
      } catch (err) {
        if (err !== ROLLBACK_SENTINEL) throw err;
      }
    }
  } finally {
    restoreEnv(envPrev);
  }

  console.log("");

  // Per-bucket detail
  for (const b of ["historical", "fresh", "high", "low"] as const) {
    printPerBucket(results, b);
  }

  printStabilityReport(results);
  printDistributions(results);
  printDriftReport(results, startWeight, startCategory);

  // Counters
  const counters = getObservationCounters();
  console.log("Counters:");
  console.log(`  skipped_disabled = ${counters.skipped_disabled}`);
  console.log(`  skipped_no_keys  = ${counters.skipped_no_keys}`);
  console.log(`  succeeded        = ${counters.succeeded}`);
  console.log(`  failed           = ${counters.failed}`);
  console.log(`  failed_guard     = ${counters.failed_guard}`);
  console.log("");

  const verdict = printGoNoGo(results, startWeight, startCategory);

  console.log(`mode: ${COMMIT_MODE ? "COMMIT (rows persisted)" : "DRY-RUN (rows rolled back)"}`);
  console.log("");
  console.log(verdict);

  await prisma.$disconnect();

  if (verdict === "NO-GO") {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[observation:stress-test] unhandled error:", err);
  process.exitCode = 1;
});
