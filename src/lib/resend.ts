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
// The placeholder is intentionally invalid (`geoviz.local`) and is ONLY ever
// resolved in non-production environments. Production deploys MUST set
// `RESEND_EMAIL_FROM` (or one of the legacy fallbacks) to a verified domain
// sender (e.g., `GeoViz <reports@yourdomain>`); see LAUNCH_CHECKLIST.md.
//
// Pre-launch hardening (PR #23): production with NO FROM env now throws at
// module-load instead of warning-and-continuing. The previous warn-mode
// silently shipped through and only surfaced when Resend rejected the
// first delivery attempt — making the first paid customer the diagnostic
// event. The throw moves the failure to module-load so Vercel surfaces it
// during the deploy or the first request that exercises this module.
const PLACEHOLDER_FROM = "GeoViz <orders@geoviz.local>";

const _resolvedFromEnv =
  process.env.RESEND_EMAIL_FROM ??
  process.env.EMAIL_FROM ??
  process.env.RESEND_FROM_EMAIL ??
  null;

if (process.env.NODE_ENV === "production" && !_resolvedFromEnv) {
  throw new Error(
    "[resend] No FROM email configured in production. Set one of " +
      "RESEND_EMAIL_FROM, EMAIL_FROM, or RESEND_FROM_EMAIL on the " +
      "production deploy (e.g. `GeoViz <reports@yourdomain>`). See " +
      ".env.example.",
  );
}

export const FROM_EMAIL = _resolvedFromEnv ?? PLACEHOLDER_FROM;

export const ADMIN_NOTIFY_EMAIL =
  process.env.ADMIN_NOTIFY_EMAIL ?? process.env.EMAIL_TO;
