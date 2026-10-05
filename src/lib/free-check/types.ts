// Types for the /check "Free AI Visibility Check" — a lightweight,
// deterministic-only lead-generation tool. Fully separate from the
// paid audit's scoring engine (`src/lib/scoring/`): no LLM call, no
// relation to the frozen v1 rubric, never persisted to
// `AuditIntelligence`. See `runFreeCheck.ts` for the orchestrator.

import type { BusinessType } from "./classifyBusinessType";

export type CheckId =
  | "business_identity"
  | "location_clarity"
  | "service_clarity"
  | "contact_consistency"
  | "structured_data"
  | "ai_recommendation_readiness";

/** `not_applicable`: the check doesn't apply to this business type and is left out of the overall score. */
export type CheckStatus = "strong" | "needs_improvement" | "missing" | "not_applicable";

export type { BusinessType };

export type CheckResult = {
  id: CheckId;
  label: string;
  status: CheckStatus;
  /** Plain-language, customer-safe explanation. Never exposes raw signals. */
  explanation: string;
};

export type FreeCheckInput = {
  websiteUrl: string;
  businessName: string;
  city: string;
  state: string;
  category: string;
};

export type FreeCheckResult = {
  ok: true;
  /**
   * 0–100, or null when the site is outside the supported scoring scope
   * (scoring v1.3: publisher / media and ecommerce sites are not scored).
   */
  overallScore: number | null;
  /** True only for local and online businesses (see `scopeNote` otherwise). */
  scored: boolean;
  /** Why the site wasn't scored; null when scored. */
  unscoredReason: UnscoredReason | null;
  /** Customer-safe note shown with uncertain and unscored results; null otherwise. */
  scopeNote: string | null;
  checks: CheckResult[];
  strengths: string[];
  problems: string[];
  fixes: string[];
  /** Which scoring profile was applied (scoring v1.1+). */
  businessType: BusinessType;
  /** Why the site was scored as an online business (empty when local). */
  businessTypeReasons: string[];
  scoringVersion: typeof FREE_CHECK_SCORING_VERSION;
};

/**
 * v1.1: classify local vs. online first; online sites aren't scored on storefront location or opening hours.
 * v1.2: online structured data scored on Organization / WebSite / product schema; fixes never restate a Strong check.
 * v1.3: five classifications (local, online, uncertain, publisher, ecommerce); no silent default to local;
 *       uncertain sites scored on general checks only; publisher / ecommerce sites are outside the
 *       supported scope (no overall score, no fixes). Local and online scoring are unchanged.
 */
/**
 * out_of_scope: publisher / media or ecommerce. type_undetermined: conflicting
 * or too-weak evidence. insufficient_evidence: too little readable content.
 */
export type UnscoredReason = "out_of_scope" | "type_undetermined" | "insufficient_evidence";

export const FREE_CHECK_SCORING_VERSION = "free-check-v1.3" as const;

export type FreeCheckFailure = {
  ok: false;
  error: string;
  /** HTTP status the API route should respond with. Defaults to 502 (site unreachable) when omitted; 504 for a timeout. */
  status?: number;
};
