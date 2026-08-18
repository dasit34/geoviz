/**
 * The one entry point that turns two audits' persisted evidence into
 * an `AuditComparisonResult`. Pure/deterministic aside from the
 * cohort-position lookup (a DB read, not a model call) — no LLM
 * involved anywhere in this file. Admin view, customer view, and the
 * verification PDF all call this same function so the numbers are
 * guaranteed identical everywhere they're shown.
 *
 * Callers pass in the minimal projection this needs (not the full
 * Prisma row) so the engine stays testable without a DB — see
 * `AuditSnapshotInput` below and the test scripts under `scripts/`.
 */
import type { DeterministicScore, CategoryKey, PublicBucketKey } from "@/lib/scoring/types";
import type {
  NormalizedValidationOutput,
  ValidationLayerResult,
} from "@/lib/validators/types";
import { computeDimensions } from "@/lib/consensus/dimensions";
import { getAuditPercentile } from "@/lib/intelligence/audit-percentile";
import { classifyBooleanDelta, classifyScoreDelta } from "./classify";
import { computeQueryConsistency } from "./queryConsistency";
import {
  COMPARISON_ENGINE_VERSION,
  type AuditComparisonResult,
  type CohortContext,
  type CohortPosition,
  type CompetitorComparison,
  type IssueComparisonEntry,
  type LabeledScoreDelta,
  type LiveModelComparison,
  type ProviderComparisonEntry,
  type ProviderSnapshot,
  type SiteTechnicalComparison,
} from "./types";

export type AuditSnapshotInput = {
  auditOrderId: string;
  createdAt: Date;
  industryCategoryNormalized: string | null;
  industryTaxonomyVersion: string | null;
  /** Raw Json column value — validated defensively, never assumed well-formed. */
  deterministicScore: unknown;
  /** Raw Json column value — validated defensively, never assumed well-formed. */
  aiValidations: unknown;
};

const BUCKET_LABEL: Record<PublicBucketKey, string> = {
  understanding: "Understanding",
  retrieval: "AI Accessibility",
  trust: "Trust",
  recommendation: "Recommendation Readiness",
};
const BUCKET_ORDER: PublicBucketKey[] = [
  "understanding",
  "retrieval",
  "trust",
  "recommendation",
];

const CATEGORY_LABEL: Record<CategoryKey, string> = {
  schema: "Structured Data / Schema",
  crawler: "Crawl Access",
  trust: "Trust Signals",
  content: "Content Depth",
  brand: "Brand Presence",
  tech: "Content Extraction",
};
const CATEGORY_ORDER: CategoryKey[] = [
  "schema",
  "crawler",
  "trust",
  "content",
  "brand",
  "tech",
];

const PROVIDER_DISPLAY: Record<string, string> = {
  openai: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};
const PROVIDER_ORDER = ["openai", "claude", "gemini", "perplexity"];

/** Safe cast — Json columns are `unknown` at the type level; validate shape loosely, never throw. */
function asDeterministicScore(value: unknown): DeterministicScore | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<DeterministicScore>;
  if (typeof v.overall_score !== "number" || !v.category_scores || !v.public_bucket_scores) {
    return null;
  }
  return v as DeterministicScore;
}

function asValidationOutputs(value: unknown): NormalizedValidationOutput[] {
  if (!value || typeof value !== "object") return [];
  const outputs = (value as Partial<ValidationLayerResult>).outputs;
  return Array.isArray(outputs) ? outputs : [];
}

function categoryPct(det: DeterministicScore, key: CategoryKey): number | null {
  const cat = det.category_scores?.[key];
  if (!cat || typeof cat.score !== "number" || !cat.max) return null;
  return Math.round((cat.score / cat.max) * 100);
}

function avg(...vals: Array<number | null>): number | null {
  const nums = vals.filter((v): v is number => v !== null);
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

// ── Site / technical ──────────────────────────────────────────────

function buildSiteTechnical(
  previous: DeterministicScore,
  current: DeterministicScore,
): SiteTechnicalComparison {
  const overall = classifyScoreDelta(previous.overall_score, current.overall_score);

  // "recommendation" is deliberately NOT read from public_bucket_scores
  // — that field is a different, internal-only calibration concept
  // (Content category only) that report-model.ts explicitly avoids for
  // the customer-facing "Recommendation Readiness" dimension. The real
  // canonical value is the weighted composite (brand 0.25 + schema 0.30
  // + trust 0.25 + content 0.20) from computeDimensions() — same
  // function report-model.ts calls for the cover/Page-6 headline, reused
  // here so this comparison can never disagree with the report itself.
  // Caught via real production data (FlagStat): reading
  // public_bucket_scores.recommendation directly produced a number that
  // silently duplicated the Content Depth diagnostic instead of the
  // real composite.
  const prevRecommendationPct = computeDimensions(previous).recommendation_readiness.score;
  const currRecommendationPct = computeDimensions(current).recommendation_readiness.score;

  const dimensions: LabeledScoreDelta[] = BUCKET_ORDER.map((key) => {
    if (key === "recommendation") {
      return {
        key,
        label: BUCKET_LABEL[key],
        ...classifyScoreDelta(prevRecommendationPct, currRecommendationPct),
      };
    }
    const prevBucket = previous.public_bucket_scores?.[key];
    const currBucket = current.public_bucket_scores?.[key];
    const prevPct =
      prevBucket && prevBucket.max ? Math.round((prevBucket.score / prevBucket.max) * 100) : null;
    const currPct =
      currBucket && currBucket.max ? Math.round((currBucket.score / currBucket.max) * 100) : null;
    return { key, label: BUCKET_LABEL[key], ...classifyScoreDelta(prevPct, currPct) };
  });

  const diagnostics: LabeledScoreDelta[] = CATEGORY_ORDER.map((key) => ({
    key,
    label: CATEGORY_LABEL[key],
    ...classifyScoreDelta(categoryPct(previous, key), categoryPct(current, key)),
  }));

  // Mirrors report-model.ts's `readiness` derivation exactly (same
  // formula, independently computed here since nothing in that file
  // is exported for reuse — see the plan's investigation notes).
  const readiness: LabeledScoreDelta[] = [
    {
      key: "ai-overviews",
      label: "Google AI Overviews Readiness",
      ...classifyScoreDelta(
        avg(categoryPct(previous, "schema"), categoryPct(previous, "crawler"), categoryPct(previous, "content")),
        avg(categoryPct(current, "schema"), categoryPct(current, "crawler"), categoryPct(current, "content")),
      ),
    },
    {
      key: "structured-identity",
      label: "Structured Identity",
      ...classifyScoreDelta(categoryPct(previous, "schema"), categoryPct(current, "schema")),
    },
    {
      key: "entity-consistency",
      label: "Entity Consistency",
      ...classifyScoreDelta(categoryPct(previous, "brand"), categoryPct(current, "brand")),
    },
    {
      key: "trust-evidence",
      label: "Trust Evidence",
      ...classifyScoreDelta(categoryPct(previous, "trust"), categoryPct(current, "trust")),
    },
  ];

  const issues = buildIssueComparison(previous, current);

  return { overall, dimensions, diagnostics, readiness, issues };
}

function buildIssueComparison(previous: DeterministicScore, current: DeterministicScore) {
  const prevIssues = new Map<string, IssueComparisonEntry>();
  const currIssues = new Map<string, IssueComparisonEntry>();
  for (const key of CATEGORY_ORDER) {
    for (const issue of previous.category_scores?.[key]?.issues ?? []) {
      prevIssues.set(issue.id, {
        id: issue.id,
        message: issue.message,
        categoryKey: key,
        severity: issue.severity,
      });
    }
    for (const issue of current.category_scores?.[key]?.issues ?? []) {
      currIssues.set(issue.id, {
        id: issue.id,
        message: issue.message,
        categoryKey: key,
        severity: issue.severity,
      });
    }
  }

  const resolved: IssueComparisonEntry[] = [];
  const unchanged: IssueComparisonEntry[] = [];
  for (const [id, entry] of prevIssues) {
    if (currIssues.has(id)) unchanged.push(entry);
    else resolved.push(entry);
  }
  const newIssues: IssueComparisonEntry[] = [];
  for (const [id, entry] of currIssues) {
    if (!prevIssues.has(id)) newIssues.push(entry);
  }

  // "Partially resolved" — same category still has issues, but the
  // category's severity mix improved (fewer critical-severity issues
  // than before) even though not every individual issue id cleared.
  // Deterministic from the issue lists above; not a separate signal.
  const partiallyResolved: IssueComparisonEntry[] = [];
  for (const key of CATEGORY_ORDER) {
    const prevCritical = (previous.category_scores?.[key]?.issues ?? []).filter(
      (i) => i.severity === "critical",
    ).length;
    const currCritical = (current.category_scores?.[key]?.issues ?? []).filter(
      (i) => i.severity === "critical",
    ).length;
    if (currCritical < prevCritical && currCritical > 0) {
      const stillPresent = (current.category_scores?.[key]?.issues ?? []).find(
        (i) => i.severity === "critical",
      );
      if (stillPresent) {
        partiallyResolved.push({
          id: stillPresent.id,
          message: stillPresent.message,
          categoryKey: key,
          severity: stillPresent.severity,
        });
      }
    }
  }

  return { resolved, partiallyResolved, unchanged, new: newIssues };
}

// ── Live AI model movement ────────────────────────────────────────

function toSnapshot(o: NormalizedValidationOutput | undefined): ProviderSnapshot | null {
  if (!o) return null;
  return {
    status: o.status,
    businessUnderstandingScore: o.business_understanding_score,
    wouldRecommend: o.would_recommend ?? null,
    mentioned: o.competitive?.business_named === true,
    citationCount: o.cited_sources?.length ?? 0,
    topEntityNamed: o.competitive?.entities?.[0] ?? null,
    queryText: o.competitive?.query_text ?? null,
  };
}

function buildLiveModel(
  previousOutputs: NormalizedValidationOutput[],
  currentOutputs: NormalizedValidationOutput[],
  queryConsistency: ReturnType<typeof computeQueryConsistency>,
): LiveModelComparison {
  const prevByProvider = new Map(previousOutputs.map((o) => [o.provider, o]));
  const currByProvider = new Map(currentOutputs.map((o) => [o.provider, o]));

  const providers: ProviderComparisonEntry[] = PROVIDER_ORDER.map((provider) => {
    const prevOutput = prevByProvider.get(provider);
    const currOutput = currByProvider.get(provider);
    const previous = toSnapshot(prevOutput);
    const current = toSnapshot(currOutput);

    const bothPassed = prevOutput?.status === "passed" && currOutput?.status === "passed";
    const queryMatch = queryConsistency.perProviderQueryMatch[provider];
    const queryMismatch = queryMatch === false;

    const comparable = bothPassed && !queryMismatch;
    const notComparableReason = !bothPassed
      ? "This provider did not return a usable result on one or both audits."
      : queryMismatch
        ? "The buyer-intent query text sent to this provider changed between audits — not a clean before/after."
        : null;

    return {
      provider,
      display: PROVIDER_DISPLAY[provider] ?? provider,
      comparable,
      notComparableReason,
      previous,
      current,
      understandingScore: comparable
        ? classifyScoreDelta(previous?.businessUnderstandingScore ?? null, current?.businessUnderstandingScore ?? null)
        : { previous: null, current: null, delta: null, classification: "NOT_COMPARABLE" },
      mentioned: comparable
        ? classifyBooleanDelta(previous?.mentioned ?? null, current?.mentioned ?? null)
        : { previous: null, current: null, classification: "NOT_COMPARABLE" },
      recommended: comparable
        ? classifyBooleanDelta(
            previous ? previous.wouldRecommend === "YES" : null,
            current ? current.wouldRecommend === "YES" : null,
          )
        : { previous: null, current: null, classification: "NOT_COMPARABLE" },
      citationCount: comparable
        ? classifyScoreDelta(previous?.citationCount ?? null, current?.citationCount ?? null)
        : { previous: null, current: null, delta: null, classification: "NOT_COMPARABLE" },
    };
  });

  const previouslyNamed = uniqueEntities(previousOutputs);
  const currentlyNamed = uniqueEntities(currentOutputs);
  const competitors: CompetitorComparison = {
    previouslyNamed,
    currentlyNamed,
    newlyAppearing: currentlyNamed.filter((c) => !previouslyNamed.includes(c)),
    noLongerAppearing: previouslyNamed.filter((c) => !currentlyNamed.includes(c)),
    persisting: currentlyNamed.filter((c) => previouslyNamed.includes(c)),
  };

  const recommendedCount = {
    previous: previousOutputs.filter((o) => o.would_recommend === "YES").length,
    current: currentOutputs.filter((o) => o.would_recommend === "YES").length,
    totalProviders: PROVIDER_ORDER.length,
  };

  return { providers, competitors, recommendedCount };
}

function uniqueEntities(outputs: NormalizedValidationOutput[]): string[] {
  const set = new Set<string>();
  for (const o of outputs) {
    for (const e of o.competitive?.entities ?? []) set.add(e.trim());
  }
  return Array.from(set).filter(Boolean);
}

// ── Cohort context (never a delta) ────────────────────────────────

async function buildCohortPosition(
  overallScore: number | null,
  industry: string | null,
): Promise<CohortPosition | null> {
  if (overallScore === null) return null;
  try {
    // getAuditPercentile ranks against the CURRENT live cohort — it
    // does not (and cannot) reconstruct "the cohort as it existed
    // when the previous audit ran." Both calls below intentionally
    // rank against today's same cohort, so this is always presented
    // as "where does score X land today," never as a percentile
    // delta implying the customer's own movement caused a cohort
    // shift — see this module's doc comment and the customer-facing
    // copy in VerificationReportView.
    const result = await getAuditPercentile({
      score: overallScore,
      industry,
      metric: "overallScore",
    });
    return {
      label: "Current cohort position",
      copy: result.copy,
      percentile: result.percentile,
      cohortSize: result.cohortSize,
      bucket: result.bucket,
    };
  } catch (err) {
    console.warn(
      `[audit-comparison] cohort lookup failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ── Entry point ────────────────────────────────────────────────────

export async function buildAuditComparison(
  previous: AuditSnapshotInput,
  current: AuditSnapshotInput,
): Promise<AuditComparisonResult> {
  const previousDet = asDeterministicScore(previous.deterministicScore);
  const currentDet = asDeterministicScore(current.deterministicScore);
  const previousOutputs = asValidationOutputs(previous.aiValidations);
  const currentOutputs = asValidationOutputs(current.aiValidations);

  const queryConsistency = computeQueryConsistency({
    previousCategory: previous.industryCategoryNormalized,
    previousTaxonomyVersion: previous.industryTaxonomyVersion,
    currentCategory: current.industryCategoryNormalized,
    currentTaxonomyVersion: current.industryTaxonomyVersion,
    previousOutputs,
    currentOutputs,
  });

  const siteTechnical =
    previousDet && currentDet ? buildSiteTechnical(previousDet, currentDet) : null;

  const liveModel =
    previousOutputs.length > 0 || currentOutputs.length > 0
      ? buildLiveModel(previousOutputs, currentOutputs, queryConsistency)
      : null;

  const [previousCohort, currentCohort] = await Promise.all([
    buildCohortPosition(previousDet?.overall_score ?? null, previous.industryCategoryNormalized),
    buildCohortPosition(currentDet?.overall_score ?? null, current.industryCategoryNormalized),
  ]);

  const cohort: CohortContext = {
    previous: previousCohort,
    current: currentCohort,
    note:
      "Cohort position reflects today's audit dataset for both scores — it is not a percentile you moved through, since cohort composition changes independently of your own results.",
  };

  return {
    engineVersion: COMPARISON_ENGINE_VERSION,
    previousAuditOrderId: previous.auditOrderId,
    currentAuditOrderId: current.auditOrderId,
    previousCreatedAt: previous.createdAt,
    currentCreatedAt: current.createdAt,
    availability: {
      siteTechnicalAvailable: siteTechnical !== null,
      liveModelAvailable: liveModel !== null,
    },
    queryConsistency,
    siteTechnical,
    liveModel,
    cohort,
  };
}
