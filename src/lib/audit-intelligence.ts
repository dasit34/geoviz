/* eslint-disable no-console */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  derivePlatformVisibility,
  deriveStrengths,
  detectJsHeavySite,
  inferFixPriority,
  inferIssueSeverity,
  parseEnumeratedItems,
  parseReportScoreBreakdown,
  parseReportSections,
  type ScoreCategoryKey,
} from "@/lib/parse-report";
import {
  inferIndustryFromAuditInputs,
  normalizeIndustry,
} from "@/lib/intelligence/industry-taxonomy";
import { runIntelligenceIngest } from "@/lib/intelligence/intelligenceIngest";
import {
  createDefaultRawFetcher,
  runRenderIntelligence,
} from "@/lib/intelligence/render/renderIntelligence";
import { obscuraProvider } from "@/lib/intelligence/render/obscuraProvider";
import type { RenderIntelligenceResult } from "@/lib/intelligence/render/renderProvider";

/**
 * Prisma's nullable Json columns require the `Prisma.JsonNull`
 * sentinel to persist a SQL NULL — plain JS `null` isn't accepted
 * by the generated input type. This helper centralizes the
 * convention so every nullable-Json field in the payload follows
 * the same pattern.
 */
function jsonOrNull<T extends object>(value: T | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as unknown as Prisma.InputJsonValue);
}

/**
 * GeoViz V2 data foundation — normalized intelligence persistence.
 *
 * Writes one `AuditIntelligence` row per generated audit, alongside
 * the existing customer-facing markdown stored on
 * `AuditOrder.reportMarkdown`. NOT customer-facing. NOT exposed via
 * any public route, UI, or email template.
 *
 * Failure isolation contract:
 *   • This module **never throws**. The caller (the Railway worker)
 *     can `await` it without try/catch and never lose a customer
 *     report flow because of a V2 data-layer hiccup.
 *   • The only side effect on failure is a single `console.error`
 *     line that Railway's log collector ingests.
 *   • The customer report has already been persisted to
 *     `AuditOrder.reportMarkdown` BEFORE this function is called by
 *     the worker — so even a total intelligence outage doesn't
 *     reduce what the customer receives.
 *
 * What this module DOES NOT touch:
 *   • Scoring rubric, calibration math, ladder anchors, band
 *     thresholds (all frozen per CLAUDE.md).
 *   • The audit prompt or audit engine.
 *   • The worker poll loop, atomic claim, or stale-job recovery.
 *   • Report rendering (markdown, print page, PDF, emails).
 *   • Stripe checkout / webhook / payment-status logic.
 *
 * Field-population policy:
 *   • Where V1 reliably extracts a value (per-category scores from
 *     the markdown, derived strengths, severity labels), we write
 *     it.
 *   • Where V1 doesn't reliably produce a value (renderability,
 *     individual technical-signal detection, industry/location),
 *     we write `null`. No fake precision. V2 modules (crawler,
 *     classifier) will populate later.
 *   • Where V2 will care about the raw parser output for
 *     debugging, we capture it in `rawSignalSnapshot` (jsonb).
 */

const AUDIT_ENGINE_VERSION = "v1.0";
const SCORING_VERSION = "Calibration v2.2";

/** Score normalization helper — null-safe. */
function toPercent(value: number | null, max: number): number | null {
  if (value === null || !Number.isFinite(value) || max <= 0) return null;
  const pct = Math.round((value / max) * 100);
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

/** Read the score for a specific rubric category by key. */
function categoryScore(
  categories: Array<{ key: ScoreCategoryKey; score: number | null }>,
  key: ScoreCategoryKey,
): number | null {
  return categories.find((c) => c.key === key)?.score ?? null;
}

/** Confidence level — derived from how many rubric categories parsed. */
function confidenceFromPopulated(populatedCount: number): "low" | "medium" | "high" {
  if (populatedCount >= 6) return "high";
  if (populatedCount >= 4) return "medium";
  return "low";
}

export type PersistAuditIntelligenceResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function persistAuditIntelligence(args: {
  orderId: string;
  businessName: string | null;
  websiteUrl: string;
  competitorUrl: string | null;
  reportMarkdown: string;
  /**
   * Optional explicit industry hint — operator entry, V2 classifier,
   * etc. When provided, we use it as the raw value before
   * normalization. When omitted, we fall back to a best-effort
   * inference from `businessName` + `reportMarkdown`. Either way
   * the result is normalized via the frozen v1 taxonomy.
   */
  industryRaw?: string | null;
  /**
   * Optional operator-supplied benchmark cohort tag. When present,
   * persisted to `AuditIntelligence.benchmarkTag` (the operator-set
   * scalar — distinct from the system-set `benchmarkTags` JSON
   * array). Used by bulk batches to group audits into named cohorts
   * like `roofing_batch_1`. Absent leaves `benchmarkTag` unset on
   * insert and PRESERVED on re-run update.
   */
  benchmarkTag?: string | null;
}): Promise<PersistAuditIntelligenceResult> {
  const {
    orderId,
    businessName,
    websiteUrl,
    competitorUrl,
    reportMarkdown,
    industryRaw,
    benchmarkTag,
  } = args;

  if (!reportMarkdown || reportMarkdown.trim().length === 0) {
    console.error(
      `[audit-intelligence] empty markdown for orderId=${orderId} — refusing to persist intelligence row`,
    );
    return { ok: false, reason: "empty_markdown" };
  }

  let payload: ReturnType<typeof buildIntelligencePayload>;
  try {
    payload = buildIntelligencePayload({
      orderId,
      businessName,
      websiteUrl,
      competitorUrl,
      reportMarkdown,
      industryRaw: industryRaw ?? null,
      benchmarkTag: benchmarkTag ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[audit-intelligence] payload build threw orderId=${orderId} message="${message}"`,
    );
    return { ok: false, reason: "build_threw" };
  }

  try {
    // Upsert keyed on auditOrderId so an admin "Re-run" refreshes the
    // intelligence row instead of erroring on the unique constraint.
    await prisma.auditIntelligence.upsert({
      where: { auditOrderId: orderId },
      create: payload,
      update: {
        ...payload,
        // Don't reset operator review state on re-run — operator
        // notes/approval should survive an audit refresh.
        operatorReviewed: undefined,
        operatorNotes: undefined,
        // Don't reset createdAt — keep original insert time.
        createdAt: undefined,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[audit-intelligence] upsert failed orderId=${orderId} message="${message}"`,
    );
    return { ok: false, reason: "upsert_failed" };
  }

  // ─── V2 Stage 2 — Optional render pass ──────────────────────────
  // Runs AFTER the main upsert so a render failure cannot leave the
  // base intelligence row unwritten. Gated by `GEO_RENDER_ENABLED`
  // (default false) AND a multi-signal eligibility check. The whole
  // block is wrapped in try/catch — any throw is logged with
  // `[geo-render] failed` and the audit row stays correct.
  //
  // The render fields are persisted via a separate `update()` so the
  // main upsert payload stays small + fast. We never await render
  // intelligence as a blocker — but we DO await it here so a
  // `await persistAuditIntelligence(...)` from the worker gets the
  // updated row before returning. The worker's audit-completion
  // status was already saved on `AuditOrder` BEFORE this function
  // was called, so render slowness can't delay customer delivery.
  try {
    const renderResult: RenderIntelligenceResult = await runRenderIntelligence({
      orderId,
      url: websiteUrl,
      frameworkDetected: (payload as { frameworkDetected: string | null }).frameworkDetected,
      contentDensity: (payload as { contentDensity: number | null }).contentDensity,
      provider: obscuraProvider,
      rawFetcher: createDefaultRawFetcher(),
    });

    // Only update if render produced at least one populated field —
    // skip writes that would only persist nulls.
    const anyPopulated =
      renderResult.renderAttempted !== null ||
      renderResult.rawTextLength !== null ||
      renderResult.rawSchemaTypes !== null;
    if (anyPopulated) {
      await prisma.auditIntelligence.update({
        where: { auditOrderId: orderId },
        data: {
          renderAttempted: renderResult.renderAttempted,
          renderSuccessful: renderResult.renderSuccessful,
          renderEngineVersion: renderResult.renderEngineVersion,
          renderFailureReason: renderResult.renderFailureReason,
          renderDurationMs: renderResult.renderDurationMs,
          renderedHtmlLength: renderResult.renderedHtmlLength,
          renderedTextLength: renderResult.renderedTextLength,
          renderedSchemaTypes: jsonOrNull(
            renderResult.renderedSchemaTypes as unknown as object | null,
          ),
          hydrationDetected: renderResult.hydrationDetected,
          blankShellRisk: renderResult.blankShellRisk,
          clientOnlyContentDetected: renderResult.clientOnlyContentDetected,
          renderConfidence: renderResult.renderConfidence,
          rawTextLength: renderResult.rawTextLength,
          rawSchemaTypes: jsonOrNull(
            renderResult.rawSchemaTypes as unknown as object | null,
          ),
          schemaDeltaDetected: renderResult.schemaDeltaDetected,
          contentDeltaDetected: renderResult.contentDeltaDetected,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Render failures are operational — log and continue. The main
    // intelligence row is already persisted; render fields just stay
    // null on this audit.
    console.warn(
      `[geo-render] orchestrator threw orderId=${orderId} (non-fatal): ${message}`,
    );
  }

  return { ok: true };
}

/**
 * Pure function — builds the row payload from inputs. Separated so
 * we can validate the build path independently of Prisma I/O.
 */
function buildIntelligencePayload(args: {
  orderId: string;
  businessName: string | null;
  websiteUrl: string;
  competitorUrl: string | null;
  reportMarkdown: string;
  industryRaw: string | null;
  benchmarkTag: string | null;
}) {
  const {
    orderId,
    businessName,
    websiteUrl,
    competitorUrl,
    reportMarkdown,
    industryRaw,
    benchmarkTag,
  } = args;

  // -- Industry taxonomy (V2 benchmarking). Three columns:
  //    raw, normalized, version. Caller-provided `industryRaw` wins;
  //    otherwise we run a best-effort keyword sniff against the
  //    business name + the head of the audit markdown. Unknown ->
  //    raw=null, normalized="unknown" — never guess.
  const industryRawResolved =
    industryRaw && industryRaw.trim().length > 0
      ? industryRaw.trim()
      : inferIndustryFromAuditInputs(businessName, reportMarkdown);
  const industry = normalizeIndustry(industryRawResolved);

  // -- Reuse the existing parsers; never duplicate scoring logic. --
  const score = parseReportScoreBreakdown(reportMarkdown);
  const layout = parseReportSections(reportMarkdown);

  // -- Score normalization (rubric-max → 0..100). --
  //
  // Category → field mapping (closest semantic fit; null where there
  // is no clean 1:1 in the V1 rubric):
  //
  //   structuredIdentityScore       ← Schema / 25
  //   crawlerAccessibilityScore     ← Crawler / 20
  //   trustSignalScore              ← Trust   / 20
  //   recommendationReadinessScore  ← Content / 15
  //   semanticClarityScore          ← Brand   / 10   (closest in V1)
  //   renderabilityScore            ← null         (not measured in V1)
  //
  // V2 modules can refine these mappings as the rubric evolves. The
  // mapping is documented here AND in the plan file so future work
  // sees how the V2 schema relates to the V1 scoring.
  const overallScore = typeof score.overall === "number" ? score.overall : null;
  const structuredIdentityScore = toPercent(
    categoryScore(score.categories, "schema"),
    25,
  );
  const crawlerAccessibilityScore = toPercent(
    categoryScore(score.categories, "crawler"),
    20,
  );
  const trustSignalScore = toPercent(
    categoryScore(score.categories, "trust"),
    20,
  );
  const recommendationReadinessScore = toPercent(
    categoryScore(score.categories, "content"),
    15,
  );
  const semanticClarityScore = toPercent(
    categoryScore(score.categories, "brand"),
    10,
  );
  const renderabilityScore: number | null = null;

  const populatedScoreCount = [
    overallScore,
    structuredIdentityScore,
    crawlerAccessibilityScore,
    trustSignalScore,
    recommendationReadinessScore,
    semanticClarityScore,
  ].filter((v) => v !== null).length;
  const confidenceLevel = confidenceFromPopulated(populatedScoreCount);

  // -- Categorization arrays. --
  const issuesSection = layout.sections.find((s) => s.slug === "why");
  const fixesSection = layout.sections.find((s) => s.slug === "fix-first");
  const issueItems = issuesSection
    ? parseEnumeratedItems(issuesSection.body)
    : [];
  const fixItems = fixesSection
    ? parseEnumeratedItems(fixesSection.body)
    : [];

  const issueSeverityLabels = unique(
    issueItems.map((it) => inferIssueSeverity(it.title, it.body).label),
  );
  const fixPriorityLabels = unique(
    fixItems.map((it) => inferFixPriority(it.title, it.body).priority),
  );

  const strengths = deriveStrengths(score).map((s) => s.label);
  const weaknesses = score.categories
    .filter(
      (c): c is typeof c & { score: number } =>
        typeof c.score === "number" && c.score / c.max < 0.4,
    )
    .map((c) => c.label);

  // -- AI readability flags (best-effort). --
  const flags: string[] = [];
  if (detectJsHeavySite(reportMarkdown)) flags.push("js_heavy_site");
  const platforms = derivePlatformVisibility(reportMarkdown, score);
  if (platforms.some((p) => p.crawlStatus === "blocked")) {
    flags.push("crawler_block_detected");
  }
  if (populatedScoreCount < 4) flags.push("low_parse_confidence");

  // -- Raw signal snapshot for V2 debugging. --
  const rawSignalSnapshot = {
    parsedScore: score,
    platforms,
    issueCount: issueItems.length,
    fixCount: fixItems.length,
    markdownBytes: reportMarkdown.length,
    capturedAt: new Date().toISOString(),
  };

  return {
    auditOrderId: orderId,
    businessName,
    websiteUrl,
    // `industryCategory` is the deprecated legacy column. Kept null
    // forever; superseded by the three industry* fields below.
    industryCategory: null,
    industryCategoryRaw: industry.raw,
    industryCategoryNormalized: industry.normalized,
    industryTaxonomyVersion: industry.version,
    // Location is V1-unset (no extractor yet). The V2 classifier
    // module will populate from a canonical source.
    location: null,
    competitorUrl: competitorUrl || null,

    overallScore,
    semanticClarityScore,
    crawlerAccessibilityScore,
    trustSignalScore,
    structuredIdentityScore,
    recommendationReadinessScore,
    renderabilityScore,

    // V1 doesn't reliably detect these from markdown alone. V2
    // crawler module will populate. Stored null over fake precision.
    schemaDetected: null,
    llmsTxtDetected: null,
    robotsTxtDetected: null,
    sitemapDetected: null,
    mobileRenderOk: null,
    pagesIndexable: null,

    aiReadabilityFlags: flags as unknown as object,
    majorIssueCategories: issueSeverityLabels as unknown as object,
    majorFixCategories: fixPriorityLabels as unknown as object,
    topObservedStrengths: strengths as unknown as object,
    topObservedWeaknesses: weaknesses as unknown as object,

    confidenceLevel,
    auditEngineVersion: AUDIT_ENGINE_VERSION,
    scoringVersion: SCORING_VERSION,
    promptVersion: null,
    // operatorReviewed and operatorNotes are intentionally NOT set
    // on insert — the @default(false) handles operatorReviewed; the
    // upsert update branch explicitly preserves operator state.
    rawSignalSnapshot: rawSignalSnapshot as unknown as object,

    // Operator-supplied benchmark cohort tag from the bulk-queue
    // POST. Only included when the caller passed a non-null value
    // so re-running an audit without a tag never blanks the prior
    // operator-set tag. Distinct from the system-set
    // `benchmarkTags` JSON array populated by Stage 1 ingest.
    ...(benchmarkTag ? { benchmarkTag } : {}),

    // ─── V2 Stage 1 — Intelligence ingestion ────────────────────
    // runIntelligenceIngest is itself fail-soft: every module is
    // wrapped in try/catch internally and returns nulls for any
    // dimension that failed. The whole call is ALSO wrapped here as
    // belt-and-suspenders — if the orchestrator itself throws (it
    // shouldn't), the audit row still writes with V2 fields null.
    // The customer report has already been saved by the worker
    // BEFORE this code runs, so nothing here can affect delivery.
    ...(() => {
      try {
        const ingest = runIntelligenceIngest({
          reportMarkdown,
          businessName,
          websiteUrl,
          score,
          orderId,
        });
        return {
          cmsDetected: ingest.cmsDetected,
          frameworkDetected: ingest.frameworkDetected,
          schemaTypes: jsonOrNull(ingest.schemaTypes as unknown as object | null),
          aiReadabilityScore: ingest.aiReadabilityScore,
          contentDensity: ingest.contentDensity,
          renderRequired: ingest.renderRequired,
          renderAttempted: ingest.renderAttempted,
          renderSuccessful: ingest.renderSuccessful,
          renderEngineVersion: ingest.renderEngineVersion,
          benchmarkTags: jsonOrNull(ingest.benchmarkTags as unknown as object | null),
          extractedEntities: jsonOrNull(
            ingest.extractedEntities as unknown as object | null,
          ),
          scoreProvenance: jsonOrNull(
            ingest.scoreProvenance as unknown as object | null,
          ),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // ---- [geo-intelligence] ingest failed ----
        // eslint-disable-next-line no-console
        console.warn(
          `[geo-intelligence] ingest failed orderId=${orderId} (non-fatal): ${message}`,
        );
        return {
          cmsDetected: null,
          frameworkDetected: null,
          schemaTypes: Prisma.JsonNull,
          aiReadabilityScore: null,
          contentDensity: null,
          renderRequired: null,
          renderAttempted: null,
          renderSuccessful: null,
          renderEngineVersion: null,
          benchmarkTags: Prisma.JsonNull,
          extractedEntities: Prisma.JsonNull,
          scoreProvenance: Prisma.JsonNull,
        };
      }
    })(),
  };
}

/**
 * Backfill API — for historic audits that completed before the
 * `AuditIntelligence` table existed. Differs from the worker path in
 * three places:
 *
 *   1. **Create-if-missing semantics.** A pre-check on
 *      `findUnique({ auditOrderId })` short-circuits as `already_exists`.
 *      We then call `prisma.auditIntelligence.create(...)`. Any race
 *      with a concurrent worker write surfaces as Prisma error code
 *      `P2002` (unique constraint), caught and returned as
 *      `race_already_inserted`. We never overwrite an existing row.
 *
 *   2. **Version sentinels.** `auditEngineVersion` and
 *      `scoringVersion` are stamped `"legacy_v1"` so a later cohort
 *      query can distinguish "row produced live by the V1 worker"
 *      from "row produced retroactively from historic markdown".
 *
 *   3. **Confidence cap.** The live worker emits `"high"` when ≥6
 *      score categories parse. Backfill caps at `"medium"` — we don't
 *      know the original rubric version with certainty, so we never
 *      claim high confidence on historic data.
 *
 * Operator-review inference: backfill consults the caller-supplied
 * `reviewStatus` (the existing `AuditOrder.reviewStatus` enum).
 * `"approved"` → `operatorReviewed = true`; anything else stays false.
 *
 * Returns rich stats so the calling script can aggregate
 * dry-run reports without re-parsing the markdown.
 */

export type BackfillFieldStats = {
  overallScorePopulated: boolean;
  semanticClarityScorePopulated: boolean;
  crawlerAccessibilityScorePopulated: boolean;
  trustSignalScorePopulated: boolean;
  structuredIdentityScorePopulated: boolean;
  recommendationReadinessScorePopulated: boolean;
  industryDetected: boolean; // industryCategoryNormalized !== "unknown"
  industrySlug: string;
  operatorReviewed: boolean;
  confidenceLevel: "low" | "medium";
  populatedScoreCount: number;
};

export type BackfillResult =
  | { ok: true; outcome: "would_backfill" | "backfilled"; stats: BackfillFieldStats }
  | {
      ok: false;
      reason:
        | "no_markdown"
        | "already_exists"
        | "build_threw"
        | "create_failed"
        | "race_already_inserted";
    };

export async function backfillAuditIntelligence(args: {
  orderId: string;
  businessName: string | null;
  websiteUrl: string;
  competitorUrl: string | null;
  reportMarkdown: string | null;
  reviewStatus: string | null;
  dryRun: boolean;
}): Promise<BackfillResult> {
  const {
    orderId,
    businessName,
    websiteUrl,
    competitorUrl,
    reportMarkdown,
    reviewStatus,
    dryRun,
  } = args;

  // Don't even build the payload for orders that have nothing to parse.
  if (!reportMarkdown || reportMarkdown.trim().length === 0) {
    return { ok: false, reason: "no_markdown" };
  }

  // Pre-check — never overwrite an existing row. Cheaper than letting
  // the create fail and unwinding from a P2002.
  try {
    const existing = await prisma.auditIntelligence.findUnique({
      where: { auditOrderId: orderId },
      select: { id: true },
    });
    if (existing) return { ok: false, reason: "already_exists" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[audit-intelligence:backfill] pre-check failed orderId=${orderId} message="${message}"`,
    );
    return { ok: false, reason: "create_failed" };
  }

  let basePayload: ReturnType<typeof buildIntelligencePayload>;
  try {
    basePayload = buildIntelligencePayload({
      orderId,
      businessName,
      websiteUrl,
      competitorUrl,
      reportMarkdown,
      industryRaw: null,
      // Backfill never overwrites operator-set benchmarkTag; the
      // backfill path stays a pure historic-data fill.
      benchmarkTag: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[audit-intelligence:backfill] build threw orderId=${orderId} message="${message}"`,
    );
    return { ok: false, reason: "build_threw" };
  }

  const operatorReviewed = reviewStatus === "approved";
  const populatedScoreCount = [
    basePayload.overallScore,
    basePayload.semanticClarityScore,
    basePayload.crawlerAccessibilityScore,
    basePayload.trustSignalScore,
    basePayload.structuredIdentityScore,
    basePayload.recommendationReadinessScore,
  ].filter((v) => v !== null).length;
  // Backfill caps at "medium" — never "high". See header comment.
  const confidenceLevel: "low" | "medium" =
    populatedScoreCount >= 4 ? "medium" : "low";

  const payload = {
    ...basePayload,
    auditEngineVersion: "legacy_v1",
    scoringVersion: "legacy_v1",
    operatorReviewed,
    confidenceLevel,
  };

  const stats: BackfillFieldStats = {
    overallScorePopulated: payload.overallScore !== null,
    semanticClarityScorePopulated: payload.semanticClarityScore !== null,
    crawlerAccessibilityScorePopulated:
      payload.crawlerAccessibilityScore !== null,
    trustSignalScorePopulated: payload.trustSignalScore !== null,
    structuredIdentityScorePopulated:
      payload.structuredIdentityScore !== null,
    recommendationReadinessScorePopulated:
      payload.recommendationReadinessScore !== null,
    industryDetected:
      typeof payload.industryCategoryNormalized === "string" &&
      payload.industryCategoryNormalized !== "unknown",
    industrySlug: payload.industryCategoryNormalized ?? "unknown",
    operatorReviewed,
    confidenceLevel,
    populatedScoreCount,
  };

  if (dryRun) return { ok: true, outcome: "would_backfill", stats };

  try {
    await prisma.auditIntelligence.create({ data: payload });
    return { ok: true, outcome: "backfilled", stats };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : null;
    if (code === "P2002") {
      // Race: a worker wrote the row between our check and our create.
      // The other writer wins; this backfill exits cleanly.
      return { ok: false, reason: "race_already_inserted" };
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[audit-intelligence:backfill] create failed orderId=${orderId} message="${message}"`,
    );
    return { ok: false, reason: "create_failed" };
  }
}

function unique<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of arr) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}
