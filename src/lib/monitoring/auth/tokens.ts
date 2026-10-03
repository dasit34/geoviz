/**
 * Monitoring customer login — secret + hashing primitives (pure).
 *
 * Every credential (emailed link, session cookie) is a 256-bit random
 * secret. Only its SHA-256 is stored, so a database read can't be replayed
 * as a login. Secrets are never logged; the emailed link carries the
 * secret in the URL FRAGMENT (`#t=…`), which browsers never send to a
 * server, never put in a Referer header, and which never appears in
 * request logs.
 */
import { createHash, randomBytes } from "node:crypto";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type LoginLinkPurpose = "welcome" | "sign_in" | "admin";

/** Lifetime of each kind of emailed link. All are single use. */
export const LINK_TTL_MS: Record<LoginLinkPurpose, number> = {
  welcome: 24 * HOUR,
  sign_in: 15 * MINUTE,
  admin: 24 * HOUR,
};

/** Absolute session lifetime (no sliding renewal). */
export const SESSION_TTL_MS = 30 * DAY;

/** lastSeenAt is refreshed at most this often (keeps reads cheap). */
export const SESSION_TOUCH_INTERVAL_MS = 5 * MINUTE;

const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function isWellFormedSecret(value: unknown): value is string {
  return typeof value === "string" && SECRET_PATTERN.test(value);
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Rate-limit bucket key — hashed, so no raw email or IP is ever stored. */
export function rateLimitKey(scope: string, value: string): string {
  return `${scope}:${createHash("sha256").update(`${scope}|${value}`, "utf8").digest("hex").slice(0, 32)}`;
}
