/**
 * Monitoring customer emails — every one carries a single-use sign-in link
 * (never a reusable dashboard URL). The welcome email is sent at most once
 * per subscription (claimed atomically by the webhook).
 *
 * Plain text only. The link's secret is in the URL fragment, so it is
 * never sent to any server when clicked; still, never log `url`.
 */
import { getResend } from "@/lib/resend";

import type { SendLinkArgs } from "./auth/service";
import type { LoginLinkPurpose } from "./auth/tokens";

const FROM_FALLBACK = "GeoViz <orders@mail.geoviz.ai>";

function fromEmail(): string {
  const env = process.env.RESEND_EMAIL_FROM?.trim();
  return env && env.length > 0 ? env : FROM_FALLBACK;
}

function signInPageUrl(linkUrl: string): string {
  return `${new URL(linkUrl).origin}/monitoring/sign-in`;
}

const VALIDITY: Record<LoginLinkPurpose, string> = {
  welcome: "24 hours",
  sign_in: "15 minutes",
  admin: "24 hours",
};

export function buildSignInEmail(args: SendLinkArgs): { subject: string; text: string } {
  const validity = VALIDITY[args.purpose];
  const linkBlock = [
    `Sign in: ${args.url}`,
    "",
    `This link works once and expires in ${validity}. After that, request a new one at`,
    `${signInPageUrl(args.url)} — enter this email address and we'll send a fresh link.`,
  ];
  if (args.purpose === "welcome") {
    return {
      subject: "Your GeoViz AI visibility monitoring is active — sign in",
      text: [
        "Your GeoViz AI visibility monitoring is active.",
        "",
        "Your first monitoring audit is being prepared. Every audit is reviewed before delivery,",
        "and each new report is compared with your previous one so you can see what changed.",
        "",
        ...linkBlock,
        "",
        "Once signed in you can see your monitoring results, tracked questions, competitors,",
        "reports, and business settings, and manage or cancel billing through Stripe.",
        "",
        "Scores are directional measurements of AI readability and trust signals, not a",
        "guarantee of rankings or AI recommendations.",
        "",
        "— GeoViz",
      ].join("\n"),
    };
  }
  return {
    subject: "Your GeoViz sign-in link",
    text: [
      "Here is your link to sign in to GeoViz AI visibility monitoring.",
      "",
      ...linkBlock,
      "",
      "If you didn't ask to sign in, you can ignore this email — nobody can sign in without it.",
      "",
      "— GeoViz",
    ].join("\n"),
  };
}

export async function sendMonitoringSignInEmail(args: SendLinkArgs): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[monitoring-auth] RESEND_API_KEY unset — ${args.purpose} sign-in email not sent`);
    return;
  }
  const { subject, text } = buildSignInEmail(args);
  const result = await getResend().emails.send({ from: fromEmail(), to: args.to, subject, text });
  if (result.error) throw new Error(`resend: ${result.error.message}`);
  console.log(`[monitoring-auth] ${args.purpose} link emailed resendId=${result.data?.id ?? "?"}`);
}
