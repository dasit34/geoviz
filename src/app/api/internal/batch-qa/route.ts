import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { parseReportScoreBreakdown } from "@/lib/parse-report";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/batch-qa?orderIds=id1,id2,...
 *
 * Polls order status for a comma-separated list of order IDs and returns
 * per-order status + QA validation signals (score, model failures, malformed
 * text detected in raw reportMarkdown before normalization).
 *
 * Called by BatchQaRunner every 5s while any order is queued/running.
 * Auth: x-admin-secret header or ?key= query param.
 */

// ── QA validation patterns ────────────────────────────────────────────────────
// Checked against raw reportMarkdown (the worker output, before normalization).
// A hit means the normalizer will sanitize the field at render time — flagged
// here as a quality signal so the operator can decide whether to investigate.
const FORBIDDEN_QA: Array<[RegExp, string]> = [
  [/json-?ld\s+block/i, "json-ld block"],
  [/\blocalbusiness\b/i, "LocalBusiness jargon"],
  [/\bnap\s+consistency\b/i, "NAP consistency jargon"],
  [/no response captured/i, "internal error string"],
  [/fields?\s+missing:.*\bgeo\b/i, "raw field 'geo'"],
  [/fields?\s+missing:.*\bopeninghours\b/i, "raw field 'openingHours'"],
  [/\bundefined\b/, "literal 'undefined'"],
  [/\[object\s*Object\]/i, "[object Object]"],
  [/best and /i, "broken question template"],
  [/best or /i, "broken question template"],
];

function checkMalformed(markdown: string | null): {
  detected: boolean;
  issues: string[];
} {
  if (!markdown || markdown.trim().length < 100) {
    return { detected: true, issues: ["report markdown missing or too short"] };
  }
  const issues: string[] = [];
  for (const [re, label] of FORBIDDEN_QA) {
    if (re.test(markdown)) issues.push(label);
  }
  return { detected: issues.length > 0, issues };
}

function countModelFailures(aiValidations: unknown): number {
  if (!aiValidations) return 0;
  try {
    // Shape 1: flat array of { provider, status }
    if (Array.isArray(aiValidations)) {
      return (aiValidations as Array<{ status?: string }>).filter(
        (v) => v?.status === "unavailable" || v?.status === "error",
      ).length;
    }
    // Shape 2: { outputs: [...] }
    const obj = aiValidations as { outputs?: Array<{ status?: string }> };
    if (Array.isArray(obj.outputs)) {
      return obj.outputs.filter(
        (v) => v?.status === "unavailable" || v?.status === "error",
      ).length;
    }
  } catch {
    // Malformed intelligence payload — not a hard error
  }
  return 0;
}

export async function GET(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:internal:batch-qa",
    limit: 300,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("orderIds") ?? "";
  const orderIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 50); // hard cap — mirrors calibration POST

  if (orderIds.length === 0) {
    return NextResponse.json({ error: "No orderIds provided." }, { status: 400 });
  }

  const rows = await prisma.auditOrder.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      websiteUrl: true,
      businessName: true,
      reportStatus: true,
      reportMarkdown: true,
      reportError: true,
      failureReason: true,
      intelligence: {
        select: { deterministicScore: true, aiValidations: true },
      },
    },
  });

  const results = rows.map((row) => {
    const isGenerated = row.reportStatus === "generated";
    const isFailed = row.reportStatus === "failed";

    let score: number | null = null;
    let band: string | null = null;
    let malformedTextDetected = false;
    let validationIssues: string[] = [];
    let modelFailures = 0;

    if (isGenerated) {
      const parsed = parseReportScoreBreakdown(row.reportMarkdown);
      score = parsed.overall ?? null;
      band = parsed.status ?? null;
      const malformed = checkMalformed(row.reportMarkdown);
      malformedTextDetected = malformed.detected;
      validationIssues = malformed.issues;
      modelFailures = countModelFailures(row.intelligence?.aiValidations);
    }

    const error =
      row.reportError ??
      row.failureReason ??
      (isFailed ? "Audit failed — check worker logs" : null);

    return {
      orderId: row.id,
      url: row.websiteUrl,
      businessName: row.businessName,
      status: row.reportStatus,
      score,
      band,
      reportUrl: `/report/${row.id}`,
      modelFailures,
      malformedTextDetected,
      validationIssues,
      error,
    };
  });

  return NextResponse.json({ results });
}
