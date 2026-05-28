import { NextResponse } from "next/server";

import {
  REPLAY_STATUS_VALUES,
  REPLAY_SORT_KEYS,
  getCalibrationReplayList,
  getCalibrationReplaySummary,
  type ReplaySortKey,
  type ReplaySortOrder,
  type ReplayStatus,
} from "@/lib/calibration/replays";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/calibration/replays
 *
 * Returns the persisted replay-history rows + an aggregate summary
 * for the operator cockpit's <ReplayHistoryPanel />. Pure read; never
 * mutates `CalibrationReplay`. Auth + rate-limit mirror the existing
 * `/api/admin/calibration` route.
 *
 * Query params (all optional):
 *   ?limit=200                   default 100, capped at 500
 *   ?status=stable|...           single replayStatus filter
 *   ?bandChanged=true            only rows where bandChanged=true
 *   ?sort=createdAt|delta|status default createdAt
 *   ?order=asc|desc              default desc
 */
export async function GET(req: Request) {
  // Cockpit polls this every 30s while open. 300/5min covers
  // several concurrent operator sessions without throttling.
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:calibration-replays-list",
    limit: 300,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 0) : undefined;

  const statusRaw = url.searchParams.get("status");
  const status: ReplayStatus | undefined =
    statusRaw && (REPLAY_STATUS_VALUES as readonly string[]).includes(statusRaw)
      ? (statusRaw as ReplayStatus)
      : undefined;

  const bandChangedOnly = url.searchParams.get("bandChanged") === "true";

  const sortRaw = url.searchParams.get("sort");
  const sort: ReplaySortKey | undefined =
    sortRaw && (REPLAY_SORT_KEYS as readonly string[]).includes(sortRaw)
      ? (sortRaw as ReplaySortKey)
      : undefined;

  const orderRaw = url.searchParams.get("order");
  const order: ReplaySortOrder | undefined =
    orderRaw === "asc" || orderRaw === "desc" ? orderRaw : undefined;

  try {
    const rows = await getCalibrationReplayList({
      limit,
      status,
      bandChangedOnly,
      sort,
      order,
    });
    const summary = getCalibrationReplaySummary(rows);
    return NextResponse.json({ rows, summary });
  } catch (err) {
    const e = err as Error;
    console.error(
      `[api:admin:calibration-replays] read failed: ${e.message?.slice(0, 200)}`,
    );
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
