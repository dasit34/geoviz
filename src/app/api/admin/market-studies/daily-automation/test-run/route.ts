import { NextResponse } from "next/server";

import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { runManualTestKickoff } from "@/lib/market-studies/automation/runTick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 220; // same discovery-poll ceiling as /api/admin/leads/discover

type PostBody = {
  businessCount?: unknown;
  industry?: unknown;
  city?: unknown;
  state?: unknown;
};

/**
 * POST /api/admin/market-studies/daily-automation/test-run
 *
 * Runs a REAL but small (2–5 business) daily-automation kickoff on
 * demand, without waiting for the schedule. Exercises the exact same
 * discover → qualify → exclude → enqueue path the daily cron uses —
 * it is not a mock. Safe to run against production:
 *   - Never touches Instantly (the kickoff path has no outbound call
 *     anywhere in it — see `runTick.ts`'s doc comment).
 *   - Businesses land as normal `Lead` rows (`status: "NEW"` or
 *     qualified) and a normal `MarketStudy`, visible at
 *     `/admin/market-studies/{studyId}`.
 *   - The created `MarketStudyAutomationRun` is flagged
 *     `isManualTest: true` and uses a full-precision `runDate`, so it
 *     never collides with (or consumes) the real daily run's unique
 *     "one per calendar day" slot.
 */
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:market-studies:daily-automation:test-run",
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (limited) return limited;
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody = {};
  try {
    body = (await req.json().catch(() => ({}))) as PostBody;
  } catch {
    // ignore — defaults below
  }

  const rawCount = typeof body.businessCount === "number" ? body.businessCount : 2;
  const businessCount = Math.min(5, Math.max(2, Math.floor(rawCount) || 2));
  const industry = typeof body.industry === "string" && body.industry.trim() ? body.industry.trim() : undefined;
  const city = typeof body.city === "string" && body.city.trim() ? body.city.trim() : undefined;
  const state = typeof body.state === "string" && body.state.trim() ? body.state.trim() : undefined;

  const result = await runManualTestKickoff({ businessCount, industry, city, state });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    runId: result.runId,
    studyId: result.studyId,
    studyUrl: result.studyId ? `/admin/market-studies/${result.studyId}` : null,
    note: "Audits are queued on the existing worker queue — they will complete within a few minutes, same as any Market Study batch. No outreach email can be sent from this test.",
  });
}
