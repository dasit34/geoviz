import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/launch-validation
 *
 * Reads launch-loop-state.json from the project root (written by
 * `npm run launch:loop`) and returns it as structured JSON for the
 * Report QA dashboard.
 *
 * No DB queries, no rerunning validation — the script is the single
 * source of truth.
 *
 * Auth: x-admin-secret header or ?key= query param.
 */

const STATE_PATH = join(process.cwd(), "launch-loop-state.json");

export async function GET(request: Request) {
  const limited = applyApiRateLimit({
    req: request,
    routeKey: "api:admin:launch-validation",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  const key = readAdminKeyFromRequest(request);
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = readFileSync(STATE_PATH, "utf-8");
    const state = JSON.parse(raw);
    return NextResponse.json({ exists: true, state });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
