/* eslint-disable no-console */
/**
 * Customer-facing failure email sender.
 *
 * Sends one of two calm, branded emails when a paid customer audit
 * lands in a non-completed terminal state:
 *
 *   • "delayed"  — recoverable infrastructure/provider issue. Tells
 *                  the customer "we're handling it, no action required".
 *   • "failed"   — non-recoverable. Tells the customer "we couldn't
 *                  complete your audit, we'll re-run or refund".
 *
 * What this module does NOT do:
 *   • Decide WHICH email to send. The caller passes a CustomerStatus
 *     (derived from `deriveCustomerStatus` in customer-failure-mapping).
 *   • Mention the provider, the model, the API, the billing cap,
 *     or any internal error string. Copy is hand-authored in
 *     `customerCopyFor()` and is the only customer-visible language
 *     used by this sender.
 *   • Throw. Same contract as `notify-operator-report-ready`: every
 *     error is logged and swallowed. The caller can `await` without
 *     try/catch.
 *
 * The worker writes `AuditOrder.customerFailureNotifiedAt` after this
 * function returns true; the caller should only invoke this once per
 * terminal failure (the worker's caller path enforces that).
 */

import { getResend, FROM_EMAIL } from "@/lib/resend";
import {
  customerCopyFor,
  CUSTOMER_STATUS_LABEL,
  type CustomerStatus,
} from "@/lib/customer-failure-mapping";

/**
 * Reply-to address customers see on the delayed/failed email. Replies
 * land in the operator's support inbox. Same domain as the FROM.
 *
 * Set `CUSTOMER_SUPPORT_EMAIL` in env to override; otherwise the
 * convention `support@geoviz.ai` is used.
 */
function customerSupportEmail(): string {
  return process.env.CUSTOMER_SUPPORT_EMAIL?.trim() || "support@geoviz.ai";
}

/**
 * Send the appropriate customer-facing email for a non-completed
 * terminal state. Returns true on Resend "accepted", false on any
 * error (always logged).
 *
 * The caller should ONLY pass `customerStatus = "delayed"` or
 * `"failed"`. Any other status is a programming error — we log and
 * skip rather than send something the customer doesn't need.
 */
export async function sendCustomerFailureEmail(args: {
  orderId: string;
  businessName: string | null;
  customerEmail: string;
  websiteUrl: string;
  customerStatus: CustomerStatus;
}): Promise<boolean> {
  const { orderId, businessName, customerEmail, websiteUrl, customerStatus } =
    args;

  if (customerStatus !== "delayed" && customerStatus !== "failed") {
    console.warn(
      `[customer-email] refusing to send for orderId=${orderId} status=${customerStatus} (only delayed/failed allowed)`,
    );
    return false;
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn(
      `[customer-email] skipped — RESEND_API_KEY not set (orderId=${orderId} status=${customerStatus})`,
    );
    return false;
  }

  const businessLabel = businessName?.trim() || websiteUrl;
  const copy = customerCopyFor(customerStatus);
  const statusLabel = CUSTOMER_STATUS_LABEL[customerStatus];

  const subject =
    customerStatus === "delayed"
      ? `${statusLabel} — ${businessLabel}`
      : `${statusLabel} — we'll make this right`;

  const textBody = buildPlainText({
    businessLabel,
    websiteUrl,
    customerStatus,
    copy,
  });
  const htmlBody = buildHtml({
    businessLabel,
    websiteUrl,
    customerStatus,
    copy,
  });

  console.log(
    `[customer-email] sending orderId=${orderId} to=${customerEmail} status=${customerStatus} subject="${subject}"`,
  );

  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: customerEmail,
      replyTo: customerSupportEmail(),
      subject,
      text: textBody,
      html: htmlBody,
    });
    if (result.error) {
      console.error(
        `[customer-email] FAILED orderId=${orderId} to=${customerEmail} status=${customerStatus} resendError="${result.error.name}: ${result.error.message}"`,
      );
      return false;
    }
    console.log(
      `[customer-email] SENT orderId=${orderId} to=${customerEmail} status=${customerStatus} resendId=${result.data?.id ?? "unknown"}`,
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[customer-email] FAILED orderId=${orderId} to=${customerEmail} status=${customerStatus} threwException="${message}"`,
    );
    return false;
  }
}

// ────────────────────────────────────────────────────────────
// Copy assembly
// ────────────────────────────────────────────────────────────

function buildPlainText(args: {
  businessLabel: string;
  websiteUrl: string;
  customerStatus: CustomerStatus;
  copy: ReturnType<typeof customerCopyFor>;
}): string {
  const { businessLabel, websiteUrl, copy } = args;
  return [
    `Hi —`,
    "",
    `This is a quick update on your GeoViz AI Visibility Audit for ${businessLabel} (${websiteUrl}).`,
    "",
    copy.body,
    "",
    copy.reassurance,
    "",
    `If you have any questions, just reply to this email.`,
    "",
    `— The GeoViz team`,
  ].join("\n");
}

function buildHtml(args: {
  businessLabel: string;
  websiteUrl: string;
  customerStatus: CustomerStatus;
  copy: ReturnType<typeof customerCopyFor>;
}): string {
  const { businessLabel, websiteUrl, customerStatus, copy } = args;
  const accent = customerStatus === "delayed" ? "#ffc46b" : "#ff7a18";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b0d14;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e8eaf0;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0b0d14;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background:#10131c;border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${accent};">${escapeHtml(CUSTOMER_STATUS_LABEL[customerStatus])}</div>
            <h1 style="margin:14px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">${escapeHtml(copy.heading)}</h1>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.55);">${escapeHtml(businessLabel)} · ${escapeHtml(websiteUrl)}</p>
          </td></tr>
          <tr><td style="padding:20px 32px 8px;font-size:15px;line-height:1.65;color:rgba(255,255,255,0.85);">
            ${escapeHtml(copy.body)}
          </td></tr>
          <tr><td style="padding:14px 32px 28px;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.6);">
            ${escapeHtml(copy.reassurance)}
          </td></tr>
          <tr><td style="padding:0 32px 28px;font-size:13px;color:rgba(255,255,255,0.5);border-top:1px solid rgba(255,255,255,0.06);padding-top:18px;">
            Questions? Just reply to this email and we'll get back to you within one business day.
          </td></tr>
        </table>
        <p style="margin:18px 0 0;font-size:11.5px;color:rgba(255,255,255,0.35);">— The GeoViz team</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
