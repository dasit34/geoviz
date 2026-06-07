/* eslint-disable no-console */
/**
 * scripts/replay-benchmark.ts
 *
 * OFFLINE, READ-ONLY benchmark/test-loop over historical audits. Replays
 * every generated audit through the NEW deterministic report + scoring
 * system and compares old (as-delivered) score vs new (recomputed) score.
 *
 *   npx tsx scripts/replay-benchmark.ts                 # DEFAULT: customer cohort
 *   npx tsx scripts/replay-benchmark.ts --include-cal   # include [CAL] + internal
 *   npx tsx scripts/replay-benchmark.ts --limit 5       # smoke test
 *   npx tsx scripts/replay-benchmark.ts --since 2026-05-20
 *   npx tsx scripts/replay-benchmark.ts --audit-id <id>
 *   npx tsx scripts/replay-benchmark.ts --no-network    # strict $0 local
 *   npx tsx scripts/replay-benchmark.ts --concurrency 4
 *
 * COHORT (default = customer-only): excludes `[CAL]`-prefixed calibration
 * probes and internal domains (geoviz.ai) so the benchmark reflects real
 * customer audits. `--include-cal` (alias `--all`) scores every generated row.
 *
 * Per audit, the NEW score is computed:
 *   • replayBundle present  → scoreAudit(bundle.inputs)  → byte-exact, $0 local
 *   • else (legacy)         → evidence rebuilt from stored preflight, or a
 *                             fresh HTTP runPreflight() re-fetch (no LLM, ~$0)
 *   • --no-network          → only stored evidence; legacy w/o it = render_only
 *
 * ⚠ INTERPRETING DELTAS — site drift vs scoring method:
 *   Legacy rows (status `reconstructed`) re-fetch the LIVE site TODAY to rebuild
 *   evidence, so their old→new delta blends TWO effects: (a) the new scoring
 *   method AND (b) the website having CHANGED since the original audit. Only
 *   `bundle_exact` rows replay from the audit's STORED evidence and therefore
 *   isolate the scoring-method change with no site drift. Read big reconstructed
 *   deltas as "what this site would score today," not as pure rubric change.
 *
 * SAFETY (hard guarantees):
 *   • DB access is READ-ONLY — findMany / findUnique only. No create /
 *     update / upsert. Never touches AuditOrder, AuditIntelligence,
 *     CalibrationReplay, or any customer report/PDF.
 *   • No Resend, no Stripe, no queueing, no LLM/validator calls.
 *   • Only network is runPreflight()'s homepage HTTP re-fetch (no API spend).
 *   • Writes ONLY under tmp/replay/ (gitignored).
 */

import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrismaClient } from "@prisma/client";

// The report components use Next's automatic JSX runtime (no `React` import).
// Under tsx/esbuild the classic transform emits free `React.createElement`
// calls, so expose React as a global — resolved at render time.
(globalThis as Record<string, unknown>).React = React;

import { scoreAudit } from "../src/lib/scoring";
import type { DeterministicScore } from "../src/lib/scoring/types";
import type { PreflightSignals } from "../src/lib/intelligence/preflight/types";
import type { IntelligenceIngestResult } from "../src/lib/intelligence/intelligenceIngest";
import type { RenderIntelligenceResult } from "../src/lib/intelligence/render/renderProvider";
import { runPreflight } from "../src/lib/intelligence/preflight/runPreflight";
import {
  parseReportScoreBreakdown,
  bandLabelForOverall,
} from "../src/lib/parse-report";
import { buildReportModelFromRender } from "../src/lib/report/report-model";
import { ReportDocument } from "../src/components/report/ReportDocument";

// ── args ──────────────────────────────────────────────────────────────
function flagValue(name: string): string | undefined {
  const f = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (f) return f.slice(`--${name}=`.length);
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  return undefined;
}
const LIMIT = flagValue("limit") ? Number(flagValue("limit")) : undefined;
const SINCE = flagValue("since") ? new Date(flagValue("since")!) : undefined;
const AUDIT_ID = flagValue("audit-id");
const NO_NETWORK = process.argv.includes("--no-network");
// Customer cohort is the DEFAULT: exclude [CAL] calibration probes + internal
// (geoviz.ai). Pass --include-cal (or --all) to score every generated audit.
const APPLY_COHORT_FILTER =
  !process.argv.includes("--include-cal") && !process.argv.includes("--all");
const CONCURRENCY = Math.max(1, Number(flagValue("concurrency") ?? 4));

/** Calibration/test probe — same predicate as replay-audits.ts (--cal-prefix). */
function isCalRow(businessName: string | null): boolean {
  return (businessName ?? "").startsWith("[CAL]");
}

// Internal/non-customer domains — excluded from the customer cohort. Only
// geoviz.ai (our own site); intentional test reports on real businesses stay.
const INTERNAL_DOMAINS = ["geoviz.ai"];
function isInternalDomain(website: string): boolean {
  let host = website;
  try {
    host = new URL(website).hostname;
  } catch {
    /* fall back to raw string match */
  }
  host = host.replace(/^www\./, "").toLowerCase();
  return INTERNAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Human-readable reason for a delta, derived from status + missing data. */
function deltaReason(r: Row): string {
  if (r.replayStatus === "partial") return r.failureReason || "partial replay";
  if (r.replayStatus === "bundle_exact") return "byte-exact replay (method only)";
  if (r.missingDataFields.includes("preflight(refetched-not-original)"))
    return "new score from today's live site (method + drift)";
  if (r.replayStatus === "reconstructed") return "method change (stored evidence)";
  return r.replayStatus;
}

const OUT_DIR = join(process.cwd(), "tmp", "replay");
const MODELS_DIR = join(OUT_DIR, "models");
const REPORTS_DIR = join(OUT_DIR, "reports");

// ── reconstruct helpers (ported from score-backfill.ts; stored-column → typed) ─
function reconstructIngest(row: IntelRow): IntelligenceIngestResult {
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
    scoreProvenance:
      row.scoreProvenance as IntelligenceIngestResult["scoreProvenance"],
  };
}

function reconstructRender(row: IntelRow): RenderIntelligenceResult | null {
  if (row.renderAttempted === null && row.rawTextLength === null) return null;
  const rc =
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
    renderConfidence: rc,
    rawTextLength: row.rawTextLength,
    rawSchemaTypes: row.rawSchemaTypes as string[] | null,
    schemaDeltaDetected: row.schemaDeltaDetected,
    contentDeltaDetected: row.contentDeltaDetected,
  };
}

function looksLikePreflight(v: unknown): v is PreflightSignals {
  return (
    !!v &&
    typeof v === "object" &&
    "engineVersion" in (v as object) &&
    "fetchOk" in (v as object)
  );
}

function hasBundleInputs(
  v: unknown,
): v is { inputs: Record<string, unknown>; computed_at?: string } {
  return !!v && typeof v === "object" && "inputs" in (v as object);
}

/**
 * True when a recomputed DeterministicScore reproduces the STORED one on every
 * score that matters: overall + freeze hashes + each category score + each
 * bucket score. Order-INSENSITIVE — the stored JSON's object-key ordering is an
 * artifact of how it was serialized and is not a score change.
 */
function scoreMap(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "∅";
  const rec = obj as Record<string, { score?: number }>;
  return Object.keys(rec)
    .sort()
    .map((k) => `${k}:${rec[k]?.score ?? "?"}`)
    .join("|");
}
function bundleByteEqualCheck(
  recomputed: DeterministicScore,
  stored: unknown,
): boolean {
  if (!stored || typeof stored !== "object") return false;
  const s = stored as Record<string, unknown>;
  return (
    s.overall_score === recomputed.overall_score &&
    s.weight_hash === recomputed.weight_hash &&
    s.category_hash === recomputed.category_hash &&
    scoreMap(s.category_scores) === scoreMap(recomputed.category_scores) &&
    scoreMap(s.public_bucket_scores) ===
      scoreMap(recomputed.public_bucket_scores)
  );
}

// ── types for the rows we select (read-only) ──────────────────────────
type IntelRow = {
  industryCategoryNormalized: string | null;
  industryCategoryRaw: string | null;
  industryCategory: string | null;
  businessName: string | null;
  overallScore: number | null;
  deterministicScore: unknown;
  replayBundle: unknown;
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
  aiValidations: unknown;
};

type ReplayStatus =
  | "bundle_exact"
  | "reconstructed"
  | "render_only"
  | "partial"
  | "failed";

type Row = {
  auditId: string;
  businessName: string;
  website: string;
  industry: string;
  oldScore: number | null;
  newScore: number | null;
  scoreDelta: number | null;
  oldBand: string | null;
  newBand: string | null;
  bandChanged: boolean;
  oldCategoryScores: Record<string, number | null>;
  newCategoryScores: Record<string, number | null>;
  missingDataFields: string[];
  replayStatus: ReplayStatus;
  failureReason: string;
  reportPath: string;
  /** For bundle_exact rows: does recomputed score == stored deterministicScore? */
  bundleByteEqual: boolean | null;
  storedOverall: number | null;
};

const INTEL_SELECT = {
  industryCategoryNormalized: true,
  industryCategoryRaw: true,
  industryCategory: true,
  businessName: true,
  overallScore: true,
  deterministicScore: true,
  replayBundle: true,
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
  aiValidations: true,
} as const;

type Loaded = {
  id: string;
  websiteUrl: string;
  businessName: string | null;
  reportMarkdown: string | null;
  reportGeneratedAt: Date | null;
  intelligence: IntelRow | null;
};

// Module-level flag: disabled after the first HTML render failure (e.g. a
// component pulls a non-SSR dependency) so we don't spam errors per row.
let htmlRenderEnabled = true;
let REPORT_CSS = "";

function categoryScoresFromDeterministic(
  d: DeterministicScore | null,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!d || !d.category_scores) return out;
  for (const [k, v] of Object.entries(d.category_scores)) {
    out[k] = (v as { score?: number })?.score ?? null;
  }
  return out;
}

function writeReportHtml(orderId: string, model: unknown): string {
  if (!htmlRenderEnabled || !model) return "";
  try {
    const body = renderToStaticMarkup(
      React.createElement(ReportDocument, { model } as never),
    );
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>GeoViz replay — ${orderId}</title>
<style>body{margin:0;background:#06070a;}main{max-width:880px;margin:0 auto;}
${REPORT_CSS}</style></head><body><main class="rd">${body}</main></body></html>`;
    const path = join(REPORTS_DIR, `${orderId}.html`);
    writeFileSync(path, html, "utf8");
    return `tmp/replay/reports/${orderId}.html`;
  } catch (err) {
    htmlRenderEnabled = false;
    console.warn(
      `[replay] HTML render disabled (first failure on ${orderId}): ${(err as Error).message.slice(0, 160)}`,
    );
    return "";
  }
}

async function replayOne(row: Loaded): Promise<Row> {
  const intel = row.intelligence;
  const businessName = intel?.businessName ?? row.businessName ?? "";
  const website = row.websiteUrl;
  const industry =
    intel?.industryCategoryNormalized ??
    intel?.industryCategoryRaw ??
    intel?.industryCategory ??
    "";

  // ── OLD score: what the customer's delivered markdown declared ──
  const oldBreakdown = parseReportScoreBreakdown(row.reportMarkdown ?? null);
  const oldScore = oldBreakdown.overall;
  const oldCategoryScores: Record<string, number | null> = {};
  for (const c of oldBreakdown.categories) oldCategoryScores[c.key] = c.score;

  const missing: string[] = [];
  let newDet: DeterministicScore | null = null;
  let status: ReplayStatus = "failed";
  let failureReason = "";
  let bundleByteEqual: boolean | null = null;
  const storedOverall =
    intel?.deterministicScore &&
    typeof intel.deterministicScore === "object" &&
    typeof (intel.deterministicScore as Record<string, unknown>).overall_score ===
      "number"
      ? ((intel.deterministicScore as Record<string, unknown>)
          .overall_score as number)
      : null;

  try {
    if (intel && hasBundleInputs(intel.replayBundle)) {
      // Tier A — byte-exact, fully local.
      const inputs = intel.replayBundle.inputs as Record<string, unknown>;
      newDet = scoreAudit({
        preflightSignals: (inputs.preflightSignals ?? null) as PreflightSignals | null,
        intelligenceIngest: (inputs.intelligenceIngest ?? null) as IntelligenceIngestResult | null,
        renderResult: (inputs.renderResult ?? null) as RenderIntelligenceResult | null,
        history: (inputs.history as never) ?? undefined,
      });
      status = "bundle_exact";
      bundleByteEqual = bundleByteEqualCheck(newDet, intel.deterministicScore);
    } else if (intel) {
      // Tier B — legacy. Rebuild evidence from stored preflight or a fresh
      // HTTP re-fetch (no LLM). Ingest/render reconstructed from columns.
      let preflight: PreflightSignals | null = looksLikePreflight(
        intel.preflightSignals,
      )
        ? (intel.preflightSignals as PreflightSignals)
        : null;
      let preflightSource = preflight ? "stored" : "none";

      if (!preflight && !NO_NETWORK && website) {
        const fresh = await runPreflight(website);
        if (fresh.fetchOk) {
          preflight = fresh;
          preflightSource = "refetched";
        } else {
          status = "partial";
          failureReason = `site_unreachable: ${fresh.fetchError ?? "fetch failed"}`;
          missing.push("preflight(site_unreachable)");
        }
      }

      if (!preflight) {
        if (status !== "partial") {
          status = "render_only";
          if (NO_NETWORK) missing.push("preflight(no-network)");
        }
      } else {
        if (preflightSource === "refetched") missing.push("preflight(refetched-not-original)");
        if (!intel.cmsDetected && !intel.contentDensity) missing.push("ingest");
        if (intel.renderAttempted === null) missing.push("render");
        newDet = scoreAudit({
          preflightSignals: preflight,
          intelligenceIngest: reconstructIngest(intel),
          renderResult: reconstructRender(intel),
          history: [],
        });
        status = "reconstructed";
      }
    } else {
      missing.push("intelligence_row");
      status = "render_only";
    }
  } catch (err) {
    status = "failed";
    failureReason = `scoreAudit: ${(err as Error).message.slice(0, 160)}`;
  }

  if (!intel) missing.push("intelligence_row");
  if (intel && !intel.aiValidations) missing.push("aiValidations");

  const newScore = newDet ? newDet.overall_score : null;
  const newCategoryScores = categoryScoresFromDeterministic(newDet);
  const scoreDelta =
    newScore !== null && oldScore !== null ? newScore - oldScore : null;
  const oldBand = oldScore !== null ? bandLabelForOverall(oldScore) : null;
  const newBand = newScore !== null ? bandLabelForOverall(newScore) : null;
  const bandChanged = !!oldBand && !!newBand && oldBand !== newBand;

  // ── build + render the NEW ReportModel ──
  let reportPath = "";
  try {
    const model = buildReportModelFromRender({
      orderId: row.id,
      businessLabel: businessName || website,
      websiteUrl: website,
      reportMarkdown: row.reportMarkdown,
      reportGeneratedAt: row.reportGeneratedAt,
      deterministicScore: newDet ?? intel?.deterministicScore ?? null,
      context: { aiValidations: intel?.aiValidations ?? null },
    });
    if (model) {
      writeFileSync(
        join(MODELS_DIR, `${row.id}.json`),
        JSON.stringify(model, null, 2),
        "utf8",
      );
      reportPath = writeReportHtml(row.id, model);
    } else {
      missing.push("report_model(null)");
    }
  } catch (err) {
    if (!failureReason) failureReason = `buildModel: ${(err as Error).message.slice(0, 120)}`;
  }

  return {
    auditId: row.id,
    businessName,
    website,
    industry,
    oldScore,
    newScore,
    scoreDelta,
    oldBand,
    newBand,
    bandChanged,
    oldCategoryScores,
    newCategoryScores,
    missingDataFields: [...new Set(missing)],
    replayStatus: status,
    failureReason,
    reportPath,
    bundleByteEqual,
    storedOverall,
  };
}

// ── simple concurrency pool ───────────────────────────────────────────
async function pool<T, R>(
  items: T[],
  size: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

function csvCell(v: unknown): string {
  const s =
    v === null || v === undefined
      ? ""
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function percentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function main(): Promise<void> {
  mkdirSync(MODELS_DIR, { recursive: true });
  mkdirSync(REPORTS_DIR, { recursive: true });
  try {
    REPORT_CSS = readFileSync(
      join(process.cwd(), "src/components/report/report-document.css"),
      "utf8",
    );
  } catch {
    REPORT_CSS = "";
  }

  const prisma = new PrismaClient();
  const t0 = Date.now();
  console.log(
    `[replay] READ-ONLY benchmark · network=${NO_NETWORK ? "off" : "on"} · concurrency=${CONCURRENCY}${LIMIT ? ` · limit=${LIMIT}` : ""}`,
  );

  const where: Record<string, unknown> = AUDIT_ID
    ? { id: AUDIT_ID }
    : {
        reportStatus: "generated",
        NOT: { reportMarkdown: null },
        ...(SINCE ? { createdAt: { gte: SINCE } } : {}),
      };

  const rows = (await prisma.auditOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    ...(LIMIT ? { take: LIMIT } : {}),
    select: {
      id: true,
      websiteUrl: true,
      businessName: true,
      reportMarkdown: true,
      reportGeneratedAt: true,
      intelligence: { select: INTEL_SELECT },
    },
  })) as Loaded[];

  const totalLoaded = rows.length;
  let excludedCal = 0;
  let excludedInternal = 0;
  const filtered = APPLY_COHORT_FILTER
    ? rows.filter((r) => {
        if (isCalRow(r.businessName)) {
          excludedCal += 1;
          return false;
        }
        if (isInternalDomain(r.websiteUrl)) {
          excludedInternal += 1;
          return false;
        }
        return true;
      })
    : rows;
  console.log(
    `[replay] loaded ${totalLoaded} generated audit(s)` +
      (APPLY_COHORT_FILTER
        ? ` · excluded ${excludedCal} [CAL] + ${excludedInternal} internal (${INTERNAL_DOMAINS.join(",")}) → ${filtered.length} customer audit(s) [default cohort; --include-cal for all]`
        : " · full set (--include-cal)"),
  );

  const results = await pool(filtered, CONCURRENCY, async (row, i) => {
    const r = await replayOne(row);
    console.log(
      `[replay] (${i + 1}/${filtered.length}) ${r.replayStatus.padEnd(13)} old=${r.oldScore ?? "—"} new=${r.newScore ?? "—"} Δ=${r.scoreDelta ?? "—"} ${r.website}`,
    );
    return r;
  });

  // ── outputs ──
  const cols = [
    "auditId",
    "businessName",
    "website",
    "industry",
    "oldScore",
    "newScore",
    "scoreDelta",
    "oldBand",
    "newBand",
    "bandChanged",
    "oldCategoryScores",
    "newCategoryScores",
    "missingDataFields",
    "replayStatus",
    "failureReason",
    "reportPath",
  ];
  const csv = [
    cols.join(","),
    ...results.map((r) =>
      cols.map((c) => csvCell((r as Record<string, unknown>)[c])).join(","),
    ),
  ].join("\n");
  writeFileSync(join(OUT_DIR, "benchmark.csv"), csv, "utf8");
  writeFileSync(
    join(OUT_DIR, "benchmark.json"),
    JSON.stringify(results, null, 2),
    "utf8",
  );

  // ── summary ──
  const byStatus: Record<string, number> = {};
  for (const r of results) byStatus[r.replayStatus] = (byStatus[r.replayStatus] ?? 0) + 1;
  const deltas = results
    .map((r) => r.scoreDelta)
    .filter((d): d is number => d !== null);
  const absDeltas = deltas.map(Math.abs);
  const missingHist: Record<string, number> = {};
  for (const r of results)
    for (const m of r.missingDataFields)
      missingHist[m] = (missingHist[m] ?? 0) + 1;
  const unreachable = results
    .filter((r) => r.failureReason.startsWith("site_unreachable"))
    .map((r) => r.website);

  const round1 = (n: number | null) =>
    n === null ? null : Math.round(n * 10) / 10;
  const topDeltas = results
    .filter((r) => r.scoreDelta !== null)
    .sort((a, b) => Math.abs(b.scoreDelta!) - Math.abs(a.scoreDelta!))
    .slice(0, 10)
    .map((r) => ({
      businessName: r.businessName,
      website: r.website,
      oldScore: r.oldScore,
      newScore: round1(r.newScore),
      delta: round1(r.scoreDelta),
      bandChange: r.bandChanged ? `${r.oldBand} → ${r.newBand}` : null,
      replayStatus: r.replayStatus,
      reason: deltaReason(r),
    }));

  const bundleRows = results.filter((r) => r.replayStatus === "bundle_exact");
  const bundleStability = {
    total: bundleRows.length,
    byteEqual: bundleRows.filter((r) => r.bundleByteEqual === true).length,
    drifted: bundleRows
      .filter((r) => r.bundleByteEqual !== true)
      .map((r) => ({
        auditId: r.auditId,
        website: r.website,
        storedOverall: r.storedOverall,
        recomputedOverall: round1(r.newScore),
      })),
  };

  const summary = {
    generatedAtIso: new Date(t0).toISOString(),
    cohort: APPLY_COHORT_FILTER
      ? `customer-only (excludes [CAL] + ${INTERNAL_DOMAINS.join(",")})`
      : "all (--include-cal)",
    excludedCalProbes: APPLY_COHORT_FILTER ? excludedCal : 0,
    excludedInternal: APPLY_COHORT_FILTER ? excludedInternal : 0,
    bundleStability,
    totalAudits: results.length,
    byStatus,
    comparableRows: deltas.length,
    delta: {
      mean: deltas.length
        ? Number((deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(2))
        : null,
      median: median(deltas),
      absMean: absDeltas.length
        ? Number(
            (absDeltas.reduce((a, b) => a + b, 0) / absDeltas.length).toFixed(2),
          )
        : null,
      absP90: percentile(absDeltas, 90),
      bandChanges: results.filter((r) => r.bandChanged).length,
      over10: absDeltas.filter((d) => d > 10).length,
    },
    missingDataHistogram: missingHist,
    unreachableSites: unreachable,
    topDeltas,
    runtimeSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
  };
  writeFileSync(
    join(OUT_DIR, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  await prisma.$disconnect();

  console.log("");
  console.log(`[replay] status:`, byStatus);
  console.log(
    `[replay] delta (comparable=${deltas.length}): mean=${summary.delta.mean} absMean=${summary.delta.absMean} absP90=${summary.delta.absP90} bandChanges=${summary.delta.bandChanges} over10=${summary.delta.over10}`,
  );
  if (unreachable.length) console.log(`[replay] unreachable sites: ${unreachable.length}`);
  console.log(
    `[replay] bundle byte-equal: ${bundleStability.byteEqual}/${bundleStability.total} stable` +
      (bundleStability.drifted.length
        ? ` · DRIFTED: ${bundleStability.drifted.map((d) => `${d.website}(${d.storedOverall}→${d.recomputedOverall})`).join(", ")}`
        : ""),
  );
  console.log("");
  console.log(`[replay] TOP 10 LARGEST DELTAS:`);
  topDeltas.forEach((d, i) => {
    const name = (d.businessName || d.website).slice(0, 34).padEnd(34);
    const arrow = (d.delta ?? 0) > 0 ? "+" : "";
    console.log(
      `  ${String(i + 1).padStart(2)}. ${name} ${String(d.oldScore).padStart(4)}→${String(d.newScore).padEnd(5)} Δ${arrow}${d.delta}  ${d.bandChange ? `[${d.bandChange}] ` : ""}${d.reason}`,
    );
    console.log(`      ${d.website}`);
  });
  console.log("");
  console.log(
    `[replay] outputs → tmp/replay/{benchmark.csv,benchmark.json,summary.json,models/,reports/} · ${summary.runtimeSec}s`,
  );
}

main().catch((err) => {
  console.error("[replay] fatal:", err);
  process.exitCode = 1;
});
