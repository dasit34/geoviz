/**
 * Pre-import discovery filters — applied to ANY provider's
 * `NormalizedBusinessRecord[]` before the dedup/import loop, so a
 * search's "must have website" / "minimum reviews" / "minimum rating"
 * settings reject records before they ever touch the lead system, not
 * after. Provider-agnostic on purpose — lives in `src/lib/leads/`, not
 * `src/lib/discovery/`, and Google Places discovery gets these filters
 * for free alongside Outscraper.
 */

import type { NormalizedBusinessRecord } from "@/lib/discovery/types";

export type DiscoveryFilterOptions = {
  minReviews?: number | null;
  minRating?: number | null;
  mustHaveWebsite?: boolean | null;
};

export type DiscoveryFilterResult = {
  passed: NormalizedBusinessRecord[];
  filteredOutCount: number;
};

/**
 * A record with an unknown (null) reviewCount/rating FAILS a configured
 * minimum — fail-safe, not a silent pass. This is a deliberate choice:
 * an admin setting "minimum 20 reviews" wants a quality bar, not a
 * loophole for records the provider didn't score.
 */
export function filterDiscoveryRecords(
  records: NormalizedBusinessRecord[],
  options: DiscoveryFilterOptions,
): DiscoveryFilterResult {
  const minReviews = options.minReviews ?? null;
  const minRating = options.minRating ?? null;
  const mustHaveWebsite = options.mustHaveWebsite ?? false;

  const passed = records.filter((r) => {
    if (minReviews !== null) {
      if (r.reviewCount === null || r.reviewCount < minReviews) return false;
    }
    if (minRating !== null) {
      if (r.rating === null || r.rating < minRating) return false;
    }
    if (mustHaveWebsite) {
      if (!r.website || r.website.trim().length === 0) return false;
    }
    return true;
  });

  return { passed, filteredOutCount: records.length - passed.length };
}
