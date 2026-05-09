import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuditReportContent } from "@/components/AuditReportContent";
import {
  SAMPLE_REGISTRY,
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

  return (
    <main>
      <Header />

      {audit && audit.reportMarkdown ? (
        <RealSample
          entry={entry}
          orderId={audit.id}
          reportMarkdown={audit.reportMarkdown}
          reportGeneratedAt={audit.reportGeneratedAt}
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
            <Link href="/sample-report" className="btn-ghost">
              View other samples
            </Link>
          </div>
        </div>
      </section>
    </>
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
