/**
 * Auth helper for the GEO-fulfillment admin pages and routes.
 *
 * Pages: read `?key=...` from searchParams and call `isValidAdminKey` (or
 *   `checkAdminKey` for richer diagnostics on the Unauthorized screen).
 * Routes: accept the secret via the `x-admin-secret` header OR `?key=`
 *   query (see `readAdminKeyFromRequest`).
 *
 * Returns true only when ADMIN_SECRET is configured AND the supplied
 * value matches. Both sides are trimmed first — env loaders sometimes
 * append a stray newline, and pasted URLs sometimes carry trailing
 * whitespace. The compare itself is constant-time.
 */
import { timingSafeEqual } from "node:crypto";
import { isAuthed } from "@/lib/admin-auth";

export type AdminKeyCheck = {
  /** True when ADMIN_SECRET is set on the server. */
  configured: boolean;
  /** Length of the trimmed expected key (0 when not configured). */
  expectedLength: number;
  /** Length of the trimmed supplied key (0 when missing). */
  receivedLength: number;
  /** True only on a successful constant-time match. */
  ok: boolean;
};

function coerceSupplied(
  supplied: string | string[] | undefined | null,
): string {
  if (supplied === undefined || supplied === null) return "";
  if (Array.isArray(supplied)) return (supplied[0] ?? "").trim();
  return supplied.trim();
}

export function checkAdminKey(
  supplied: string | string[] | undefined | null,
): AdminKeyCheck {
  const expected = (process.env.ADMIN_SECRET ?? "").trim();
  const received = coerceSupplied(supplied);
  const configured = expected.length > 0;
  const expectedLength = expected.length;
  const receivedLength = received.length;

  if (!configured || receivedLength === 0) {
    return { configured, expectedLength, receivedLength, ok: false };
  }
  if (expectedLength !== receivedLength) {
    return { configured, expectedLength, receivedLength, ok: false };
  }

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  let ok = false;
  try {
    // Buffer.from(utf8) can produce different lengths than the string
    // when characters are multi-byte. Defend against that explicitly.
    ok = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    ok = false;
  }
  return { configured, expectedLength, receivedLength, ok };
}

export function isValidAdminKey(
  supplied: string | string[] | undefined | null,
): boolean {
  return checkAdminKey(supplied).ok;
}

/**
 * Admin-or-authenticated check for page Server Components (not route
 * handlers — see `applyAdminApiRateLimit` in `src/lib/rate-limit.ts` for
 * that side). True when either the operator is logged into `/admin` via
 * the `geoviz_admin` cookie (`isAuthed()`), or a valid `?key=` was
 * supplied. Used to exempt real admin traffic from the public
 * `checkPageRateLimit` throttle — see `src/app/admin/reports/page.tsx`,
 * `src/app/admin/report-qa/page.tsx`, `src/app/report/[id]/page.tsx`,
 * `src/app/report/[id]/print/page.tsx`.
 */
export function isAdminPageRequest(opts: {
  key?: string | string[] | null;
}): boolean {
  if (isAuthed()) return true;
  return isValidAdminKey(opts.key);
}

export function readAdminKeyFromRequest(req: Request): string | null {
  const header = req.headers.get("x-admin-secret");
  if (header) return header.trim();
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("key");
    if (q) return q.trim();
  } catch {
    // ignore
  }
  return null;
}
