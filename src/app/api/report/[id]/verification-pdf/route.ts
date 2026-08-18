import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildPdfBaseUrl, generateAuditPdf } from "@/lib/generate-pdf";
import { logReportAccessAttempt, validateAdminAccess } from "@/lib/report-access";
import { applyApiRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/report/[id]/verification-pdf
 *
 * Same Puppeteer pipeline as `/api/report/[id]/pdf` — reuses
 * `generateAuditPdf` with `routeSegment: "verification"` instead of a
 * second PDF engine. `[id]` is the CURRENT (latest) audit's order id;
 * the route it renders (`/report/[id]/verification`) itself resolves
 * the linked previous audit and 404s if none is linked, so this route
 * inherits that same "no fabricated comparison" behavior for free.
 *
 * Access model: identical to the standard PDF route — order ID is the
 * token, admin key only exempts from the public rate limiter.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const url = new URL(req.url);
  const adminKey =
    url.searchParams.get("key") ?? req.headers.get("x-admin-secret") ?? undefined;
  const isAdmin = validateAdminAccess(adminKey).ok;

  if (!isAdmin) {
    const limited = applyApiRateLimit({
      req,
      routeKey: "api:verification-pdf",
      limit: 12,
      windowMs: 5 * 60_000,
    });
    if (limited) return limited;
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      reportStatus: true,
      previousAuditOrderId: true,
      businessName: true,
    },
  });
  const NEUTRAL_404_BODY = { error: "Verification report not available." } as const;
  if (!order) {
    logReportAccessAttempt({
      route: "/api/report/[id]/verification-pdf",
      orderId: params.id,
      outcome: "not_found",
      reason: "no_order_row",
    });
    return NextResponse.json(NEUTRAL_404_BODY, { status: 404 });
  }
  if (order.reportStatus !== "generated" || !order.previousAuditOrderId) {
    logReportAccessAttempt({
      route: "/api/report/[id]/verification-pdf",
      orderId: params.id,
      outcome: "not_ready",
      reason: !order.previousAuditOrderId
        ? "no_previous_audit_linked"
        : `reportStatus=${order.reportStatus}`,
    });
    return NextResponse.json(NEUTRAL_404_BODY, { status: 404 });
  }

  const baseUrl = buildPdfBaseUrl(req);
  console.log(`[verification-pdf] orderId=${order.id} baseUrl=${baseUrl} starting render`);
  const startedAt = Date.now();

  let pdf: Buffer;
  try {
    pdf = await generateAuditPdf({
      orderId: order.id,
      baseUrl,
      routeSegment: "verification",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[verification-pdf] orderId=${order.id} generation failed (${Date.now() - startedAt}ms): ${message}`,
    );
    logReportAccessAttempt({
      route: "/api/report/[id]/verification-pdf",
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
    `[verification-pdf] orderId=${order.id} ready bytes=${pdf.length} elapsedMs=${Date.now() - startedAt}`,
  );

  const filename = filenameFor(order.businessName);

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

function filenameFor(businessName: string | null): string {
  const words = (businessName ?? "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 8);
  const slug = words.length > 0 ? words.join("-") : "Business";
  return `GeoViz-Verification-Audit-${slug}.pdf`;
}
