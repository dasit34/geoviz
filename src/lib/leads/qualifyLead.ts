/**
 * Lead qualification — "is this a good SALES PROSPECT for GeoViz",
 * NOT "how good is this business's own AI visibility" (that's Free
 * Check's job, src/lib/free-check/). Reuses the exact same four
 * deterministic V2 preflight analyzers Free Check already runs — one
 * HTML fetch, fanned out in parallel — so qualification costs $0: no
 * LLM call, no paid API, just our own outbound fetch + our own
 * compute.
 *
 * Scoring philosophy (deliberately NOT a blended/inverted score in
 * Phase 1 — see the lead-gen plan's design-review notes): the numeric
 * `qualificationScore` is built ONLY from baseline-legitimacy signals
 * (reachable, has real content, findable contact info, known
 * category, some review signal). AI-readiness/entity-clarity gaps
 * found along the way (missing schema, NAP inconsistency, etc.) are
 * surfaced as INFORMATIONAL reasons — pitch talking points — rather
 * than folded into the score, since those gaps are supposed to make a
 * business a BETTER prospect, not a worse one, and blending that in
 * numerically without real score-distribution data risks miscalibration.
 *
 * Every weight below lives in one place (`SCORE_WEIGHTS`) specifically
 * so it's easy to see and adjust later, per "make scoring transparent."
 */

import { fetchRawHtml } from "@/lib/intelligence/preflight/fetchRawHtml";
import { extractReadableContent } from "@/lib/intelligence/preflight/extractReadableContent";
import { validateSchema } from "@/lib/intelligence/preflight/schemaValidation";
import { auditCrawlability } from "@/lib/intelligence/preflight/crawlabilityAudit";
import { checkEntityConsistency } from "@/lib/intelligence/preflight/entityConsistency";

export type QualificationResult = {
  score: number;
  qualified: boolean;
  reasons: string[];
};

// Transparent, adjustable weights — must sum to 100. Hard-gated on
// `hasRealContent`: a site that doesn't resolve or is parked/empty
// scores 0 regardless of the other signals, since none of them are
// meaningful without a real site to point a Free Check/audit at.
const SCORE_WEIGHTS = {
  hasRealContent: 40,
  hasFindableContact: 25,
  categoryKnown: 15,
  hasReviewSignal: 10,
  crawlableBaseline: 10,
} as const;

const MIN_WORD_COUNT = 30; // below this, treat as parked/placeholder
export const QUALIFICATION_THRESHOLD = 50;

async function safe<T>(fn: () => T | Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn(
      `[lead-qualify] analyzer failed err=${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}

export async function qualifyLead(args: {
  website: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
}): Promise<QualificationResult> {
  const reasons: string[] = [];

  if (!args.website) {
    return {
      score: 0,
      qualified: false,
      reasons: ["No website on record — cannot run a Free Check or audit."],
    };
  }

  const fetchRes = await fetchRawHtml(args.website, { timeoutMs: 10_000 });
  if (!fetchRes.ok) {
    return {
      score: 0,
      qualified: false,
      reasons: [
        fetchRes.timedOut
          ? "Website did not respond within the timeout — may be down or misconfigured."
          : `Website unreachable: ${fetchRes.error}`,
      ],
    };
  }

  const { html, finalUrl } = fetchRes;
  const [readability, schema, crawlability, entityConsistency] =
    await Promise.all([
      safe(() => extractReadableContent(html, finalUrl)),
      safe(() => validateSchema(html, finalUrl)),
      safe(() => auditCrawlability({ url: finalUrl, homepageHtml: html })),
      safe(() => checkEntityConsistency({ url: finalUrl, html })),
    ]);

  let score = 0;

  // ── Hard-ish gate: real content vs. parked/placeholder page ──
  const wordCount = readability?.wordCount ?? 0;
  const hasRealContent = wordCount >= MIN_WORD_COUNT;
  if (hasRealContent) {
    score += SCORE_WEIGHTS.hasRealContent;
    reasons.push(
      `Website reachable with ${wordCount.toLocaleString()} words of extractable content.`,
    );
  } else {
    reasons.push(
      "Website reachable but has very little extractable content — may be parked or under construction.",
    );
    // Everything else is moot without real content to work with —
    // still report what was found, but score stays at 0.
    return { score: 0, qualified: false, reasons };
  }

  // ── Findable contact info (phone or address on any surface) ──
  const entities = entityConsistency?.extractedEntities;
  const hasPhone = !!(
    entities?.phone.schema ||
    entities?.phone.homepage ||
    entities?.phone.footer
  );
  const hasAddress = !!(
    entities?.address.schema ||
    entities?.address.homepage ||
    entities?.address.footer
  );
  if (hasPhone || hasAddress) {
    score += SCORE_WEIGHTS.hasFindableContact;
    reasons.push(
      `Findable contact info on-site (${[hasPhone && "phone", hasAddress && "address"].filter(Boolean).join(", ")}).`,
    );
  } else {
    reasons.push("No phone or address findable on the homepage/footer/schema.");
  }
  if (entityConsistency?.inconsistencies.length) {
    reasons.push(
      `AI-readiness gap: ${entityConsistency.inconsistencies.length} entity-consistency issue(s) found (e.g. name/phone/address mismatch across surfaces) — a concrete talking point for the pitch.`,
    );
  }

  // ── Known category (already normalized upstream) ──
  if (args.category) {
    score += SCORE_WEIGHTS.categoryKnown;
    reasons.push(`Category matched to a known local-service category: ${args.category}.`);
  } else {
    reasons.push("Category could not be matched to a known local-service taxonomy.");
  }

  // ── Third-party review signal (provider-reported, scale not assumed) ──
  const hasReviewSignal =
    args.rating !== null || (args.reviewCount !== null && args.reviewCount > 0);
  if (hasReviewSignal) {
    score += SCORE_WEIGHTS.hasReviewSignal;
    reasons.push(
      `Has a third-party review signal${args.reviewCount ? ` (${args.reviewCount} review${args.reviewCount === 1 ? "" : "s"})` : ""} — indicates an active, real business.`,
    );
  }

  // ── Baseline crawlability (site isn't blocking everything) ──
  if ((crawlability?.score ?? 0) > 0) {
    score += SCORE_WEIGHTS.crawlableBaseline;
  } else if (crawlability) {
    reasons.push(
      "Site appears to block crawlers entirely (robots/meta-robots) — would need to be addressed before AI visibility work can help.",
    );
  }

  // ── Informational AI-readiness gaps — never affect score ──
  if (schema && schema.rawJsonLdCount === 0) {
    reasons.push(
      "AI-readiness gap: no structured data (JSON-LD) detected at all — a strong, concrete audit pitch.",
    );
  } else if (schema && schema.missingFields.length > 0) {
    reasons.push(
      `AI-readiness gap: structured data present but missing fields (${schema.missingFields.join(", ")}).`,
    );
  }

  return {
    score,
    qualified: score >= QUALIFICATION_THRESHOLD,
    reasons,
  };
}
