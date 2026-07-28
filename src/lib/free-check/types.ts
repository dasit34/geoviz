// Types for the /check "Free AI Visibility Check" — a lightweight,
// deterministic-only lead-generation tool. Fully separate from the
// paid audit's scoring engine (`src/lib/scoring/`): no LLM call, no
// relation to the frozen v1 rubric, never persisted to
// `AuditIntelligence`. See `runFreeCheck.ts` for the orchestrator.

export type CheckId =
  | "business_identity"
  | "location_clarity"
  | "service_clarity"
  | "contact_consistency"
  | "structured_data"
  | "ai_recommendation_readiness";

export type CheckStatus = "strong" | "needs_improvement" | "missing";

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
  overallScore: number;
  checks: CheckResult[];
  strengths: string[];
  problems: string[];
  fixes: string[];
};

export type FreeCheckFailure = {
  ok: false;
  error: string;
};
