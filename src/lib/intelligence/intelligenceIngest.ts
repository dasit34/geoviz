/**
 * V2 Stage 1 — intelligence ingestion orchestrator.
 *
 * Called from `persistAuditIntelligence` AFTER the audit's markdown
 * has been saved to AuditOrder. Runs each detection / heuristic
 * module in its own try/catch so one module's failure cannot break
 * the others. The return value is merged into the AuditIntelligence
 * upsert payload.
 *
 *   • Pure function — no DB writes here. The persistence call is the
 *     caller's responsibility. This keeps ingest deterministic +
 *     unit-testable.
 *   • Never throws. Every module is wrapped; partial results return
 *     null for the failed dimension only.
 *   • Returns the same shape every time. Callers can spread the
 *     result directly into the Prisma upsert; null fields stay null.
 *
 * NOT consumed by scoring. NOT consumed by report rendering. NOT
 * consumed by customer-facing email or the PDF. Pure intelligence
 * layer — admin / operator visibility + V2 benchmark groundwork.
 *
 * Stage 1 scope: detection + readability + entities + score
 * provenance. Render-required heuristic is reserved; the
 * render* fields stay null until Stage 6 (post-launch browser
 * rendering).
 */

import {
  detectCms,
  type CmsDetectionResult,
} from "@/lib/intelligence/detectCms";
import {
  detectFramework,
  type FrameworkDetectionResult,
} from "@/lib/intelligence/detectFramework";
import {
  computeReadability,
  type ReadabilityResult,
} from "@/lib/intelligence/readability";
import {
  extractEntities,
  type EntityExtractionResult,
} from "@/lib/intelligence/entities";
import {
  buildScoreProvenance,
  type ScoreProvenance,
} from "@/lib/intelligence/scoreProvenance";
import type { ReportScore } from "@/lib/parse-report";

/**
 * Shape of the ingest result. Mirrors the V2 columns added in the
 * `add_v2_intelligence_fields` migration. Every field is null-safe
 * — modules that fail or that don't have confident signals return
 * null for their contribution.
 */
export type IntelligenceIngestResult = {
  cmsDetected: string | null;
  frameworkDetected: string | null;
  schemaTypes: string[] | null;
  aiReadabilityScore: number | null;
  contentDensity: number | null;
  renderRequired: boolean | null;
  renderAttempted: boolean | null;
  renderSuccessful: boolean | null;
  renderEngineVersion: string | null;
  benchmarkTags: string[] | null;
  extractedEntities: string[] | null;
  scoreProvenance: ScoreProvenance | null;
};

const EMPTY_RESULT: IntelligenceIngestResult = {
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
};

/**
 * Single-module guarded runner. Logs failures with the `[geo-intelligence]`
 * prefix so the operator can grep the full ingest lifecycle on one tail.
 * Returns `fallback` on any throw.
 */
function safe<T>(
  moduleLabel: string,
  fn: () => T,
  fallback: T,
): T {
  try {
    return fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(
      `[geo-intelligence] module=${moduleLabel} failed (non-fatal): ${message}`,
    );
    return fallback;
  }
}

export function runIntelligenceIngest(args: {
  reportMarkdown: string;
  businessName: string | null;
  websiteUrl: string;
  score: ReportScore;
  /** Optional logging context; emitted in `[geo-intelligence]` lines when provided. */
  orderId?: string;
}): IntelligenceIngestResult {
  const orderCtx = args.orderId ? ` orderId=${args.orderId}` : "";
  // ---- [geo-intelligence] ingest start ----
  // eslint-disable-next-line no-console
  console.log(`[geo-intelligence] ingest start${orderCtx}`);

  // Defensive: empty markdown means there's nothing to extract from.
  // Caller already guards on this but we duplicate the check so a
  // direct call from a unit test gets the right shape too.
  const md = args.reportMarkdown ?? "";
  if (md.trim().length === 0) {
    // ---- [geo-intelligence] ingest skipped ----
    // eslint-disable-next-line no-console
    console.log(
      `[geo-intelligence] ingest skipped${orderCtx} reason=empty_markdown`,
    );
    return { ...EMPTY_RESULT };
  }

  const cms: CmsDetectionResult = safe(
    "detectCms",
    () => detectCms({ reportMarkdown: md, websiteUrl: args.websiteUrl }),
    { detected: null, confidence: "none", signals: [] },
  );

  const framework: FrameworkDetectionResult = safe(
    "detectFramework",
    () =>
      detectFramework({ reportMarkdown: md, websiteUrl: args.websiteUrl }),
    { detected: null, confidence: "none", signals: [] },
  );

  const readability: ReadabilityResult = safe(
    "readability",
    () => computeReadability({ reportMarkdown: md }),
    {
      score: null,
      contentDensity: null,
      signals: {
        hasSemanticHeadings: false,
        hasFaqSection: false,
        hasServicesSection: false,
        hasLocationMention: false,
        hasReviewsSection: false,
        hasSchemaMention: false,
        markdownStructureClean: false,
      },
    },
  );

  const entities: EntityExtractionResult = safe(
    "entities",
    () =>
      extractEntities({
        reportMarkdown: md,
        businessName: args.businessName,
      }),
    { entities: [], counts: { services: 0, locations: 0, other: 0 } },
  );

  const provenance: ScoreProvenance = safe(
    "scoreProvenance",
    () => buildScoreProvenance({ reportMarkdown: md, score: args.score }),
    {},
  );

  // Derive renderRequired heuristically from JS-framework detection
  // + readability signals. Stage 1 ONLY sets the flag; no browser
  // execution. The renderAttempted / renderSuccessful /
  // renderEngineVersion fields stay null until Stage 6.
  const renderRequired =
    framework.detected !== null && framework.detected !== "vanilla"
      ? framework.confidence === "high" ||
        framework.confidence === "medium"
      : null;

  // System-set benchmark tags — auto-emitted cohort hints. Distinct
  // from the operator-set `benchmarkTag` scalar (calibration layer).
  // Stage 1 emits a small fixed set; Stage 5 will refine as
  // benchmarks gain sample size.
  const benchmarkTags: string[] = [];
  if (framework.detected !== null && framework.confidence !== "none") {
    benchmarkTags.push(`framework:${framework.detected}`);
  }
  if (cms.detected !== null && cms.confidence !== "none") {
    benchmarkTags.push(`cms:${cms.detected}`);
  }
  if (
    readability.contentDensity !== null &&
    readability.contentDensity < 200
  ) {
    benchmarkTags.push("thin_content");
  }
  if (renderRequired === true) {
    benchmarkTags.push("js_heavy");
  }

  const result: IntelligenceIngestResult = {
    cmsDetected: cms.detected,
    frameworkDetected: framework.detected,
    // Stage 1 doesn't extract schema types yet — markdown rarely
    // distinguishes them clearly. Stays null until Stage 2 refines.
    schemaTypes: null,
    aiReadabilityScore: readability.score,
    contentDensity: readability.contentDensity,
    renderRequired,
    renderAttempted: null,
    renderSuccessful: null,
    renderEngineVersion: null,
    benchmarkTags: benchmarkTags.length > 0 ? benchmarkTags : null,
    extractedEntities:
      entities.entities.length > 0 ? entities.entities : null,
    scoreProvenance:
      Object.keys(provenance).length > 0 ? provenance : null,
  };

  // ---- [geo-intelligence] ingest success ----
  // One-line summary of what populated. Operator can grep this prefix
  // to confirm each audit's intelligence ingest completed.
  // eslint-disable-next-line no-console
  console.log(
    `[geo-intelligence] ingest success${orderCtx} cms=${result.cmsDetected ?? "-"} framework=${result.frameworkDetected ?? "-"} readability=${result.aiReadabilityScore ?? "-"} density=${result.contentDensity ?? "-"} renderRequired=${result.renderRequired ?? "-"} entities=${result.extractedEntities?.length ?? 0} provenanceDims=${result.scoreProvenance ? Object.keys(result.scoreProvenance).length : 0}`,
  );

  return result;
}
