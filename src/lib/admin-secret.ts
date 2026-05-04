/**
 * Auth helper for the GEO-fulfillment admin pages and routes.
 *
 * Pages: read `?key=...` from searchParams and call `isValidAdminKey`.
 * Routes: accept the secret via the `x-admin-secret` header OR `?key=` query.
 *
 * Returns true only when ADMIN_SECRET is configured AND the supplied value
 * matches. A constant-time compare keeps the route from leaking timing info.
 */
import { timingSafeEqual } from "node:crypto";

export function isValidAdminKey(supplied: string | undefined | null): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected || expected.length === 0) return false;
  if (!supplied || supplied.length === 0) return false;
  // timingSafeEqual requires equal-length buffers — pad/truncate both to the
  // same length so we never short-circuit on a length mismatch.
  const len = Math.max(expected.length, supplied.length);
  const a = Buffer.alloc(len);
  const b = Buffer.alloc(len);
  a.write(expected);
  b.write(supplied);
  try {
    return timingSafeEqual(a, b) && expected.length === supplied.length;
  } catch {
    return false;
  }
}

export function readAdminKeyFromRequest(req: Request): string | null {
  const header = req.headers.get("x-admin-secret");
  if (header) return header;
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("key");
    if (q) return q;
  } catch {
    // ignore
  }
  return null;
}
