import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Auth helper for the GeoViz fulfillment admin PAGE (`/admin`).
 *
 * This is the `ADMIN_PASSWORD` cookie flow used by the human operator's
 * browser session. (The separate `ADMIN_SECRET` flow in
 * `src/lib/admin-secret.ts` guards the admin API routes / `?key=` and is
 * already constant-time — that file is unchanged.)
 *
 * Hardening (launch readiness §6):
 *   - The login compare is **constant-time** (`verifyAdminPassword`), not a
 *     short-circuiting `!==`.
 *   - The cookie stores a **SHA-256 token derived from the password**
 *     (`adminCookieToken`), never the raw password. A leaked/forged cookie
 *     therefore can't reveal the operator's password (which might be reused
 *     elsewhere), and `isAuthed()` verifies the token in constant time.
 */

export const ADMIN_COOKIE = "geoviz_admin";

export function getAdminPassword(): string | undefined {
  const raw = process.env.ADMIN_PASSWORD;
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Constant-time string equality. False on any length mismatch or error. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * The opaque value stored in the admin cookie: SHA-256(password) hex.
 * Stable for a given `ADMIN_PASSWORD`, verifiable statelessly (no session
 * store needed — fits the serverless MVP), and never the plaintext.
 * Returns null when `ADMIN_PASSWORD` is not configured.
 */
export function adminCookieToken(): string | null {
  const expected = getAdminPassword();
  if (!expected) return null;
  return createHash("sha256").update(expected, "utf8").digest("hex");
}

/** Constant-time check of a supplied login password against ADMIN_PASSWORD. */
export function verifyAdminPassword(supplied: string): boolean {
  const expected = getAdminPassword();
  if (!expected) return false;
  return timingSafeEqualStr(supplied, expected);
}

export function isAuthed(): boolean {
  const token = adminCookieToken();
  if (!token) return false;
  const value = cookies().get(ADMIN_COOKIE)?.value;
  return Boolean(value) && timingSafeEqualStr(value as string, token);
}
