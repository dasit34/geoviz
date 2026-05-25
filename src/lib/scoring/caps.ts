/**
 * Declarative cap rules.
 *
 * Caps are absolute ceilings on a target score (category, bucket, or
 * overall). When a rule's trigger fires, the target's score is clamped
 * down to `cap_value` and a `CapRecord` is appended to the trace.
 *
 * Pure — no I/O, no Date, no random.
 */

import type {
  CapRecord,
  CapRule,
  CategoryKey,
  CategoryScoreInternal,
  Evidence,
  PublicBucketKey,
} from "./types";

export const CAP_RULES: CapRule[] = [
  {
    id: "no_schema_caps_understanding",
    target: "bucket:understanding",
    cap_value: 18,
    triggers_on: (e) => {
      const blockCount = e.schema?.raw_jsonld_block_count ?? 0;
      return blockCount === 0;
    },
    reason: "No structured data on the homepage",
  },
  {
    id: "crawl_failure_caps_retrieval",
    target: "bucket:retrieval",
    cap_value: 12,
    triggers_on: (e) => {
      const failed = new Set(
        (e.crawlability?.failed_checks ?? []).map((s) => s.toLowerCase()),
      );
      return (
        failed.has("robots_txt_not_blocking_all") ||
        failed.has("homepage_not_noindex")
      );
    },
    reason: "Crawler is blocked or homepage is noindex",
  },
  {
    id: "missing_identity_caps_overall",
    target: "overall",
    cap_value: 40,
    triggers_on: (e) => {
      const n = e.entity?.name ?? null;
      if (!n) return true;
      const noName =
        !n.schema?.trim() && !n.homepage?.trim() && !n.footer?.trim();
      return noName;
    },
    reason: "Business identity not extractable from any surface",
  },
  {
    id: "thin_content_caps_recommendation",
    target: "bucket:recommendation",
    cap_value: 8,
    triggers_on: (e) => (e.content?.word_count ?? 0) < 200,
    reason: "Service / homepage content under 200 words",
  },
];

/**
 * Apply every cap whose target is a category or a bucket. Returns the
 * mutated category/bucket scores plus the list of cap records.
 *
 * Overall-level caps are applied separately by `applyOverallCaps`.
 */
export function applyBucketAndCategoryCaps(args: {
  buckets: Record<PublicBucketKey, { score: number; max: number; percentage: number }>;
  categories: Record<CategoryKey, CategoryScoreInternal>;
  evidence: Evidence;
}): {
  buckets: Record<PublicBucketKey, { score: number; max: number; percentage: number }>;
  applied: CapRecord[];
} {
  const buckets = { ...args.buckets };
  const applied: CapRecord[] = [];

  for (const rule of CAP_RULES) {
    if (rule.target === "overall") continue;
    if (!rule.triggers_on(args.evidence, args.categories)) continue;

    if (rule.target.startsWith("bucket:")) {
      const key = rule.target.slice("bucket:".length) as PublicBucketKey;
      const current = buckets[key];
      const bound = current.score > rule.cap_value;
      const adjusted = bound ? rule.cap_value : current.score;
      // Always record when the trigger fires — useful for the trace
      // even when the cap didn't bind (the rule still tells the
      // operator why this bucket can't grow past `cap_value`).
      applied.push({
        rule_id: rule.id,
        target: rule.target,
        original_value: current.score,
        adjusted_value: adjusted,
        reason: rule.reason,
      });
      if (bound) {
        buckets[key] = {
          ...current,
          score: adjusted,
          percentage:
            current.max > 0 ? Math.round((adjusted / current.max) * 100) : 0,
        };
      }
    }
    // category:* targets reserved for future use — categories are
    // already clamped to their `max` by each scorer. No code path
    // currently fires here.
  }

  return { buckets, applied };
}

/**
 * Apply caps that target the overall score. Called after synergy.
 */
export function applyOverallCaps(args: {
  overall: number;
  categories: Record<CategoryKey, CategoryScoreInternal>;
  evidence: Evidence;
}): { overall: number; applied: CapRecord[] } {
  let overall = args.overall;
  const applied: CapRecord[] = [];

  for (const rule of CAP_RULES) {
    if (rule.target !== "overall") continue;
    if (!rule.triggers_on(args.evidence, args.categories)) continue;
    const bound = overall > rule.cap_value;
    const adjusted = bound ? rule.cap_value : overall;
    // Same policy as bucket caps — record when the trigger fires,
    // even if the cap didn't bind, so the trace reflects every rule
    // the evidence triggered.
    applied.push({
      rule_id: rule.id,
      target: "overall",
      original_value: overall,
      adjusted_value: adjusted,
      reason: rule.reason,
    });
    if (bound) overall = adjusted;
  }

  return { overall, applied };
}
