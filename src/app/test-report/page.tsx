import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReportView } from "@/components/ReportView";
import { crawlPage } from "@/lib/reporting/crawl";
import { generateVisibilityReport } from "@/lib/reporting/generateVisibilityReport";
import { generateMarkdownReport } from "@/lib/reporting/generateMarkdownReport";
import { generateFixPack } from "@/lib/reporting/generateFixPack";

const TEST_INPUT = {
  url: "https://get.eriehome.com/",
  businessName: "Erie Home",
  email: "test@example.com",
} as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Test Report · GeoViz",
  description:
    "Temporary test route — runs the live crawler against a hardcoded URL and renders the generated report.",
  robots: { index: false, follow: false },
};

export default async function TestReportPage() {
  const startedAt = Date.now();
  const audit = await crawlPage(TEST_INPUT.url, {
    businessName: TEST_INPUT.businessName,
  });
  const elapsedMs = Date.now() - startedAt;

  const report = generateVisibilityReport(audit);
  const markdown = generateMarkdownReport(report, { includeDebug: true });
  const fixPack = generateFixPack(report);

  return (
    <main>
      <Header />

      <section className="border-b border-white/5">
        <div className="container-page py-12">
          <div className="mb-5 rounded-md border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            <strong className="font-semibold">Temporary test route.</strong>{" "}
            Crawls a hardcoded URL with the live crawler, runs the report
            generator, and renders the result — no Stripe, no form, no
            checkout.
          </div>

          <p className="pill">Internal · Test report</p>
          <h1 className="h2 mt-3">Test Report — {report.businessName}</h1>
          <p className="muted mt-2 text-sm break-all">{report.websiteUrl}</p>

          <dl className="mt-6 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
            <Fact label="Email (test)" value={TEST_INPUT.email} />
            <Fact label="Crawl time" value={`${elapsedMs} ms`} />
            <Fact
              label="Word count"
              value={String(audit.word_count ?? 0)}
            />
            <Fact
              label="Schema blocks"
              value={String(audit.structured_data?.length ?? 0)}
            />
          </dl>

          {audit.errors && audit.errors.length > 0 ? (
            <div className="mt-5 rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              <strong className="font-semibold">Crawl errors:</strong>
              <ul className="mt-2 list-disc pl-5">
                {audit.errors.map((e, i) => (
                  <li key={i} className="break-words">{e}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/sample-report" className="btn-ghost">
              View customer-facing sample
            </Link>
            <Link href="/report-preview" className="btn-ghost">
              Static report preview
            </Link>
            <Link href="/" className="btn-ghost">
              Home
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="container-page py-12">
          <ReportView report={report} />
        </div>
      </section>

      <section className="border-t border-white/5">
        <div className="container-page py-12">
          <p className="section-eyebrow">Markdown export</p>
          <h2 className="h3 mt-2">Copy this into Gmail, Google Docs, or your PDF tool.</h2>
          <pre className="mt-6 max-h-[600px] overflow-auto rounded-xl border border-white/10 bg-ink-900/80 p-6 text-xs leading-relaxed text-white/85">
{markdown}
          </pre>
        </div>
      </section>

      <section className="border-t border-white/5">
        <div className="container-page py-12">
          <p className="section-eyebrow">Fix Pack — customer deliverable</p>
          <h2 className="h3 mt-2">The AI Visibility Profile Setup template, prefilled.</h2>
          <p className="muted mt-2 text-sm">
            Bracketed placeholders are filled by the consultant during
            fulfillment.
          </p>
          <pre className="mt-6 max-h-[700px] overflow-auto rounded-xl border border-accent/30 bg-ink-900/80 p-6 text-xs leading-relaxed text-white/85">
{fixPack}
          </pre>
        </div>
      </section>

      <section className="border-t border-white/5">
        <div className="container-page py-12">
          <p className="section-eyebrow">Raw audit JSON</p>
          <h2 className="h3 mt-2">What the crawler extracted.</h2>
          <p className="muted mt-2 text-sm">
            The exact <code>RawAuditJson</code> object passed into{" "}
            <code>generateVisibilityReport()</code>.
          </p>
          <pre className="mt-6 max-h-[500px] overflow-auto rounded-xl border border-white/10 bg-ink-900/80 p-6 text-xs leading-relaxed text-white/70">
{JSON.stringify(audit, null, 2)}
          </pre>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <dt className="text-[10px] uppercase tracking-[0.2em] text-white/40">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-white break-all">
        {value}
      </dd>
    </div>
  );
}
