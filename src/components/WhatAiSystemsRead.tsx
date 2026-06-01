import { SECTION_EYEBROWS } from "@/lib/report-sections";

/**
 * What AI Systems Read — report v3 quantitative metrics strip.
 *
 * Single consolidated section answering "what did GeoViz analyze?"
 * (the prior categorical AiInputsAnalyzed checklist was removed in
 * the Report Polish pass). Each row is a labeled metric drawn from
 * preflightSignals; rows render "Not analyzed" when the underlying
 * preflight module didn't run (legacy audits).
 *
 * The goal per the user brief: avoid metrics that make the audit
 * appear smaller than it is. "Homepage analyzed" reads honestly when
 * we only fetched the homepage; "Homepage + N pages discovered"
 * surfaces the broader visibility footprint when a sitemap is
 * present without claiming we crawled each page individually.
 */

type ReadabilityShape = {
  textLength?: number | null;
  wordCount?: number | null;
  parsedByReadability?: boolean | null;
} | null;

type SchemaShape = {
  presentFields?: string[] | null;
  detectedTypes?: string[] | null;
  rawJsonLdCount?: number | null;
} | null;

type CrawlabilityShape = {
  passedChecks?: string[] | null;
  findings?: string[] | null;
  failedChecks?: string[] | null;
} | null;

type EntityConsistencyShape = {
  extractedEntities?: {
    name?: { schema?: string | null; homepage?: string | null; footer?: string | null } | null;
    phone?: { schema?: string | null; homepage?: string | null; footer?: string | null } | null;
    address?: { schema?: string | null; homepage?: string | null; footer?: string | null } | null;
  } | null;
} | null;

type PreflightShape = {
  ok?: boolean;
  fetchOk?: boolean;
  readability?: ReadabilityShape;
  schema?: SchemaShape;
  crawlability?: CrawlabilityShape;
  entityConsistency?: EntityConsistencyShape;
};

type MetricRow = {
  label: string;
  value: string;
  notAnalyzed: boolean;
};

const NOT_ANALYZED = {
  value: "Not analyzed",
  notAnalyzed: true as const,
};

function sitemapPageCount(crawl: CrawlabilityShape): number | null {
  // Probe positive findings + passedChecks for sitemap-related
  // strings carrying a numeric depth. Examples we recognize:
  //   "Sitemap has 47 URLs"
  //   "sitemap.xml found · 12 entries"
  //   "Robots.txt references sitemap"
  // Returns the parsed integer when present, null when the sitemap
  // exists but no depth was captured, undefined-as-null when no
  // sitemap signal at all.
  if (!crawl) return null;
  const haystack = [
    ...(crawl.findings ?? []),
    ...(crawl.passedChecks ?? []),
  ].filter((s): s is string => typeof s === "string");
  let sawSitemap = false;
  for (const s of haystack) {
    if (!/sitemap/i.test(s)) continue;
    sawSitemap = true;
    const match = s.match(/(\d{1,5})\s*(?:url|entr|page|item|link)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return sawSitemap ? 0 : null;
}

function entitySurfacesCount(entity: EntityConsistencyShape): number {
  if (!entity?.extractedEntities) return 0;
  const e = entity.extractedEntities;
  const types = ["name", "phone", "address"] as const;
  let count = 0;
  for (const t of types) {
    const surfaces = e[t];
    if (!surfaces) continue;
    if (
      (surfaces.schema && surfaces.schema.trim().length > 0) ||
      (surfaces.homepage && surfaces.homepage.trim().length > 0) ||
      (surfaces.footer && surfaces.footer.trim().length > 0)
    ) {
      count += 1;
    }
  }
  return count;
}

function hasContactInfo(entity: EntityConsistencyShape): boolean {
  if (!entity?.extractedEntities) return false;
  const e = entity.extractedEntities;
  const checkSurface = (
    s?: { schema?: string | null; homepage?: string | null; footer?: string | null } | null,
  ): boolean => {
    if (!s) return false;
    return Boolean(
      (s.schema && s.schema.trim().length > 0) ||
        (s.homepage && s.homepage.trim().length > 0) ||
        (s.footer && s.footer.trim().length > 0),
    );
  };
  return checkSurface(e.phone) || checkSurface(e.address);
}

function buildRows(preflight: PreflightShape | null): MetricRow[] {
  if (!preflight) {
    return [
      { label: "Pages analyzed", ...NOT_ANALYZED },
      { label: "Sitemap detected", ...NOT_ANALYZED },
      { label: "Content analyzed", ...NOT_ANALYZED },
      { label: "Structured data found", ...NOT_ANALYZED },
      { label: "FAQ content found", ...NOT_ANALYZED },
      { label: "Contact information found", ...NOT_ANALYZED },
      { label: "Business entities detected", ...NOT_ANALYZED },
    ];
  }

  const rows: MetricRow[] = [];

  // 1. Pages analyzed
  const sitemap = sitemapPageCount(preflight.crawlability ?? null);
  if (sitemap !== null && sitemap > 0) {
    rows.push({
      label: "Pages analyzed",
      value: `Homepage + ${sitemap.toLocaleString()} pages discovered`,
      notAnalyzed: false,
    });
  } else {
    rows.push({
      label: "Pages analyzed",
      value: "Homepage analyzed",
      notAnalyzed: false,
    });
  }

  // 2. Sitemap detected
  if (sitemap !== null) {
    rows.push({
      label: "Sitemap detected",
      value: sitemap > 0 ? `${sitemap.toLocaleString()} pages` : "Yes",
      notAnalyzed: false,
    });
  } else {
    rows.push({
      label: "Sitemap detected",
      value: "Not detected",
      notAnalyzed: false,
    });
  }

  // 3. Content analyzed
  const wordCount = preflight.readability?.wordCount;
  if (typeof wordCount === "number" && wordCount > 0) {
    rows.push({
      label: "Content analyzed",
      value: `${wordCount.toLocaleString()} words`,
      notAnalyzed: false,
    });
  } else {
    rows.push({ label: "Content analyzed", ...NOT_ANALYZED });
  }

  // 4. Structured data found
  const schema = preflight.schema;
  const detectedTypes = schema?.detectedTypes ?? [];
  const presentFields = schema?.presentFields ?? [];
  const jsonLdBlocks =
    typeof schema?.rawJsonLdCount === "number" ? schema.rawJsonLdCount : 0;
  const hasStructured =
    detectedTypes.length > 0 ||
    presentFields.length > 0 ||
    jsonLdBlocks > 0;
  if (hasStructured) {
    const parts: string[] = [];
    if (detectedTypes.length > 0) {
      parts.push(
        `${detectedTypes.length} schema type${detectedTypes.length === 1 ? "" : "s"}`,
      );
    }
    if (presentFields.length > 0) {
      parts.push(
        `${presentFields.length} entity field${presentFields.length === 1 ? "" : "s"}`,
      );
    }
    rows.push({
      label: "Structured data found",
      value: parts.length > 0 ? `Yes · ${parts.join(" · ")}` : "Yes",
      notAnalyzed: false,
    });
  } else {
    rows.push({
      label: "Structured data found",
      value: "No",
      notAnalyzed: false,
    });
  }

  // 5. FAQ content found
  const hasFaq = detectedTypes.some((t) =>
    typeof t === "string" && /faq/i.test(t),
  );
  rows.push({
    label: "FAQ content found",
    value: hasFaq ? "Yes" : "No",
    notAnalyzed: false,
  });

  // 6. Contact information found
  const contactFound = hasContactInfo(preflight.entityConsistency ?? null);
  rows.push({
    label: "Contact information found",
    value: contactFound ? "Yes" : "No",
    notAnalyzed: false,
  });

  // 7. Business entities detected
  const entityCount = entitySurfacesCount(preflight.entityConsistency ?? null);
  if (entityCount > 0) {
    rows.push({
      label: "Business entities detected",
      value: `${entityCount} entit${entityCount === 1 ? "y" : "ies"}`,
      notAnalyzed: false,
    });
  } else {
    rows.push({
      label: "Business entities detected",
      value: "None detected",
      notAnalyzed: false,
    });
  }

  return rows;
}

export function WhatAiSystemsRead({
  preflightSignals,
}: {
  preflightSignals: unknown;
}) {
  const preflight =
    preflightSignals && typeof preflightSignals === "object"
      ? (preflightSignals as PreflightShape)
      : null;
  const rows = buildRows(preflight);
  const allNotAnalyzed = rows.every((r) => r.notAnalyzed);

  return (
    <section
      className="report-section-card mt-10"
      aria-label="What AI systems read"
    >
      <div className="report-section-card-header">
        <p className="section-eyebrow">{SECTION_EYEBROWS.whatAiSystemsRead}</p>
        <span className="pill">{rows.length} metrics</span>
      </div>
      <h2 className="h2 mt-3">What AI systems had access to.</h2>
      <p className="muted mt-2 max-w-2xl text-sm leading-relaxed">
        {allNotAnalyzed
          ? "This audit predates the structured input inventory. New audits include a quantitative metrics strip."
          : "Concrete measurements from the homepage fetch and supporting crawl. AI systems use these inputs to interpret the business."}
      </p>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-baseline justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2"
          >
            <span className="text-[13px] text-white/80">{r.label}</span>
            <span
              className={`mono-data text-[11px] font-semibold ${
                r.notAnalyzed ? "text-white/40" : "text-white/85"
              }`}
            >
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
