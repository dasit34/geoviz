/**
 * Declarative penalty rules.
 *
 * Penalties subtract a fixed magnitude from a bucket's score (with a
 * floor of 0). When a rule's trigger fires, the bucket score is
 * adjusted and a `PenaltyRecord` is appended to the trace.
 *
 * Pure.
 */

import type {
  Evidence,
  PenaltyRecord,
  PenaltyRule,
  PublicBucketKey,
} from "./types";

export const PENALTY_RULES: PenaltyRule[] = [
  {
    id: "render_failed",
    target: "bucket:retrieval",
    amount: -3,
    triggers_on: (e) =>
      e.render?.attempted === true && e.render?.successful === false,
    reason: "Render probe failed — AI may not parse content reliably",
  },
  {
    id: "conflicting_nap",
    target: "bucket:trust",
    amount: -4,
    triggers_on: (e) => (e.entity?.inconsistencies?.length ?? 0) >= 2,
    reason: "Name / phone / address conflict across surfaces",
  },
];

export function applyPenalties(args: {
  buckets: Record<PublicBucketKey, { score: number; max: number; percentage: number }>;
  evidence: Evidence;
}): {
  buckets: Record<PublicBucketKey, { score: number; max: number; percentage: number }>;
  applied: PenaltyRecord[];
} {
  const buckets = { ...args.buckets };
  const applied: PenaltyRecord[] = [];

  for (const rule of PENALTY_RULES) {
    if (!rule.triggers_on(args.evidence)) continue;
    if (rule.target === "overall") continue; // bucket-level penalties only in v1

    const key = rule.target.slice("bucket:".length) as PublicBucketKey;
    const current = buckets[key];
    const adjusted = Math.max(0, current.score + rule.amount);
    if (adjusted === current.score) continue;

    applied.push({
      rule_id: rule.id,
      target: rule.target,
      amount: rule.amount,
      original_value: current.score,
      adjusted_value: adjusted,
      reason: rule.reason,
    });
    buckets[key] = {
      ...current,
      score: adjusted,
      percentage:
        current.max > 0 ? Math.round((adjusted / current.max) * 100) : 0,
    };
  }

  return { buckets, applied };
}
