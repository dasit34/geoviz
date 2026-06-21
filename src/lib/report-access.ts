/**
 * Centralized access-control helpers for GeoViz report routes.
 *
 * Auth model (intentionally unchanged by this module):
 *   • Customer report routes — `/report/[id]`, `/report/[id]/print`,
 *     `/api/report/[id]/pdf` — use the 25-char CUID order ID as the
 *     access token. ~120 bits of entropy → URL-as-token is the model.
 *     This is documented in each route's header comment; rotating
 *     away from it would require schema work + invalidating every
 *     email link already delivered to a customer.
 *   • Admin routes — `/admin/reports` and the admin API surfaces —
 *     require `?key=ADMIN_SECRET`. `ADMIN_SECRET` is read at request
 *     time (no module-level cache) so env rotation takes effect on
 *     the next request.
 *   • Sample routes — `/sample-report` and `/sample-report/[slug]` —
 *     are public by design and gated by the `SAMPLE_REGISTRY` slug
 *     whitelist so they can never leak an arbitrary `AuditOrder` row.
 *
 * This module adds two things:
 *   1. `validateAdminAccess(key)` — single source of truth for the
 *      ADMIN_SECRET compare. Length-stable to keep timing oracles off
 *      the table even though the query-param transport already exposes
 *      the secret to anyone with the URL.
 *   2. `logReportAccessAttempt(...)` — structured single-line server
 *      log used by every report route to record the access outcome
 *      (`served` on success; `not_found`, `not_ready`, `render_failed`,
 *      `blocked` otherwise). Never
 *      echoes the secret, the report markdown, the score, or the
 *      customer email — only the route, the order ID (already a CUID
 *      token, never sensitive on its own), and the outcome.
 *
 * Nothing in this module touches the DB, Prisma, Stripe, the worker
 * queue, scoring, the audit prompt, the PDF engine, or any email
 * template. It's a thin policy + telemetry seam.
 */

export type AdminAccessReason =
  | "ok"
  | "server_misconfigured"
  | "missing"
  | "invalid";

export type AdminAccessResult =
  | { ok: true; reason: "ok"; expectedLength: number; receivedLength: number }
  | {
      ok: false;
      reason: Exclude<AdminAccessReason, "ok">;
      expectedLength: number;
      receivedLength: number;
    };

/**
 * Length-stable byte compare. Even though the admin key travels in a
 * URL query parameter (already exposed to anyone with the link), a
 * length-stable compare is cheap insurance against any future temptation
 * to short-circuit a check and accidentally introduce a timing oracle.
 * Returns false when lengths differ — there is no way to leak info from
 * an unequal-length pair in this codebase's call sites.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function validateAdminAccess(
  key: string | string[] | undefined | null,
): AdminAccessResult {
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  const expectedLength = ADMIN_SECRET ? ADMIN_SECRET.length : 0;
  const normalized = Array.isArray(key) ? key[0] : key;
  const receivedLength =
    typeof normalized === "string" ? normalized.length : 0;

  if (!ADMIN_SECRET) {
    return {
      ok: false,
      reason: "server_misconfigured",
      expectedLength,
      receivedLength,
    };
  }
  if (typeof normalized !== "string" || normalized.length === 0) {
    return {
      ok: false,
      reason: "missing",
      expectedLength,
      receivedLength,
    };
  }
  if (!constantTimeEqual(normalized, ADMIN_SECRET)) {
    return {
      ok: false,
      reason: "invalid",
      expectedLength,
      receivedLength,
    };
  }
  return { ok: true, reason: "ok", expectedLength, receivedLength };
}

/**
 * Single structured log line emitted whenever a report-access route
 * decides NOT to serve content. Pure `console.log` / `console.warn` —
 * picked up by Vercel and Railway log collectors with no extra setup.
 * Format is `[report-access] key=val key=val …` so it greps cleanly.
 *
 * What this NEVER logs:
 *   • The admin secret or any portion of it.
 *   • Report markdown, score, business name, or customer email.
 *   • Stack traces (callers pass a short `reason` string instead).
 *
 * What it DOES log:
 *   • `route` — which surface decided to block.
 *   • `orderId` — already a CUID token, public-on-purpose in the URL.
 *   • `outcome` — one of `served` / `not_found` / `not_ready` /
 *     `render_failed` / `blocked`.
 *   • `reason` — caller-supplied short string. For admin blocks this
 *     is the `AdminAccessReason` enum.
 *   • `recvLen` / `expLen` — query-key lengths for admin diagnostics
 *     (length only — never the value).
 */
export function logReportAccessAttempt(args: {
  route: string;
  orderId?: string | null;
  outcome: "not_found" | "not_ready" | "render_failed" | "blocked" | "served";
  reason?: string;
  receivedLength?: number;
  expectedLength?: number;
}): void {
  const parts = [
    "[report-access]",
    `route=${args.route}`,
    `outcome=${args.outcome}`,
  ];
  if (args.orderId) parts.push(`orderId=${args.orderId}`);
  if (args.reason) parts.push(`reason=${args.reason}`);
  if (typeof args.receivedLength === "number") {
    parts.push(`recvLen=${args.receivedLength}`);
  }
  if (typeof args.expectedLength === "number") {
    parts.push(`expLen=${args.expectedLength}`);
  }
  const line = parts.join(" ");
  if (args.outcome === "blocked" || args.outcome === "render_failed") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
