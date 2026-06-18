/* eslint-disable no-console */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Lightweight in-memory rate limiter used at the top of expensive /
 * sensitive route handlers. Designed for the GeoViz launch MVP and
 * NOT for a global multi-instance production deployment:
 *
 *   • State lives in a process-local `Map`. On Vercel each function
 *     instance keeps its own bucket; an attacker fanning across
 *     instances may exceed the per-IP limit slightly. Acceptable for
 *     MVP — the goal is to stop accidental loops and casual abuse,
 *     not state-actor evasion.
 *   • Cleared on cold start. Cold-start re-windowing is fine for the
 *     short windows used here (5–10 min).
 *   • Fixed window (not sliding) — simplest correct primitive at this
 *     scale and easy to reason about for the windows we're using.
 *
 * If/when traffic justifies it, swap the `buckets` Map for an
 * Upstash/Redis-backed store behind the same `checkRateLimit`
 * signature — no caller changes required.
 *
 * What this NEVER logs:
 *   • Full client IPs. IPs are SHA-256-hashed and truncated to 12 hex
 *     chars before any log or bucket key derivation. The raw IP never
 *     leaves the helper.
 *   • Admin secrets, report tokens, Stripe session IDs, customer
 *     emails, business names, score values, report markdown. Callers
 *     pass only a short `routeKey` plus the (already-hashed) IP.
 *
 * Routes this is NOT used on (deliberate exclusions):
 *   • `/api/stripe/webhook` — Stripe retries failed deliveries; a 429
 *     from a shared-tenancy webhook IP could lock us out of a real
 *     payment event. Trust Stripe's own delivery infrastructure.
 *   • `/sample-report` and `/sample-report/[slug]` — public marketing
 *     surfaces, no per-user state, intentionally crawlable.
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_STALE_AFTER_MS = 30 * 60_000;

function maybeCleanup(now: number): void {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [key, b] of buckets) {
    if (now - b.windowStart > CLEANUP_STALE_AFTER_MS) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
};

/**
 * Returns whether a hit on `bucketKey` is allowed under
 * (`limit` / `windowMs`). On the first hit in a window, the bucket
 * is created and counted. On exhaustion, returns `allowed: false`
 * with a `retryAfterSec` for the caller's `Retry-After` header.
 */
export function checkRateLimit(
  bucketKey: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  maybeCleanup(now);
  let b = buckets.get(bucketKey);
  if (!b || now - b.windowStart >= windowMs) {
    b = { count: 0, windowStart: now };
    buckets.set(bucketKey, b);
  }
  if (b.count >= limit) {
    const resetAt = b.windowStart + windowMs;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }
  b.count += 1;
  return {
    allowed: true,
    remaining: limit - b.count,
    resetAt: b.windowStart + windowMs,
    retryAfterSec: 0,
  };
}

/**
 * Extracts the client's IP from common proxy headers. Returns the
 * raw string only inside this module — callers receive the hashed
 * form via `hashClientIp` so no raw IP ever flows back into a route.
 *
 * Order of preference matches what Vercel and Railway forward:
 *   1. `x-forwarded-for` (first hop).
 *   2. `x-real-ip`.
 *   3. Literal `"unknown"` so unknown-IP traffic shares a single
 *      bucket — a known-IP attacker can't bypass the limit by
 *      stripping headers.
 */
function readClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = headers.get("x-real-ip");
  if (xri) {
    const trimmed = xri.trim();
    if (trimmed) return trimmed;
  }
  return "unknown";
}

/**
 * SHA-256 → first 12 hex chars. Stable across requests from the same
 * IP, opaque enough to safely log and to use as the per-IP bucket
 * dimension. 48 bits is more than enough to disambiguate IPs at the
 * scale this MVP serves.
 */
export function hashClientIp(rawIp: string): string {
  return createHash("sha256").update(rawIp).digest("hex").slice(0, 12);
}

/**
 * Pulls the client IP from a request's headers and hashes it. Pure
 * convenience for the API/page wrappers below.
 */
export function clientIpHashFromHeaders(headers: Headers): string {
  return hashClientIp(readClientIp(headers));
}

function logRateLimitBlock(opts: {
  routeKey: string;
  ipHash: string;
  limit: number;
  windowMs: number;
  retryAfterSec: number;
  reason: string;
}): void {
  console.warn(
    `[rate-limit] route=${opts.routeKey} ipHash=${opts.ipHash} limit=${opts.limit} windowMs=${opts.windowMs} retryAfterSec=${opts.retryAfterSec} outcome=blocked reason=${opts.reason}`,
  );
}

/**
 * One-stop wrapper for **API** routes. Call at the top of a route
 * handler; if it returns a `NextResponse` you must return it
 * immediately — the request has been throttled. If it returns `null`
 * the request is allowed; continue normally.
 *
 *   const limited = applyApiRateLimit({ req, routeKey: "api:pdf",
 *     limit: 5, windowMs: 5 * 60_000 });
 *   if (limited) return limited;
 *
 * The 429 body is customer-safe copy (no raw "Too many requests."):
 *   `"We're processing a few audits right now. Please wait a moment
 *   and try again."` plus a `support` contact, a `retryAfterSec`
 * field, and a real `Retry-After` HTTP header so well-behaved clients
 * back off automatically.
 */
export function applyApiRateLimit(opts: {
  req: Request;
  routeKey: string;
  limit: number;
  windowMs: number;
}): NextResponse | null {
  const ipHash = clientIpHashFromHeaders(opts.req.headers);
  const result = checkRateLimit(
    `${opts.routeKey}:${ipHash}`,
    opts.limit,
    opts.windowMs,
  );
  if (result.allowed) return null;
  logRateLimitBlock({
    routeKey: opts.routeKey,
    ipHash,
    limit: opts.limit,
    windowMs: opts.windowMs,
    retryAfterSec: result.retryAfterSec,
    reason: "over_limit",
  });
  return NextResponse.json(
    {
      error:
        "We're processing a few audits right now. Please wait a moment and try again.",
      retryAfterSec: result.retryAfterSec,
      support: "support@geoviz.ai",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSec),
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * One-stop wrapper for **page** server components. Call at the top of
 * a page; check `blocked`. If true, render the branded
 * `<RateLimitedNotice>` component instead of report content. The
 * response itself stays HTTP 200 (Next.js page components can't easily
 * set a non-2xx status); browser-only clients see the branded notice
 * either way, and machine clients aren't expected on these pages.
 */
export function checkPageRateLimit(opts: {
  headers: Headers;
  routeKey: string;
  limit: number;
  windowMs: number;
}): { blocked: boolean; retryAfterSec: number; ipHash: string } {
  const ipHash = clientIpHashFromHeaders(opts.headers);
  const result = checkRateLimit(
    `${opts.routeKey}:${ipHash}`,
    opts.limit,
    opts.windowMs,
  );
  if (result.allowed) {
    return { blocked: false, retryAfterSec: 0, ipHash };
  }
  logRateLimitBlock({
    routeKey: opts.routeKey,
    ipHash,
    limit: opts.limit,
    windowMs: opts.windowMs,
    retryAfterSec: result.retryAfterSec,
    reason: "over_limit",
  });
  return { blocked: true, retryAfterSec: result.retryAfterSec, ipHash };
}
