/**
 * Single source of truth for "what URL should links in emails / PDFs use?"
 *
 * Resolution order (first non-empty wins):
 *   1. NEXT_PUBLIC_SITE_URL  — preferred, explicit operator override.
 *   2. SITE_URL              — server-only override.
 *   3. NEXT_PUBLIC_APP_URL   — legacy alias kept for backward compat.
 *   4. (production deploy fallback) PRODUCTION_DOMAIN_FALLBACK
 *      — only when `VERCEL_ENV === "production"` AND none of the env
 *      vars above are set. Prevents preview-style `*.vercel.app` URLs
 *      from leaking into customer / operator emails when the operator
 *      forgot to configure the canonical domain.
 *   5. https://${VERCEL_URL}  — preview / dev deploys only.
 *   6. request origin         — last-resort for non-localhost runtime.
 *   7. http://localhost:3000  — non-production fallback only.
 *
 * Always returns a string with no trailing slash.
 *
 * The production-domain fallback is hardcoded because emails are sent
 * from server functions where there's no way to "discover" the
 * Vercel-attached custom domain at runtime — Vercel's `VERCEL_URL`
 * env always returns the deployment-specific alias, never the custom
 * domain. If the operator deploys to a different production domain
 * later, override via `NEXT_PUBLIC_APP_URL` in Vercel project env.
 */
const PRODUCTION_DOMAIN_FALLBACK = "https://geoviz.ai";

export function resolveAppBaseUrl(req?: Request): string {
  const explicit = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ];
  for (const c of explicit) {
    if (c && c.trim().length > 0) {
      return c.trim().replace(/\/+$/, "");
    }
  }

  // Production deploy with no operator-set URL → use the canonical
  // custom domain instead of leaking a deployment-specific alias or
  // a localhost reference. Catches both Vercel production deploys
  // (`VERCEL_ENV === "production"`) AND the Railway worker
  // (`NODE_ENV === "production"` with no Vercel envs in scope) so
  // operator emails sent from the worker include working URLs.
  // NODE_ENV is cast to `string` because Next.js's build-time global
  // narrows it to `"development" | "test"`; at runtime it's actually
  // "production" in deployed Vercel functions and Railway services.
  const nodeEnv = process.env.NODE_ENV as string | undefined;
  if (process.env.VERCEL_ENV === "production" || nodeEnv === "production") {
    console.warn(
      "[app-url] production runtime with no NEXT_PUBLIC_APP_URL set — falling back to canonical domain. Set NEXT_PUBLIC_APP_URL on Vercel and the Railway worker to override.",
    );
    return PRODUCTION_DOMAIN_FALLBACK;
  }

  // Preview / dev — use whatever Vercel auto-injects (deployment-
  // specific alias for previews, undefined for local dev).
  if (process.env.VERCEL_URL && process.env.VERCEL_URL.trim().length > 0) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/+$/, "")}`;
  }

  if (req) {
    try {
      const origin = new URL(req.url).origin;
      if (origin && !/localhost|127\.0\.0\.1/.test(origin)) {
        return origin.replace(/\/+$/, "");
      }
      if (process.env.NODE_ENV !== "production") {
        return origin.replace(/\/+$/, "");
      }
    } catch {
      // ignore
    }
  }

  return "http://localhost:3000";
}

/**
 * Build the admin-review URL for a specific order. Embeds the
 * `ADMIN_SECRET` query param so the operator can click straight from
 * email → review dashboard. If `ADMIN_SECRET` is unset (mis-configured
 * env), returns the bare URL — operator hits the styled 401 page and
 * sees the diagnostic, which is better than a non-functional link.
 */
export function buildAdminReviewUrl(req?: Request): string {
  const base = resolveAppBaseUrl(req);
  const adminSecret = process.env.ADMIN_SECRET;
  return adminSecret
    ? `${base}/admin/reports?key=${encodeURIComponent(adminSecret)}`
    : `${base}/admin/reports`;
}
