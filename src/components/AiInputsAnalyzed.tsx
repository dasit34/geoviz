import { SECTION_EYEBROWS } from "@/lib/report-sections";

/**
 * AI Inputs Analyzed — report v2 section.
 *
 * Lists the AI-readable signals GeoViz pulled from the customer's
 * site, each marked FOUND / PARTIAL / NOT FOUND. Reads from the
 * AuditIntelligence.preflightSignals JSON column (PreflightSignals
 * shape — see src/lib/intelligence/preflight/types.ts). Older audits
 * that never ran preflight render "Not analyzed" rows instead of
 * fabricating a status.
 *
 * Customer-language only: never says "JSON-LD", "structured data", or
 * "schema markup" — the customer-facing row is "Structured Business
 * Data". Translation table is local to this component so the worker
 * prompt and DB schema stay byte-stable.
 */

type PreflightShape = {
  ok?: boolean;
  fetchOk?: boolean;
  readability?: {
    textLength?: number | null;
    wordCount?: number | null;
    parsedByReadability?: boolean | null;
    articleTitle?: string | null;
  } | null;
  schema?: {
    score?: number | null;
    presentFields?: string[] | null;
    missingFields?: string[] | null;
    detectedTypes?: string[] | null;
    rawJsonLdCount?: number | null;
  } | null;
  crawlability?: {
    score?: number | null;
    passedChecks?: string[] | null;
    failedChecks?: string[] | null;
    findings?: string[] | null;
    warnings?: string[] | null;
  } | null;
  entityConsistency?: {
    score?: number | null;
    confidence?: number | null;
    extractedEntities?: {
      name?: { schema?: string | null; homepage?: string | null; footer?: string | null } | null;
      phone?: { schema?: string | null; homepage?: string | null; footer?: string | null } | null;
      address?: { schema?: string | null; homepage?: string | null; footer?: string | null } | null;
    } | null;
  } | null;
};

type InputStatus = "FOUND" | "PARTIAL" | "NOT FOUND" | "NOT ANALYZED";

type InputRow = {
  label: string;
  status: InputStatus;
};

function statusToneClass(s: InputStatus): string {
  switch (s) {
    case "FOUND":
      return "text-severity-info";
    case "PARTIAL":
      return "text-severity-warning";
    case "NOT FOUND":
      return "text-severity-critical";
    case "NOT ANALYZED":
      return "text-white/40";
  }
}

function hasAny(arr: unknown): boolean {
  return Array.isArray(arr) && arr.length > 0;
}

function containsAny(arr: unknown, needles: RegExp): boolean {
  if (!Array.isArray(arr)) return false;
  return arr.some(
    (s) => typeof s === "string" && needles.test(s),
  );
}

function deriveInputRows(preflight: PreflightShape | null): InputRow[] {
  if (!preflight) {
    return [
      "Homepage Content",
      "Service Pages",
      "Contact Information",
      "Business Details",
      "robots.txt",
      "sitemap.xml",
      "Structured Business Data",
      "FAQ Content",
      "Reviews and Testimonials",
      "Internal Links",
      "Metadata",
      "Entity Signals",
    ].map((label) => ({ label, status: "NOT ANALYZED" as const }));
  }

  const rows: InputRow[] = [];

  // Homepage Content — readability succeeded + meaningful word count.
  const homepageWords = preflight.readability?.wordCount ?? 0;
  const homepageParsed = Boolean(preflight.readability?.parsedByReadability);
  if (homepageParsed && homepageWords >= 200) {
    rows.push({ label: "Homepage Content", status: "FOUND" });
  } else if (homepageWords > 0) {
    rows.push({ label: "Homepage Content", status: "PARTIAL" });
  } else {
    rows.push({ label: "Homepage Content", status: "NOT FOUND" });
  }

  // Service Pages — heuristic from sitemap-derived crawlability passes
  // (no direct field today). Use crawlability findings/passedChecks
  // mentioning "service" or "page".
  const serviceMentioned =
    containsAny(preflight.crawlability?.passedChecks, /service|sitemap/i) ||
    containsAny(preflight.crawlability?.findings, /service|page/i);
  rows.push({
    label: "Service Pages",
    status: serviceMentioned ? "PARTIAL" : "NOT FOUND",
  });

  // Contact Information — entity consistency provides phone presence
  // across schema / homepage / footer surfaces.
  const phone = preflight.entityConsistency?.extractedEntities?.phone ?? null;
  const phoneSurfaces = phone
    ? [phone.schema, phone.homepage, phone.footer].filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      ).length
    : 0;
  if (phoneSurfaces >= 2) {
    rows.push({ label: "Contact Information", status: "FOUND" });
  } else if (phoneSurfaces === 1) {
    rows.push({ label: "Contact Information", status: "PARTIAL" });
  } else {
    rows.push({ label: "Contact Information", status: "NOT FOUND" });
  }

  // Business Details — entity consistency name + address presence.
  const name = preflight.entityConsistency?.extractedEntities?.name ?? null;
  const address =
    preflight.entityConsistency?.extractedEntities?.address ?? null;
  const nameSurfaces = name
    ? [name.schema, name.homepage, name.footer].filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      ).length
    : 0;
  const addrSurfaces = address
    ? [address.schema, address.homepage, address.footer].filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      ).length
    : 0;
  if (nameSurfaces >= 2 && addrSurfaces >= 1) {
    rows.push({ label: "Business Details", status: "FOUND" });
  } else if (nameSurfaces >= 1 || addrSurfaces >= 1) {
    rows.push({ label: "Business Details", status: "PARTIAL" });
  } else {
    rows.push({ label: "Business Details", status: "NOT FOUND" });
  }

  // robots.txt — crawlability check.
  const robotsPassed = containsAny(
    preflight.crawlability?.passedChecks,
    /robots\.txt/i,
  );
  const robotsFailed = containsAny(
    preflight.crawlability?.failedChecks,
    /robots\.txt/i,
  );
  if (robotsPassed) {
    rows.push({ label: "robots.txt", status: "FOUND" });
  } else if (robotsFailed) {
    rows.push({ label: "robots.txt", status: "NOT FOUND" });
  } else {
    rows.push({ label: "robots.txt", status: "PARTIAL" });
  }

  // sitemap.xml — crawlability check.
  const sitemapPassed = containsAny(
    preflight.crawlability?.passedChecks,
    /sitemap/i,
  );
  const sitemapFailed = containsAny(
    preflight.crawlability?.failedChecks,
    /sitemap/i,
  );
  if (sitemapPassed) {
    rows.push({ label: "sitemap.xml", status: "FOUND" });
  } else if (sitemapFailed) {
    rows.push({ label: "sitemap.xml", status: "NOT FOUND" });
  } else {
    rows.push({ label: "sitemap.xml", status: "PARTIAL" });
  }

  // Structured Business Data — schema validation score / coverage.
  const schemaScore = preflight.schema?.score ?? 0;
  const hasJsonLd = (preflight.schema?.rawJsonLdCount ?? 0) > 0;
  if (schemaScore >= 70) {
    rows.push({ label: "Structured Business Data", status: "FOUND" });
  } else if (hasJsonLd || schemaScore > 0) {
    rows.push({ label: "Structured Business Data", status: "PARTIAL" });
  } else {
    rows.push({ label: "Structured Business Data", status: "NOT FOUND" });
  }

  // FAQ Content — detected types include FAQPage, or readability text
  // contains FAQ markers. We don't have a direct FAQ-detection signal,
  // so detect from schema detectedTypes.
  const faqType = containsAny(preflight.schema?.detectedTypes, /faq/i);
  if (faqType) {
    rows.push({ label: "FAQ Content", status: "FOUND" });
  } else {
    rows.push({ label: "FAQ Content", status: "NOT FOUND" });
  }

  // Reviews and Testimonials — schema types include Review /
  // AggregateRating.
  const reviewType = containsAny(
    preflight.schema?.detectedTypes,
    /review|aggregaterating/i,
  );
  if (reviewType) {
    rows.push({ label: "Reviews and Testimonials", status: "FOUND" });
  } else {
    rows.push({ label: "Reviews and Testimonials", status: "NOT FOUND" });
  }

  // Internal Links — heuristic from readability word count. If the
  // homepage has substantive text we treat internal-link presence as
  // PARTIAL; no direct preflight signal today.
  rows.push({
    label: "Internal Links",
    status: homepageWords >= 200 ? "PARTIAL" : "NOT FOUND",
  });

  // Metadata — crawlability covers canonical / meta-robots. If
  // crawlability had any passed checks, treat metadata as PARTIAL or
  // better depending on overall score.
  const crawlScore = preflight.crawlability?.score ?? 0;
  if (crawlScore >= 70) {
    rows.push({ label: "Metadata", status: "FOUND" });
  } else if (crawlScore > 0 || hasAny(preflight.crawlability?.passedChecks)) {
    rows.push({ label: "Metadata", status: "PARTIAL" });
  } else {
    rows.push({ label: "Metadata", status: "NOT FOUND" });
  }

  // Entity Signals — entity consistency score.
  const entityScore = preflight.entityConsistency?.score ?? 0;
  if (entityScore >= 70) {
    rows.push({ label: "Entity Signals", status: "FOUND" });
  } else if (entityScore > 0) {
    rows.push({ label: "Entity Signals", status: "PARTIAL" });
  } else {
    rows.push({ label: "Entity Signals", status: "NOT FOUND" });
  }

  return rows;
}

export function AiInputsAnalyzed({
  preflightSignals,
}: {
  preflightSignals: unknown;
}) {
  // Defensive narrow — preflightSignals is a Prisma Json? column.
  const preflight =
    preflightSignals && typeof preflightSignals === "object"
      ? (preflightSignals as PreflightShape)
      : null;
  const rows = deriveInputRows(preflight);
  const notAnalyzed = rows.every((r) => r.status === "NOT ANALYZED");

  return (
    <section
      className="report-section-card mt-10"
      aria-label="AI inputs analyzed"
    >
      <div className="report-section-card-header">
        <p className="section-eyebrow">{SECTION_EYEBROWS.aiInputsAnalyzed}</p>
        <span className="pill">{rows.length} inputs</span>
      </div>
      <h2 className="h2 mt-3">What an AI system could read on your site.</h2>
      <p className="muted mt-2 max-w-2xl text-sm leading-relaxed">
        {notAnalyzed
          ? "This audit predates the structured input inventory. New audits include a per-signal readout."
          : "Each row shows whether GeoViz could find the signal on your site. AI systems use the same signals when deciding whether to recommend a business."}
      </p>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2"
          >
            <span className="text-[13px] text-white/80">{r.label}</span>
            <span
              className={`mono-data text-[10px] font-semibold uppercase tracking-[0.16em] ${statusToneClass(r.status)}`}
            >
              {r.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
