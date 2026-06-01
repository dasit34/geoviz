/**
 * Deterministic builder for the customer-facing "Where All AI Systems
 * Agree" four-group bullet list.
 *
 * Pure function. No I/O. No clocks. Reads validator outputs +
 * deterministic consensus rollup; returns four parallel arrays
 * (agreed / uncertain / missing / barriers). Bullets are intentionally
 * brief — they're written for one-line list rendering and may be
 * passed through `polishConsensusBullets()` for a natural-language
 * rewrite before persistence.
 *
 * Frozen-surface note: this never touches scoring. It synthesizes
 * presentation-only text from already-persisted fields.
 */

import type { NormalizedValidationOutput } from "@/lib/validators/types";

import type { ConsensusBullets, ConsensusIndex } from "./types";

type Axis =
  | "category_confidence"
  | "service_area_confidence"
  | "recommendation_confidence";

const AXIS_DISPLAY: Record<Axis, string> = {
  category_confidence: "business identity",
  service_area_confidence: "service area definition",
  recommendation_confidence: "trust to actively recommend",
};

function countAt(
  outputs: NormalizedValidationOutput[],
  axis: Axis,
  level: "low" | "medium" | "high",
): number {
  return outputs.filter(
    (o) => o.status === "passed" && o[axis] === level,
  ).length;
}

function tally(
  outputs: NormalizedValidationOutput[],
  axis: Axis,
): { low: number; medium: number; high: number } {
  return {
    low: countAt(outputs, axis, "low"),
    medium: countAt(outputs, axis, "medium"),
    high: countAt(outputs, axis, "high"),
  };
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

function passedOutputs(
  outputs: NormalizedValidationOutput[],
): NormalizedValidationOutput[] {
  return outputs.filter((o) => o.status === "passed");
}

function buildAgreed(
  outputs: NormalizedValidationOutput[],
): string[] {
  const passed = passedOutputs(outputs);
  const passedCount = passed.length;
  if (passedCount < 2) return [];

  const majority = Math.ceil(passedCount / 2);
  const out: string[] = [];

  // Business identity — if majority say "high", include concrete
  // industry strings from the new rich fields where available.
  const id = tally(passed, "category_confidence");
  if (id.high >= majority) {
    const industries = dedupePreserveOrder(
      passed
        .map((o) => o.industry_identified ?? "")
        .filter((s): s is string => s.length > 0),
    );
    if (industries.length === 1) {
      out.push(`Identified the business as ${industries[0]}.`);
    } else if (industries.length > 1) {
      out.push(
        `Identified the business as ${industries[0]} (others described it similarly).`,
      );
    } else {
      out.push("Identified the type of business this is.");
    }
  }

  // Service area
  const svc = tally(passed, "service_area_confidence");
  if (svc.high >= majority) {
    const locations = dedupePreserveOrder(
      passed
        .map((o) => o.location_identified ?? "")
        .filter((s): s is string => s.length > 0),
    );
    if (locations.length > 0) {
      out.push(`Recognized the service area: ${locations[0]}.`);
    } else {
      out.push("Recognized the geographic service area the business serves.");
    }
  }

  // Specific services — list services that appear in 2+ providers'
  // services_identified arrays.
  const serviceFreq = new Map<string, number>();
  for (const o of passed) {
    if (!Array.isArray(o.services_identified)) continue;
    const seenInThisProvider = new Set<string>();
    for (const raw of o.services_identified) {
      const key = raw.trim().toLowerCase();
      if (!key || seenInThisProvider.has(key)) continue;
      seenInThisProvider.add(key);
      serviceFreq.set(key, (serviceFreq.get(key) ?? 0) + 1);
    }
  }
  const sharedServices: string[] = [];
  for (const [key, count] of serviceFreq.entries()) {
    if (count >= 2) {
      // Recover a nicely-cased version from the first provider that had it.
      let display = key;
      for (const o of passed) {
        const match = o.services_identified?.find(
          (s) => s.trim().toLowerCase() === key,
        );
        if (match) {
          display = match.trim();
          break;
        }
      }
      sharedServices.push(display);
    }
  }
  if (sharedServices.length === 1) {
    out.push(`Recognized the same core service: ${sharedServices[0]}.`);
  } else if (sharedServices.length >= 2) {
    const head = sharedServices.slice(0, 3).join(", ");
    out.push(`Recognized the same core services: ${head}.`);
  }

  return out.slice(0, 5);
}

function buildUncertain(
  outputs: NormalizedValidationOutput[],
): string[] {
  const passed = passedOutputs(outputs);
  const passedCount = passed.length;
  if (passedCount < 2) return [];

  const out: string[] = [];
  const axes: Axis[] = [
    "category_confidence",
    "service_area_confidence",
    "recommendation_confidence",
  ];
  for (const axis of axes) {
    const t = tally(passed, axis);
    const nonZero = [t.low, t.medium, t.high].filter((n) => n > 0).length;
    const dominant = Math.max(t.low, t.medium, t.high);
    // Considered "uncertain" when:
    //  - at least 2 distinct confidence levels are present, AND
    //  - no single level holds the majority of passed providers.
    if (nonZero >= 2 && dominant < Math.ceil(passedCount / 2) + 1) {
      out.push(`Mixed reads on ${AXIS_DISPLAY[axis]} across the systems.`);
    }
  }

  // Also flag uncertainty in the would_recommend field when providers
  // disagree (e.g. one YES + others PARTIAL/NO).
  const recommendCounts = { YES: 0, PARTIAL: 0, NO: 0 };
  for (const o of passed) {
    if (o.would_recommend) recommendCounts[o.would_recommend] += 1;
  }
  const recVotes =
    recommendCounts.YES + recommendCounts.PARTIAL + recommendCounts.NO;
  const dominantVote = Math.max(
    recommendCounts.YES,
    recommendCounts.PARTIAL,
    recommendCounts.NO,
  );
  if (recVotes >= 2 && dominantVote < recVotes) {
    out.push(
      "Whether the business is recommend-ready is split across the systems.",
    );
  }

  return out.slice(0, 5);
}

function buildMissing(
  outputs: NormalizedValidationOutput[],
): string[] {
  const passed = passedOutputs(outputs);
  if (passed.length < 2) return [];

  // Theme-cluster missing_facts by a normalized key (lowercased,
  // collapsed whitespace, trailing punctuation stripped). Items
  // appearing in ≥ 2 providers' lists become bullets.
  const themeCount = new Map<string, number>();
  const themeDisplay = new Map<string, string>();
  for (const o of passed) {
    if (!Array.isArray(o.missing_facts)) continue;
    const seenInProvider = new Set<string>();
    for (const raw of o.missing_facts) {
      if (typeof raw !== "string") continue;
      const display = raw.trim().replace(/[\.;,!?]+$/g, "");
      if (!display) continue;
      const key = display.toLowerCase();
      if (seenInProvider.has(key)) continue;
      seenInProvider.add(key);
      themeCount.set(key, (themeCount.get(key) ?? 0) + 1);
      if (!themeDisplay.has(key)) themeDisplay.set(key, display);
    }
  }
  const shared: string[] = [];
  for (const [key, count] of themeCount.entries()) {
    if (count >= 2) {
      const display = themeDisplay.get(key) ?? key;
      shared.push(display.charAt(0).toUpperCase() + display.slice(1));
    }
  }
  return shared.slice(0, 5);
}

function buildBarriers(
  outputs: NormalizedValidationOutput[],
  consensus: ConsensusIndex,
): string[] {
  const passed = passedOutputs(outputs);
  const out: string[] = [];

  const recMajority =
    consensus.agreement_metrics?.recommendation_confidence_majority ?? null;
  const trustScore = consensus.dimensions?.trust_signals?.score ?? 0;
  const recReadinessScore =
    consensus.dimensions?.recommendation_readiness?.score ?? 0;

  if (recMajority === "low") {
    out.push(
      "Most AI systems lack confident grounds to actively recommend the business today.",
    );
  }
  if (trustScore < 50) {
    out.push(
      "Trust signals (reviews, credentials, on-site verification) are thin.",
    );
  }
  if (recReadinessScore < 50) {
    out.push(
      "Composite recommendation readiness (brand + schema + trust + content depth) is below the threshold.",
    );
  }

  // Pull per-provider recommendation_reason strings when would_recommend
  // is NO and provide one as a concrete barrier sentence.
  const noReasons = passed
    .filter((o) => o.would_recommend === "NO")
    .map((o) => o.recommendation_reason ?? "")
    .filter((s): s is string => s.trim().length > 0);
  if (noReasons.length > 0) {
    out.push(noReasons[0].trim());
  }

  return dedupePreserveOrder(out).slice(0, 5);
}

export function buildConsensusBullets(input: {
  outputs: NormalizedValidationOutput[];
  consensus: ConsensusIndex;
}): ConsensusBullets {
  return {
    agreed: buildAgreed(input.outputs),
    uncertain: buildUncertain(input.outputs),
    missing: buildMissing(input.outputs),
    barriers: buildBarriers(input.outputs, input.consensus),
  };
}
