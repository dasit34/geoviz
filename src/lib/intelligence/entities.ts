/**
 * V2 Stage 1 — lightweight entity extraction (skeleton).
 *
 * Pulls structured nouns out of the audit markdown so V2 cohort logic
 * + benchmark queries have something to group by. Stage 1 ships
 * regex-only extraction — no LLM call, no NER, no external service.
 *
 * Returns at most ~10 entities per audit (capped to keep the Json
 * column bounded). When the markdown is too sparse, returns [].
 *
 * Pure function — no DB, no SDK, no React.
 *
 * NOT consumed by scoring. Informational only.
 */

export type EntityExtractionResult = {
  /** De-duplicated, case-preserving string array. Capped at MAX_ENTITIES. */
  entities: string[];
  /** Counts by category — informational, for the operator dashboard. */
  counts: {
    services: number;
    locations: number;
    other: number;
  };
};

const EMPTY: EntityExtractionResult = {
  entities: [],
  counts: { services: 0, locations: 0, other: 0 },
};

const MAX_ENTITIES = 10;
const MIN_MARKDOWN_BYTES = 500;

/**
 * Common local-services service-noun patterns. Intentionally narrow —
 * we want to surface obvious service mentions without flooding the
 * entity list with audit-prose chatter.
 */
const SERVICE_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(roof\s+(?:repair|installation|replacement)|roofing)\b/gi,
  /\b(hvac|heating\s+(?:and|&)\s+(?:air\s+conditioning|cooling))\b/gi,
  /\b(plumbing\s+(?:service|repair))\b/gi,
  /\b(electrical\s+(?:service|repair|installation))\b/gi,
  /\b(landscaping|lawn\s+care)\b/gi,
  /\b(dental\s+(?:cleaning|implants?|exam))\b/gi,
  /\b(personal\s+injury\s+law|family\s+law|estate\s+planning)\b/gi,
  /\b(haircut|massage|facial|manicure)\b/gi,
];

/**
 * Naive location extraction — capitalized two-word place-name
 * patterns ("New York", "Los Angeles") plus state-suffix patterns
 * ("Austin, TX"). High false-positive risk; we cap aggressively.
 */
const LOCATION_PATTERNS: ReadonlyArray<RegExp> = [
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}),\s+([A-Z]{2})\b/g,
  /\bservice\s+area\s*[:\-—]\s*([A-Z][a-zA-Z\s,]+)\b/gi,
];

function uniqueCapped<T>(arr: T[], cap: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const key = String(item).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

export function extractEntities(args: {
  reportMarkdown: string;
  businessName: string | null;
}): EntityExtractionResult {
  const md = args.reportMarkdown ?? "";
  if (md.trim().length < MIN_MARKDOWN_BYTES) return EMPTY;

  const services: string[] = [];
  for (const pattern of SERVICE_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(md)) !== null) {
      services.push(m[0].toLowerCase());
      if (services.length >= MAX_ENTITIES) break;
    }
  }

  const locations: string[] = [];
  for (const pattern of LOCATION_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(md)) !== null) {
      // Prefer the captured location group when present; otherwise
      // the full match.
      locations.push((m[1] ?? m[0]).trim());
      if (locations.length >= MAX_ENTITIES) break;
    }
  }

  const businessName = args.businessName?.trim();
  const other: string[] = businessName ? [businessName] : [];

  const dedupedServices = uniqueCapped(services, 4);
  const dedupedLocations = uniqueCapped(locations, 3);
  const dedupedOther = uniqueCapped(other, 3);

  const merged = uniqueCapped(
    [...dedupedOther, ...dedupedServices, ...dedupedLocations],
    MAX_ENTITIES,
  );

  return {
    entities: merged,
    counts: {
      services: dedupedServices.length,
      locations: dedupedLocations.length,
      other: dedupedOther.length,
    },
  };
}
