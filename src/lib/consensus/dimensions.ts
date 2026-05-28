/**
 * Roll up the six frozen deterministic categories into six product-facing
 * dimensions. Pure deterministic math — reads only `category_scores`
 * from `DeterministicScore`, never validator data.
 *
 * Weight rationale (auditable):
 *   Business Identity              brand 0.60 + schema 0.40
 *     — Brand captures name + sameAs + cross-surface agreement.
 *     — Schema captures the JSON-LD entity declaration.
 *
 *   Schema Quality                  schema 1.00
 *     — Pure schema signal: JSON-LD validity, type coverage, fields.
 *
 *   Trust Signals                   trust 1.00
 *     — NAP consistency + AggregateRating + review signal.
 *
 *   Service Clarity                 content 1.00
 *     — Word count, FAQ schema, AI-readability proxy.
 *
 *   Coverage Depth                  crawler 0.60 + content 0.40
 *     — Crawler: robots.txt + sitemap + canonical (can AI reach it).
 *     — Content: word count proxy for depth.
 *
 *   Recommendation Readiness        brand 0.25 + schema 0.30
 *                                  + trust 0.25 + content 0.20
 *     — Composite: AI can only recommend if it can name the entity
 *       (brand), understand it (schema), trust it (trust signals),
 *       and quote relevant content.
 *
 * The dimension WEIGHTS are independent of the frozen scoring weights
 * (Schema 25 / Crawler 20 / Trust 20 / Content 15 / Brand 10 / Tech 10).
 * `WEIGHT_HASH` stays byte-equal because `src/lib/scoring/frozen.ts` is
 * not touched.
 */

import type { DeterministicScore } from "@/lib/scoring/types";

import type { ConfidenceBand, DimensionScore, Dimensions } from "./types";

/** Band thresholds for both dimension scores AND the Confidence Index.
 *  NOT the frozen deterministic bands (those stay 0/26/46/66/81). */
export function bandForScore(score: number): ConfidenceBand {
  if (score >= 90) return "Exceptional";
  if (score >= 75) return "Strong";
  if (score >= 60) return "Competitive";
  if (score >= 40) return "Limited";
  return "Invisible Risk";
}

function pctNormalized(score: number, max: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return 0;
  const pct = (score / max) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

function makeDimension(
  weightedScore: number,
  contributing: readonly string[],
): DimensionScore {
  const clamped = Math.max(0, Math.min(100, Math.round(weightedScore)));
  return {
    score: clamped,
    level: bandForScore(clamped),
    contributing_categories: contributing,
  };
}

export function computeDimensions(
  deterministicScore: DeterministicScore,
): Dimensions {
  const cats = deterministicScore.category_scores;

  // Per-category 0..100 normalized score.
  const schemaPct = pctNormalized(cats.schema.score, cats.schema.max);
  const crawlerPct = pctNormalized(cats.crawler.score, cats.crawler.max);
  const trustPct = pctNormalized(cats.trust.score, cats.trust.max);
  const contentPct = pctNormalized(cats.content.score, cats.content.max);
  const brandPct = pctNormalized(cats.brand.score, cats.brand.max);

  // Business Identity = brand 0.60 + schema 0.40
  const businessIdentity = brandPct * 0.6 + schemaPct * 0.4;

  // Schema Quality = schema 1.00
  const schemaQuality = schemaPct;

  // Trust Signals = trust 1.00
  const trustSignals = trustPct;

  // Service Clarity = content 1.00
  const serviceClarity = contentPct;

  // Coverage Depth = crawler 0.60 + content 0.40
  const coverageDepth = crawlerPct * 0.6 + contentPct * 0.4;

  // Recommendation Readiness = brand 0.25 + schema 0.30 + trust 0.25 + content 0.20
  const recommendationReadiness =
    brandPct * 0.25 + schemaPct * 0.3 + trustPct * 0.25 + contentPct * 0.2;

  return {
    business_identity: makeDimension(businessIdentity, ["brand", "schema"]),
    schema_quality: makeDimension(schemaQuality, ["schema"]),
    trust_signals: makeDimension(trustSignals, ["trust"]),
    service_clarity: makeDimension(serviceClarity, ["content"]),
    coverage_depth: makeDimension(coverageDepth, ["crawler", "content"]),
    recommendation_readiness: makeDimension(recommendationReadiness, [
      "brand",
      "schema",
      "trust",
      "content",
    ]),
  };
}
