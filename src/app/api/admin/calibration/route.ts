import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { parseReportScoreBreakdown } from "@/lib/parse-report";
import {
  CALIBRATION_PREFIX,
  parseCalibrationNotes,
  stringifyCalibrationNotes,
} from "@/lib/calibration";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/calibration             — list every calibration run
 * POST /api/admin/calibration             — queue a batch of URLs
 *
 * Calibration entries are real AuditOrder rows tagged with
 * businessName starting with "[CAL]" so the existing worker pipeline
 * picks them up unchanged. No schema migration needed.
 */

export async function GET(req: Request) {
  // Polled endpoint — CalibrationDashboard hits this every 6s while
  // any audit is inflight (~50 polls/5min per tab) and every 30s
  // when idle. 300/5min covers 5+ concurrent tabs running active
  // calibration batches without throttling legitimate operator use.
  // Frontend back-off honors 429 if the cap is ever reached.
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:calibration-list",
    limit: 300,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.auditOrder.findMany({
    where: { businessName: { startsWith: CALIBRATION_PREFIX } },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      // Pull the V2 intelligence row (industry slug, operator
      // calibration fields). Cheap one-to-one join; nullable for
      // historic rows that pre-date the intelligence table.
      intelligence: {
        select: {
          industryCategoryNormalized: true,
          operatorVerdict: true,
          operatorConfidence: true,
          benchmarkTag: true,
          calibrationNotes: true,
        },
      },
    },
  });

  // Diagnostic — surfaces the live row counts in Vercel logs so any
  // "results table not updating" report can be checked against what
  // the database actually shows.
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.reportStatus] = (acc[r.reportStatus] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `[calibration] GET total=${rows.length} ${Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`,
  );

  const runs = rows.map((row) => {
    const score = parseReportScoreBreakdown(row.reportMarkdown);
    const cal = parseCalibrationNotes(row.adminNotes);
    const businessName = stripPrefix(row.businessName ?? row.websiteUrl);
    return {
      id: row.id,
      url: row.websiteUrl,
      businessName,
      label: businessName,
      reportStatus: row.reportStatus,
      reportError: row.reportError,
      reportQueuedAt: row.reportQueuedAt?.toISOString() ?? null,
      reportStartedAt: row.reportStartedAt?.toISOString() ?? null,
      reportGeneratedAt: row.reportGeneratedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      overall: score.overall,
      bandStatus: score.status,
      categories: score.categories.map((c) => ({
        key: c.key,
        label: c.label,
        short: c.short,
        max: c.max,
        score: c.score,
      })),
      expectedScore: cal?.expected ?? null,
      notes: cal?.notes ?? null,
      // Operator-intelligence telemetry (Phase 1 + 1.5). Null for
      // historic rows / CLI-mode runs / failed audits without usage.
      estimatedCostUsd:
        row.estimatedCostUsd === null
          ? null
          : Number(row.estimatedCostUsd),
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      modelUsed: row.modelUsed,
      workerRuntimeMs: row.workerRuntimeMs,
      retryCount: row.retryCount,
      failureReason: row.failureReason,
      // V2 intelligence layer fields (null when no intelligence row
      // exists yet — historic audits before the backfill).
      industryCategoryNormalized:
        row.intelligence?.industryCategoryNormalized ?? null,
      operatorVerdict: row.intelligence?.operatorVerdict ?? null,
      operatorConfidence: row.intelligence?.operatorConfidence ?? null,
      benchmarkTag: row.intelligence?.benchmarkTag ?? null,
      calibrationNotes: row.intelligence?.calibrationNotes ?? null,
    };
  });

  return NextResponse.json({
    runs,
    fetchedAt: new Date().toISOString(),
    total: rows.length,
    counts,
  });
}

export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:calibration-create",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    urls?: string[];
    expectedByUrl?: Record<string, number>;
    // Optional operator-supplied benchmark tagging — preserves the
    // existing URL-only contract. Top-level `industry` /
    // `benchmarkTag` apply to every URL in the batch as defaults;
    // per-URL entries in `industryByUrl` / `benchmarkTagByUrl`
    // override the batch default for that single URL. Absent means
    // no tag — the existing inference path runs unchanged.
    industry?: string | null;
    benchmarkTag?: string | null;
    industryByUrl?: Record<string, string>;
    benchmarkTagByUrl?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const urls = Array.isArray(body.urls) ? body.urls : [];
  const cleaned = urls
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => u.length > 0);

  if (cleaned.length === 0) {
    return NextResponse.json(
      { error: "No URLs supplied." },
      { status: 400 },
    );
  }

  const expectedByUrl = body.expectedByUrl ?? {};
  const industryByUrl = body.industryByUrl ?? {};
  const benchmarkTagByUrl = body.benchmarkTagByUrl ?? {};
  const defaultIndustry =
    typeof body.industry === "string" && body.industry.trim().length > 0
      ? body.industry.trim()
      : null;
  const defaultBenchmarkTag =
    typeof body.benchmarkTag === "string" && body.benchmarkTag.trim().length > 0
      ? body.benchmarkTag.trim()
      : null;
  const created: Array<{ id: string; url: string }> = [];
  const skipped: Array<{ url: string; reason: string }> = [];
  const now = new Date();
  // One batchId per POST — groups all orders from this Launch QA submission
  // so Recover Last Batch can return exactly this set without a time window.
  const batchId = `lqa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  for (const rawUrl of cleaned) {
    let websiteUrl: string;
    let host: string;
    try {
      const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
      websiteUrl = u.toString();
      host = u.hostname.replace(/^www\./, "");
    } catch {
      skipped.push({ url: rawUrl, reason: "Could not parse URL" });
      continue;
    }

    const expected = expectedByUrl[rawUrl];
    // Per-URL override wins; otherwise fall back to the batch
    // default; otherwise null (no operator tag — inference path runs).
    const industryForUrl =
      typeof industryByUrl[rawUrl] === "string" &&
      industryByUrl[rawUrl]!.trim().length > 0
        ? industryByUrl[rawUrl]!.trim()
        : defaultIndustry;
    const benchmarkTagForUrl =
      typeof benchmarkTagByUrl[rawUrl] === "string" &&
      benchmarkTagByUrl[rawUrl]!.trim().length > 0
        ? benchmarkTagByUrl[rawUrl]!.trim()
        : defaultBenchmarkTag;
    const calNotes = stringifyCalibrationNotes({
      expected: typeof expected === "number" ? expected : null,
      industry: industryForUrl,
      benchmarkTag: benchmarkTagForUrl,
    });

    try {
      const order = await prisma.auditOrder.create({
        data: {
          websiteUrl,
          email: "calibration@geoviz.invalid",
          businessName: `${CALIBRATION_PREFIX} ${host}`,
          stripeSessionId: `calibration_${cuid()}`,
          paymentStatus: "paid",
          auditStatus: "pending",
          reportStatus: "queued",
          reportQueuedAt: now,
          adminNotes: calNotes,
          calibrationBatchId: batchId,
        },
      });
      created.push({ id: order.id, url: websiteUrl });
      console.log(
        `[calibration] queued orderId=${order.id} url=${websiteUrl} expected=${expected ?? "(none)"} industry=${industryForUrl ?? "(none)"} benchmarkTag=${benchmarkTagForUrl ?? "(none)"}`,
      );
      // Greppable one-liner whenever the operator supplies tagging —
      // separate prefix lets `npx @railway/cli logs | grep '\[geo-benchmark\]'`
      // find every cohort assignment at a glance.
      if (industryForUrl || benchmarkTagForUrl) {
        console.log(
          `[geo-benchmark] operator tag applied orderId=${order.id} url=${websiteUrl} industry=${industryForUrl ?? "(none)"} benchmarkTag=${benchmarkTagForUrl ?? "(none)"}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      skipped.push({ url: rawUrl, reason: message });
      console.error(
        `[calibration] failed to queue url=${websiteUrl}: ${message}`,
      );
    }
  }

  // Batch-summary log line — one greppable record per submission so an
  // operator following along on mobile can see the outcome shape at a
  // glance without scanning every per-URL line above. Each URL was
  // already isolated in its own try/catch, so partial failures here
  // never block the rest of the batch.
  console.log(
    `[calibration] batch complete submitted=${cleaned.length} queued=${created.length} skipped=${skipped.length}`,
  );

  return NextResponse.json({
    queued: created.length,
    skipped: skipped.length,
    created,
    skippedDetail: skipped,
    batchId,
  });
}

function stripPrefix(s: string): string {
  return s.startsWith(CALIBRATION_PREFIX)
    ? s.slice(CALIBRATION_PREFIX.length).trim()
    : s;
}

// Lightweight cuid — same shape Prisma uses; sufficient for synthetic
// `calibration_<id>` stripeSessionId values that just need to be unique.
function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
