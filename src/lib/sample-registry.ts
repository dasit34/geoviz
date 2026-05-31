import { prisma, isDatabaseConfigured } from "@/lib/db";

/**
 * Public sample-audit registry.
 *
 * Each entry is a curated AuditOrder we want to expose at
 * `/sample-report/<slug>` — and one of them (the `featured` slug)
 * is also surfaced at the bare `/sample-report` URL.
 *
 * Adding a new sample is one entry here + one row in the DB (run
 * `scripts/seed-public-samples.ts` then let the worker generate the
 * audit). No other code changes needed.
 *
 * The audit row is identified in the DB by *both* `websiteUrl` (must
 * `contain` the configured fragment) AND `businessName` (must `contain`
 * the configured business label) — both case-insensitive — so that a
 * customer who happened to order an audit of one of these same sites
 * doesn't accidentally surface as a public sample.
 */
export type SampleSlug =
  | "geoviz"
  | "charles-boyk-law"
  | "ohio-roofing-siding";

export type SampleEntry = {
  slug: SampleSlug;
  /** Customer-facing display URL on the sample page hero. */
  publicUrl: string;
  /** Substring used to match the AuditOrder.websiteUrl column. */
  urlMatch: string;
  /** Customer-facing business label (rendered in the report hero). */
  businessName: string;
  /**
   * Substring used in the DB lookup `businessName contains` check.
   * Optional — defaults to `businessName` when absent. Set this when
   * the display name has trailing variation that the DB row may not
   * match exactly (ampersands, suffixes like "Law" / "Inc"). The
   * substring should be the most distinctive prefix of the display
   * name so the match remains protective against unrelated customer
   * orders for the same domain.
   */
  businessNameMatch?: string;
  /** One-line summary used in card-style listings. */
  archetypeBlurb: string;
};

export const SAMPLE_REGISTRY: SampleEntry[] = [
  {
    slug: "geoviz",
    publicUrl: "https://www.geoviz.ai",
    urlMatch: "geoviz.ai",
    businessName: "GeoViz",
    archetypeBlurb:
      "Self-audit of GeoViz's own public website — the SaaS product behind these reports.",
  },
  {
    slug: "charles-boyk-law",
    publicUrl: "https://www.charlesboyk-law.com",
    urlMatch: "charlesboyk-law.com",
    businessName: "Charles Boyk Law",
    // Looser match — accommodates rows stored as "Charles Boyk", "Charles Boyk
    // Law Office", "Charles Boyk, Esq.", etc.
    businessNameMatch: "Charles Boyk",
    archetypeBlurb:
      "Regional personal-injury law firm — multi-location professional services.",
  },
  {
    slug: "ohio-roofing-siding",
    publicUrl: "https://www.ohioroofingandsiding.com",
    urlMatch: "ohioroofingandsiding.com",
    businessName: "Ohio Roofing & Siding",
    // Looser match — the display name uses "&" but rows could be stored
    // as "Ohio Roofing and Siding", "Ohio Roofing", or any spelling
    // variation of the trailing fragment. The leading "Ohio Roofing"
    // is the unambiguous part.
    businessNameMatch: "Ohio Roofing",
    archetypeBlurb:
      "Local home-services contractor — classic GeoViz wedge customer.",
  },
];

/**
 * Slug shown at the bare `/sample-report` URL. Override at runtime via
 * `GEO_VIZ_FEATURED_SAMPLE` (e.g. set on Vercel) without changing the
 * registry. Default: `ohio-roofing-siding` — the closest archetype to
 * the actual GeoViz buyer (local home services), so the marketing
 * page leads with the most-representative real audit.
 */
export function getFeaturedSlug(): SampleSlug {
  const raw = (process.env.GEO_VIZ_FEATURED_SAMPLE ?? "")
    .trim()
    .toLowerCase();
  const valid = SAMPLE_REGISTRY.find((e) => e.slug === raw);
  return (valid?.slug ?? "ohio-roofing-siding") as SampleSlug;
}

export function findSampleEntryBySlug(slug: string): SampleEntry | null {
  return SAMPLE_REGISTRY.find((e) => e.slug === slug) ?? null;
}

/**
 * DB lookup: find the most recently generated audit row that matches a
 * registry entry. Returns null when no match (sample not yet generated).
 *
 * Logs a one-line diagnostic when the lookup returns null OR throws,
 * including a count of rows that match the URL substring alone — so
 * an operator can read Vercel function logs and immediately tell
 * which constraint filtered the row out (URL, businessName, status,
 * or markdown). Diagnostic only; no PII is logged beyond the slug
 * and registry-configured search strings.
 */
export async function findSampleAudit(entry: SampleEntry) {
  if (!isDatabaseConfigured()) {
    console.warn(
      `[sample-registry] findSampleAudit(${entry.slug}) — database not configured`,
    );
    return null;
  }
  const businessNameMatch = entry.businessNameMatch ?? entry.businessName;
  try {
    const row = await prisma.auditOrder.findFirst({
      where: {
        websiteUrl: { contains: entry.urlMatch, mode: "insensitive" },
        businessName: { contains: businessNameMatch, mode: "insensitive" },
        reportStatus: "generated",
        reportMarkdown: { not: null },
      },
      orderBy: { reportGeneratedAt: "desc" },
      include: {
        intelligence: {
          select: {
            deterministicScore: true,
            industryCategoryNormalized: true,
            overallScore: true,
            semanticClarityScore: true,
            crawlerAccessibilityScore: true,
            trustSignalScore: true,
            structuredIdentityScore: true,
            recommendationReadinessScore: true,
            // Cross-Model Intelligence (Phase: 4-provider validator
            // stack). Null when gate off; renderer hides the section
            // when both are null.
            aiValidations: true,
            consensusIndex: true,
            // V2 preflight signals — consumed by the report v2
            // "AI Inputs Analyzed" section. Null on older audits.
            preflightSignals: true,
          },
        },
      },
    });
    if (row) return row;

    // Null result — log enough context that an operator can debug
    // without touching the DB. We separately count rows that match
    // *just* the URL substring, with no other filter, so we can tell
    // the operator how many candidate rows exist for this domain
    // and which constraint excluded them.
    const urlMatchCount = await prisma.auditOrder.count({
      where: {
        websiteUrl: { contains: entry.urlMatch, mode: "insensitive" },
      },
    });
    console.warn(
      `[sample-registry] findSampleAudit(${entry.slug}) returned null · urlMatch="${entry.urlMatch}" businessNameMatch="${businessNameMatch}" rowsMatchingUrlOnly=${urlMatchCount}`,
    );
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[sample-registry] findSampleAudit(${entry.slug}) threw — ${message}`,
    );
    return null;
  }
}

/**
 * Returns just the registry entries that currently have a generated
 * audit row. Used by the "Additional sample audits" listing so we
 * never surface a slug whose audit isn't ready.
 */
export async function findAvailableSamples(): Promise<SampleEntry[]> {
  if (!isDatabaseConfigured()) return [];
  const results = await Promise.all(
    SAMPLE_REGISTRY.map(async (entry) => {
      const row = await findSampleAudit(entry);
      return row ? entry : null;
    }),
  );
  return results.filter((e): e is SampleEntry => e !== null);
}
