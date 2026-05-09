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

// Resolution order: canonical → legacy → env-validator-required → placeholder.
// The placeholder is intentionally invalid (`geoviz.local`) so a misconfigured
// environment fails loud at Resend rather than silently shipping from a
// look-alike address. Production must set `RESEND_EMAIL_FROM` to a verified
// domain sender (e.g., `GeoViz <reports@yourdomain>`); see LAUNCH_CHECKLIST.md.
export const FROM_EMAIL =
  process.env.RESEND_EMAIL_FROM ??
  process.env.EMAIL_FROM ??
  process.env.RESEND_FROM_EMAIL ??
  "GeoViz <orders@geoviz.local>";

if (
  process.env.NODE_ENV === "production" &&
  !process.env.RESEND_EMAIL_FROM &&
  !process.env.EMAIL_FROM &&
  !process.env.RESEND_FROM_EMAIL
) {
  // Surface the misconfig at module-load time so it shows up in the
  // first request's log, not buried in an Resend "domain not verified"
  // 422 ten requests later.
  console.warn(
    "[resend] WARNING — no FROM email env set in production. Falling back to placeholder; Resend will reject sends.",
  );
}

export const ADMIN_NOTIFY_EMAIL =
  process.env.ADMIN_NOTIFY_EMAIL ?? process.env.EMAIL_TO;
