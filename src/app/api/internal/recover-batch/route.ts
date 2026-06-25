import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { parseReportScoreBreakdown } from "@/lib/parse-report";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/recover-batch
 *
 * Finds [CAL] calibration orders created in the last 24 hours and returns
 * them in the same QaResult shape as the batch-qa polling endpoint.
 *
 * Purpose: lets the operator reload a completed batch after a page refresh
 * without creating new audits or spending API budget.
 *
 * Auth: x-admin-secret header or ?key= query param.
 */

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
    if (Array.isArray(aiValidations)) {
      return (aiValidations as Array<{ status?: string }>).filter(
        (v) => v?.status === "unavailable" || v?.status === "error",
      ).length;
    }
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
    routeKey: "api:internal:recover-batch",
    limit: 300,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.auditOrder.findMany({
    where: {
      businessName: { startsWith: "[CAL]" },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
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

  return NextResponse.json({ results, total: rows.length });
}
