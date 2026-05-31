import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  AuditReportContent,
  type AuditReportContext,
} from "@/components/AuditReportContent";
import {
  SAMPLE_REGISTRY,
  findAvailableSamples,
  findSampleAudit,
  findSampleEntryBySlug,
  type SampleEntry,
} from "@/lib/sample-registry";
import {
  getAuditPercentileBundle,
  type AuditScoreSnapshot,
} from "@/lib/intelligence/audit-percentile";
import { formatCustomerConfidence } from "@/lib/intelligence/confidence-display";
import type { DeterministicScore } from "@/lib/scoring/types";
import "@/app/report/[id]/print/print.css";

/**
 * `/sample-report/[slug]` — public per-archetype sample audits.
 * Same render template as `/sample-report` (the featured page) and
 * `/report/[id]/print` (the customer view). The slug whitelist is
 * `SAMPLE_REGISTRY`; anything not in the registry 404s so we never
 * leak arbitrary AuditOrder rows through this surface.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function generateStaticParams() {
  // Hint to Next.js — these are the only valid slugs. Doesn't make
  // the page static (we still hit the DB at request time), but keeps
  // the build-time route table tight.
  return SAMPLE_REGISTRY.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  const entry = findSampleEntryBySlug(params.slug);
  if (!entry) {
    return {
      title: "Sample report · GeoViz",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `Sample · ${entry.businessName} · GeoViz`,
    description: `A real GeoViz AI Visibility Report for ${entry.businessName} — same dashboard your audit will use.`,
  };
}

export default async function SampleReportSlugPage({
  params,
}: {
  params: { slug: string };
}) {
  const entry = findSampleEntryBySlug(params.slug);
  if (!entry) notFound();

  const audit = await findSampleAudit(entry).catch(() => null);

  // Pull every other archetype that has a generated audit so we can
  // render the "Additional sample audits" grid below the report.
  // This grid used to live on `/sample-report` (the index page);
  // moved here when /sample-report became a redirect so the cross-
  // archetype affordance isn't lost.
  const allAvailable = await findAvailableSamples().catch(
    () => [] as SampleEntry[],
  );
  const otherAvailable = allAvailable.filter((e) => e.slug !== entry.slug);

  return (
    <main>
      <Header />

      {audit && audit.reportMarkdown ? (
        <RealSample
          entry={entry}
          orderId={audit.id}
          reportMarkdown={audit.reportMarkdown}
          reportGeneratedAt={audit.reportGeneratedAt}
          deterministicScore={audit.intelligence?.deterministicScore ?? null}
          context={await buildSampleContext(audit.intelligence ?? null)}
          otherAvailable={otherAvailable}
        />
      ) : (
        <PendingSample entry={entry} />
      )}

      <Footer />
    </main>
  );
}

function RealSample({
  entry,
  orderId,
  reportMarkdown,
  reportGeneratedAt,
  deterministicScore,
  context,
  otherAvailable,
}: {
  entry: SampleEntry;
  orderId: string;
  reportMarkdown: string;
  reportGeneratedAt: Date | null;
  deterministicScore: unknown;
  context?: AuditReportContext;
  otherAvailable: SampleEntry[];
}) {
  return (
    <>
      <section className="border-b border-white/[0.06] bg-ink-950">
        <div className="container-page py-12 text-center md:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            Sample · {entry.businessName}
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl md:mx-0">
            What a GeoViz audit looks like for {entry.businessName}.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-white/60 md:mx-0">
            {entry.archetypeBlurb} Identical scoring rubric, layout, and
            rendering to the reports paying customers receive — only the
            audited site is different.
          </p>
        </div>
      </section>

      <AuditReportContent
        orderId={orderId}
        businessLabel={entry.businessName}
        websiteUrl={entry.publicUrl}
        reportMarkdown={reportMarkdown}
        reportGeneratedAt={reportGeneratedAt}
        deterministicScore={deterministicScore}
        context={context}
      />

      {/* Additional sample audits — moved here from the old
          `/sample-report` index page (which is now a redirect).
          Lets a visitor see other archetypes without leaving the
          full-report context. */}
      {otherAvailable.length > 0 ? (
        <AdditionalSamples entries={otherAvailable} />
      ) : null}

      <section className="border-t border-white/[0.06] bg-ink-950">
        <div className="container-page py-20 text-center">
          <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Get your real AI Visibility Report.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/60">
            Same dashboard. Your domain. Your data. Ranked fixes you can
            hand straight to your developer — or have us implement.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/order" className="btn-primary">
              Request My AI Visibility Audit
            </Link>
            <Link href="/" className="btn-ghost">
              Back to homepage
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * "Additional sample audits" grid. Renders every archetype other
 * than the current one so a visitor can jump straight to a peer
 * sample (e.g. plumbing → roofing). Previously lived on the
 * `/sample-report` index page; moved here when that became a
 * redirect. Same markup, same hover styles — only relocated.
 */
function AdditionalSamples({ entries }: { entries: SampleEntry[] }) {
  return (
    <section className="border-t border-white/[0.06] bg-ink-950">
      <div className="container-page py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          Additional sample audits
        </p>
        <h2 className="mt-5 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
          See the same dashboard across different business archetypes.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/55">
          Real audits — real scores, real findings — produced by the
          same engine and template you&rsquo;d receive.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <Link
              key={entry.slug}
              href={`/sample-report/${entry.slug}`}
              className="card card-hover block"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                {entry.businessName}
              </p>
              <p className="mt-2 break-all text-[11px] text-white/40">
                {entry.publicUrl}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/80">
                {entry.archetypeBlurb}
              </p>
              <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                View report <span aria-hidden>→</span>
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function PendingSample({ entry }: { entry: SampleEntry }) {
  return (
    <>
      <section className="relative border-b border-white/[0.06]">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="absolute inset-0 -z-10 grid-bg opacity-50" />
        <div className="container-page py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            Sample · {entry.businessName} · pending
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl">
            {entry.businessName} sample audit coming soon.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/60">
            {entry.archetypeBlurb} The audit is queued; this page will
            display the live report once the GeoViz worker generates it.
            No redeploy required.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/order" className="btn-primary">
              Request My AI Visibility Audit
            </Link>
            <Link href="/sample-report" className="btn-ghost">
              See the featured sample
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * Phase L: compute benchmark + confidence context for the sample
 * report. Mirrors the helper in `/report/[id]/print/page.tsx`.
 * Fail-soft — returns undefined on any failure so the sample
 * renders unchanged when intelligence data is missing.
 */
async function buildSampleContext(
  intelligence: {
    deterministicScore: unknown;
    industryCategoryNormalized: string | null;
    overallScore: number | null;
    semanticClarityScore: number | null;
    crawlerAccessibilityScore: number | null;
    trustSignalScore: number | null;
    structuredIdentityScore: number | null;
    recommendationReadinessScore: number | null;
    aiValidations?: unknown;
    consensusIndex?: unknown;
    preflightSignals?: unknown;
  } | null,
): Promise<AuditReportContext | undefined> {
  if (!intelligence) return undefined;
  if (intelligence.overallScore === null) return undefined;
  try {
    const snapshot: AuditScoreSnapshot = {
      industrySlug: intelligence.industryCategoryNormalized,
      overallScore: intelligence.overallScore,
      semanticClarityScore: intelligence.semanticClarityScore,
      crawlerAccessibilityScore: intelligence.crawlerAccessibilityScore,
      trustSignalScore: intelligence.trustSignalScore,
      structuredIdentityScore: intelligence.structuredIdentityScore,
      recommendationReadinessScore: intelligence.recommendationReadinessScore,
    };
    const bundle = await getAuditPercentileBundle(snapshot);
    const cohortCellValue =
      bundle.overall.bucket === "insufficient"
        ? "Industry benchmark forming"
        : `${bundle.overall.bucket}${
            intelligence.industryCategoryNormalized
              ? ` (${intelligence.industryCategoryNormalized})`
              : ""
          }`;

    let confidenceLabel: string | null = null;
    let confidenceReason: string | null = null;
    const deterministic = intelligence.deterministicScore as
      | DeterministicScore
      | null;
    if (
      deterministic &&
      typeof deterministic === "object" &&
      "confidence_level" in deterministic &&
      "confidence_inputs" in deterministic
    ) {
      const framing = formatCustomerConfidence(deterministic);
      confidenceLabel = framing.label;
      confidenceReason = framing.reason;
    }

    return {
      percentileCopy: bundle.overall.copy,
      cohortCellValue,
      confidenceLabel,
      confidenceReason,
      weakestCategoryCopy: bundle.weakestCategory?.data.copy ?? null,
      aiValidations: intelligence.aiValidations ?? null,
      consensusIndex: intelligence.consensusIndex ?? null,
      preflightSignals: intelligence.preflightSignals ?? null,
    };
  } catch (err) {
    console.error(
      "[sample-report/slug] buildSampleContext failed:",
      (err as Error).message?.slice(0, 200),
    );
    return undefined;
  }
}
