import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuditReportContent } from "@/components/AuditReportContent";
import {
  SAMPLE_REGISTRY,
  findAvailableSamples,
  findSampleAudit,
  findSampleEntryBySlug,
  getFeaturedSlug,
  type SampleEntry,
} from "@/lib/sample-registry";
import "@/app/report/[id]/print/print.css";

/**
 * Public featured sample report. Renders whichever slug
 * `getFeaturedSlug()` returns (default: `ohio-roofing-siding` — the
 * closest archetype to the actual GeoViz buyer; override per
 * environment via `GEO_VIZ_FEATURED_SAMPLE`). When that audit doesn't
 * yet exist in the database, falls back to a styled "coming soon"
 * page that still surfaces the registry's other available samples
 * below.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Sample AI Visibility Report · GeoViz",
  description:
    "A real GeoViz AI Visibility Report — same dashboard your audit will use.",
};

export default async function SampleReportPage() {
  const featuredSlug = getFeaturedSlug();
  const featuredEntry =
    findSampleEntryBySlug(featuredSlug) ??
    findSampleEntryBySlug("geoviz") ??
    SAMPLE_REGISTRY[0];

  const featuredAudit = await findSampleAudit(featuredEntry).catch(() => null);
  const allAvailable = await findAvailableSamples().catch(
    () => [] as SampleEntry[],
  );
  const otherAvailable = allAvailable.filter(
    (e) => e.slug !== featuredEntry.slug,
  );

  return (
    <main>
      <Header />

      {featuredAudit && featuredAudit.reportMarkdown ? (
        <FeaturedSample
          entry={featuredEntry}
          orderId={featuredAudit.id}
          reportMarkdown={featuredAudit.reportMarkdown}
          reportGeneratedAt={featuredAudit.reportGeneratedAt}
        />
      ) : (
        <FallbackHero entry={featuredEntry} />
      )}

      {otherAvailable.length > 0 ? (
        <AdditionalSamples entries={otherAvailable} />
      ) : null}

      <FinalCta />

      <Footer />
    </main>
  );
}

function FeaturedSample({
  entry,
  orderId,
  reportMarkdown,
  reportGeneratedAt,
}: {
  entry: SampleEntry;
  orderId: string;
  reportMarkdown: string;
  reportGeneratedAt: Date | null;
}) {
  return (
    <>
      <section className="border-b border-white/5 bg-ink-950">
        <div className="container-page py-10 text-center md:text-left">
          <p className="pill">Sample · {entry.businessName}</p>
          <h1 className="h2 mt-3 max-w-3xl mx-auto md:mx-0">
            What a GeoViz audit actually looks like.
          </h1>
          <p className="muted mt-3 max-w-2xl mx-auto md:mx-0">
            {entry.archetypeBlurb} Identical scoring rubric, layout, and
            rendering to the report paying customers receive — only the
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
    </>
  );
}

function FallbackHero({ entry }: { entry: SampleEntry }) {
  return (
    <section className="relative border-b border-white/5">
      <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
      <div className="container-page py-20">
        <p className="pill">Sample · coming soon</p>
        <h1 className="h1 mt-4 max-w-3xl">
          {entry.businessName} sample audit coming soon
        </h1>
        <p className="muted mt-5 max-w-2xl text-base leading-relaxed">
          This page will display a live audit of {entry.publicUrl} —
          the same dashboard your audit will use, with our scoring
          rubric, findings, and ranked fixes. Until that ships, see
          what each report block contains.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/order" className="btn-primary">
            Request My AI Visibility Audit
          </Link>
          <Link href="/" className="btn-ghost">
            Back to homepage
          </Link>
        </div>
      </div>
    </section>
  );
}

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

function FinalCta() {
  return (
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
  );
}
