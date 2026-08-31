import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { getDiscoveryProvider } from "@/lib/discovery/registry";
import { importDiscoveredBusiness } from "@/lib/leads/dedupe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/leads/discover — the ONE route in this feature that
 * can trigger real external API spend. Two independent guardrails on
 * top of the normal rate limit (which is documented as an in-memory,
 * per-IP, anti-abuse control — NOT a spend guardrail, see
 * src/lib/rate-limit.ts):
 *   1. A hard server-side cap on `limit` per single request
 *      (LEAD_DISCOVERY_MAX_RESULTS, default 200) — not just UI copy.
 *   2. A DB-backed rolling-24h cap on total provider requests across
 *      ALL discovery runs (LEAD_DISCOVERY_MAX_REQUESTS_PER_DAY,
 *      default 50) via the LeadDiscoveryRun audit table — survives
 *      cold starts, unlike the in-memory rate limiter.
 * A LeadDiscoveryRun row is written for every attempt, success or
 * failure, as the audit trail this feature's analytics rely on.
 */

const MAX_RESULTS_DEFAULT = 200;
const MAX_REQUESTS_PER_DAY_DEFAULT = 50;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:discover",
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    provider?: unknown;
    category?: unknown;
    city?: unknown;
    state?: unknown;
    radiusMiles?: unknown;
    limit?: unknown;
  } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    // ignore
  }

  const providerName = typeof body.provider === "string" ? body.provider : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const state = typeof body.state === "string" ? body.state.trim() : undefined;
  const radiusMiles =
    typeof body.radiusMiles === "number" && Number.isFinite(body.radiusMiles)
      ? Math.max(1, Math.round(body.radiusMiles))
      : undefined;
  const requestedLimit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.round(body.limit)
      : 0;

  if (!category || !city) {
    return NextResponse.json(
      { error: "category and city are required" },
      { status: 400 },
    );
  }
  if (requestedLimit <= 0) {
    return NextResponse.json({ error: "limit must be a positive number" }, { status: 400 });
  }

  const maxResults = envInt("LEAD_DISCOVERY_MAX_RESULTS", MAX_RESULTS_DEFAULT);
  const limit = Math.min(requestedLimit, maxResults);

  const provider = getDiscoveryProvider(providerName);
  if (!provider || !provider.enabled()) {
    return NextResponse.json(
      {
        error: provider
          ? "This discovery provider is not configured (missing API key)."
          : "Unknown discovery provider.",
      },
      { status: 409 },
    );
  }

  // Guardrail 2 — rolling-24h cap on total provider requests across
  // all discovery runs, DB-backed so it survives cold starts.
  const maxRequestsPerDay = envInt(
    "LEAD_DISCOVERY_MAX_REQUESTS_PER_DAY",
    MAX_REQUESTS_PER_DAY_DEFAULT,
  );
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const recentRuns = await prisma.leadDiscoveryRun.aggregate({
    where: { createdAt: { gte: since } },
    _sum: { providerRequestCount: true },
  });
  const requestsInLast24h = recentRuns._sum.providerRequestCount ?? 0;
  if (requestsInLast24h >= maxRequestsPerDay) {
    return NextResponse.json(
      {
        error: `Daily discovery request cap reached (${requestsInLast24h}/${maxRequestsPerDay} in the last 24h). Try again later or raise LEAD_DISCOVERY_MAX_REQUESTS_PER_DAY.`,
      },
      { status: 429 },
    );
  }

  console.log(
    `[admin-leads] discover starting provider=${providerName} category="${category}" city="${city}" limit=${limit}`,
  );

  const result = await provider.discoverBusinesses({
    category,
    city,
    state,
    radiusMiles,
    limit,
  });

  let imported = 0;
  let matched = 0;
  for (const record of result.records.slice(0, limit)) {
    try {
      const outcome = await importDiscoveredBusiness(record);
      if (outcome.matched) matched += 1;
      else imported += 1;
    } catch (err) {
      console.error(
        `[admin-leads] discover import failed provider=${providerName} providerId=${record.providerId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await prisma.leadDiscoveryRun.create({
    data: {
      provider: providerName,
      industry: category,
      city,
      state: state ?? null,
      radiusMiles: radiusMiles ?? null,
      requestedCount: requestedLimit,
      providerRequestCount: result.providerRequestCount,
      resultCount: result.records.length,
    },
  });

  console.log(
    `[admin-leads] discover done provider=${providerName} requested=${requestedLimit} resultCount=${result.records.length} imported=${imported} matched=${matched} providerRequestCount=${result.providerRequestCount}${result.error ? ` error="${result.error}"` : ""}`,
  );

  return NextResponse.json({
    requested: requestedLimit,
    resultCount: result.records.length,
    imported,
    matched,
    providerRequestCount: result.providerRequestCount,
    providerError: result.error ?? null,
  });
}
