import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { readApiKey } from "@/lib/validators/apiKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY DIAGNOSTIC ROUTE (added 2026-09-03) — delete once the
 * production-vs-local INSTANTLY_API_KEY mismatch investigation is
 * resolved. Not part of the outbound feature's permanent surface.
 *
 * GET /api/admin/leads/outbound/key-fingerprint — reports, for
 * whichever deployment actually serves this request, a SHA-256
 * fingerprint (first 8 hex chars only) of the INSTANTLY_API_KEY this
 * runtime would actually use, plus Vercel's own auto-injected
 * deployment identity (VERCEL_ENV, VERCEL_URL,
 * VERCEL_GIT_COMMIT_SHA/REF — set automatically on every Vercel
 * deployment, no configuration needed). Comparing this against a
 * same-methodology local fingerprint answers "is production actually
 * running the key I think it is" from ground truth, without ever
 * exposing the key itself.
 *
 * Uses the exact same readApiKey() helper the real InstantlyProvider
 * uses, so the fingerprint reflects exactly what sendLeads() would
 * actually send — never a raw, unvalidated process.env read.
 *
 * Never returns/logs: the API key itself, the full SHA-256 hash
 * (only the first 8 hex chars — plenty to detect "same key" vs
 * "different key" without being reversible or brute-forceable to the
 * original value), or any other secret.
 */
export async function GET(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:outbound:key-fingerprint",
    limit: 20,
    windowMs: 15 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = readApiKey("INSTANTLY_API_KEY");

  return NextResponse.json({
    instantlyKeyPresent: apiKey !== null,
    instantlyKeyLength: apiKey?.length ?? null,
    instantlyKeySha256First8: apiKey
      ? createHash("sha256").update(apiKey).digest("hex").slice(0, 8)
      : null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
  });
}
