import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { checkPageRateLimit } from "@/lib/rate-limit";
import { isAdminPageRequest } from "@/lib/admin-secret";
import { logReportAccessAttempt } from "@/lib/report-access";
import { buildAuditComparison } from "@/lib/audit-comparison/buildAuditComparison";
import { VerificationReportView } from "@/components/report/VerificationReportView";
import "../print/print.css";

/**
 * Re-Audit / Verification Audit customer report. Same access model as
 * `/report/[id]/print` — the order's CUID is the token, no admin key
 * required. Deliberately a separate, concise view (not another 9-page
 * `ReportDocument` render) — see `VerificationReportView`.
 *
 * `[id]` here is the CURRENT (latest) audit's order id. Its
 * `previousAuditOrderId` points at the prior order this compares
 * against. If that link isn't set (first-ever audit, or a re-audit
 * that hasn't been linked), this route 404s rather than fabricating a
 * comparison — `/print` remains the correct link for a non-re-audit.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Verification Audit",
  robots: { index: false, follow: false },
};

const INTELLIGENCE_SELECT = {
  deterministicScore: true,
  aiValidations: true,
  overallScore: true,
  industryCategoryNormalized: true,
  industryTaxonomyVersion: true,
} as const;

export default async function VerificationReportPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { key?: string | string[] };
}) {
  if (!isAdminPageRequest({ key: searchParams?.key })) {
    const rl = checkPageRateLimit({
      headers: headers(),
      routeKey: "page:report:verification",
      limit: 30,
      windowMs: 5 * 60_000,
    });
    if (rl.blocked) {
      return (
        <main>
          <Header />
          <section className="container-page py-24 text-center">
            <p className="muted">
              Too many requests. Please try again shortly.
            </p>
          </section>
          <Footer />
        </main>
      );
    }
  }

  const current = await prisma.auditOrder.findUnique({
    where: { id: params.id },
    include: { intelligence: { select: INTELLIGENCE_SELECT } },
  });

  if (!current) {
    logReportAccessAttempt({
      route: "/report/[id]/verification",
      orderId: params.id,
      outcome: "not_found",
      reason: "no_order_row",
    });
    notFound();
  }

  if (!current.previousAuditOrderId || !current.intelligence?.deterministicScore) {
    // No linked prior audit, or this audit itself has no deterministic
    // score yet — nothing to compare. 404 rather than a fabricated
    // comparison; the standard report at /print is the correct link.
    logReportAccessAttempt({
      route: "/report/[id]/verification",
      orderId: params.id,
      outcome: "not_ready",
      reason: "no_previous_audit_linked",
    });
    notFound();
  }

  const previous = await prisma.auditOrder.findUnique({
    where: { id: current.previousAuditOrderId },
    include: { intelligence: { select: INTELLIGENCE_SELECT } },
  });

  if (!previous?.intelligence) {
    logReportAccessAttempt({
      route: "/report/[id]/verification",
      orderId: params.id,
      outcome: "not_ready",
      reason: "previous_audit_missing_intelligence",
    });
    notFound();
  }

  const comparison = await buildAuditComparison(
    {
      auditOrderId: previous.id,
      createdAt: previous.createdAt,
      industryCategoryNormalized: previous.intelligence.industryCategoryNormalized,
      industryTaxonomyVersion: previous.intelligence.industryTaxonomyVersion,
      deterministicScore: previous.intelligence.deterministicScore,
      aiValidations: previous.intelligence.aiValidations,
    },
    {
      auditOrderId: current.id,
      createdAt: current.createdAt,
      industryCategoryNormalized: current.intelligence.industryCategoryNormalized,
      industryTaxonomyVersion: current.intelligence.industryTaxonomyVersion,
      deterministicScore: current.intelligence.deterministicScore,
      aiValidations: current.intelligence.aiValidations,
    },
  );

  logReportAccessAttempt({
    route: "/report/[id]/verification",
    orderId: current.id,
    outcome: "served",
  });

  const businessLabel = current.businessName?.trim() || current.websiteUrl;

  return (
    <main>
      <Header />
      <VerificationReportView
        businessLabel={businessLabel}
        websiteUrl={current.websiteUrl}
        comparison={comparison}
        currentOrderId={current.id}
        previousOrderId={previous.id}
        reAuditEligible={current.reviewStatus === "approved"}
      />
      <Footer />
    </main>
  );
}
