import { Resend } from "resend";

let cached: Resend | null = null;

export function getResend(): Resend {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }
  cached = new Resend(apiKey);
  return cached;
}

export function isResendConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      (process.env.ADMIN_NOTIFY_EMAIL || process.env.EMAIL_TO),
  );
}

export const FROM_EMAIL =
  process.env.EMAIL_FROM ??
  process.env.RESEND_FROM_EMAIL ??
  "GeoViz <orders@geoviz.local>";

export const ADMIN_NOTIFY_EMAIL =
  process.env.ADMIN_NOTIFY_EMAIL ?? process.env.EMAIL_TO;
