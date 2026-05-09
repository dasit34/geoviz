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
  /** Customer-facing business label. */
  businessName: string;
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
    archetypeBlurb:
      "Regional personal-injury law firm — multi-location professional services.",
  },
  {
    slug: "ohio-roofing-siding",
    publicUrl: "https://www.ohioroofingandsiding.com",
    urlMatch: "ohioroofingandsiding.com",
    businessName: "Ohio Roofing & Siding",
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
 */
export async function findSampleAudit(entry: SampleEntry) {
  if (!isDatabaseConfigured()) return null;
  return prisma.auditOrder.findFirst({
    where: {
      websiteUrl: { contains: entry.urlMatch, mode: "insensitive" },
      businessName: { contains: entry.businessName, mode: "insensitive" },
      reportStatus: "generated",
      reportMarkdown: { not: null },
    },
    orderBy: { reportGeneratedAt: "desc" },
  });
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
      const row = await findSampleAudit(entry).catch(() => null);
      return row ? entry : null;
    }),
  );
  return results.filter((e): e is SampleEntry => e !== null);
}
