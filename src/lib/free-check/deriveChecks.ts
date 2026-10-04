// Pure, deterministic scoring for the /check "Free AI Visibility Check".
//
// Takes the same four preflight analyzer outputs the paid audit's V2
// intelligence layer already produces (readability, schema validation,
// crawlability, entity consistency — see
// src/lib/intelligence/preflight/) plus a small amount of independently
// extracted plain text, and derives six simplified checks + an overall
// score. No LLM call. No relation to the frozen v1 paid-audit rubric in
// src/lib/scoring/ — a distinct, explicitly-labeled "preview" score.
//
// Readable in one pass: every check maps a 0–100 sub-score to a
// CheckStatus via the same threshold function, then a fixed weight table
// rolls the six sub-scores into one overall score. Nothing here is
// invented — every input traces back to a signal one of the four
// analyzers actually computed.

import type {
  CrawlabilityResult,
  EntityConsistencyResult,
  ReadableContentResult,
  SchemaValidationResult,
} from "@/lib/intelligence/preflight/types";
import { classifyBusinessType, type BusinessType } from "./classifyBusinessType";
import type { OnlineSchemaSignals } from "./onlineSchema";
import {
  FREE_CHECK_SCORING_VERSION,
  type CheckId,
  type CheckResult,
  type CheckStatus,
  type FreeCheckInput,
  type FreeCheckResult,
} from "./types";

export type DeriveChecksInput = {
  input: FreeCheckInput;
  plainText: string; // lowercased, whitespace-collapsed homepage body text
  readability: ReadableContentResult | null;
  schema: SchemaValidationResult | null;
  crawlability: CrawlabilityResult | null;
  entityConsistency: EntityConsistencyResult | null;
  /** Online-business schema checklist (scoring v1.2). Absent → treated as no online schema. */
  onlineSchema?: OnlineSchemaSignals | null;
};

// Sub-score → status thresholds, shared across all six checks so the
// scoring rule is legible in one place.
const STRONG_THRESHOLD = 70;
const NEEDS_IMPROVEMENT_THRESHOLD = 35;

function scoreToStatus(score: number): CheckStatus {
  if (score >= STRONG_THRESHOLD) return "strong";
  if (score >= NEEDS_IMPROVEMENT_THRESHOLD) return "needs_improvement";
  return "missing";
}

// Overall-score weights. Sum to 100. Deliberately distinct from (and not
// derived from) the frozen paid-audit category weights in
// src/lib/scoring/frozen.ts — this is a separate, simpler tool.
const WEIGHTS: Record<CheckId, number> = {
  business_identity: 20,
  location_clarity: 15,
  service_clarity: 15,
  contact_consistency: 15,
  structured_data: 20,
  ai_recommendation_readiness: 15,
};

function containsNormalized(haystack: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (n.length === 0) return false;
  return haystack.includes(n);
}

function scoreBusinessIdentity(args: DeriveChecksInput): {
  score: number;
  explanation: string;
} {
  const { input, plainText, readability, entityConsistency } = args;
  const nameFound =
    containsNormalized(plainText, input.businessName) ||
    Boolean(
      entityConsistency?.extractedEntities.name.schema &&
        containsNormalized(
          input.businessName.toLowerCase(),
          entityConsistency.extractedEntities.name.schema.toLowerCase(),
        ),
    );
  const contentReadable = (readability?.wordCount ?? 0) > 50;

  let score = 0;
  if (nameFound) score += 60;
  if (contentReadable) score += 40;

  const status = scoreToStatus(score);
  const explanation =
    status === "strong"
      ? "Your business name appears clearly in your homepage content, so AI systems can confidently identify who you are."
      : status === "needs_improvement"
        ? "Your business name is only partially clear from your homepage content — AI systems may struggle to confirm your identity."
        : "Your business name doesn't clearly appear in readable homepage content, making it hard for AI systems to identify your business.";

  return { score, explanation };
}

function scoreLocationClarity(args: DeriveChecksInput): {
  score: number;
  explanation: string;
} {
  const { input, plainText, entityConsistency } = args;
  const cityFound = containsNormalized(plainText, input.city);
  const stateFound = containsNormalized(plainText, input.state);
  const addressPresent = Boolean(
    entityConsistency?.extractedEntities.address.schema ||
      entityConsistency?.extractedEntities.address.homepage ||
      entityConsistency?.extractedEntities.address.footer,
  );

  let score = 0;
  if (cityFound) score += 40;
  if (stateFound) score += 20;
  if (addressPresent) score += 40;
  score = Math.min(100, score);

  const status = scoreToStatus(score);
  const explanation =
    status === "strong"
      ? "Your city, state, and address are clearly stated, helping AI systems match you to local searches."
      : status === "needs_improvement"
        ? "Your service area is only partially stated — add your city, state, and address more clearly."
        : "Your website doesn't clearly state where you're located, so AI systems can't confidently match you to local queries.";

  return { score, explanation };
}

function scoreServiceClarity(args: DeriveChecksInput): {
  score: number;
  explanation: string;
} {
  const { input, plainText, readability } = args;
  const categoryFound = containsNormalized(plainText, input.category);
  const wordCount = readability?.wordCount ?? 0;
  const depthScore = Math.min(100, Math.round((wordCount / 300) * 100));

  const score = Math.round((categoryFound ? 60 : 0) + depthScore * 0.4);

  const status = scoreToStatus(score);
  const explanation =
    status === "strong"
      ? "Your homepage describes your services in enough plain-language detail for AI systems to understand what you offer."
      : status === "needs_improvement"
        ? "Your services are only partially described in text — AI systems may not fully understand what you offer."
        : "Your homepage doesn't describe your services in enough readable detail for AI systems to understand what you offer.";

  return { score, explanation };
}

function scoreContactConsistency(args: DeriveChecksInput): {
  score: number;
  explanation: string;
} {
  const score = args.entityConsistency?.score ?? 0;
  const status = scoreToStatus(score);
  const explanation =
    status === "strong"
      ? "Your business name, phone, and address are consistent across your site, which builds AI trust in your identity."
      : status === "needs_improvement"
        ? "Some contact details differ between your homepage, footer, and structured data — small mismatches reduce AI trust."
        : "Your contact details are missing or inconsistent across your site, which weakens AI confidence in your identity.";

  return { score, explanation };
}

function scoreStructuredData(
  args: DeriveChecksInput,
  online = false,
): {
  score: number;
  explanation: string;
} {
  const score = args.schema?.score ?? 0;
  const status = scoreToStatus(score);
  if (online) {
    const explanation =
      status === "strong"
        ? "Your site includes Organization, WebSite, and product structured data, so AI systems can confirm who you are and what you offer."
        : status === "needs_improvement"
          ? "Your site has some Organization, WebSite, or product (e.g. SoftwareApplication) structured data, but key pieces are missing."
          : "Your site has little or no Organization, WebSite, or product structured data, so AI systems have no machine-readable way to confirm who you are and what you offer.";
    return { score, explanation };
  }
  const explanation =
    status === "strong"
      ? "Your site includes LocalBusiness-style structured data with the key fields AI systems look for."
      : status === "needs_improvement"
        ? "Your site has some structured data, but it's missing key fields AI systems use to verify your business."
        : "Your site has little or no LocalBusiness structured data, so AI systems have no machine-readable way to confirm your details.";

  return { score, explanation };
}

function scoreAiRecommendationReadiness(args: DeriveChecksInput): {
  score: number;
  explanation: string;
} {
  const crawl = args.crawlability?.score ?? 0;
  const schema = args.schema?.score ?? 0;
  const entity = args.entityConsistency?.score ?? 0;
  const wordCount = args.readability?.wordCount ?? 0;
  const depth = Math.min(100, Math.round((wordCount / 300) * 100));

  const score = Math.round(
    0.3 * crawl + 0.25 * schema + 0.2 * entity + 0.25 * depth,
  );

  const status = scoreToStatus(score);
  const explanation =
    status === "strong"
      ? "Combined, your crawlability, structured data, and content depth give AI systems enough to work with when considering a recommendation."
      : status === "needs_improvement"
        ? "AI systems can partially understand your business, but gaps in crawlability, structure, or content reduce confidence in recommending you."
        : "Taken together, these signals give AI systems very little to work with — improving them together is the fastest path to being considered.";

  return { score, explanation };
}

const CHECK_LABELS: Record<BusinessType, Record<CheckId, string>> = {
  local: {
    business_identity: "Business identity clarity",
    location_clarity: "Location clarity",
    service_clarity: "Service clarity",
    contact_consistency: "Contact information consistency",
    structured_data: "Structured data / LocalBusiness schema",
    ai_recommendation_readiness: "AI recommendation readiness",
  },
  online: {
    business_identity: "Business identity clarity",
    location_clarity: "Location clarity",
    service_clarity: "Service clarity",
    contact_consistency: "Contact information consistency",
    structured_data: "Structured data / Organization & product schema",
    ai_recommendation_readiness: "AI recommendation readiness",
  },
};

const READINESS_FIX_PREFIX = "Improve these AI recommendation inputs together:";

// Scoring v1.2: each fix names only what its own check measures, so a fix
// never restates a check that reads Strong (e.g. the old contact fix said
// "business identity" while "Business identity clarity" could be Strong).
const CHECK_PRIORITIES: Record<BusinessType, Record<CheckId, string>> = {
  local: {
    business_identity: "State your business name clearly in your homepage text.",
    location_clarity: "State your city, state, and street address on your homepage.",
    service_clarity: "Describe your services in more plain-language detail on your homepage.",
    contact_consistency: "Make your name, phone, and address consistent across your site.",
    structured_data: "Add LocalBusiness structured data with your address, phone, and opening hours.",
    ai_recommendation_readiness: READINESS_FIX_PREFIX,
  },
  online: {
    business_identity: "State your business name clearly in your homepage text.",
    location_clarity: "State your city, state, and street address on your homepage.",
    service_clarity: "Describe your product and what it does in more plain-language detail on your homepage.",
    contact_consistency: "Make your business name and contact details consistent across your site.",
    structured_data: "Add Organization, WebSite, and SoftwareApplication (or Product) structured data.",
    ai_recommendation_readiness: READINESS_FIX_PREFIX,
  },
};

/**
 * The readiness fix names only the readiness inputs that are actually weak
 * (< STRONG_THRESHOLD), so it can't contradict a Strong structured-data or
 * contact check that shares an input.
 */
function readinessFix(args: DeriveChecksInput): string {
  const parts: string[] = [];
  if ((args.crawlability?.score ?? 0) < STRONG_THRESHOLD) parts.push("crawl access");
  if ((args.schema?.score ?? 0) < STRONG_THRESHOLD) parts.push("structured data");
  if ((args.entityConsistency?.score ?? 0) < STRONG_THRESHOLD) parts.push("contact consistency");
  if (Math.min(100, Math.round(((args.readability?.wordCount ?? 0) / 300) * 100)) < STRONG_THRESHOLD) parts.push("content depth");
  return parts.length > 0 ? `${READINESS_FIX_PREFIX} ${parts.join(", ")}.` : `${READINESS_FIX_PREFIX} crawl access and content depth.`;
}

/** Which check a fix came from — exported for consistency tests. */
export function checkIdForFix(fix: string): CheckId | null {
  if (fix.startsWith(READINESS_FIX_PREFIX)) return "ai_recommendation_readiness";
  for (const table of Object.values(CHECK_PRIORITIES)) {
    const hit = (Object.keys(table) as CheckId[]).find((id) => table[id] === fix);
    if (hit) return hit;
  }
  return null;
}

const CHECK_ORDER: CheckId[] = [
  "business_identity",
  "location_clarity",
  "service_clarity",
  "contact_consistency",
  "structured_data",
  "ai_recommendation_readiness",
];

export function deriveChecks(args: DeriveChecksInput): FreeCheckResult {
  // Scoring v1.1: classify first. Local (the default) is scored exactly as
  // in v1.0. Online businesses aren't scored on storefront location or
  // opening hours.
  const classification = classifyBusinessType({
    category: args.input.category,
    plainText: args.plainText,
    schema: args.schema,
    entityConsistency: args.entityConsistency,
  });
  const online = classification.type === "online";
  const effective: DeriveChecksInput =
    online && args.schema
      ? { ...args, schema: { ...args.schema, score: args.onlineSchema?.score ?? 0 } }
      : args;

  const scored: Record<CheckId, { score: number; explanation: string }> = {
    business_identity: scoreBusinessIdentity(args),
    location_clarity: online
      ? {
          score: 0,
          explanation:
            "This looks like an online business, so a storefront address and service area aren't scored.",
        }
      : scoreLocationClarity(args),
    service_clarity: scoreServiceClarity(args),
    contact_consistency: scoreContactConsistency(args),
    structured_data: scoreStructuredData(effective, online),
    ai_recommendation_readiness: scoreAiRecommendationReadiness(effective),
  };
  const applicable = (id: CheckId) => !(online && id === "location_clarity");

  const checks: CheckResult[] = CHECK_ORDER.map((id) => ({
    id,
    label: CHECK_LABELS[classification.type][id],
    status: applicable(id) ? scoreToStatus(scored[id].score) : "not_applicable",
    explanation: scored[id].explanation,
  }));

  // Weights of the checks that apply; 100 for local, so v1.0 math is unchanged.
  const applicableWeight = CHECK_ORDER.filter(applicable).reduce(
    (sum, id) => sum + WEIGHTS[id],
    0,
  );
  const overallScore = Math.round(
    CHECK_ORDER.filter(applicable).reduce(
      (sum, id) => sum + (scored[id].score * WEIGHTS[id]) / applicableWeight,
      0,
    ),
  );

  // Severity rank for sorting problems worst-first: missing < needs_improvement.
  const severityRank: Record<CheckStatus, number> = {
    missing: 0,
    needs_improvement: 1,
    strong: 2,
    not_applicable: 3,
  };

  const strengths = checks
    .filter((c) => c.status === "strong")
    .slice(0, 3)
    .map((c) => c.label);

  const problemChecks = [...checks]
    .filter((c) => c.status !== "strong" && c.status !== "not_applicable")
    .sort((a, b) => severityRank[a.status] - severityRank[b.status]);

  const problems = problemChecks.slice(0, 3).map((c) => c.label);
  const fixes = problemChecks
    .slice(0, 3)
    .map((c) =>
      c.id === "ai_recommendation_readiness"
        ? readinessFix(effective)
        : CHECK_PRIORITIES[classification.type][c.id],
    );

  return {
    ok: true,
    overallScore,
    checks,
    strengths,
    problems,
    fixes,
    businessType: classification.type,
    businessTypeReasons: classification.reasons,
    scoringVersion: FREE_CHECK_SCORING_VERSION,
  };
}
