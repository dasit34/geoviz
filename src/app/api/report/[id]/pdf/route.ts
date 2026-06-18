import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildPdfBaseUrl, generateAuditPdf } from "@/lib/generate-pdf";
import { logReportAccessAttempt, validateAdminAccess } from "@/lib/report-access";
import { applyApiRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/report/[id]/pdf
 *
 * Server-side renders the print page at /report/[id]/print into a PDF
 * and streams it back as application/pdf. The admin "Download PDF"
 * button and the customer report email both link here.
 *
 * Access model: the order ID is a 25-char CUID (~120 bits of entropy)
 * and acts as the access token. There is no admin-secret check on this
 * route — it is intentionally public-by-CUID so the link inside the
 * customer email works without an admin key. Same access model as the
 * `/report/[id]/print` page. Don't add an admin-key gate here unless
 * you also rework the email link.
 *
 * TODO(rate-limit): This is the most expensive public route in the
 * app — every hit launches a headless Chromium and streams an A4 PDF.
 * Add per-IP throttling (e.g., 6 / minute per IP via a small in-memory
 * Map or an upstream WAF rule) before opening live traffic. Keyed on
 * IP rather than order ID so an attacker can't fan out across IDs.
 *
 * The customer-facing email send (POST /api/admin/orders/[id]/send-report)
 * also calls into the shared `generateAuditPdf` helper to attach the same
 * PDF to Resend.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Headless Chromium cold-start + page render + PDF print can take 20–40s.
// Bump beyond Vercel's default 10s.
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  // Operator/preview downloads carry a valid admin key (the admin "Download
  // PDF" button + preview). Exempt them from the per-IP limiter so an operator
  // iterating on a report doesn't trip the public cap. Public/email links carry
  // no key and stay rate-limited.
  const url = new URL(req.url);
  const adminKey =
    url.searchParams.get("key") ?? req.headers.get("x-admin-secret") ?? undefined;
  const isAdmin = validateAdminAccess(adminKey).ok;

  // Rate limit FIRST (public hits only) — PDF generation is the most expensive
  // route in the app (~20–40s of headless Chromium per call). 12 hits per 5 min
  // per IP keeps report *downloading* more forgiving than audit *generation*
  // (checkout is 5/10min), so a real customer who views + downloads + re-shares
  // their own report during normal use never 429s — while still blocking runaway
  // scripts before they can launch a chromium instance. Admin downloads bypass
  // this entirely (operator iteration).
  if (!isAdmin) {
    const limited = applyApiRateLimit({
      req,
      routeKey: "api:pdf",
      limit: 12,
      windowMs: 5 * 60_000,
    });
    if (limited) return limited;
  }

  // Auth: anyone with the URL can download. Order IDs are 25-char cuids
  // (~120 bits of entropy) so URL-as-token is the access model. Same as
  // the print page at /report/[id]/print.
  //
  // Security: deliberately collapse "no order row" and "order exists but
  // report not generated yet" into the SAME 404 + neutral body. The
  // previous 404/409 split let an external attacker probing CUIDs
  // distinguish a valid order in-flight from a non-existent ID. Real
  // operator/admin context for "not ready" lives in the admin queue
  // page — this public API surface stays uniform. Log the actual reason
  // server-side via `logReportAccessAttempt`.
  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      reportStatus: true,
      reportMarkdown: true,
      businessName: true,
    },
  });
  const NEUTRAL_404_BODY = { error: "Report not available." } as const;
  if (!order) {
    logReportAccessAttempt({
      route: "/api/report/[id]/pdf",
      orderId: params.id,
      outcome: "not_found",
      reason: "no_order_row",
    });
    return NextResponse.json(NEUTRAL_404_BODY, { status: 404 });
  }
  if (!order.reportMarkdown || order.reportStatus !== "generated") {
    logReportAccessAttempt({
      route: "/api/report/[id]/pdf",
      orderId: params.id,
      outcome: "not_ready",
      reason: !order.reportMarkdown
        ? "no_report_markdown"
        : `reportStatus=${order.reportStatus}`,
    });
    return NextResponse.json(NEUTRAL_404_BODY, { status: 404 });
  }

  const baseUrl = buildPdfBaseUrl(req);

  console.log(
    `[pdf] orderId=${order.id} baseUrl=${baseUrl} starting render`,
  );
  const startedAt = Date.now();

  let pdf: Buffer;
  try {
    pdf = await generateAuditPdf({
      orderId: order.id,
      baseUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Full error to server log (Vercel/Railway log collectors); sanitized
    // body to the client so we never echo a stack trace, chromium path,
    // tmp filename, or any other internal detail back to a caller.
    console.error(
      `[pdf] orderId=${order.id} generation failed (${Date.now() - startedAt}ms): ${message}`,
    );
    logReportAccessAttempt({
      route: "/api/report/[id]/pdf",
      orderId: order.id,
      outcome: "render_failed",
      reason: "pdf_generation_threw",
    });
    return NextResponse.json(
      { error: "PDF generation failed. Please retry shortly." },
      { status: 500 },
    );
  }

  console.log(
    `[pdf] orderId=${order.id} ready bytes=${pdf.length} elapsedMs=${Date.now() - startedAt}`,
  );

  const filename = filenameFor(order.id, order.businessName);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}

function filenameFor(id: string, businessName: string | null): string {
  const slug = (businessName ?? "audit")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "audit";
  const shortId = id.slice(-6);
  return `geoviz-${slug}-${shortId}.pdf`;
}
