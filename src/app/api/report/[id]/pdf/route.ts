import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildPdfBaseUrl, generateAuditPdf } from "@/lib/generate-pdf";

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
  // Auth: anyone with the URL can download. Order IDs are 25-char cuids
  // (~120 bits of entropy) so URL-as-token is the access model. Same as
  // the print page at /report/[id]/print.
  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      reportStatus: true,
      reportMarkdown: true,
      businessName: true,
    },
  });
  if (!order) {
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404 },
    );
  }
  if (!order.reportMarkdown || order.reportStatus !== "generated") {
    return NextResponse.json(
      {
        error:
          "Report not generated yet. Run the audit first, then download.",
      },
      { status: 409 },
    );
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
    console.error(
      `[pdf] orderId=${order.id} generation failed (${Date.now() - startedAt}ms): ${message}`,
    );
    return NextResponse.json(
      { error: `PDF generation failed: ${message}` },
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
