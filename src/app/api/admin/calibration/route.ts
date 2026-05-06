import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { parseReportScoreBreakdown } from "@/lib/parse-report";
import {
  CALIBRATION_PREFIX,
  parseCalibrationNotes,
} from "@/lib/calibration";

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
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.auditOrder.findMany({
    where: { businessName: { startsWith: CALIBRATION_PREFIX } },
    orderBy: { createdAt: "desc" },
    take: 500,
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
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { urls?: string[]; expectedByUrl?: Record<string, number> };
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
  const created: Array<{ id: string; url: string }> = [];
  const skipped: Array<{ url: string; reason: string }> = [];
  const now = new Date();

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
    const calNotes = JSON.stringify({
      calibration: {
        expected: typeof expected === "number" ? expected : null,
      },
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
        },
      });
      created.push({ id: order.id, url: websiteUrl });
      console.log(
        `[calibration] queued orderId=${order.id} url=${websiteUrl} expected=${expected ?? "(none)"}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      skipped.push({ url: rawUrl, reason: message });
      console.error(
        `[calibration] failed to queue url=${websiteUrl}: ${message}`,
      );
    }
  }

  return NextResponse.json({
    queued: created.length,
    skipped: skipped.length,
    created,
    skippedDetail: skipped,
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
