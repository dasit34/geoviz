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
import { buildCustomerQuestions } from "@/lib/report/customer-questions";
import { providerHasUsableData } from "@/lib/report/model-testing";

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
  /** True only when an operator actually approved the report (reviewStatus
   *  === "approved"). Drives the cover "Human Reviewed" vs "Automated Audit"
   *  label so the badge never overstates a manual review that didn't happen. */
  reviewed: boolean;
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
  /** True when this model could not load/render the site during its test. */
  fetchFailed: boolean;
  /** Other businesses this model named for the category/area (capped). */
  competitors: string[];
  /** Source domains this model drew on for its answer (capped). */
  citationDomains: string[];
  /** True when this model named the business itself among the options. */
  mentioned: boolean;
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

/**
 * A single inspected-signal row for the "Evidence Reviewed" page.
 * `unconfirmed` = the signal was NOT actually checked (e.g. crawlability never
 * audited) — a neutral state, NEVER a FAIL, and never the basis for a hard fix.
 * `na` = the signal is unknown to BOTH preflight and the deterministic engine.
 */
export type EvidenceStatus = "pass" | "warn" | "fail" | "unconfirmed" | "na";
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

/**
 * Cross-Model Intelligence summary (Page 4). Derived ENTIRELY from the
 * already-captured per-provider validator + competitive data + the consensus
 * roll-up. Display only — no scoring, no new data. Counts are "of 4" across the
 * four directly-tested models (ChatGPT/Claude/Gemini/Perplexity).
 */
export type ReportModelCrossModel = {
  modelsTested: number;
  recognizedCount: number;
  mentionedCount: number;
  recommendedCount: number;
  /** Aggregated, frequency-ranked citation domains across models (capped). */
  topCitedDomains: string[];
  /** Most common reason models could not place the business; null when none. */
  mainSkipReason: string | null;
  /** Consensus headline label (e.g. "Moderate Visibility"); null when absent. */
  consensusLabel: string | null;
  /** Cross-model agreement label (e.g. "Strong"); null when absent. */
  consensusAgreement: string | null;
  /** Providers that passed, per the consensus roll-up; null when absent. */
  providersPassed: number | null;
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
  /**
   * Page-5 "Score interpretation" prose. Distinct from `businessImpact`
   * (the Page-8 projected outcome): this explains why a high access score
   * can coexist with a low overall score — access ≠ recommendation
   * readiness — so customers don't misread a 100 Crawl Access / Content
   * Extraction as strong AI visibility.
   */
  scoreInterpretation: string;
  /** Page-5 callout shown ONLY when access/extraction are high but
   *  recommendation readiness + trust are low and the band is "Needs Work" —
   *  explains why an access-driven baseline still lands mid-score. Null
   *  otherwise. */
  scoreNote: string | null;
  /** Buyer-intent "Customer Questions Tested" (up to 5) — the real questions a
   *  customer would ask an AI before choosing this business. Deterministically
   *  derived from name / industry / detected city + services. Display only. */
  customerQuestions: string[];
  /** Cross-Model Intelligence summary (Page 4). Display only. */
  crossModel: ReportModelCrossModel;
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
    label: "Crawl Access",
    tooltip:
      "Whether AI systems can reach your website. High access means crawlers are not blocked — it does not mean the business is verified or recommended.",
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
    label: "Content Extraction",
    tooltip:
      "Whether AI systems can cleanly parse your page text and structure. Clean extraction is necessary, but not sufficient for being recommended.",
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

// General (non-local) variants — used when the business is NOT confidently a
// local / service-area business, so we never force "nearby customer" / "local
// option" / "where you operate" wording onto an ecommerce/general/unknown site.
const SCHEMA_WHY_GENERAL =
  "When a customer asks an AI assistant which business to choose in this category, the model needs a confirmed business identity to name. Without it, AI systems skip you and cite a competitor they can verify.";
const SCHEMA_FIX_IMPACT_GENERAL =
  "AI tools can now confirm who you are and what you do — the minimum required to appear in an AI recommendation.";
// Non-local schema fix action — never prescribes "LocalBusiness" for an
// ecommerce / SaaS / general business; lets the implementer pick the accurate
// schema.org subtype (Organization, SoftwareApplication, ProfessionalService…).
const SCHEMA_FIX_GENERAL_ACTION =
  "Add JSON-LD structured data describing the business as Organization, LocalBusiness, or the most accurate subtype.";

// Entity-consistency (name/phone/address) "why it hurts" — distinct from the
// third-party-trust explanation. Both NAP-consistency and reviews findings live
// in the `trust` category, so without this they'd render the same paragraph.
const ENTITY_CONSISTENCY_WHY =
  "AI systems rely on consistent name, contact, and identity details across the site. Conflicting or incomplete identity signals make it harder to resolve the business as one trusted entity.";
const NAP_MSG_RE =
  /name\s*[/,]\s*phone\s*[/,]\s*address|inconsistent (?:between|across) surfaces|\bnap\b|consistent name/i;

// Normalized industry slugs that represent local / service-area businesses
// (mirrors src/lib/intelligence/industry-taxonomy.ts).
const LOCAL_INDUSTRY_SLUGS = new Set<string>([
  "roofing", "hvac", "plumbing", "electrical", "landscaping", "legal", "dental",
  "medical", "restaurant", "salon", "real_estate", "automotive",
  "local_services", "home_services",
]);

/**
 * A business is treated as local/service-area only when its normalized industry
 * is a local type AND there's a corroborating location signal (a model that
 * identified a location). This guards against mislabeled inputs (e.g. an
 * ecommerce site tagged "real_estate") wrongly getting "nearby customer" copy.
 */
function detectIsLocal(
  industryNormalized: string | null | undefined,
  providers: ReportModelProvider[],
): boolean {
  if (!industryNormalized || !LOCAL_INDUSTRY_SLUGS.has(industryNormalized)) {
    return false;
  }
  return providers.some((p) => !!p.location && p.location.trim().length > 0);
}

/** "a", "a and b", "a, b, and c". */
function humanList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Page-5 "Score interpretation" copy. Built from the normalized category
 * scores so the prose matches the bars. The message customers must not miss:
 * access (Crawl Access + Content Extraction) is necessary but NOT the same as
 * recommendation readiness (structured identity + entity consistency + trust
 * evidence). A site can score 100 on access and still be a weak recommendation
 * candidate — that's the exact confusion this copy resolves.
 */
function buildScoreInterpretation(
  businessName: string,
  categories: ReportModelCategory[],
): string {
  const get = (k: CategoryKey): number | null =>
    categories.find((c) => c.key === k)?.score ?? null;
  const mean = (...vals: Array<number | null>): number | null => {
    const nums = vals.filter((v): v is number => v !== null);
    return nums.length
      ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
      : null;
  };
  const crawler = get("crawler");
  const access = mean(crawler, get("tech"));
  const schema = get("schema");
  const brand = get("brand");
  const trust = get("trust");
  const rec = mean(schema, brand, trust);

  const accessHigh = access !== null && access >= 65;
  const recLow = rec !== null && rec < 60;

  // The headline case the relabel exists to fix: clean access, weak
  // recommendation signals (e.g. 100 access but ~50 overall).
  if (accessHigh && recLow) {
    const weak: string[] = [];
    if (schema !== null && schema < 60) weak.push("weak structured identity");
    if (brand !== null && brand < 60) weak.push("inconsistent business signals");
    if (trust !== null && trust < 60) weak.push("low third-party trust evidence");
    const weakList =
      weak.length > 0
        ? humanList(weak)
        : "gaps in structured identity, business signals, and trust evidence";
    return `${businessName} is accessible to AI systems, but access is not the same as recommendation readiness. The site can be crawled and extracted cleanly, but ${weakList} reduce confidence when AI systems decide who to recommend.`;
  }

  // Access is part of the limiting factor — but separate "the site is hard to
  // reach" from "the site is reachable, yet offers little useful data". A high
  // Crawl Access bar must never read as "AI cannot reach the site" (the
  // contradiction this split resolves). Wording only; the math is unchanged.
  if (access !== null && access < 65) {
    const reachable = crawler !== null && crawler >= 65;
    if (reachable) {
      return `${businessName}'s site is reachable by AI systems, but they find little useful identity, content, and trust information to work with — which limits how well they can understand the business and how confidently they can recommend it. Strengthening structured identity, content depth, and trust signals is the foundation the rest of the score builds on.`;
    }
    return `AI crawlers have trouble fully reaching and parsing ${businessName}'s site, which limits how much they can understand and how confidently they can recommend it. Improving crawl access and content extraction is the foundation the rest of the score builds on.`;
  }

  // Access and recommendation signals are both reasonably strong.
  return `${businessName} is accessible to AI systems and sends reasonably clear identity and trust signals. Closing the remaining gaps above raises how confidently AI systems can recommend it when customers ask who to choose.`;
}

/**
 * Page-5 callout for the specific case where a business is in "Needs Work"
 * because access/extraction lift the baseline while recommendation readiness +
 * trust stay weak. Same access/rec computation as buildScoreInterpretation;
 * returns null outside that pattern so the note only appears when it's the
 * honest explanation for the band. Display only — no scoring impact.
 */
function buildScoreNote(
  band: string,
  categories: ReportModelCategory[],
): string | null {
  const get = (k: CategoryKey): number | null =>
    categories.find((c) => c.key === k)?.score ?? null;
  const mean = (...vals: Array<number | null>): number | null => {
    const nums = vals.filter((v): v is number => v !== null);
    return nums.length
      ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
      : null;
  };
  const access = mean(get("crawler"), get("tech"));
  const rec = mean(get("schema"), get("brand"), get("trust"));
  const accessHigh = access !== null && access >= 65;
  const recLow = rec !== null && rec < 60;
  if (band === "Needs Work" && accessHigh && recLow) {
    return "Access and extraction raise the baseline score, but low recommendation readiness and trust evidence are the primary reasons this business remains in Needs Work.";
  }
  return null;
}

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

// A schema-category finding whose message is about structured identity /
// JSON-LD. The frozen scoring engine can phrase this as "No LocalBusiness or
// Organization JSON-LD block" even when JSON-LD blocks DO exist (it means no
// *complete* identity block) — which contradicts the Evidence page's "2 blocks
// found". We normalize the customer-facing title in the display layer only.
const SCHEMA_IDENTITY_MSG_RE =
  /json-?ld|structured data|localbusiness|organization|schema/i;

/**
 * True when the audit actually detected JSON-LD blocks on the page. Prefers the
 * preflight count (authoritative) and falls back to parsing the deterministic
 * schema reason ("Detected 2 JSON-LD block(s)"). Never reads scoring; display
 * signal only.
 */
function schemaBlocksDetected(
  det: DeterministicScore | null,
  preflight: unknown,
): boolean {
  if (isPreflight(preflight) && preflight.fetchOk && preflight.schema) {
    const c = (preflight.schema as { rawJsonLdCount?: number }).rawJsonLdCount;
    if (typeof c === "number") return c > 0;
  }
  const reason = det?.category_scores?.schema?.reason ?? "";
  const m =
    reason.match(/(\d+)\s*(?:json-?ld\s*)?block/i) ??
    reason.match(/detected\s+(\d+)/i);
  if (m) return parseInt(m[1], 10) > 0;
  return false;
}

/**
 * Canonical structured-identity issue title — never says "no JSON-LD" when
 * blocks exist, and never forces "local business" wording onto a non-local
 * (ecommerce / SaaS / general) business, where Organization is the right frame.
 */
function structuredIdentityTitle(blocksDetected: boolean, isLocal: boolean): string {
  if (isLocal) {
    return blocksDetected
      ? "Existing JSON-LD is incomplete for local business verification"
      : "No complete LocalBusiness or Organization identity block";
  }
  return blocksDetected
    ? "Existing JSON-LD is incomplete for business identity verification"
    : "No complete Organization or business identity block";
}

/**
 * Customer-facing finding title. For structured-identity schema findings, swaps
 * the engine's raw message for the normalized title so the cover, Executive
 * Summary, Top Issues, and Priority Fix Plan never contradict the Evidence page.
 * All other findings pass through unchanged.
 */
function displayFindingTitle(
  message: string,
  category: CategoryKey,
  blocksDetected: boolean,
  isLocal: boolean,
): string {
  if (category === "schema" && SCHEMA_IDENTITY_MSG_RE.test(message)) {
    return structuredIdentityTitle(blocksDetected, isLocal);
  }
  return message;
}

/**
 * Build the "Evidence Reviewed" rows. DETERMINISTIC-FIRST: prefer the preflight
 * HTTP signals only when the preflight fetch succeeded; otherwise derive each
 * row from the deterministic engine's category scores/reasons + evidence-summary
 * flags so a KNOWN gap reads as FAIL (never a lazy "Not analyzed"), and a signal
 * that was never checked reads as NOT CONFIRMED (neutral) — never a FAIL.
 * "Not analyzed" (na) survives only when NEITHER source knows the signal.
 */
function buildEvidence(
  preflight: unknown,
  det: DeterministicScore | null,
  categories: ReportModelCategory[],
): ReportModelEvidence[] {
  const p = isPreflight(preflight) ? preflight : null;
  const pfOk = !!p && p.fetchOk === true; // preflight modules are only meaningful when the fetch worked
  const es = det?.evidence_summary ?? null;
  const cat = (k: CategoryKey) => categories.find((c) => c.key === k) ?? null;
  const reasonOf = (k: CategoryKey) => det?.category_scores?.[k]?.reason ?? "";
  const rows: ReportModelEvidence[] = [];
  const L = (label: string, descriptor: string, status: EvidenceStatus) => ({
    label,
    descriptor,
    status,
  });

  // 1. Homepage readable content
  const r = pfOk ? p!.readability : null;
  {
    const label = "Homepage readable content";
    if (r) {
      rows.push(
        r.parsedByReadability
          ? L(label, "Extracted article text successfully", "pass")
          : r.textLength > 0
            ? L(label, "Body text extracted via fallback", "warn")
            : L(label, "Little readable text could be extracted", "fail"),
      );
    } else {
      const content = cat("content");
      const score = content?.score ?? null;
      rows.push(
        score === null
          ? L(label, "Not analyzed", "na")
          : score < 25
            ? L(label, "Minimal readable content on the homepage", "fail")
            : score < 50
              ? L(label, "Limited readable content extracted", "warn")
              : L(label, "Readable content present", "pass"),
      );
    }
  }

  // 2. JSON-LD schema blocks
  const s = pfOk ? p!.schema : null;
  {
    const label = "JSON-LD schema blocks";
    if (s) {
      rows.push(
        s.rawJsonLdCount === 0
          ? L(label, "No JSON-LD structured data found", "fail")
          : s.missingFields.length > 0
            ? L(label, `${s.rawJsonLdCount} block${s.rawJsonLdCount === 1 ? "" : "s"} found; identity fields incomplete`, "warn")
            : L(label, `${s.rawJsonLdCount} block${s.rawJsonLdCount === 1 ? "" : "s"} found; identity fields complete`, "pass"),
      );
    } else {
      const schema = cat("schema");
      const score = schema?.score ?? null;
      const reason = reasonOf("schema");
      rows.push(
        score === null
          ? L(label, "Not analyzed", "na")
          : /no json-?ld|0 block/i.test(reason) || score < 20
            ? L(label, "0 JSON-LD blocks found on the homepage", "fail")
            : score < 60
              ? L(label, "Structured data present; identity fields incomplete", "warn")
              : L(label, "Structured data present", "pass"),
      );
    }
  }

  // 3. NAP consistency
  const e = pfOk ? p!.entityConsistency : null;
  {
    const label = "NAP consistency";
    if (e) {
      rows.push(
        e.inconsistencies.length > 0
          ? L(label, `${e.inconsistencies.length} name / address / phone inconsistenc${e.inconsistencies.length === 1 ? "y" : "ies"} detected`, "fail")
          : L(label, "Name, address, and phone align across surfaces", "pass"),
      );
    } else if (es && !es.entity_checked) {
      rows.push(L(label, "Not enough business identity data to verify", "unconfirmed"));
    } else {
      const brand = cat("brand");
      const score = brand?.score ?? null;
      rows.push(
        score === null
          ? L(label, "Not analyzed", "na")
          : score < 30
            ? L(label, "No complete name / address / phone found across surfaces", "fail")
            : score < 60
              ? L(label, "Business identity only partly consistent across surfaces", "warn")
              : L(label, "Business identity consistent across surfaces", "pass"),
      );
    }
  }

  // 4. Robots and crawl access — only a verdict when actually audited.
  const c = pfOk && es?.crawlability_audited ? p!.crawlability : null;
  {
    const label = "Robots and crawl access";
    if (c) {
      rows.push(
        c.score >= 70
          ? L(label, "robots.txt present; site accessible", "pass")
          : c.score >= 40
            ? L(label, c.warnings[0] ?? "Some crawl-access limitations detected", "warn")
            : L(label, c.failedChecks[0] ?? "Crawl access blocked or misconfigured", "fail"),
      );
    } else if (es && !es.crawlability_audited) {
      rows.push(L(label, "Crawl access not confirmed in this audit", "unconfirmed"));
    } else {
      rows.push(L(label, "Not analyzed", "na"));
    }
  }

  // 5. Homepage depth (word count)
  {
    const label = "Homepage depth";
    if (r) {
      rows.push(
        r.wordCount >= 300
          ? L(label, `${r.wordCount} words; meets depth recommendation`, "pass")
          : L(label, `${r.wordCount} words; below 300-word recommendation`, "warn"),
      );
    } else {
      const content = cat("content");
      const score = content?.score ?? null;
      const wc = (() => {
        const m = reasonOf("content").match(/(\d+)\s*words?|word count[:\s]+(\d+)/i);
        const n = m ? Number(m[1] ?? m[2]) : NaN;
        return Number.isFinite(n) ? n : null;
      })();
      rows.push(
        wc !== null
          ? wc >= 300
            ? L(label, `${wc} words; meets depth recommendation`, "pass")
            : L(label, `${wc} words; below 300-word recommendation`, "fail")
          : score === null
            ? L(label, "Not analyzed", "na")
            : score < 25
              ? L(label, "Insufficient content; below 300-word recommendation", "fail")
              : score < 50
                ? L(label, "Thin content; below depth recommendation", "warn")
                : L(label, "Content depth meets recommendation", "pass"),
      );
    }
  }

  // 6. Reviews and trust signals (trust category)
  {
    const label = "Reviews and trust signals";
    const trustPct = cat("trust")?.score ?? null;
    rows.push(
      trustPct === null
        ? L(label, "Not analyzed", "na")
        : trustPct >= 60
          ? L(label, "Verifiable third-party trust markers present", "pass")
          : trustPct >= 30
            ? L(label, "Limited third-party trust markers", "warn")
            : L(label, "Insufficient verifiable third-party trust markers", "fail"),
    );
  }

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
  /** True only when an operator approved the report (reviewStatus === "approved"). */
  reviewed?: boolean;
  /** Canonical score (from getCanonicalScore) for display categories. */
  score: ReportScore;
  /** The deterministic engine output (buckets, findings, fixes). */
  deterministic: DeterministicScore | null;
  /** Validator layer outputs[] (already structured). */
  providerOutputs: unknown;
  /** Cross-model consensus roll-up (display only) → Page-4 headline. */
  consensusIndex?: unknown;
  /** Percentile/cohort/confidence (from buildReportContext). */
  context?: {
    percentileCopy?: string | null;
    cohortCellValue?: string | null;
    confidenceLabel?: string | null;
    confidenceReason?: string | null;
  } | null;
  /** V2 preflight signals → "Evidence Reviewed" page. Null/absent for legacy. */
  preflightSignals?: unknown;
  /** Normalized industry slug → conditional local-vs-general copy. */
  industryNormalized?: string | null;
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
  raw_summary?: string;
  error?: string | null;
  // AI Answer Graph capture (optional; legacy outputs lack these).
  cited_source_domains?: string[];
  competitive?: {
    entities?: string[];
    business_named?: boolean | null;
    status?: string;
  } | null;
};

function asConfidence(v: unknown): Confidence {
  return v === "low" || v === "medium" || v === "high" ? v : null;
}

/**
 * Validator fields like `location_identified` / `industry_identified` are free
 * text — a model that found nothing often returns a sentinel phrase ("Not
 * specified on the site", "Unknown", "N/A") rather than an empty string. Those
 * are NOT real signals: surfacing them as a "READS AS" location is misleading,
 * and (critically) treating them as a corroborating location flips a mislabeled
 * site into "nearby customer" local copy. Collapse sentinels to null.
 */
const FIELD_SENTINEL_RE =
  /^(?:not?\s+specified|none?(?:\s+(?:specified|found|identified))?|n\/?a|unknown|unclear|unspecified|not\s+(?:found|identified|available|provided|listed|mentioned|stated|clear)|no\s+(?:location|specific\s+location|address)|cannot\s+(?:determine|identify)|could\s+not\s+(?:determine|identify))\b/i;

function meaningfulField(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (FIELD_SENTINEL_RE.test(t)) return null;
  return t;
}

const FETCH_FAIL_RE =
  /fail(?:ed|ure)?\s+to\s+load|could\s+not\s+(?:access|load|render|reach)|website\s+(?:failed|did\s+not|could\s+not).*load|unable\s+to\s+(?:access|load|render)|preventing\s+(?:any\s+)?(?:content\s+)?extraction|page\s+did\s+not\s+load/i;

function detectFetchFailed(o: ProviderShape): boolean {
  const blobs = [o.raw_summary, o.error, ...(o.missing_facts ?? [])]
    .filter((x): x is string => typeof x === "string")
    .join(" ");
  return FETCH_FAIL_RE.test(blobs);
}

/**
 * Normalize the YES / PARTIAL / NO pill from validator output. The raw
 * `would_recommend` is a blunt signal — a model that clearly identified the
 * business but flagged missing trust/identity fields sometimes emits a flat
 * NO, which reads as "didn't understand you" rather than "understood but
 * incomplete". We soften that to PARTIAL. This is a DISPLAY interpretation of
 * validator output only — it never touches the canonical GeoViz score (the
 * understanding score + main gap still surface the real disagreement).
 *
 * NO     = the model couldn't identify what the business does (no "reads as"),
 *          the site failed to load, OR understanding is very low (<25).
 * PARTIAL= the model named the business/category but is missing identity,
 *          trust, or recommendation-critical detail.
 * YES    = an explicit validator YES with a confirmed identity read.
 */
function deriveVerdict(
  raw: string | undefined,
  understanding: number | null,
  businessType: string | null,
  fetchFailed: boolean,
): ProviderVerdict {
  const hasIdentity = !fetchFailed && !!businessType;
  const veryLow = typeof understanding === "number" && understanding < 25;
  if (raw === "YES" && hasIdentity) return "YES";
  if (!hasIdentity || veryLow) return "NO";
  return "PARTIAL";
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
    // Render a card whenever the validator produced ANY usable signal for this
    // provider — not only when status === "passed". The old FourModelGrid
    // showed a card for any present output; mirror that so partial/degraded
    // runs still surface. Only when there's NO output (or a hard error with no
    // data) do we mark the provider UNAVAILABLE.
    const hasData = providerHasUsableData(o);
    if (!hasData) {
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
        fetchFailed: false,
        competitors: [],
        citationDomains: [],
        mentioned: false,
      };
    }
    const services = (o.services_identified ?? [])
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 3);
    const mainGap =
      (o.missing_facts ?? []).map((s) => s.trim()).find((s) => s.length > 0) ??
      null;
    const us =
      typeof o.business_understanding_score === "number" &&
      Number.isFinite(o.business_understanding_score)
        ? Math.max(0, Math.min(100, Math.round(o.business_understanding_score)))
        : null;
    const businessType = meaningfulField(o.industry_identified);
    const fetchFailed = detectFetchFailed(o);
    return {
      provider: p,
      display,
      status: o.status ?? "passed",
      verdict: deriveVerdict(o.would_recommend, us, businessType, fetchFailed),
      businessType,
      location: meaningfulField(o.location_identified),
      topServices: services,
      mainGap,
      reason: o.recommendation_reason?.trim() || null,
      understandingScore: us,
      recommendationReadiness: asConfidence(o.recommendation_confidence),
      fetchFailed,
      competitors: (o.competitive?.entities ?? [])
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter((s) => s.length > 0)
        .slice(0, 4),
      citationDomains: (o.cited_source_domains ?? [])
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter((s) => s.length > 0)
        .slice(0, 4),
      mentioned: o.competitive?.business_named === true,
    };
  });
}

/** Read the optional consensus roll-up defensively (display fields only). */
function readConsensusSummary(ci: unknown): {
  label: string | null;
  agreement: string | null;
  passed: number | null;
} {
  if (!ci || typeof ci !== "object") {
    return { label: null, agreement: null, passed: null };
  }
  const c = ci as Record<string, unknown>;
  const label = typeof c.verdict === "string" ? c.verdict : null;
  const agreement =
    typeof c.model_agreement === "string" ? c.model_agreement : null;
  const am = c.agreement_metrics;
  const passed =
    am &&
    typeof am === "object" &&
    typeof (am as Record<string, unknown>).providers_passed === "number"
      ? (am as Record<string, number>).providers_passed
      : null;
  return { label, agreement, passed };
}

/**
 * Build the Page-4 "Cross-Model Intelligence" summary from the already-built
 * provider rows + the consensus roll-up. Pure + deterministic; display only.
 * Mirrors the `buildCustomerQuestions` integration pattern.
 */
function buildCrossModelSummary(
  providers: ReportModelProvider[],
  consensusIndex: unknown,
): ReportModelCrossModel {
  const tested = providers.filter((p) => p.verdict !== "UNAVAILABLE");
  const recognizedCount = tested.filter(
    (p) =>
      !p.fetchFailed &&
      (!!p.businessType ||
        (p.understandingScore !== null && p.understandingScore >= 25)),
  ).length;
  const mentionedCount = providers.filter((p) => p.mentioned).length;
  const recommendedCount = providers.filter((p) => p.verdict === "YES").length;

  // Aggregate citation domains across models, frequency-ranked.
  const domainCounts = new Map<string, number>();
  for (const p of providers) {
    for (const d of p.citationDomains) {
      domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    }
  }
  const topCitedDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([d]) => d);

  // Most common gap among models that tested but did not fully recommend.
  const gapCounts = new Map<string, number>();
  for (const p of tested) {
    if (p.verdict === "YES") continue;
    if (p.mainGap) gapCounts.set(p.mainGap, (gapCounts.get(p.mainGap) ?? 0) + 1);
  }
  const mainSkipReason =
    [...gapCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const consensus = readConsensusSummary(consensusIndex);

  return {
    modelsTested: tested.length,
    recognizedCount,
    mentionedCount,
    recommendedCount,
    topCitedDomains,
    mainSkipReason,
    consensusLabel: consensus.label,
    consensusAgreement: consensus.agreement,
    providersPassed: consensus.passed,
  };
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
          "Structured Identity",
          catPct("schema"),
          "LocalBusiness identity fields in the page source",
        ),
        mkReadiness(
          "entity",
          "Entity Consistency",
          catPct("brand"),
          "Consistent business name + identity across surfaces",
        ),
        mkReadiness(
          "citation-trust",
          "Trust Evidence",
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

  // Providers first — needed to decide local-vs-general copy (a local copy
  // tone requires a corroborating detected location).
  const providers = buildProviders(input.providerOutputs);
  const isLocal = detectIsLocal(input.industryNormalized, providers);
  // Was crawlability actually audited? When not, we must not prescribe a
  // robots.txt-specific fix (only verify-access wording).
  const crawlAudited = det?.evidence_summary?.crawlability_audited === true;
  // No "robots.txt" wording here — crawlability wasn't audited, so we only
  // recommend verifying access, never editing a file we didn't inspect.
  const SOFT_CRAWL_ACTION =
    "Verify that AI and search crawlers can access the public homepage (crawl access was not confirmed in this audit).";

  // ── Diagnostics (which 3 + severity come from the engine) ────────
  const blocksDetected = schemaBlocksDetected(det, input.preflightSignals);
  const findings = det?.top_3_findings ?? [];
  const diagnostics: ReportModelDiagnostic[] = findings.map((f, i) => {
    const n = narration?.diagnostics?.[f.id];
    const detReason = det?.category_scores?.[f.category]?.reason;
    const why =
      f.category === "schema" && !isLocal
        ? SCHEMA_WHY_GENERAL
        : NAP_MSG_RE.test(f.message)
          ? ENTITY_CONSISTENCY_WHY
          : WHY_IT_HURTS[f.category];
    return {
      rank: i + 1,
      title: displayFindingTitle(f.message, f.category, blocksDetected, isLocal),
      severity: f.severity,
      category: f.category,
      problem: n?.problem ?? detReason ?? f.message,
      whyItHurts: n?.whyItHurts ?? why,
    };
  });

  // ── Fixes (which 3 + impact from engine; metadata deterministic) ─
  const detFixes = det?.top_3_recommended_fixes ?? [];
  const fixes: ReportModelFix[] = detFixes.map((fx, i) => {
    const finding = findings.find((f) => f.id === fx.for_finding);
    const cat = (finding?.category ?? "schema") as CategoryKey;
    const fm = FIX_META[cat];
    const n = narration?.fixes?.[fx.id];
    // Crawler fix: only prescribe robots.txt specifics when crawlability was
    // actually audited; otherwise soften to "verify crawl access" so we never
    // recommend editing a robots.txt we never inspected.
    const rawAction = n?.action ?? fx.action;
    // Display-layer action overrides (frozen fixes-table text is untouched):
    //  · crawler — soften robots.txt specifics when crawl was never audited.
    //  · schema  — for non-local businesses, don't prescribe "LocalBusiness";
    //              let the implementer pick the accurate schema.org subtype.
    const action =
      cat === "crawler" && !crawlAudited && !n?.action
        ? SOFT_CRAWL_ACTION
        : cat === "schema" &&
            !isLocal &&
            !n?.action &&
            /json-?ld|localbusiness|structured data/i.test(rawAction)
          ? SCHEMA_FIX_GENERAL_ACTION
          : rawAction;
    const impactCopy =
      cat === "schema" && !isLocal ? SCHEMA_FIX_IMPACT_GENERAL : FIX_BUSINESS_IMPACT[cat];
    // Issue headline = the linked finding (what's wrong); distinct from the
    // action (the exact fix). Normalize structured-identity findings so the
    // headline never says "No JSON-LD block" when blocks were detected. Fall
    // back to the category gap label so title and body never repeat.
    const issue = finding
      ? displayFindingTitle(finding.message, finding.category, blocksDetected, isLocal).trim()
      : `${CATEGORY_LABEL[cat].label} gap`;
    return {
      rank: i + 1,
      issue: issue === action ? `${CATEGORY_LABEL[cat].label} gap` : issue,
      title: action,
      difficulty: fm.difficulty,
      impact: fx.impact,
      action,
      businessImpact: n?.businessImpact ?? impactCopy,
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
    strongestLabel: strongest?.label ?? "Crawl Access",
    weakestLabel: weakest?.label ?? "Trust Signals",
  };

  const evidence = buildEvidence(input.preflightSignals, det, categories);

  const closingClause = isLocal
    ? "when a nearby customer asks an AI who to hire"
    : "when a customer asks an AI which business to choose in this category";
  const businessImpact =
    narration?.businessImpact ??
    `Your real-world reputation is stronger than the signals your website currently sends to AI tools. Closing the gaps above gives AI systems the confirmed identity, trust, and content they need to recommend ${input.resolvedBusinessName} ${closingClause}.`;

  const scoreInterpretation = buildScoreInterpretation(
    input.resolvedBusinessName,
    categories,
  );
  const scoreNote = buildScoreNote(band, categories);

  // "Customer Questions Tested" — buyer-intent questions derived from the
  // already-detected city/services. City = the first model-identified location
  // (never invented); services = de-duplicated across providers.
  const detectedCity =
    providers.map((p) => p.location).find((l) => !!l && l.trim().length > 0) ??
    null;
  const detectedServices = Array.from(
    new Set(providers.flatMap((p) => p.topServices).map((s) => s.trim())),
  ).filter((s) => s.length > 0);
  const detectedBusinessType =
    providers.map((p) => p.businessType).find((b) => !!b && b.trim().length > 0) ??
    null;
  const customerQuestions = buildCustomerQuestions({
    businessName: input.resolvedBusinessName,
    industrySlug: input.industryNormalized,
    city: detectedCity,
    services: detectedServices,
    businessType: detectedBusinessType,
    isLocal,
  });

  const crossModel = buildCrossModelSummary(providers, input.consensusIndex);

  return {
    meta: {
      reportId: input.reportId,
      orderId: input.orderId,
      businessName: input.resolvedBusinessName,
      nameAlternates: input.nameAlternates,
      website: input.website,
      generatedAt: input.generatedAt,
      reviewedBy: input.reviewedBy ?? "GeoViz Intelligence Team",
      reviewed: input.reviewed ?? false,
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
    scoreInterpretation,
    scoreNote,
    customerQuestions,
    crossModel,
    // True when ANY provider produced usable data (drives the page-level
    // "verdicts not run" note). UNAVAILABLE = no data for that provider.
    hasProviders: providers.some((p) => p.verdict !== "UNAVAILABLE"),
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
  /** True only when an operator approved this report (reviewStatus === "approved"). */
  reviewed?: boolean;
  deterministicScore: unknown;
  /** AuditReportContext: aiValidations + percentile/cohort/confidence + nameInconsistency + preflight. */
  context?: {
    percentileCopy?: string | null;
    cohortCellValue?: string | null;
    confidenceLabel?: string | null;
    confidenceReason?: string | null;
    aiValidations?: unknown;
    consensusIndex?: unknown;
    nameInconsistency?: { primary: string; alternates: string[] } | null;
    preflightSignals?: unknown;
    industryNormalized?: string | null;
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
    reviewed: input.reviewed ?? false,
    score,
    deterministic: isDeterministic(input.deterministicScore)
      ? input.deterministicScore
      : null,
    providerOutputs,
    consensusIndex: input.context?.consensusIndex ?? null,
    context: {
      percentileCopy: input.context?.percentileCopy ?? null,
      cohortCellValue: input.context?.cohortCellValue ?? null,
      confidenceLabel: input.context?.confidenceLabel ?? null,
      confidenceReason: input.context?.confidenceReason ?? null,
    },
    preflightSignals: input.context?.preflightSignals ?? null,
    industryNormalized: input.context?.industryNormalized ?? null,
    narration: parseNarration(input.reportMarkdown),
  });
}
