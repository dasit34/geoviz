/* eslint-disable no-console */
import { getResend, FROM_EMAIL } from "@/lib/resend";
import {
  parseReportScoreBreakdown,
  plainEnglishBandLabel,
} from "@/lib/parse-report";
import { resolveAppBaseUrl, buildAdminReviewUrl } from "@/lib/app-url";

/**
 * Internal "report ready for review" notification — fires from the
 * worker (or any other code path) the moment an audit transitions to
 * `reportStatus = "generated"`. NOT customer-facing.
 *
 * Routing:
 *   • To: `AUDIT_NOTIFICATION_EMAIL` if set, else
 *     `reports@geoviz.ai` as the documented fallback.
 *   • From: same `FROM_EMAIL` chain as every other GeoViz email.
 *
 * Failure mode: every error is logged and swallowed. The function
 * never throws — caller can `await` without try/catch and never lose
 * a worker run because of an email blip. Callers that want to know
 * whether the email was actually accepted can read the boolean.
 *
 * Idempotency: the worker only writes `reportStatus = "generated"`
 * after a successful audit run, so this function is called at most
 * once per audit completion in the normal flow. An admin "Re-run"
 * is intentionally re-notified — the operator wants to know each
 * time a report is freshly ready for review.
 */
const FALLBACK_OPERATOR_EMAIL = "reports@geoviz.ai";

export async function notifyOperatorReportReady(args: {
  orderId: string;
  businessName: string | null;
  customerEmail: string;
  websiteUrl: string;
  reportMarkdown: string;
  reportGeneratedAt: Date;
}): Promise<boolean> {
  const {
    orderId,
    businessName,
    customerEmail,
    websiteUrl,
    reportMarkdown,
    reportGeneratedAt,
  } = args;

  if (!process.env.RESEND_API_KEY) {
    console.warn(
      `[notify-operator-report-ready] skipped — RESEND_API_KEY not set (orderId=${orderId})`,
    );
    return false;
  }

  const operatorEmail =
    process.env.AUDIT_NOTIFICATION_EMAIL?.trim() || FALLBACK_OPERATOR_EMAIL;

  const baseUrl = resolveAppBaseUrl();
  const reportUrl = `${baseUrl}/report/${encodeURIComponent(orderId)}/print`;
  const adminUrl = buildAdminReviewUrl();

  const businessLabel = businessName?.trim() || websiteUrl;
  const score = parseReportScoreBreakdown(reportMarkdown);
  const overall =
    typeof score.overall === "number" ? `${score.overall}/100` : "—";
  const band =
    typeof score.overall === "number"
      ? plainEnglishBandLabel(score.overall)
      : score.status ?? "—";
  const generatedIso = reportGeneratedAt.toISOString();
  const generatedHuman = reportGeneratedAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const subject = `GeoViz Report Ready For Review — ${businessLabel}`;

  const textBody = [
    "Operator notification — a GeoViz audit just finished generating.",
    "",
    `Business:        ${businessLabel}`,
    `Website:         ${websiteUrl}`,
    `Customer email:  ${customerEmail}`,
    `Score:           ${overall}  (${band})`,
    `Generated at:    ${generatedHuman}`,
    "",
    `Review report:   ${reportUrl}`,
    `Admin queue:     ${adminUrl}`,
    "",
    "This is an internal notification. The customer has NOT received the report yet — that ships only after admin review + Send Report.",
    "",
    `Order ID: ${orderId}`,
  ].join("\n");

  const htmlBody = buildOperatorNotificationHtml({
    businessLabel,
    websiteUrl,
    customerEmail,
    overall,
    band,
    generatedHuman,
    generatedIso,
    reportUrl,
    adminUrl,
    orderId,
  });

  console.log(
    `[notify-operator-report-ready] sending orderId=${orderId} to=${operatorEmail} subject="${subject}"`,
  );

  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: operatorEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });
    if (result.error) {
      console.error(
        `[notify-operator-report-ready] FAILED orderId=${orderId} to=${operatorEmail} resendError="${result.error.name}: ${result.error.message}"`,
      );
      return false;
    }
    console.log(
      `[notify-operator-report-ready] SENT orderId=${orderId} to=${operatorEmail} resendId=${result.data?.id ?? "unknown"}`,
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[notify-operator-report-ready] FAILED orderId=${orderId} to=${operatorEmail} threwException="${message}"`,
    );
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildOperatorNotificationHtml(args: {
  businessLabel: string;
  websiteUrl: string;
  customerEmail: string;
  overall: string;
  band: string;
  generatedHuman: string;
  generatedIso: string;
  reportUrl: string;
  adminUrl: string;
  orderId: string;
}): string {
  const {
    businessLabel,
    websiteUrl,
    customerEmail,
    overall,
    band,
    generatedHuman,
    generatedIso,
    reportUrl,
    adminUrl,
    orderId,
  } = args;
  const sb = escapeHtml(businessLabel);
  const sw = escapeHtml(websiteUrl);
  const sc = escapeHtml(customerEmail);
  const so = escapeHtml(overall);
  const sn = escapeHtml(band);
  const sg = escapeHtml(generatedHuman);
  const sgIso = escapeHtml(generatedIso);
  const sr = escapeHtml(reportUrl);
  const sa = escapeHtml(adminUrl);
  const sid = escapeHtml(orderId);

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter','Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #ececec;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <div style="color:#ff7a18;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">GeoViz · Operator</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <h1 style="margin:8px 0 14px;font-size:22px;line-height:1.3;color:#111;font-weight:700;letter-spacing:-0.01em;">
                  Report ready for review — ${sb}
                </h1>
                <p style="margin:0 0 16px;font-size:14.5px;line-height:1.6;color:#2a2a2a;">
                  The audit finished generating and is queued for your review. The customer has <strong style="color:#111;">not</strong> been emailed yet — that ships from the admin dashboard after you mark the review approved and click <em>Send Report</em>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 14px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #ececec;border-radius:6px;">
                  <tr><td style="padding:8px 14px;color:#666;font-size:13px;width:140px;">Business</td><td style="padding:8px 14px;color:#111;font-size:13px;font-weight:600;">${sb}</td></tr>
                  <tr><td style="padding:8px 14px;color:#666;font-size:13px;border-top:1px solid #ececec;">Website</td><td style="padding:8px 14px;color:#111;font-size:13px;border-top:1px solid #ececec;">${sw}</td></tr>
                  <tr><td style="padding:8px 14px;color:#666;font-size:13px;border-top:1px solid #ececec;">Score</td><td style="padding:8px 14px;color:#111;font-size:13px;border-top:1px solid #ececec;font-weight:700;">${so} <span style="color:#666;font-weight:500;">(${sn})</span></td></tr>
                  <tr><td style="padding:8px 14px;color:#666;font-size:13px;border-top:1px solid #ececec;">Customer email</td><td style="padding:8px 14px;color:#111;font-size:13px;border-top:1px solid #ececec;">${sc}</td></tr>
                  <tr><td style="padding:8px 14px;color:#666;font-size:13px;border-top:1px solid #ececec;">Generated</td><td style="padding:8px 14px;color:#111;font-size:13px;border-top:1px solid #ececec;"><time datetime="${sgIso}">${sg}</time></td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:4px 32px 4px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:#ff7a18;border-radius:6px;">
                      <a href="${sr}" style="display:inline-block;padding:12px 22px;font-size:14.5px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">Review Report →</a>
                    </td>
                    <td style="width:10px;"></td>
                    <td style="border:1px solid #ff7a18;border-radius:6px;">
                      <a href="${sa}" style="display:inline-block;padding:11px 20px;font-size:14.5px;font-weight:600;color:#ff7a18;text-decoration:none;letter-spacing:0.01em;">Open Admin Queue →</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 26px;border-top:1px solid #eee;">
                <p style="margin:14px 0 4px;font-size:11.5px;line-height:1.5;color:#888;">
                  GeoViz · Internal operator notification · do not forward
                </p>
                <p style="margin:4px 0 0;font-size:11px;line-height:1.5;color:#aaa;font-family:ui-monospace,Menlo,monospace;">
                  Order ID: ${sid}
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
