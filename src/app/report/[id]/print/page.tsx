import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { type AuditReportContext } from "@/components/AuditReportContent";
import { ReportSurface } from "@/components/report/ReportSurface";
import { ReportFailedState } from "@/components/report/ReportFailedState";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { logReportAccessAttempt } from "@/lib/report-access";
import { isAdminPageRequest } from "@/lib/admin-secret";
import { checkPageRateLimit } from "@/lib/rate-limit";
import { isSampleAudit } from "@/lib/sample-audit";
import { RateLimitedNotice } from "@/components/RateLimitedNotice";
import { buildReportContext } from "@/lib/intelligence/build-report-context";
import { resolveBusinessName } from "@/lib/intelligence/resolve-business-name";
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
 * The actual report body lives in <ReportSurface /> (the single fixed-
 * template renderer over the deterministic ReportModel) so that the
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
  searchParams,
}: {
  params: { id: string };
  searchParams?: { key?: string | string[] };
}) {
  // 30 hits per 5 min per IP. Throttle BEFORE the Prisma lookup so a
  // script can't churn `findUnique` calls fishing for CUIDs. Real admin
  // traffic (cookie session or valid ?key=) is exempt — see
  // isAdminPageRequest. This is what lets the admin QA surface
  // (ReportQaPage's batch fetches to this route) run through many
  // reports in one session without tripping the public throttle.
  if (!isAdminPageRequest({ key: searchParams?.key })) {
    const rl = checkPageRateLimit({
      headers: headers(),
      routeKey: "page:report:print",
      limit: 30,
      windowMs: 5 * 60_000,
    });
    if (rl.blocked) {
      // Public sample reports must never 429 — they're marketing surfaces with
      // no per-user state. Only on the blocked path do one cheap stripeSessionId
      // lookup to let samples through; real orders stay throttled and the
      // happy-path/anti-CUID-fishing behavior is unchanged.
      const sampleProbe = await prisma.auditOrder.findUnique({
        where: { id: params.id },
        select: { stripeSessionId: true },
      });
      if (!isSampleAudit(sampleProbe?.stripeSessionId)) {
        return <RateLimitedNotice retryAfterSec={rl.retryAfterSec} />;
      }
    }
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
          // Cross-Model Intelligence — populated on every audit;
          // `null` only on legacy rows from before the consensus
          // layer was wired (or when every provider's API key was
          // absent at audit time). FourModelGrid + ConsensusSummary
          // render an "AI model analysis unavailable" panel rather
          // than hiding when these are null.
          aiValidations: true,
          consensusIndex: true,
          // V2 preflight signals — consumed by the report v2
          // "AI Inputs Analyzed" section. Null on older audits;
          // renderer falls back to "Not analyzed" rows.
          preflightSignals: true,
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
    return <ReportFailedState orderId={order.id} />;
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

  // F2 — render-time business-name resolution. Reads schema-org
  // Organization.name (best), article title, then surface scrapes,
  // before falling back to order.businessName / domain. Surfaces an
  // identity-inconsistency pill on the cover when the resolved name
  // diverges meaningfully from the user's input.
  const nameResolution = resolveBusinessName({
    intelligence: order.intelligence ?? null,
    order: {
      businessName: order.businessName,
      email: order.email,
      websiteUrl: order.websiteUrl,
    },
  });
  const businessLabel = nameResolution.name;

  // Phase L: compute customer-facing benchmark + confidence context.
  // Pure DB reads; null-safe; fully fail-soft (any error → no
  // context, report renders as it did pre-Phase L).
  const reportContext = await buildReportContext(order.intelligence ?? null);
  const contextWithIdentity: AuditReportContext | undefined = reportContext
    ? { ...reportContext, nameInconsistency: nameResolution.inconsistency }
    : nameResolution.inconsistency
      ? ({
          nameInconsistency: nameResolution.inconsistency,
        } as AuditReportContext)
      : undefined;

  // Report opened — success-path telemetry (the failure paths above already
  // log via logReportAccessAttempt). Order ID is a CUID token; never logs
  // markdown, score, business name, or email.
  logReportAccessAttempt({
    route: "/report/[id]/print",
    orderId: order.id,
    outcome: "served",
  });

  return (
    <ReportSurface
      orderId={order.id}
      businessLabel={businessLabel}
      websiteUrl={order.websiteUrl}
      reportMarkdown={order.reportMarkdown}
      reportGeneratedAt={order.reportGeneratedAt}
      reviewed={order.reviewStatus === "approved"}
      deterministicScore={order.intelligence?.deterministicScore ?? null}
      context={contextWithIdentity}
    />
  );
}

// Phase D — buildReportContext lifted to
// `src/lib/intelligence/build-report-context.ts` so both the PDF
// route AND the admin queue construct the same payload that
// `<ReportSurface />` consumes. See that module for the body.

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

// ReportFailedState (the "we hit a problem" surface) now lives in
// @/components/report/ReportFailedState — extracted so ReportSurface can
// render the same safe fallback when the report model build throws.
