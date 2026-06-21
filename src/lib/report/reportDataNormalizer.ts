/**
 * reportDataNormalizer — safety layer between buildReportModel and ReportDocument.
 *
 * Guarantees the template never receives:
 *   - raw schema.org field names in customer-facing titles/actions
 *   - broken question templates (conjunctions in noun slots)
 *   - internal error text in provider descriptions
 *   - null/undefined in fields the template accesses unconditionally
 *
 * All issues are logged to console only. Nothing reaches the PDF.
 * This is a pure function — same input always produces same output.
 */

import type {
  ReportModel,
  ReportModelDiagnostic,
  ReportModelFix,
  ReportModelProvider,
} from "./report-model";

// ── Field name humanization ──────────────────────────────────────────────────
// Maps schema.org field identifiers → plain English. Used to catch raw field
// names that leaked from older deterministicScore payloads (generated before
// the scoring engine added FIELD_LABELS humanization).
const SCHEMA_FIELD_HUMAN: Record<string, string> = {
  geo: "location coordinates",
  telephone: "phone number",
  url: "website address",
  name: "business name",
  address: "street address",
  openingHours: "business hours",
  openingHoursSpecification: "business hours",
  priceRange: "price range",
  email: "email address",
  description: "business description",
  sameAs: "directory profile links",
  aggregateRating: "customer rating",
  logo: "business logo",
  image: "business image",
  streetAddress: "street address",
  addressLocality: "city",
  addressRegion: "state or region",
  postalCode: "postal code",
  contactPoint: "contact information",
};

/**
 * Humanize raw schema.org field names appearing after "fields missing:",
 * "fields malformed:", or similar audit-engine prefixes. Only replaces
 * within that context — not globally — so identifiers in technical strings
 * are preserved.
 */
function humanizeFieldsInMessage(text: string): string {
  return text.replace(
    /((?:required|entity|business\s+profile)?\s*fields?\s+(?:missing|malformed|incomplete|required)):\s*([^.!?\n]+)/gi,
    (_, prefix, rawList) => {
      const humanized = rawList
        .split(/,\s*/)
        .map((f: string) => SCHEMA_FIELD_HUMAN[f.trim()] ?? f.trim())
        .join(", ");
      return `${prefix}: ${humanized}`;
    },
  );
}

// ── Jargon substitutions ─────────────────────────────────────────────────────
// These developer/technical terms must never appear in customer-facing strings.
// Listed from most-specific to least-specific so narrower patterns win.
const JARGON_SUBS: Array<[RegExp, string]> = [
  [/\bjson-?ld\s+block(?:s)?\b/gi, "structured business data blocks"],
  [/\bjson-?ld\b/gi, "structured business data"],
  [/\bschema\.org\b/gi, "business profile standard"],
  [/\bnap\s+consistency\b/gi, "name, address, and phone consistency"],
  [/\bnap\b(?!\s*consistency)/gi, "business identity"],
  [/\bsameAs\s+links?\b/gi, "directory profile links"],
  [/\bLocalBusiness\b/g, "local business profile"],
  [/\bJSON-LD\b/g, "structured business data"],
];

function applyJargonSubs(text: string): string {
  let out = text;
  for (const [re, sub] of JARGON_SUBS) {
    out = out.replace(re, sub);
  }
  return out;
}

function sanitize(text: string): string {
  return applyJargonSubs(humanizeFieldsInMessage(text));
}

// ── Diagnostic normalizer ────────────────────────────────────────────────────
function normalizeDiagnostic(d: ReportModelDiagnostic): ReportModelDiagnostic {
  return {
    ...d,
    title: sanitize(d.title),
    problem: sanitize(d.problem),
    // whyItHurts is hardcoded from WHY_IT_HURTS map — safe as-is
  };
}

// ── Fix normalizer ───────────────────────────────────────────────────────────
function normalizeFix(f: ReportModelFix): ReportModelFix {
  return {
    ...f,
    issue: sanitize(f.issue),
    title: sanitize(f.title),
    action: sanitize(f.action),
  };
}

// ── Provider normalizer ──────────────────────────────────────────────────────
// Maps internal status/error strings to display-safe equivalents.
const INTERNAL_STATUS_PATTERNS: Array<[RegExp, string]> = [
  [/no response captured/i, "unavailable"],
  [/failed to load/i, "unavailable"],
  [/could not access/i, "unavailable"],
  [/timeout/i, "unavailable"],
  [/error/i, "unavailable"],
];

function sanitizeProviderStatus(status: string): string {
  for (const [re, replacement] of INTERNAL_STATUS_PATTERNS) {
    if (re.test(status)) return replacement;
  }
  return status;
}

function normalizeProvider(p: ReportModelProvider): ReportModelProvider {
  return {
    ...p,
    status: sanitizeProviderStatus(p.status),
    // mainGap is an LLM-generated string — sanitize jargon if present
    mainGap: p.mainGap ? sanitize(p.mainGap) : null,
  };
}

// ── Customer question sanitizer ──────────────────────────────────────────────
// Detects the signature of a broken simplifyBusinessType result: a conjunction
// or preposition appearing immediately after the noun slot in a question frame.
// E.g. "Who are the best and decor retailers to consider?" — "and" right after
// "best" indicates the noun phrase started with a conjunction.
const BROKEN_QUESTION_RE =
  /\b(?:best|reliable|a\s+reliable|choosing\s+an?|consider)\s+(?:and|or|the|of|in|at|by|for)\b/i;

function isBrokenQuestion(q: string): boolean {
  return BROKEN_QUESTION_RE.test(q);
}

function safeFallbackQuestions(businessName: string): string[] {
  const name = (businessName ?? "").trim() || "this business";
  return [
    `Who are the best businesses in this category to consider?`,
    `Can you recommend a reliable provider like ${name}?`,
    `Is ${name} trustworthy and legitimate?`,
    `What should I look for when choosing a business in this category?`,
    `Which businesses like ${name} should I compare?`,
  ];
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Normalize a ReportModel before it reaches ReportDocument.
 *
 * Applies:
 *  1. Diagnostic title / problem sanitization (raw field names, jargon)
 *  2. Fix issue / action sanitization (same)
 *  3. Provider status sanitization (internal error strings)
 *  4. Customer question validation + fallback replacement
 *
 * Logs all issues to console only. Returns a clean model with the same
 * shape — never mutates the original.
 */
export function normalizeReportModel(model: ReportModel): ReportModel {
  const warnings: string[] = [];

  const diagnostics = model.diagnostics.map((d) => {
    const n = normalizeDiagnostic(d);
    if (n.title !== d.title || n.problem !== d.problem) {
      warnings.push(
        `[normalizer] diagnostic #${d.rank} title sanitized: "${d.title.slice(0, 60)}"`,
      );
    }
    return n;
  });

  const fixes = model.fixes.map((f) => {
    const n = normalizeFix(f);
    if (n.action !== f.action || n.issue !== f.issue) {
      warnings.push(`[normalizer] fix #${f.rank} action sanitized`);
    }
    return n;
  });

  const providers = model.providers.map(normalizeProvider);

  const hasBrokenQuestion = model.customerQuestions.some(isBrokenQuestion);
  const customerQuestions = hasBrokenQuestion
    ? (() => {
        warnings.push(
          `[normalizer] broken customer questions detected for "${model.meta.businessName}" — using safe fallbacks`,
        );
        return safeFallbackQuestions(model.meta.businessName);
      })()
    : model.customerQuestions;

  // Guarantee at least one question (edge case: empty array)
  const safeQuestions =
    customerQuestions.length > 0
      ? customerQuestions
      : safeFallbackQuestions(model.meta.businessName);

  if (warnings.length > 0) {
    console.warn("[GeoViz normalizer] Report model issues detected:");
    for (const w of warnings) console.warn("  " + w);
  }

  // executive.summaryBullets uses diagnostics[0].title before normalization
  // runs, so raw field names / jargon can appear there even after the
  // diagnostics array is cleaned. Sanitize the bullets independently.
  const executive = {
    ...model.executive,
    summaryBullets: model.executive.summaryBullets.map(sanitize),
    headline: sanitize(model.executive.headline),
  };

  return {
    ...model,
    executive,
    diagnostics,
    fixes,
    providers,
    customerQuestions: safeQuestions,
  };
}
