import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { getDiscoveryProvider } from "@/lib/discovery/registry";
import { importDiscoveredBusiness } from "@/lib/leads/dedupe";
import { filterDiscoveryRecords } from "@/lib/leads/discoveryFilters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Outscraper's bounded poll (see src/lib/discovery/providers/outscraper.ts)
// can take up to ~50s inside discoverBusinesses() before this route even
// starts importing — give the whole request room to finish.
export const maxDuration = 90;

const MAX_STORED_ERRORS = 20;

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
    minReviews?: unknown;
    minRating?: unknown;
    mustHaveWebsite?: unknown;
    leadListId?: unknown;
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
  const minReviews =
    typeof body.minReviews === "number" && Number.isFinite(body.minReviews)
      ? Math.max(0, Math.round(body.minReviews))
      : null;
  const minRating =
    typeof body.minRating === "number" && Number.isFinite(body.minRating)
      ? body.minRating
      : null;
  const mustHaveWebsite = body.mustHaveWebsite === true;
  const leadListId = typeof body.leadListId === "string" ? body.leadListId : null;

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

  if (leadListId) {
    const list = await prisma.leadList.findUnique({ where: { id: leadListId } });
    if (!list) {
      return NextResponse.json({ error: "leadListId not found" }, { status: 404 });
    }
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

  const { passed, filteredOutCount } = filterDiscoveryRecords(
    result.records.slice(0, limit),
    { minReviews, minRating, mustHaveWebsite },
  );

  let imported = 0;
  let matched = 0;
  let addedToList = 0;
  const errors: { message: string }[] = [];
  for (const record of passed) {
    try {
      const outcome = await importDiscoveredBusiness(record);
      if (outcome.matched) matched += 1;
      else imported += 1;

      if (leadListId) {
        await prisma.leadListMembership.upsert({
          where: { leadId_leadListId: { leadId: outcome.lead.id, leadListId } },
          create: { leadId: outcome.lead.id, leadListId },
          update: {},
        });
        addedToList += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[admin-leads] discover import failed provider=${providerName} providerId=${record.providerId}: ${message}`,
      );
      if (errors.length < MAX_STORED_ERRORS) errors.push({ message: message.slice(0, 300) });
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
      newLeadsCreated: imported,
      matchedExistingCount: matched,
      filteredOutCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  console.log(
    `[admin-leads] discover done provider=${providerName} requested=${requestedLimit} resultCount=${result.records.length} filteredOut=${filteredOutCount} imported=${imported} matched=${matched} addedToList=${addedToList} providerRequestCount=${result.providerRequestCount}${result.error ? ` error="${result.error}"` : ""}`,
  );

  return NextResponse.json({
    requested: requestedLimit,
    resultCount: result.records.length,
    filteredOutCount,
    imported,
    matched,
    addedToList,
    errorCount: errors.length,
    providerRequestCount: result.providerRequestCount,
    providerError: result.error ?? null,
  });
}
