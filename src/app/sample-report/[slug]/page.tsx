import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuditReportContent } from "@/components/AuditReportContent";
import {
  SAMPLE_REGISTRY,
  findAvailableSamples,
  findSampleAudit,
  findSampleEntryBySlug,
  type SampleEntry,
} from "@/lib/sample-registry";
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
  otherAvailable,
}: {
  entry: SampleEntry;
  orderId: string;
  reportMarkdown: string;
  reportGeneratedAt: Date | null;
  otherAvailable: SampleEntry[];
}) {
  return (
    <>
      <section className="border-b border-white/5 bg-ink-950">
        <div className="container-page py-10 text-center md:text-left">
          <p className="pill">Sample · {entry.businessName}</p>
          <h1 className="h2 mt-3 max-w-3xl mx-auto md:mx-0">
            What a GeoViz audit looks like for {entry.businessName}.
          </h1>
          <p className="muted mt-3 max-w-2xl mx-auto md:mx-0">
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
      />

      {/* Additional sample audits — moved here from the old
          `/sample-report` index page (which is now a redirect).
          Lets a visitor see other archetypes without leaving the
          full-report context. */}
      {otherAvailable.length > 0 ? (
        <AdditionalSamples entries={otherAvailable} />
      ) : null}

      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-16 text-center">
          <h2 className="h2 mx-auto max-w-2xl">
            Get your real AI Visibility Report.
          </h2>
          <p className="muted mx-auto mt-4 max-w-xl">
            Same dashboard. Your domain. Your data. Ranked fixes you can
            hand straight to your developer — or have us implement.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
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
    <section className="border-t border-white/5 bg-ink-950">
      <div className="container-page py-14">
        <p className="section-eyebrow">Additional sample audits</p>
        <h2 className="h2 mt-3 max-w-3xl">
          See the same dashboard across different business archetypes.
        </h2>
        <p className="muted mt-3 max-w-2xl text-sm">
          Real audits — real scores, real findings — produced by the
          same engine and template you&rsquo;d receive.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <Link
              key={entry.slug}
              href={`/sample-report/${entry.slug}`}
              className="card card-hover block"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                {entry.businessName}
              </p>
              <p className="muted mt-2 text-[11px] break-all">
                {entry.publicUrl}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/85">
                {entry.archetypeBlurb}
              </p>
              <p className="mt-4 text-xs text-accent">View report →</p>
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
      <section className="relative border-b border-white/5">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="container-page py-20">
          <p className="pill">Sample · {entry.businessName} · pending</p>
          <h1 className="h1 mt-4 max-w-3xl">
            {entry.businessName} sample audit coming soon.
          </h1>
          <p className="muted mt-5 max-w-2xl text-base leading-relaxed">
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
