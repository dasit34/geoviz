import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { getResend, FROM_EMAIL } from "@/lib/resend";
import { buildPdfBaseUrl, generateAuditPdf } from "@/lib/generate-pdf";
import { parseReportScore } from "@/lib/parse-report-score";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF generation can take 20–40s — bump beyond Vercel's default 10s.
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:send-report",
    limit: 20,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    console.warn(`[admin-send] unauthorized request for orderId=${params.id}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let force = false;
  let recipientOverride: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      force?: boolean;
      recipientEmail?: unknown;
    };
    force = body.force === true;
    if (typeof body.recipientEmail === "string") {
      recipientOverride = body.recipientEmail.trim().toLowerCase();
    }
  } catch {
    // ignore
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.reportStatus !== "generated" || !order.reportMarkdown) {
    console.warn(
      `[admin-send] orderId=${order.id} cannot send — reportStatus=${order.reportStatus}`,
    );
    return NextResponse.json(
      {
        error: "No generated report to send. Run the audit first.",
        reportStatus: order.reportStatus,
      },
      { status: 409 },
    );
  }

  // Pilot-launch gate: never send a report that hasn't been explicitly
  // approved in the admin review panel. The `force` flag is for resends —
  // it bypasses the "already-sent" check, NOT the review gate.
  if (order.reviewStatus !== "approved") {
    console.warn(
      `[admin-send] orderId=${order.id} blocked — reviewStatus=${order.reviewStatus} (approval required)`,
    );
    return NextResponse.json(
      {
        error:
          "Report has not been approved. Mark the review approved before sending.",
        reviewStatus: order.reviewStatus,
      },
      { status: 409 },
    );
  }

  // Resolve the actual recipient: admin-provided override wins, else the
  // order's original email. Validate cheaply — Resend will reject malformed
  // addresses anyway, but we catch obvious typos before generating a PDF.
  const toAddress = recipientOverride && recipientOverride.length > 0
    ? recipientOverride
    : order.email;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toAddress)) {
    return NextResponse.json(
      { error: `Invalid recipient email: "${toAddress}"` },
      { status: 400 },
    );
  }

  if (order.reportSentToCustomerAt && !force) {
    console.log(
      `[admin-send] orderId=${order.id} report already sent at ${order.reportSentToCustomerAt.toISOString()} — skipping (pass force=true to resend)`,
    );
    return NextResponse.json(
      {
        status: "already-sent",
        sentAt: order.reportSentToCustomerAt,
        message:
          "Report already sent to customer. Pass {force:true} to resend.",
      },
      { status: 409 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[admin-send] RESEND_API_KEY not set");
    return NextResponse.json(
      { error: "Email transport not configured (RESEND_API_KEY missing)." },
      { status: 503 },
    );
  }

  const businessLabel = order.businessName || order.websiteUrl;
  const baseUrl = buildPdfBaseUrl(req);
  // Loud warning if production accidentally resolves to localhost — the
  // customer email shouldn't ever go out with localhost links. The send
  // continues so admin can see what happened, but the issue is
  // surfaced in the function logs immediately.
  if (process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(baseUrl)) {
    console.error(
      `[admin-send] WARNING orderId=${order.id} baseUrl=${baseUrl} resolved to localhost in production — set NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL on Vercel.`,
    );
  }
  const viewUrl = `${baseUrl.replace(/\/$/, "")}/report/${encodeURIComponent(order.id)}/print`;
  const pdfUrl = `${baseUrl.replace(/\/$/, "")}/api/report/${encodeURIComponent(order.id)}/pdf`;

  // Pull the score for the subject line and the email summary.
  const scoreInfo = parseReportScore(order.reportMarkdown);
  const scoreLabel = scoreInfo
    ? `Score: ${scoreInfo.score}/100`
    : "Your report is ready";
  const subject = `Your AI Visibility Report is ready — ${scoreLabel}`;

  const biggestIssueLine = extractBiggestIssue(order.reportMarkdown);
  const summarySentence = scoreInfo
    ? `Your audit scored ${scoreInfo.score}/100 (${scoreInfo.status ?? "see report"}).`
    : "Your AI Visibility audit is ready.";

  const textBody = buildTextBody({
    businessLabel,
    summarySentence,
    biggestIssueLine,
    viewUrl,
    pdfUrl,
  });
  const htmlBody = buildHtmlBody({
    businessLabel,
    score: scoreInfo,
    summarySentence,
    biggestIssueLine,
    viewUrl,
    pdfUrl,
  });

  console.log(
    `[admin-send] sending report orderId=${order.id} to=${toAddress}${recipientOverride && recipientOverride !== order.email.toLowerCase() ? ` (override; original=${order.email})` : ""} subject="${subject}"`,
  );

  // CC the admin notification address (if configured) so we have a copy of
  // every customer deliverable in the same inbox we monitor for new orders.
  const ccAddress = process.env.AUDIT_NOTIFICATION_EMAIL;
  const cc =
    ccAddress && ccAddress.toLowerCase() !== toAddress.toLowerCase()
      ? [ccAddress]
      : undefined;

  // Generate the PDF attachment. The PDF is OPTIONAL — the email links
  // to /report/[id]/print and /api/report/[id]/pdf so the customer can
  // always view or download even if the attachment fails. If generation
  // succeeds we attach a copy as a convenience; if it fails we log and
  // send the email anyway.
  let pdfBuffer: Buffer | undefined;
  try {
    console.log(`[admin-send] generating PDF for orderId=${order.id}`);
    pdfBuffer = await generateAuditPdf({
      orderId: order.id,
      baseUrl,
    });
    console.log(
      `[admin-send] PDF ready orderId=${order.id} bytes=${pdfBuffer.length}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[admin-send] PDF generation failed orderId=${order.id} (email still goes — links cover delivery): ${message}`,
    );
  }

  const attachments = pdfBuffer
    ? [
        {
          filename: pdfFilenameFor(order.id, order.businessName),
          content: pdfBuffer,
        },
      ]
    : undefined;

  console.log(
    `[admin-send] EMAIL_DISPATCH orderId=${order.id} to=${toAddress} from=${FROM_EMAIL} cc=${cc?.join(",") ?? "(none)"} subject="${subject}" attachedPdf=${Boolean(pdfBuffer)}`,
  );

  let resendId: string | undefined;
  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: toAddress,
      cc,
      subject,
      text: textBody,
      html: htmlBody,
      attachments,
    });
    if (result.error) {
      console.error(
        `[admin-send] EMAIL_FAILED orderId=${order.id} to=${toAddress} resendError="${result.error.name}: ${result.error.message}"`,
      );
      return NextResponse.json(
        { error: `${result.error.name}: ${result.error.message}` },
        { status: 502 },
      );
    }
    resendId = result.data?.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[admin-send] EMAIL_FAILED orderId=${order.id} to=${toAddress} threwException="${message}"`,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const sentAt = new Date();
  const sentCcValue = cc?.[0] ?? null;
  await prisma.auditOrder.update({
    where: { id: order.id },
    data: {
      reportSentToCustomerAt: sentAt,
      sentTo: toAddress,
      sentCc: sentCcValue,
      auditStatus: "completed",
    },
  });

  console.log(
    `[admin-send] EMAIL_SENT orderId=${order.id} sentTo=${toAddress} sentCc=${sentCcValue ?? "(none)"} sentAt=${sentAt.toISOString()} resendId=${resendId ?? "unknown"} attachedPdf=${Boolean(pdfBuffer)}`,
  );

  return NextResponse.json({
    status: "sent",
    to: toAddress,
    cc: sentCcValue,
    sentAt: sentAt.toISOString(),
    resendId: resendId ?? null,
    attached: Boolean(pdfBuffer),
  });
}

function pdfFilenameFor(id: string, businessName: string | null): string {
  const slug =
    (businessName ?? "audit")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "audit";
  const shortId = id.slice(-6);
  return `geoviz-${slug}-${shortId}.pdf`;
}

const FALLBACK_BIGGEST_ISSUE =
  "Your audit identifies the highest-impact gaps preventing AI search platforms from confidently recommending your business — open the report for the ranked fixes.";

// Pull a one-line teaser from the "Why Your Business Is Not Showing Up"
// section of the audit markdown for the email preview/callout. Tolerates
// the older "Why You're Not Showing Up" heading from earlier prompt
// versions, and gracefully falls back when the structure changes.
function extractBiggestIssue(md: string): string {
  if (!md) return FALLBACK_BIGGEST_ISSUE;

  const headingRe =
    /^##\s+(?:\d+\.\s*)?Why\s+(?:Your Business\s+Is|You['’]re)\s+Not\s+Showing\s+Up.*$/im;
  const match = headingRe.exec(md);
  if (!match) return FALLBACK_BIGGEST_ISSUE;

  const after = md.slice(match.index + match[0].length);
  const nextHeading = /\n##\s+/m.exec(after);
  const section = nextHeading ? after.slice(0, nextHeading.index) : after;

  const lines = section.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    const stripped = line
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^>\s+/, "")
      .replace(/^\*\*([^*]+)\*\*[:\-—\s]*/, "$1: ")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .trim();
    if (!stripped) continue;
    return clipToLength(stripped, 180);
  }
  return FALLBACK_BIGGEST_ISSUE;
}

function clipToLength(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,;:.\s]+$/, "")}…`;
}

type EmailArgs = {
  businessLabel: string;
  summarySentence: string;
  biggestIssueLine: string;
  viewUrl: string;
  pdfUrl: string;
};

function buildTextBody(args: EmailArgs): string {
  const { businessLabel, summarySentence, biggestIssueLine, viewUrl, pdfUrl } =
    args;
  return [
    "Hi —",
    "",
    `Your AI Visibility Report for ${businessLabel} is ready.`,
    "",
    summarySentence,
    "",
    `Biggest issue: ${biggestIssueLine}`,
    "",
    `View your report: ${viewUrl}`,
    `Download PDF:    ${pdfUrl}`,
    "",
    'Recommended next step: review the "What to Fix First" section, then',
    "reply to this email if you'd like GeoViz to implement the fixes for you.",
    "",
    "— GeoViz",
    "",
  ].join("\n");
}

function buildHtmlBody(
  args: EmailArgs & {
    score: { score: number; status: string | null } | null;
  },
): string {
  const {
    businessLabel,
    score,
    summarySentence,
    biggestIssueLine,
    viewUrl,
    pdfUrl,
  } = args;

  const safeBusiness = escapeHtml(businessLabel);
  const safeSummary = escapeHtml(summarySentence);
  const safeIssue = escapeHtml(biggestIssueLine);
  const safeView = escapeHtml(viewUrl);
  const safePdf = escapeHtml(pdfUrl);

  const scoreChip = score
    ? renderScoreChip(score.score, score.status)
    : "";

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter','Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #ececec;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <div style="color:#ff7a18;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">GeoViz</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <h1 style="margin:8px 0 18px;font-size:22px;line-height:1.3;color:#111;font-weight:700;letter-spacing:-0.01em;">
                  Your AI Visibility Report for ${safeBusiness} is ready
                </h1>
                ${scoreChip}
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2a2a2a;">${safeSummary}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <div style="background:#fff4ea;border-left:3px solid #ff7a18;padding:12px 14px;border-radius:4px;margin:0 0 22px;font-size:14px;line-height:1.55;color:#1a1a1a;">
                  <strong style="color:#111;">Biggest issue:</strong> ${safeIssue}
                </div>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:4px 32px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:#ff7a18;border-radius:6px;">
                      <a href="${safeView}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">View Your Report →</a>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:10px;font-size:13px;color:#666;">
                  Or <a href="${safePdf}" style="color:#ff7a18;text-decoration:underline;">download PDF</a>.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 8px;">
                <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#2a2a2a;">
                  Want us to fix these issues for you? Reply to this email and we'll send you a fix plan.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 26px;border-top:1px solid #eee;">
                <p style="margin:14px 0 0;font-size:11.5px;line-height:1.5;color:#888;">
                  GeoViz · AI Visibility Audits for local businesses · geoviz.app
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderScoreChip(score: number, status: string | null): string {
  const tone =
    score >= 75
      ? { border: "#2da94f", bg: "#f0faf3", num: "#1f7e3a" }
      : score >= 50
        ? { border: "#c98604", bg: "#fdf6e9", num: "#946203" }
        : { border: "#ff7a18", bg: "#fff4ea", num: "#ff7a18" };
  const safeStatus = status ? escapeHtml(status) : "";
  const statusRow = safeStatus
    ? `<div style="font-size:11px;color:#666;margin-top:2px;text-transform:uppercase;letter-spacing:0.1em;">${safeStatus}</div>`
    : "";
  return `<div style="display:inline-block;padding:8px 14px;border-radius:999px;border:2px solid ${tone.border};background:${tone.bg};margin:0 0 16px;">
    <span style="font-size:18px;font-weight:800;color:${tone.num};letter-spacing:-0.01em;">${score}</span><span style="font-size:13px;color:${tone.num};font-weight:600;"> / 100</span>
    ${statusRow}
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
