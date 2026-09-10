import type { StudyAggregate } from "./types";

export type CaseStudyStudyInfo = {
  category: string | null;
  city: string | null;
  state: string | null;
};

/**
 * Build a list of factual, aggregate-only sentences for the study's
 * "Case Study Summary" section. Pure.
 *
 * Rules (per the spec):
 *   - real measured numbers only — nothing invented
 *   - NO individual company names or scores
 *   - degrade gracefully when city/state/category are missing
 *   - if there's too little data, say so instead of quoting numbers
 */
export function buildCaseStudySummary(
  study: CaseStudyStudyInfo,
  aggregate: StudyAggregate,
): string[] {
  const noun = businessNoun(study.category);
  const place = placePhrase(study.city, study.state);

  if (aggregate.auditedCount === 0) {
    return ["No audits have completed for this study yet."];
  }

  if (aggregate.insufficientData) {
    return [
      `${aggregate.auditedCount} ${noun}${
        place ? ` ${place}` : ""
      } audited so far — collecting more results before reporting aggregate metrics.`,
    ];
  }

  const lines: string[] = [];

  lines.push(
    `We audited ${aggregate.auditedCount} ${noun}${place ? ` ${place}` : ""}.`,
  );

  if (aggregate.avgScore != null) {
    lines.push(`Average GeoViz score: ${fmt(aggregate.avgScore)}/100.`);
  }
  if (aggregate.medianScore != null) {
    lines.push(`Median score: ${fmt(aggregate.medianScore)}/100.`);
  }
  if (aggregate.minScore != null && aggregate.maxScore != null) {
    lines.push(
      `Scores ranged from ${fmt(aggregate.minScore)} to ${fmt(
        aggregate.maxScore,
      )}.`,
    );
  }

  const aiReady = aggregate.scoreDistribution.find((b) => b.band === "AI-Ready");
  const invisible = aggregate.scoreDistribution.find(
    (b) => b.band === "Invisible",
  );
  if (invisible && invisible.count > 0) {
    lines.push(
      `${fmt(invisible.pct)}% scored in the lowest band ("Invisible").`,
    );
  }
  if (aiReady) {
    lines.push(
      aiReady.count > 0
        ? `${fmt(aiReady.pct)}% reached the top band ("AI-Ready").`
        : `None reached the top band ("AI-Ready").`,
    );
  }

  for (const f of aggregate.topFindings.slice(0, 3)) {
    lines.push(`${fmt(f.pctAffected)}% had ${f.label}.`);
  }

  if (aggregate.legacyCount > 0) {
    lines.push(
      `(${aggregate.legacyCount} of these audits predate the current scoring engine and are excluded from the issue breakdown.)`,
    );
  }

  return lines;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function businessNoun(category: string | null): string {
  if (!category) return "local businesses";
  // category is a normalizeIndustry() slug — make it readable + plural.
  const readable = category.replace(/_/g, " ").trim();
  const map: Record<string, string> = {
    roofing: "roofing companies",
    hvac: "HVAC companies",
    plumbing: "plumbing companies",
    electrical: "electrical contractors",
    landscaping: "landscaping companies",
    legal: "law firms",
    dental: "dental practices",
    medical: "medical practices",
    restaurant: "restaurants",
    salon: "salons and spas",
    real_estate: "real estate agencies",
    automotive: "auto shops",
    contractor: "contractors",
    home_services: "home-services businesses",
    professional_services: "professional-services firms",
    ecommerce: "online stores",
    nonprofit: "nonprofits",
    local_services: "local-services businesses",
  };
  return map[category] ?? `${readable} businesses`;
}

function placePhrase(city: string | null, state: string | null): string | null {
  const c = city?.trim();
  const s = state?.trim();
  if (c && s) return `in ${c}, ${s}`;
  if (c) return `in ${c}`;
  if (s) return `in ${s}`;
  return null;
}
