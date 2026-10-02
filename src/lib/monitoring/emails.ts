/**
 * Monitoring welcome email — the customer's link to their status page.
 * Sent at most once per subscription (claimed atomically by the webhook).
 */
import { getResend } from "@/lib/resend";

import type { MonitoringSubscriptionRecord } from "./types";

const FROM_FALLBACK = "GeoViz <orders@mail.geoviz.ai>";

function fromEmail(): string {
  const env = process.env.RESEND_EMAIL_FROM?.trim();
  return env && env.length > 0 ? env : FROM_FALLBACK;
}

export function statusPageUrl(baseUrl: string, sub: Pick<MonitoringSubscriptionRecord, "accessToken">): string {
  return `${baseUrl.replace(/\/+$/, "")}/monitoring/${sub.accessToken}`;
}

export function buildWelcomeEmail(baseUrl: string, sub: MonitoringSubscriptionRecord) {
  const url = statusPageUrl(baseUrl, sub);
  const site = sub.businessName || sub.websiteUrl;
  return {
    subject: `Your GeoViz AI visibility monitoring is active — ${site}`,
    text: [
      `Monitoring is active for ${sub.websiteUrl}.`,
      "",
      "Your first monitoring audit is being prepared. Every audit is reviewed before delivery,",
      "and each new report is compared with your previous one so you can see what changed.",
      "",
      `Your monitoring page (bookmark it — it is private to you): ${url}`,
      "",
      "From that page you can see your subscription status, the next scheduled audit, your",
      "latest and previous AI Visibility Score, open every completed report, and manage or",
      "cancel billing through Stripe.",
      "",
      "Scores are directional measurements of AI readability and trust signals, not a",
      "guarantee of rankings or AI recommendations.",
      "",
      "— GeoViz",
    ].join("\n"),
  };
}

export async function sendMonitoringWelcomeEmail(baseUrl: string, sub: MonitoringSubscriptionRecord): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[monitoring] RESEND_API_KEY unset — welcome email for ${sub.id} not sent`);
    return;
  }
  const { subject, text } = buildWelcomeEmail(baseUrl, sub);
  await getResend().emails.send({ from: fromEmail(), to: sub.email, subject, text });
}
