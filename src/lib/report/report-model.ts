/**
 * Canonical Report Model — the single typed source of truth for the
 * customer-facing AI Visibility Intelligence Report.
 *
 * WHY THIS EXISTS
 * The report used to be reconstructed by parsing the LLM's free-form
 * markdown back into structure (headings, issues, fixes) with fragile
 * heuristics in `parse-report.ts`. Two audits of similar sites rendered
 * differently — the "AI-generated / inconsistent" feeling. This module
 * assembles ONE deterministic, typed `ReportModel` from data that is
 * ALREADY structured:
 *   - the deterministic scoring engine (`DeterministicScore`):
 *     overall/band, six category scores + reasons, the four public
 *     buckets, top-3 findings, top-3 recommended fixes, confidence;
 *   - the cross-model validators (per-provider verdicts);
 *   - the percentile/confidence context (`buildReportContext`);
 *   - the resolved business name.
 *
 * The renderer consumes this model in a FIXED order with FIXED headings.
 * The LLM is demoted to filling a few narration slots (Phase 2) — it no
 * longer controls layout, order, headings, or which findings appear.
 *
 * Pure. No I/O, no Date, no random — callers pass pre-fetched inputs so
 * admin preview, PDF, and email all build the identical model.
 */

import type {
  DeterministicScore,
  CategoryKey,
  PublicBucketKey,
  IssueSeverity,
} from "@/lib/scoring/types";
import type { PreflightSignals } from "@/lib/intelligence/preflight/types";
import type { ReportScore } from "@/lib/parse-report";
import {
  plainEnglishBandLabel,
  scoreToneFromOverall,
  categoryToneFromRatio,
} from "@/lib/parse-report";
import { getCanonicalScore } from "@/lib/scoring/getCanonicalScore";

export type Tone = "ok" | "warn" | "bad" | "muted";

export type ReportModelMeta = {
  reportId: string;
  orderId: string;
  businessName: string;
  /** Surfaced when the resolved name diverges from the customer input. */
  nameAlternates: string[];
  website: string;
  generatedAt: Date | null;
  reviewedBy: string;
  /** "Top 25% (dental)" / "Industry benchmark forming" */
  cohort: string | null;
};

export type ReportModelScore = {
  overall: number | null;
  band: string;
  tone: Tone;
  /** Confidence framing ("Audit completeness: Moderate"). */
  confidenceLabel: string | null;
  confidenceReason: string | null;
  percentileCopy: string | null;
};

export type ReportModelCategory = {
  key: CategoryKey;
  label: string;
  /** Normalized 0–100 display score. */
  score: number | null;
  /** Rubric weight in percent (max == weight; rubric sums to 100). */
  weight: number;
  tone: Tone;
  reason: string;
  tooltip: string;
};

export type ReportModelBucket = {
  key: PublicBucketKey;
  label: string;
  /** 0–100 percentage. */
  pct: number;
  tone: Tone;
};

export type ProviderVerdict = "YES" | "PARTIAL" | "NO" | "UNAVAILABLE";

export type Confidence = "low" | "medium" | "high" | null;

export type ReportModelProvider = {
  provider: string;
  display: string;
  status: string;
  verdict: ProviderVerdict;
  businessType: string | null;
  location: string | null;
  topServices: string[];
  mainGap: string | null;
  reason: string | null;
  /** Per-platform business-understanding score (0–100), if scored. */
  understandingScore: number | null;
  /** Per-platform recommendation readiness. */
  recommendationReadiness: Confidence;
};

export type ReportModelDiagnostic = {
  rank: number;
  title: string;
  severity: IssueSeverity;
  category: CategoryKey;
  /** Plain-English problem statement. */
  problem: string;
  /** Why it hurts AI visibility. */
  whyItHurts: string;
};

export type FixDifficulty = "Easy" | "Moderate" | "Technical";

export type ReportModelFix = {
  rank: number;
  /** Short issue/headline the fix addresses (distinct from `action`). */
  issue: string;
  title: string;
  difficulty: FixDifficulty;
  impact: "high" | "medium" | "low";
  /** Concrete action ("exact fix"). */
  action: string;
  /** Business outcome. */
  businessImpact: string;
  /** Platforms / capabilities this unlocks. */
  unlocks: string[];
  /** Whether the GeoViz Foundation Fix covers it. */
  foundationFix: boolean;
};

export type ReportModelExecutive = {
  headline: string;
  summaryBullets: string[];
  strongestSignal: string;
  weakestSignal: string;
  /** Bare category label of the strongest signal (for stat tiles). */
  strongestLabel: string;
  /** Bare category label of the widest gap (for stat tiles). */
  weakestLabel: string;
};

/** A single inspected-signal row for the "Evidence Reviewed" page. */
export type EvidenceStatus = "pass" | "warn" | "fail" | "na";
export type ReportModelEvidence = {
  label: string;
  descriptor: string;
  status: EvidenceStatus;
};

/**
 * A derived AI-search / visibility readiness factor. NOT a model
 * validation — these are computed deterministically from the audit
 * categories. Google AI Overviews lives here (a search surface /
 * visibility target), never in `providers[]` (the four directly-tested
 * LLMs).
 */
export type ReadinessFactor = {
  key: string;
  label: string;
  /** 0–100 readiness, or null when not computable. */
  score: number | null;
  tone: Tone;
  /** Which signals feed this readiness factor. */
  basis: string;
};

export type ReportModel = {
  meta: ReportModelMeta;
  score: ReportModelScore;
  executive: ReportModelExecutive;
  buckets: ReportModelBucket[];
  categories: ReportModelCategory[];
  providers: ReportModelProvider[];
  /** Derived AI-search / visibility readiness factors (incl. Google AI Overviews). */
  readiness: ReadinessFactor[];
  /** Inspected-signal rows for the "Evidence Reviewed" page (from preflight). */
  evidence: ReportModelEvidence[];
  diagnostics: ReportModelDiagnostic[];
  fixes: ReportModelFix[];
  businessImpact: string;
  /** True when at least one cross-model validator passed. */
  hasProviders: boolean;
  /** True when preflight signals were available to populate Evidence Reviewed. */
  hasEvidence: boolean;
};

// ── Display vocab ───────────────────────────────────────────────────
const CATEGORY_LABEL: Record<CategoryKey, { label: string; tooltip: string }> = {
  schema: {
    label: "Recommendation Ready",
    tooltip: "How clearly AI systems can identify who you are and what you do.",
  },
  crawler: {
    label: "Technical Access",
    tooltip: "Whether AI systems can access and understand your website content.",
  },
  trust: {
    label: "Trust Signals",
    tooltip:
      "Whether reviews, citations, and consistent business info make AI confident enough to recommend you.",
  },
  content: {
    label: "Content Depth",
    tooltip:
      "Whether your site has the depth of service and FAQ content AI can quote when answering customers.",
  },
  brand: {
    label: "Brand Presence",
    tooltip:
      "Whether AI can confidently identify your business as one consistent entity across the web.",
  },
  tech: {
    label: "AI Readability",
    tooltip:
      "How easily AI systems can retrieve and interpret your site structure and content.",
  },
};

const BUCKET_LABEL: Record<PublicBucketKey, string> = {
  understanding: "Understanding",
  retrieval: "Retrieval",
  trust: "Trust",
  recommendation: "Recommendation",
};

const CATEGORY_ORDER: CategoryKey[] = [
  "schema",
  "crawler",
  "trust",
  "content",
  "brand",
  "tech",
];

const BUCKET_ORDER: PublicBucketKey[] = [
  "understanding",
  "retrieval",
  "trust",
  "recommendation",
];

// Deterministic fix metadata keyed by the finding's category. Replaces
// the LLM-authored "Difficulty / Foundation Fix / Unlocks" prose.
const FIX_META: Record<
  CategoryKey,
  { difficulty: FixDifficulty; foundationFix: boolean; unlocks: string[] }
> = {
  schema: {
    difficulty: "Technical",
    foundationFix: true,
    unlocks: ["ChatGPT citations", "Gemini understanding", "Perplexity sourcing"],
  },
  crawler: {
    difficulty: "Technical",
    foundationFix: true,
    unlocks: ["ChatGPT citations", "Claude reasoning", "Perplexity sourcing"],
  },
  trust: {
    difficulty: "Moderate",
    foundationFix: true,
    unlocks: ["Gemini understanding", "ChatGPT citations", "Perplexity sourcing"],
  },
  content: {
    difficulty: "Moderate",
    foundationFix: true,
    unlocks: ["Perplexity sourcing", "ChatGPT citations", "Claude reasoning"],
  },
  brand: {
    difficulty: "Easy",
    foundationFix: true,
    unlocks: ["Gemini understanding", "ChatGPT citations", "Claude reasoning"],
  },
  tech: {
    difficulty: "Technical",
    foundationFix: true,
    unlocks: ["ChatGPT citations", "Gemini understanding", "Perplexity sourcing"],
  },
};

// Category-specific deterministic narration. Used when the constrained
// LLM narration pass (Phase 2) hasn't supplied a customer-specific line,
// so the report reads as written-for-this-business rather than a single
// repeated template sentence.
const WHY_IT_HURTS: Record<CategoryKey, string> = {
  schema:
    "When a customer asks an AI assistant for a local option, the model needs a confirmed business identity to name. Without it, AI systems skip you and cite a competitor they can verify.",
  crawler:
    "If AI systems can't reliably reach or read the page, none of your other signals matter — the content simply isn't in the answer.",
  trust:
    "AI systems weigh third-party trust heavily before recommending a business. With nothing verifiable to cite, your recommendation confidence stays low.",
  content:
    "AI answers quote depth. A thin page gives the model nothing to pull from, so a content-richer competitor gets named instead.",
  brand:
    "AI systems build confidence around a single, consistently named business. Conflicting names read as an unreliable entity and reduce the chance you're cited.",
  tech: "If your structure is hard to interpret, AI systems misread or skip parts of your site, weakening every downstream signal.",
};

const FIX_BUSINESS_IMPACT: Record<CategoryKey, string> = {
  schema:
    "AI tools can now confirm who you are and where you operate — the minimum required to appear in a local recommendation.",
  crawler:
    "AI systems can reliably read the page, so the rest of your signals actually reach the answer.",
  trust:
    "Verifiable trust signals raise recommendation confidence, making AI systems far more likely to name you.",
  content:
    "AI tools gain real content to quote, making it far more likely you're cited instead of a competitor.",
  brand:
    "AI systems resolve a single, clearly identified business and can cite it confidently by name.",
  tech: "A cleaner structure lets AI systems interpret your site fully, strengthening every signal.",
};

function toneForPct(pct: number): Tone {
  return categoryToneFromRatio(pct / 100);
}

function isPreflight(v: unknown): v is PreflightSignals {
  return (
    !!v &&
    typeof v === "object" &&
    "fetchOk" in (v as object) &&
    "engineVersion" in (v as object)
  );
}

/**
 * Build the "Evidence Reviewed" rows from preflight signals (+ the trust
 * category as a proxy for review/trust markers). Real data only — every
 * row falls back to "na" ("Not analyzed") when its signal is absent, so
 * legacy audits without preflight degrade gracefully. Order matches the
 * report template.
 */
function buildEvidence(
  preflight: unknown,
  trustPct: number | null,
): ReportModelEvidence[] {
  const p = isPreflight(preflight) ? preflight : null;
  const rows: ReportModelEvidence[] = [];

  // 1. Homepage readable content
  const r = p?.readability ?? null;
  rows.push(
    !r
      ? { label: "Homepage readable content", descriptor: "Not analyzed", status: "na" }
      : r.parsedByReadability
        ? {
            label: "Homepage readable content",
            descriptor: "Extracted article text successfully",
            status: "pass",
          }
        : r.textLength > 0
          ? {
              label: "Homepage readable content",
              descriptor: "Body text extracted via fallback",
              status: "warn",
            }
          : {
              label: "Homepage readable content",
              descriptor: "Little readable text could be extracted",
              status: "fail",
            },
  );

  // 2. JSON-LD schema blocks
  const s = p?.schema ?? null;
  rows.push(
    !s
      ? { label: "JSON-LD schema blocks", descriptor: "Not analyzed", status: "na" }
      : s.rawJsonLdCount === 0
        ? {
            label: "JSON-LD schema blocks",
            descriptor: "No JSON-LD structured data found",
            status: "fail",
          }
        : s.missingFields.length > 0
          ? {
              label: "JSON-LD schema blocks",
              descriptor: `${s.rawJsonLdCount} block${s.rawJsonLdCount === 1 ? "" : "s"} found; identity fields incomplete`,
              status: "warn",
            }
          : {
              label: "JSON-LD schema blocks",
              descriptor: `${s.rawJsonLdCount} block${s.rawJsonLdCount === 1 ? "" : "s"} found; identity fields complete`,
              status: "pass",
            },
  );

  // 3. NAP consistency
  const e = p?.entityConsistency ?? null;
  rows.push(
    !e
      ? { label: "NAP consistency", descriptor: "Not analyzed", status: "na" }
      : e.inconsistencies.length > 0
        ? {
            label: "NAP consistency",
            descriptor: `${e.inconsistencies.length} name / address / phone inconsistenc${e.inconsistencies.length === 1 ? "y" : "ies"} detected`,
            status: "fail",
          }
        : {
            label: "NAP consistency",
            descriptor: "Name, address, and phone align across surfaces",
            status: "pass",
          },
  );

  // 4. Robots and crawl access
  const c = p?.crawlability ?? null;
  rows.push(
    !c
      ? { label: "Robots and crawl access", descriptor: "Not analyzed", status: "na" }
      : c.score >= 70
        ? {
            label: "Robots and crawl access",
            descriptor: "robots.txt present; site accessible",
            status: "pass",
          }
        : c.score >= 40
          ? {
              label: "Robots and crawl access",
              descriptor: c.warnings[0] ?? "Some crawl-access limitations detected",
              status: "warn",
            }
          : {
              label: "Robots and crawl access",
              descriptor: c.failedChecks[0] ?? "Crawl access blocked or misconfigured",
              status: "fail",
            },
  );

  // 5. Homepage depth (word count)
  rows.push(
    !r
      ? { label: "Homepage depth", descriptor: "Not analyzed", status: "na" }
      : r.wordCount >= 300
        ? {
            label: "Homepage depth",
            descriptor: `${r.wordCount} words; meets depth recommendation`,
            status: "pass",
          }
        : {
            label: "Homepage depth",
            descriptor: `${r.wordCount} words; below 300-word recommendation`,
            status: "warn",
          },
  );

  // 6. Reviews and trust signals (trust category as the proxy signal)
  rows.push(
    trustPct === null
      ? { label: "Reviews and trust signals", descriptor: "Not analyzed", status: "na" }
      : trustPct >= 60
        ? {
            label: "Reviews and trust signals",
            descriptor: "Verifiable third-party trust markers present",
            status: "pass",
          }
        : trustPct >= 30
          ? {
              label: "Reviews and trust signals",
              descriptor: "Limited third-party trust markers",
              status: "warn",
            }
          : {
              label: "Reviews and trust signals",
              descriptor: "Insufficient verifiable third-party trust markers",
              status: "fail",
            },
  );

  return rows;
}

function pctOf(score: number, max: number): number {
  return max > 0 ? Math.round((score / max) * 100) : 0;
}

// ── Narration source (Phase 2 fills this; Phase 1 = deterministic) ──
/**
 * Optional per-slot narration. When absent (Phase 1) the model uses the
 * deterministic category reasons + finding messages + templated copy.
 * When the constrained-LLM pass lands (Phase 2) this carries the
 * customer-specific lines, validated against this shape.
 */
export type ReportNarration = {
  executiveHeadline?: string;
  executiveBullets?: string[];
  /** Keyed by finding id → { problem, whyItHurts }. */
  diagnostics?: Record<string, { problem?: string; whyItHurts?: string }>;
  /** Keyed by fix id → { action, businessImpact }. */
  fixes?: Record<string, { action?: string; businessImpact?: string }>;
  businessImpact?: string;
};

export type BuildReportModelInput = {
  reportId: string;
  orderId: string;
  resolvedBusinessName: string;
  nameAlternates: string[];
  website: string;
  generatedAt: Date | null;
  reviewedBy?: string;
  /** Canonical score (from getCanonicalScore) for display categories. */
  score: ReportScore;
  /** The deterministic engine output (buckets, findings, fixes). */
  deterministic: DeterministicScore | null;
  /** Validator layer outputs[] (already structured). */
  providerOutputs: unknown;
  /** Percentile/cohort/confidence (from buildReportContext). */
  context?: {
    percentileCopy?: string | null;
    cohortCellValue?: string | null;
    confidenceLabel?: string | null;
    confidenceReason?: string | null;
  } | null;
  /** V2 preflight signals → "Evidence Reviewed" page. Null/absent for legacy. */
  preflightSignals?: unknown;
  /** Phase 2 narration; omit for deterministic Phase-1 copy. */
  narration?: ReportNarration | null;
};

function isDeterministic(v: unknown): v is DeterministicScore {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.overall_score === "number" &&
    typeof o.category_scores === "object" &&
    o.category_scores !== null
  );
}

type ProviderShape = {
  provider?: string;
  status?: string;
  industry_identified?: string;
  location_identified?: string;
  services_identified?: string[];
  missing_facts?: string[];
  would_recommend?: string;
  recommendation_reason?: string;
  business_understanding_score?: number | null;
  recommendation_confidence?: string | null;
};

function asConfidence(v: unknown): Confidence {
  return v === "low" || v === "medium" || v === "high" ? v : null;
}

const PROVIDER_DISPLAY: Record<string, string> = {
  openai: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};
const PROVIDER_ORDER = ["openai", "claude", "gemini", "perplexity"];

function buildProviders(outputs: unknown): ReportModelProvider[] {
  const list = Array.isArray(outputs) ? (outputs as ProviderShape[]) : [];
  const byProvider: Record<string, ProviderShape> = {};
  for (const o of list) {
    if (o && typeof o.provider === "string") byProvider[o.provider] = o;
  }
  return PROVIDER_ORDER.map((p) => {
    const o = byProvider[p];
    const display = PROVIDER_DISPLAY[p] ?? p;
    if (!o || o.status !== "passed") {
      return {
        provider: p,
        display,
        status: o?.status ?? "unavailable",
        verdict: "UNAVAILABLE" as ProviderVerdict,
        businessType: null,
        location: null,
        topServices: [],
        mainGap: null,
        reason: null,
        understandingScore: null,
        recommendationReadiness: null,
      };
    }
    const services = (o.services_identified ?? [])
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 3);
    const mainGap =
      (o.missing_facts ?? []).map((s) => s.trim()).find((s) => s.length > 0) ??
      null;
    const verdict =
      o.would_recommend === "YES" ||
      o.would_recommend === "PARTIAL" ||
      o.would_recommend === "NO"
        ? (o.would_recommend as ProviderVerdict)
        : ("PARTIAL" as ProviderVerdict);
    const us =
      typeof o.business_understanding_score === "number" &&
      Number.isFinite(o.business_understanding_score)
        ? Math.max(0, Math.min(100, Math.round(o.business_understanding_score)))
        : null;
    return {
      provider: p,
      display,
      status: "passed",
      verdict,
      businessType: o.industry_identified?.trim() || null,
      location: o.location_identified?.trim() || null,
      topServices: services,
      mainGap,
      reason: o.recommendation_reason?.trim() || null,
      understandingScore: us,
      recommendationReadiness: asConfidence(o.recommendation_confidence),
    };
  });
}

/**
 * Assemble the canonical ReportModel. Pure + deterministic for a given
 * input. Returns null only when there is no usable score at all.
 */
export function buildReportModel(
  input: BuildReportModelInput,
): ReportModel | null {
  const { score } = input;
  if (score.overall === null && (score.categories?.length ?? 0) === 0) {
    return null;
  }
  const det = isDeterministic(input.deterministic) ? input.deterministic : null;
  const narration = input.narration ?? null;
  const tone = scoreToneFromOverall(score.overall) as Tone;
  const band =
    typeof score.overall === "number"
      ? plainEnglishBandLabel(score.overall)
      : score.status ?? "Pending";

  // ── Categories (display order + normalized 0–100) ────────────────
  const categories: ReportModelCategory[] = score.categories.map((c) => {
    const meta = CATEGORY_LABEL[c.key as CategoryKey];
    const norm =
      c.score === null || c.max <= 0 ? null : Math.round((c.score / c.max) * 100);
    const detReason = det?.category_scores?.[c.key as CategoryKey]?.reason;
    return {
      key: c.key as CategoryKey,
      label: meta?.label ?? c.label,
      score: norm,
      weight: Math.round(c.max),
      tone: norm === null ? "muted" : toneForPct(norm),
      reason: detReason ?? "",
      tooltip: meta?.tooltip ?? c.tooltip ?? "",
    };
  });

  // ── Public buckets (the four AI-platform readiness lanes) ────────
  const buckets: ReportModelBucket[] = det
    ? BUCKET_ORDER.map((k) => {
        const b = det.public_bucket_scores?.[k];
        const pct =
          b && typeof b.percentage === "number"
            ? Math.round(b.percentage)
            : b && b.max > 0
              ? pctOf(b.score, b.max)
              : 0;
        return { key: k, label: BUCKET_LABEL[k], pct, tone: toneForPct(pct) };
      })
    : [];

  // ── AI Search & Visibility Readiness (DERIVED — not validation) ──
  // Each factor is computed from the deterministic category scores.
  // Google AI Overviews readiness is a composite of the signals AI
  // search surfaces depend on (structured data + crawl access +
  // content depth). These are readiness estimates, NOT model queries.
  const catPct = (k: CategoryKey): number | null =>
    categories.find((c) => c.key === k)?.score ?? null;
  const avg = (...vals: Array<number | null>): number | null => {
    const nums = vals.filter((v): v is number => v !== null);
    return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  };
  const mkReadiness = (
    key: string,
    label: string,
    score: number | null,
    basis: string,
  ): ReadinessFactor => ({
    key,
    label,
    score,
    tone: score === null ? "muted" : toneForPct(score),
    basis,
  });
  const readiness: ReadinessFactor[] = det
    ? [
        mkReadiness(
          "ai-overviews",
          "Google AI Overviews Readiness",
          avg(catPct("schema"), catPct("crawler"), catPct("content")),
          "Structured data + crawl access + content depth",
        ),
        mkReadiness(
          "structured-data",
          "Structured Data Readiness",
          catPct("schema"),
          "LocalBusiness identity fields in the page source",
        ),
        mkReadiness(
          "entity",
          "Entity Recognition Signals",
          catPct("brand"),
          "Consistent business name + identity across surfaces",
        ),
        mkReadiness(
          "citation-trust",
          "Citation & Trust Signals",
          catPct("trust"),
          "Reviews, credentials, and verifiable trust markers",
        ),
        mkReadiness(
          "search-visibility",
          "Search Visibility Factors",
          avg(catPct("crawler"), catPct("tech")),
          "Crawlability + technical accessibility",
        ),
      ]
    : [];

  // ── Diagnostics (which 3 + severity come from the engine) ────────
  const findings = det?.top_3_findings ?? [];
  const diagnostics: ReportModelDiagnostic[] = findings.map((f, i) => {
    const n = narration?.diagnostics?.[f.id];
    const detReason = det?.category_scores?.[f.category]?.reason;
    return {
      rank: i + 1,
      title: f.message,
      severity: f.severity,
      category: f.category,
      problem: n?.problem ?? detReason ?? f.message,
      whyItHurts: n?.whyItHurts ?? WHY_IT_HURTS[f.category],
    };
  });

  // ── Fixes (which 3 + impact from engine; metadata deterministic) ─
  const detFixes = det?.top_3_recommended_fixes ?? [];
  const fixes: ReportModelFix[] = detFixes.map((fx, i) => {
    const finding = findings.find((f) => f.id === fx.for_finding);
    const cat = (finding?.category ?? "schema") as CategoryKey;
    const fm = FIX_META[cat];
    const n = narration?.fixes?.[fx.id];
    const action = n?.action ?? fx.action;
    // Issue headline = the linked finding (what's wrong); distinct from the
    // action (the exact fix). Fall back to the category gap label so the card
    // title and body never repeat the same sentence.
    const issue = finding?.message?.trim() || `${CATEGORY_LABEL[cat].label} gap`;
    return {
      rank: i + 1,
      issue: issue === action ? `${CATEGORY_LABEL[cat].label} gap` : issue,
      title: action,
      difficulty: fm.difficulty,
      impact: fx.impact,
      action,
      businessImpact: n?.businessImpact ?? FIX_BUSINESS_IMPACT[cat],
      unlocks: fm.unlocks,
      foundationFix: fm.foundationFix,
    };
  });

  // ── Executive summary (deterministic; narration may override) ────
  const scored = categories
    .filter((c): c is ReportModelCategory & { score: number } => c.score !== null)
    .sort((a, b) => b.score - a.score);
  const strongest = scored[0];
  const weakest = scored[scored.length - 1];
  const strongestSignal = strongest
    ? `${strongest.label} is your strongest signal (${strongest.score}/100).`
    : "AI systems can reach and read your site.";
  const weakestSignal = weakest
    ? `${weakest.label} is the widest gap (${weakest.score}/100).`
    : "Trust and identity signals need strengthening.";
  const overallNum = typeof score.overall === "number" ? score.overall : 0;
  const executive: ReportModelExecutive = {
    headline:
      narration?.executiveHeadline ??
      `${input.resolvedBusinessName} scores ${overallNum}/100 — ${band} for AI visibility.`,
    summaryBullets:
      narration?.executiveBullets && narration.executiveBullets.length > 0
        ? narration.executiveBullets.slice(0, 4)
        : [
            strongestSignal,
            weakestSignal,
            diagnostics[0]
              ? `Top issue: ${diagnostics[0].title}`
              : "AI systems can read your site but can't fully verify who you are.",
          ],
    strongestSignal,
    weakestSignal,
    strongestLabel: strongest?.label ?? "Technical Access",
    weakestLabel: weakest?.label ?? "Trust Signals",
  };

  const evidence = buildEvidence(
    input.preflightSignals,
    categories.find((c) => c.key === "trust")?.score ?? null,
  );

  const businessImpact =
    narration?.businessImpact ??
    `Your real-world reputation is stronger than the signals your website currently sends to AI tools. Closing the gaps above gives AI systems the confirmed identity, trust, and content they need to recommend ${input.resolvedBusinessName} when a nearby customer asks an AI who to hire.`;

  const providers = buildProviders(input.providerOutputs);

  return {
    meta: {
      reportId: input.reportId,
      orderId: input.orderId,
      businessName: input.resolvedBusinessName,
      nameAlternates: input.nameAlternates,
      website: input.website,
      generatedAt: input.generatedAt,
      reviewedBy: input.reviewedBy ?? "GeoViz Intelligence Team",
      cohort: input.context?.cohortCellValue ?? null,
    },
    score: {
      overall: score.overall,
      band,
      tone,
      confidenceLabel: input.context?.confidenceLabel ?? null,
      confidenceReason: input.context?.confidenceReason ?? null,
      percentileCopy: input.context?.percentileCopy ?? null,
    },
    executive,
    buckets,
    categories,
    providers,
    readiness,
    evidence,
    diagnostics,
    fixes,
    businessImpact,
    hasProviders: providers.some((p) => p.status === "passed"),
    hasEvidence: isPreflight(input.preflightSignals),
  };
}

// ── Render-surface adapter ──────────────────────────────────────────
/**
 * Inputs every render surface (PDF print page, admin preview, sample)
 * already has on hand. `buildReportModelFromRender` derives the
 * canonical model from them so all three call sites stay one-liners and
 * cannot diverge.
 */
export type RenderModelInputs = {
  orderId: string;
  businessLabel: string;
  websiteUrl: string;
  reportMarkdown: string | null;
  reportGeneratedAt: Date | null;
  deterministicScore: unknown;
  /** AuditReportContext: aiValidations + percentile/cohort/confidence + nameInconsistency + preflight. */
  context?: {
    percentileCopy?: string | null;
    cohortCellValue?: string | null;
    confidenceLabel?: string | null;
    confidenceReason?: string | null;
    aiValidations?: unknown;
    nameInconsistency?: { primary: string; alternates: string[] } | null;
    preflightSignals?: unknown;
  } | null;
};

/**
 * Extract the optional narration JSON the worker embeds in the report
 * markdown (Phase 2): a single HTML comment
 *   <!--GEOVIZ_NARRATION {...json...} -->
 * Validated leniently — any malformed/missing field is simply dropped,
 * so the model falls back to deterministic copy. Never throws.
 */
export function parseNarration(
  markdown: string | null | undefined,
): ReportNarration | null {
  if (!markdown) return null;
  const m = markdown.match(/<!--\s*GEOVIZ_NARRATION\s*([\s\S]*?)-->/);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1].trim()) as Record<string, unknown>;
    const out: ReportNarration = {};
    if (typeof raw.executiveHeadline === "string") {
      out.executiveHeadline = raw.executiveHeadline;
    }
    if (
      Array.isArray(raw.executiveBullets) &&
      raw.executiveBullets.every((b) => typeof b === "string")
    ) {
      out.executiveBullets = raw.executiveBullets as string[];
    }
    if (typeof raw.businessImpact === "string") {
      out.businessImpact = raw.businessImpact;
    }
    if (raw.diagnostics && typeof raw.diagnostics === "object") {
      out.diagnostics = raw.diagnostics as ReportNarration["diagnostics"];
    }
    if (raw.fixes && typeof raw.fixes === "object") {
      out.fixes = raw.fixes as ReportNarration["fixes"];
    }
    return out;
  } catch {
    return null;
  }
}

export function buildReportModelFromRender(
  input: RenderModelInputs,
): ReportModel | null {
  const score = getCanonicalScore({
    reportMarkdown: input.reportMarkdown ?? null,
    intelligence: { deterministicScore: input.deterministicScore },
  });
  const providerOutputs =
    input.context?.aiValidations &&
    typeof input.context.aiValidations === "object"
      ? (input.context.aiValidations as { outputs?: unknown }).outputs
      : null;
  return buildReportModel({
    reportId: `GEO-${input.orderId.slice(-8).toUpperCase()}`,
    orderId: input.orderId,
    resolvedBusinessName: input.businessLabel,
    nameAlternates: input.context?.nameInconsistency?.alternates ?? [],
    website: input.websiteUrl,
    generatedAt: input.reportGeneratedAt,
    score,
    deterministic: isDeterministic(input.deterministicScore)
      ? input.deterministicScore
      : null,
    providerOutputs,
    context: {
      percentileCopy: input.context?.percentileCopy ?? null,
      cohortCellValue: input.context?.cohortCellValue ?? null,
      confidenceLabel: input.context?.confidenceLabel ?? null,
      confidenceReason: input.context?.confidenceReason ?? null,
    },
    preflightSignals: input.context?.preflightSignals ?? null,
    narration: parseNarration(input.reportMarkdown),
  });
}
