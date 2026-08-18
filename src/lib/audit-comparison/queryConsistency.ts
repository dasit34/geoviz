/**
 * Query / category consistency — the "apples to apples" gate for
 * live-model comparisons.
 *
 * `QueryLibraryEntry` (the persistent buyer-intent query catalog) is
 * global/shared across every business in an industry+geo, not audit-
 * specific, and only weakly linked via the evidence-layer tables
 * (gated behind `GEO_EVIDENCE_LAYER_ENABLED`, off by default) — so it
 * can't reliably answer "which exact query ran for audit X." Instead
 * this uses what's actually persisted per-audit, always:
 *   - `AuditIntelligence.industryCategoryNormalized`/`industryTaxonomyVersion`
 *     — the category the audit was scored under.
 *   - `aiValidations.outputs[].competitive.query_text` — the literal
 *     buyer-intent question sent to that provider for THIS audit.
 *
 * Any mismatch means the two audits weren't tested against the same
 * question, so live-model comparison for that provider (or the whole
 * category framing) must be flagged NOT_COMPARABLE rather than
 * silently diffed as if it were apples to apples.
 */
import type { NormalizedValidationOutput } from "@/lib/validators/types";
import type { QueryConsistency } from "./types";

export function computeQueryConsistency(args: {
  previousCategory: string | null;
  previousTaxonomyVersion: string | null;
  currentCategory: string | null;
  currentTaxonomyVersion: string | null;
  previousOutputs: NormalizedValidationOutput[];
  currentOutputs: NormalizedValidationOutput[];
}): QueryConsistency {
  const categoryConsistent =
    args.previousCategory !== null &&
    args.currentCategory !== null &&
    args.previousCategory === args.currentCategory &&
    args.previousTaxonomyVersion === args.currentTaxonomyVersion;

  const previousByProvider = new Map(
    args.previousOutputs.map((o) => [o.provider, o]),
  );
  const currentByProvider = new Map(
    args.currentOutputs.map((o) => [o.provider, o]),
  );

  const providers = new Set([
    ...previousByProvider.keys(),
    ...currentByProvider.keys(),
  ]);

  const perProviderQueryMatch: Record<string, boolean | null> = {};
  for (const provider of providers) {
    const prevQuery = previousByProvider.get(provider)?.competitive?.query_text ?? null;
    const currQuery = currentByProvider.get(provider)?.competitive?.query_text ?? null;
    if (prevQuery === null || currQuery === null) {
      // No competitive-capture data on one/both sides — can't confirm
      // consistency, but also nothing to actively contradict. Null,
      // not false, so callers can distinguish "unknown" from "mismatch".
      perProviderQueryMatch[provider] = null;
      continue;
    }
    perProviderQueryMatch[provider] = normalizeForCompare(prevQuery) === normalizeForCompare(currQuery);
  }

  return {
    categoryConsistent,
    previousCategory: args.previousCategory,
    currentCategory: args.currentCategory,
    previousTaxonomyVersion: args.previousTaxonomyVersion,
    currentTaxonomyVersion: args.currentTaxonomyVersion,
    perProviderQueryMatch,
  };
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
