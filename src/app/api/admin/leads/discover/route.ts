import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { getDiscoveryProvider } from "@/lib/discovery/registry";
import { importDiscoveredBusiness } from "@/lib/leads/dedupe";
import { filterDiscoveryRecords } from "@/lib/leads/discoveryFilters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Outscraper's bounded poll (see src/lib/discovery/providers/outscraper.ts,
// OUTSCRAPER_POLL_BUDGET_MS, default 180s as of 2026-09-02) can take up
// to ~180s inside discoverBusinesses() before this route even starts
// importing. 220 = 20s submit worst case + 180s poll worst case + ~20s
// headroom for the filter/import/dedupe loop and the LeadDiscoveryRun
// write. Keep this in sync if OUTSCRAPER_POLL_BUDGET_MS is ever raised.
export const maxDuration = 220;

const MAX_STORED_ERRORS = 20;
// How long a PENDING run is treated as "still genuinely in flight" for
// the duplicate-job guard below — comfortably longer than the poll
// budget so it only ever catches a real overlapping job, not a run
// that simply finished (successfully or not) after GeoViz stopped
// watching it.
const PENDING_RUN_STALE_MS_DEFAULT = 15 * 60_000;

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
    resumeRunId?: unknown;
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
  const resumeRunId = typeof body.resumeRunId === "string" && body.resumeRunId ? body.resumeRunId : null;

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

  let run: Awaited<ReturnType<typeof prisma.leadDiscoveryRun.findUnique>>;

  if (resumeRunId) {
    // ── Resume path — never resubmits; only continues polling a job
    // GeoViz already knows about (see resumeDiscovery() on the
    // provider). Daily-spend cap and duplicate-job guard below don't
    // apply here — this IS the guarded, already-approved job.
    run = await prisma.leadDiscoveryRun.findUnique({ where: { id: resumeRunId } });
    if (!run) {
      return NextResponse.json({ error: "resumeRunId not found" }, { status: 404 });
    }
    if (run.providerJobStatus !== "PENDING" || !run.providerJobId) {
      return NextResponse.json(
        { error: "This run has no pending provider job to resume (already finished, failed, or never had one)." },
        { status: 400 },
      );
    }
    if (!provider.resumeDiscovery) {
      return NextResponse.json(
        { error: "This provider does not support resuming a job." },
        { status: 400 },
      );
    }
  } else {
    // ── Fresh submit path — guardrails against runaway spend / duplicate jobs ──

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

    // Guardrail 3 (new) — never submit a second job for a query that
    // still has one genuinely in flight. Heuristic identity match on
    // (provider, industry, city, state, radiusMiles) — not
    // requestedCount, since re-running "the same search" for a
    // different count is still the same underlying job to wait for.
    const staleWindowMs = envInt("OUTSCRAPER_PENDING_RUN_STALE_MS", PENDING_RUN_STALE_MS_DEFAULT);
    const pendingSince = new Date(Date.now() - staleWindowMs);
    const inFlight = await prisma.leadDiscoveryRun.findFirst({
      where: {
        provider: providerName,
        industry: category,
        city,
        state: state ?? null,
        radiusMiles: radiusMiles ?? null,
        providerJobStatus: "PENDING",
        createdAt: { gte: pendingSince },
      },
      orderBy: { createdAt: "desc" },
    });
    if (inFlight) {
      return NextResponse.json(
        {
          error: `A search for this exact query is still processing (started ${inFlight.createdAt.toISOString()}). Resume it instead of starting a new one.`,
          runId: inFlight.id,
          providerJobId: inFlight.providerJobId,
        },
        { status: 409 },
      );
    }

    // Create the audit row UP FRONT (not after the provider call, as
    // before) so the provider job id can be persisted the instant
    // it's known — durable even if this request is later killed
    // mid-poll by the platform's own function-duration limit.
    run = await prisma.leadDiscoveryRun.create({
      data: {
        provider: providerName,
        industry: category,
        city,
        state: state ?? null,
        radiusMiles: radiusMiles ?? null,
        requestedCount: requestedLimit,
        providerRequestCount: 0,
      },
    });
  }

  const runId = run.id;
  console.log(
    `[admin-leads] discover ${resumeRunId ? "resuming" : "starting"} provider=${providerName} category="${category}" city="${city}" limit=${limit} runId=${runId}`,
  );

  const result = resumeRunId
    ? await provider.resumeDiscovery!(run.providerJobId!)
    : await provider.discoverBusinesses(
        { category, city, state, radiusMiles, limit },
        {
          onJobAccepted: async (jobId) => {
            await prisma.leadDiscoveryRun.update({
              where: { id: runId },
              data: { providerJobId: jobId, providerJobStatus: "PENDING" },
            });
          },
        },
      );

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

  // Additive onto whatever the run already recorded — matters for
  // resume, where the original submit+poll requests must not be lost
  // from the rolling-24h spend guardrail above.
  const totalProviderRequestCount = (run.providerRequestCount ?? 0) + result.providerRequestCount;

  await prisma.leadDiscoveryRun.update({
    where: { id: runId },
    data: {
      providerRequestCount: totalProviderRequestCount,
      resultCount: result.records.length,
      newLeadsCreated: imported,
      matchedExistingCount: matched,
      filteredOutCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      providerJobId: result.providerJobId ?? run.providerJobId,
      providerJobStatus: result.providerJobStatus ?? run.providerJobStatus,
    },
  });

  console.log(
    `[admin-leads] discover done provider=${providerName} runId=${runId} requested=${requestedLimit} resultCount=${result.records.length} filteredOut=${filteredOutCount} imported=${imported} matched=${matched} addedToList=${addedToList} providerRequestCount=${totalProviderRequestCount}${result.error ? ` error="${result.error}"` : ""}`,
  );

  return NextResponse.json({
    requested: requestedLimit,
    resultCount: result.records.length,
    filteredOutCount,
    imported,
    matched,
    addedToList,
    errorCount: errors.length,
    providerRequestCount: totalProviderRequestCount,
    providerError: result.error ?? null,
    runId,
    providerJobId: result.providerJobId ?? null,
    providerJobStatus: result.providerJobStatus ?? null,
    resumable: result.providerJobStatus === "PENDING",
  });
}
