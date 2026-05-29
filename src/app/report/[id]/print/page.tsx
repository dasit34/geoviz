import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { AuditReportContent, type AuditReportContext } from "@/components/AuditReportContent";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { logReportAccessAttempt } from "@/lib/report-access";
import { checkPageRateLimit } from "@/lib/rate-limit";
import { RateLimitedNotice } from "@/components/RateLimitedNotice";
import {
  getAuditPercentileBundle,
  type AuditScoreSnapshot,
} from "@/lib/intelligence/audit-percentile";
import { formatCustomerConfidence } from "@/lib/intelligence/confidence-display";
import type { DeterministicScore } from "@/lib/scoring/types";
import "./print.css";

/**
 * Customer-facing audit report. Same surface that powers:
 *   1. The "View Your Report" link in the delivery email.
 *   2. The admin preview.
 *   3. Puppeteer's `/api/report/[id]/pdf` server-side render.
 *
 * Auth: anyone with the URL can view. 25-char cuid order IDs give
 * ~120 bits of entropy. Metadata is noindex/nofollow.
 *
 * The actual report body lives in <AuditReportContent /> so that the
 * public `/sample-report` page (the GeoViz self-audit preview) can
 * render the exact same template against a different audit row
 * without forking the design.
 *
 * Pre-launch hardening (PR #23): customers who click the report
 * link before the worker finishes used to see a generic 404. Now
 * the page branches on `reportStatus` so the queued/running and
 * failed paths render branded states instead.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "GEO Audit Report",
  robots: { index: false, follow: false },
};

export default async function PrintPage({
  params,
}: {
  params: { id: string };
}) {
  // 30 hits per 5 min per IP. Throttle BEFORE the Prisma lookup so a
  // script can't churn `findUnique` calls fishing for CUIDs.
  const rl = checkPageRateLimit({
    headers: headers(),
    routeKey: "page:report:print",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (rl.blocked) {
    return <RateLimitedNotice retryAfterSec={rl.retryAfterSec} />;
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
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
        },
      },
    },
  });

  // True 404 — no order row for this ID. The only outcome that
  // should leak as 404 to the customer.
  if (!order) {
    logReportAccessAttempt({
      route: "/report/[id]/print",
      orderId: params.id,
      outcome: "not_found",
      reason: "no_order_row",
    });
    notFound();
  }

  // Order exists. Branch on report status so the customer always
  // sees a branded surface, not a generic 404.
  if (order.reportStatus === "failed") {
    logReportAccessAttempt({
      route: "/report/[id]/print",
      orderId: order.id,
      outcome: "render_failed",
      reason: order.reportError ?? "unknown",
    });
    return <ReportFailed orderId={order.id} />;
  }

  if (!order.reportMarkdown) {
    // queued / running / pending / any non-terminal status without
    // markdown yet — render the in-flight surface with meta-refresh.
    logReportAccessAttempt({
      route: "/report/[id]/print",
      orderId: order.id,
      outcome: "not_ready",
      reason: `report_status=${order.reportStatus ?? "unknown"}`,
    });
    return <ReportInFlight orderId={order.id} />;
  }

  const businessLabel = order.businessName ?? order.email;

  // Phase L: compute customer-facing benchmark + confidence context.
  // Pure DB reads; null-safe; fully fail-soft (any error → no
  // context, report renders as it did pre-Phase L).
  const reportContext = await buildReportContext(order.intelligence ?? null);

  return (
    <AuditReportContent
      orderId={order.id}
      businessLabel={businessLabel}
      websiteUrl={order.websiteUrl}
      reportMarkdown={order.reportMarkdown}
      reportGeneratedAt={order.reportGeneratedAt}
      deterministicScore={order.intelligence?.deterministicScore ?? null}
      context={reportContext}
    />
  );
}

/**
 * Phase L: compute percentile + confidence context server-side.
 * Returns `undefined` (rather than throwing) on any failure path so
 * the report renders unchanged when intelligence data is missing or
 * the cohort lookup hits an edge case.
 */
async function buildReportContext(
  intelligence: {
    deterministicScore: unknown;
    industryCategoryNormalized: string | null;
    overallScore: number | null;
    semanticClarityScore: number | null;
    crawlerAccessibilityScore: number | null;
    trustSignalScore: number | null;
    structuredIdentityScore: number | null;
    recommendationReadinessScore: number | null;
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

    // Build the cover-page "Cohort" cell value. Friendly short
    // form, never speculative.
    const cohortCellValue =
      bundle.overall.bucket === "insufficient"
        ? "Calibrating"
        : `${bundle.overall.bucket}${
            intelligence.industryCategoryNormalized
              ? ` (${intelligence.industryCategoryNormalized})`
              : ""
          }`;

    // Confidence framing from the deterministic engine output.
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
    };
  } catch (err) {
    console.error(
      "[report/print] buildReportContext failed:",
      (err as Error).message?.slice(0, 200),
    );
    return undefined;
  }
}

/**
 * Branded "your audit is being prepared" surface. Renders for any
 * order whose `reportMarkdown` is still null but isn't in a
 * terminal failure state. Auto-refreshes every 20 seconds via a
 * meta tag so the customer doesn't need JS or an explicit refresh
 * click — the page just becomes the real report when the worker
 * finishes.
 */
function ReportInFlight({ orderId }: { orderId: string }) {
  return (
    <>
      {/* Auto-refresh — server-rendered so no JS dependency. 20s
          cadence matches the worker's typical median runtime; long
          enough to avoid hammering the DB, short enough that the
          customer doesn't sit on the screen wondering. */}
      <meta httpEquiv="refresh" content="20" />
      <main>
        <Header />
        <section className="relative">
          <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
          <div className="container-page py-20 md:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <span className="pill animate-pulseSoft">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Audit in progress
              </span>
              <h1 className="h1 mt-6">
                Your AI Visibility Audit is being prepared.
              </h1>
              <p className="muted mt-5 text-base leading-relaxed">
                We&rsquo;re running the analysis right now. Most audits
                finish within a couple of minutes. This page will
                refresh on its own as soon as your report is ready
                &mdash; you don&rsquo;t need to click anything.
              </p>
              <p className="mt-5 text-sm text-white/55">
                You&rsquo;ll also receive an email when delivery
                completes. If nothing has appeared after ten minutes,
                reach us at{" "}
                <a
                  href="mailto:support@geoviz.ai"
                  className="text-accent hover:text-accent-glow underline-offset-4 hover:underline"
                >
                  support@geoviz.ai
                </a>
                .
              </p>
              <p className="mt-8 text-xs uppercase tracking-[0.18em] text-white/40">
                Report ID: {orderId}
              </p>
            </div>
          </div>
        </section>
        <Footer />
      </main>
    </>
  );
}

/**
 * Branded "we hit a problem" surface for orders whose audit ended
 * in a terminal failure. Does NOT auto-refresh — failure is a
 * stable state until operator intervention. Surfaces the order ID
 * (so the customer can quote it in support email) and routes them
 * to support directly.
 */
function ReportFailed({ orderId }: { orderId: string }) {
  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="container-page py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <span className="pill">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              Audit needs attention
            </span>
            <h1 className="h1 mt-6">
              We hit a snag generating your audit.
            </h1>
            <p className="muted mt-5 text-base leading-relaxed">
              Our system flagged the audit for review and our team has
              been notified. We&rsquo;ll either regenerate it for you
              or refund your payment &mdash; whichever you prefer.
            </p>
            <p className="mt-5 text-sm text-white/55">
              Reach us at{" "}
              <a
                href="mailto:support@geoviz.ai"
                className="text-accent hover:text-accent-glow underline-offset-4 hover:underline"
              >
                support@geoviz.ai
              </a>{" "}
              and quote your report ID below so we can resolve this
              quickly.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/" className="btn-ghost text-sm">
                Back to homepage
              </Link>
              <a
                href="mailto:support@geoviz.ai?subject=AI%20Visibility%20Audit%20%E2%80%94%20report%20needs%20regeneration"
                className="btn-primary text-sm"
              >
                Contact support
              </a>
            </div>
            <p className="mt-8 text-xs uppercase tracking-[0.18em] text-white/40">
              Report ID: {orderId}
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
