import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuditReportContent } from "@/components/AuditReportContent";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import "@/app/report/[id]/print/print.css";

/**
 * Public sample report — renders a real GeoViz self-audit when one
 * exists in the database, otherwise a styled "coming soon" fallback.
 *
 * Detection: the most recent `AuditOrder` whose `websiteUrl` contains
 * `geoviz.ai` and whose `reportStatus` is `"generated"` (excluding
 * the `[CAL]`-prefixed calibration entries the admin uses internally).
 * `dynamic = "force-dynamic"` so the lookup runs on every request —
 * the moment a fresh self-audit lands, this page picks it up without
 * a redeploy.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Sample AI Visibility Report · GeoViz",
  description:
    "A real GeoViz AI Visibility Report — generated from GeoViz's own public website. Same dashboard your audit will use, with our scores, findings, and fixes.",
};

const GEOVIZ_PUBLIC_URL = "https://www.geoviz.ai";
const GEOVIZ_BUSINESS_LABEL = "GeoViz";

async function findGeoVizSampleAudit() {
  if (!isDatabaseConfigured()) return null;
  return prisma.auditOrder.findFirst({
    where: {
      websiteUrl: { contains: "geoviz.ai", mode: "insensitive" },
      reportStatus: "generated",
      reportMarkdown: { not: null },
      OR: [
        { businessName: null },
        { businessName: { not: { startsWith: "[CAL]" } } },
      ],
    },
    orderBy: { reportGeneratedAt: "desc" },
  });
}

export default async function SampleReportPage() {
  const audit = await findGeoVizSampleAudit().catch(() => null);

  return (
    <main>
      <Header />

      {audit && audit.reportMarkdown ? (
        <RealSampleReport
          orderId={audit.id}
          reportMarkdown={audit.reportMarkdown}
          reportGeneratedAt={audit.reportGeneratedAt}
        />
      ) : (
        <FallbackSampleReport />
      )}

      <Footer />
    </main>
  );
}

function RealSampleReport({
  orderId,
  reportMarkdown,
  reportGeneratedAt,
}: {
  orderId: string;
  reportMarkdown: string;
  reportGeneratedAt: Date | null;
}) {
  return (
    <>
      {/* Framing band — sits above the report body and tells the visitor
          what they're looking at. The report body itself uses the exact
          same template real customers receive. */}
      <section className="border-b border-white/5 bg-ink-950">
        <div className="container-page py-10 text-center md:text-left">
          <p className="pill">Sample · live self-audit</p>
          <h1 className="h2 mt-3 max-w-3xl mx-auto md:mx-0">
            What a GeoViz audit actually looks like.
          </h1>
          <p className="muted mt-3 max-w-2xl mx-auto md:mx-0">
            Sample report generated from GeoViz&rsquo;s own public website.
            Identical layout, scoring rubric, and rendering to the report
            paying customers receive — only the audited site is different.
          </p>
        </div>
      </section>

      <AuditReportContent
        orderId={orderId}
        businessLabel={GEOVIZ_BUSINESS_LABEL}
        websiteUrl={GEOVIZ_PUBLIC_URL}
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
            <Link href="/" className="btn-ghost">
              Back to homepage
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function FallbackSampleReport() {
  return (
    <>
      <section className="relative border-b border-white/5">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="container-page py-20">
          <p className="pill">Sample · coming soon</p>
          <h1 className="h1 mt-4 max-w-3xl">
            GeoViz sample audit coming soon
          </h1>
          <p className="muted mt-5 max-w-2xl text-base leading-relaxed">
            This page will display a live self-audit of geoviz.ai —
            the same dashboard your audit will use, with our own scores,
            findings, and fixes. Until that ships, here&rsquo;s exactly
            what the report includes.
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

      <section className="bg-ink-950">
        <div className="container-page py-16">
          <p className="section-eyebrow">What the sample will show</p>
          <h2 className="h2 mt-3 max-w-2xl">
            Five visual blocks the report renders on every audit.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <PreviewCard
              title="Overall AI Visibility Score"
              body="A 0–100 score with plain-English band — Strong, Good, Needs Work, or Limited Visibility."
            />
            <PreviewCard
              title="Six-dimension breakdown"
              body="Schema, AI crawler readiness, trust signals, content depth, brand clarity, AI readability — all scored individually."
            />
            <PreviewCard
              title="Score-distribution radar"
              body="A six-axis chart so you see the shape of your visibility before reading the cards."
            />
            <PreviewCard
              title="Top strengths"
              body="Categories scoring at least 70% of max — surfaced as positive signals you already have working."
            />
            <PreviewCard
              title="Platform visibility"
              body="ChatGPT · Claude · Gemini · Perplexity — derived from the audit's findings, not invented."
            />
            <PreviewCard
              title="Top issues + ranked fixes"
              body="Three issues with severity, three fixes with priority + difficulty — the ones to do first."
            />
          </div>
        </div>
      </section>

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

function PreviewCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card card-hover">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="muted mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
