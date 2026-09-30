/* eslint-disable no-console */
/**
 * Daily Market Study automation — analytics summary email.
 *
 * All numbers here are deterministic database queries/aggregations —
 * no LLM is used to compute or narrate them (per the constitution's
 * "Forbidden: LLM-generated scores" and the explicit instruction for
 * this feature). Reuses the exact same aggregation helpers the manual
 * Market Study dashboard already uses (`countEntryStatuses`,
 * `scoreStats`, `countFindingFrequency`, `findingLabel`) — nothing
 * here is a second implementation of scoring or aggregation logic.
 *
 * Mirrors `notify-operator-report-ready.ts`'s sending contract:
 * fail-soft (logs + returns false, never throws), same
 * `AUDIT_NOTIFICATION_EMAIL`-or-fallback routing. Deliberately does
 * NOT reuse `buildAdminReviewUrl()` — that helper embeds `ADMIN_SECRET`
 * in the URL, which is the established pattern for other internal
 * notifications but is explicitly disallowed for this feature ("never
 * expose API keys ... in emails"). The admin link here carries no
 * secret; the recipient authenticates normally when they click it.
 */

import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";
import { getResend } from "@/lib/resend";
import { resolveAppBaseUrl } from "@/lib/app-url";
import { countEntryStatuses, scoreStats } from "@/lib/market-studies/studyView";
import { countFindingFrequency } from "@/lib/scoring/calibration-summary";
import { findingLabel } from "@/lib/market-studies/findingLabels";
import type { DeterministicScore } from "@/lib/scoring/types";

const OPERATOR_NOTIFICATION_FROM_FALLBACK = "GeoViz Reports <reports@mail.geoviz.ai>";
const FALLBACK_OPERATOR_EMAIL = "reports@geoviz.ai";

function operatorNotificationFrom(): string {
  const fromEnv = process.env.RESEND_EMAIL_FROM?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : OPERATOR_NOTIFICATION_FROM_FALLBACK;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(n: number | null): string {
  return n === null ? "—" : `$${n.toFixed(2)}`;
}

export type SummaryEntry = {
  businessName: string;
  auditOrder: {
    reportStatus: string | null;
    failureReason: string | null;
    // Accepts Prisma's Decimal type too (Number()-coercible) without
    // importing @prisma/client/runtime just for this one field's type.
    estimatedCostUsd: { toString(): string } | number | string | null;
    intelligence: { overallScore: number | null; deterministicScore: unknown } | null;
  } | null;
  skipReason: string | null;
};

export type ComputedSummary = {
  counts: ReturnType<typeof countEntryStatuses>;
  stats: ReturnType<typeof scoreStats>;
  highest: { businessName: string; overallScore: number } | null;
  lowest: { businessName: string; overallScore: number } | null;
  topFindings: { id: string; count: number }[];
  failureCounts: [string, number][];
  auditCostUsd: number;
};

/**
 * Pure — no I/O. All the "what happened in this batch" math, isolated
 * so it's directly unit-testable against fixture entries (see
 * `scripts/test-market-study-automation-summary.ts`) without a live
 * DB or Resend call.
 */
export function computeSummaryStats(entries: ReadonlyArray<SummaryEntry>): ComputedSummary {
  const counts = countEntryStatuses(entries);
  const stats = scoreStats(entries);

  const completedScored = entries
    .filter((e) => e.auditOrder?.reportStatus === "generated" && e.auditOrder.intelligence?.overallScore != null)
    .map((e) => ({
      businessName: e.businessName,
      overallScore: e.auditOrder!.intelligence!.overallScore as number,
    }))
    .sort((a, b) => b.overallScore - a.overallScore);
  const highest = completedScored[0] ?? null;
  const lowest = completedScored.length > 0 ? completedScored[completedScored.length - 1] : null;

  const findingRows = entries
    .map((e) => e.auditOrder?.intelligence?.deterministicScore)
    .filter((s): s is DeterministicScore => Boolean(s) && typeof s === "object" && "top_3_findings" in (s as object))
    .map((score) => ({ score: score as DeterministicScore }));
  const topFindings = countFindingFrequency(findingRows, { limit: 5 });

  const failureCounts = new Map<string, number>();
  for (const e of entries) {
    if (e.auditOrder?.reportStatus === "failed") {
      const reason = e.auditOrder.failureReason ?? "unknown";
      failureCounts.set(reason, (failureCounts.get(reason) ?? 0) + 1);
    }
  }

  const auditCostUsd = entries.reduce(
    (sum, e) => sum + (e.auditOrder?.estimatedCostUsd != null ? Number(e.auditOrder.estimatedCostUsd) : 0),
    0,
  );

  return {
    counts,
    stats,
    highest,
    lowest,
    topFindings,
    failureCounts: Array.from(failureCounts.entries()),
    auditCostUsd,
  };
}

/**
 * Builds and sends the daily summary for one `MarketStudyAutomationRun`.
 * Idempotency (never sending twice for the same run) is the caller's
 * responsibility (`runTick.ts` only calls this once, then stamps
 * `summaryEmailSentAt`) — this function itself just sends.
 */
export async function sendDailyAutomationSummaryEmail(
  runId: string,
  recipientEmail: string | null,
  prisma: PrismaClient = defaultPrisma,
): Promise<boolean> {
  const run = await prisma.marketStudyAutomationRun.findUnique({ where: { id: runId } });
  if (!run) {
    console.warn(`[market-study-daily] summary skipped — run not found runId=${runId}`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[market-study-daily] summary skipped — RESEND_API_KEY not set runId=${runId}`);
    return false;
  }
  const to = recipientEmail?.trim() || FALLBACK_OPERATOR_EMAIL;

  const study = run.marketStudyId
    ? await prisma.marketStudy.findUnique({
        where: { id: run.marketStudyId },
        include: {
          entries: {
            select: {
              skipReason: true,
              businessName: true,
              leadId: true,
              auditOrder: {
                select: {
                  reportStatus: true,
                  failureReason: true,
                  estimatedCostUsd: true,
                  intelligence: {
                    select: { overallScore: true, deterministicScore: true },
                  },
                },
              },
            },
          },
        },
      })
    : null;

  const entries = study?.entries ?? [];
  const { counts, stats, highest, lowest, topFindings, failureCounts, auditCostUsd } =
    computeSummaryStats(entries);

  const discoveryRun = run.leadDiscoveryRunId
    ? await prisma.leadDiscoveryRun.findUnique({
        where: { id: run.leadDiscoveryRunId },
        select: { estimatedCostUsd: true },
      })
    : null;
  const discoveryCostUsd = discoveryRun?.estimatedCostUsd != null ? Number(discoveryRun.estimatedCostUsd) : 0;
  const totalCostUsd = auditCostUsd + discoveryCostUsd;

  // Leads newly touched by this run that ended up QUALIFIED — the
  // run's own `businessesQualified` counter (populated at kickoff).
  const newQualifiedLeads = run.businessesQualified;
  const excludedCount = run.duplicatesExcluded + run.existingCustomersExcluded + run.blockedExcluded;

  const baseUrl = resolveAppBaseUrl();
  const studyUrl = run.marketStudyId ? `${baseUrl}/admin/market-studies/${run.marketStudyId}` : `${baseUrl}/admin/market-studies`;
  const dateLabel = run.runDate.toISOString().slice(0, 10);

  const subject = `GeoViz Daily Market Study — ${dateLabel} — ${run.industry} / ${run.city}${run.state ? `, ${run.state}` : ""}`;

  const textLines = [
    "Daily Market Study automation — batch summary.",
    "",
    `Date:                 ${dateLabel}`,
    `Industry:             ${run.industry}`,
    `Location:             ${run.city}${run.state ? `, ${run.state}` : ""}`,
    `Businesses collected: ${run.businessesCollected}`,
    `Businesses qualified: ${run.businessesQualified}`,
    `Reports attempted:    ${counts.total}`,
    `Reports completed:    ${counts.completed}`,
    `Reports failed:       ${counts.failed}`,
    `Avg / median score:   ${stats.avg ?? "—"} / ${stats.median ?? "—"}`,
    `Highest scoring:      ${highest ? `${highest.businessName} (${highest.overallScore})` : "—"}`,
    `Lowest scoring:       ${lowest ? `${lowest.businessName} (${lowest.overallScore})` : "—"}`,
    `Most common issues:   ${topFindings.length ? topFindings.map((f) => `${findingLabel(f.id)} (${f.count})`).join("; ") : "—"}`,
    `Provider/model failures: ${failureCounts.length ? failureCounts.map(([k, v]) => `${k}: ${v}`).join(", ") : "none"}`,
    `New qualified leads:  ${newQualifiedLeads}`,
    `Duplicates/excluded:  ${excludedCount} (duplicates ${run.duplicatesExcluded}, existing customers ${run.existingCustomersExcluded}, blocked ${run.blockedExcluded})`,
    `Estimated cost:       ${money(totalCostUsd)} (discovery ${money(discoveryCostUsd)} + audits ${money(auditCostUsd)})`,
    "",
    `Market Study: ${studyUrl}`,
  ].join("\n");

  const htmlBody = buildSummaryHtml({
    dateLabel,
    industry: run.industry,
    city: run.city,
    state: run.state,
    collected: run.businessesCollected,
    qualified: run.businessesQualified,
    attempted: counts.total,
    completed: counts.completed,
    failed: counts.failed,
    avg: stats.avg,
    median: stats.median,
    highest,
    lowest,
    topFindings: topFindings.map((f) => ({ label: findingLabel(f.id), count: f.count })),
    failureCounts,
    newQualifiedLeads,
    duplicatesExcluded: run.duplicatesExcluded,
    existingCustomersExcluded: run.existingCustomersExcluded,
    blockedExcluded: run.blockedExcluded,
    totalCostUsd,
    discoveryCostUsd,
    auditCostUsd,
    studyUrl,
  });

  console.log(`[market-study-daily] sending summary runId=${runId} to=${to} subject="${subject}"`);
  try {
    const result = await getResend().emails.send({
      from: operatorNotificationFrom(),
      to,
      subject,
      text: textLines,
      html: htmlBody,
    });
    if (result.error) {
      console.error(`[market-study-daily] summary FAILED runId=${runId} resendError="${result.error.name}: ${result.error.message}"`);
      return false;
    }
    console.log(`[market-study-daily] summary SENT runId=${runId} resendId=${result.data?.id ?? "unknown"}`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[market-study-daily] summary FAILED runId=${runId} threwException="${message}"`);
    return false;
  }
}

function buildSummaryHtml(args: {
  dateLabel: string;
  industry: string;
  city: string;
  state: string | null;
  collected: number;
  qualified: number;
  attempted: number;
  completed: number;
  failed: number;
  avg: number | null;
  median: number | null;
  highest: { businessName: string; overallScore: number } | null;
  lowest: { businessName: string; overallScore: number } | null;
  topFindings: { label: string; count: number }[];
  failureCounts: [string, number][];
  newQualifiedLeads: number;
  duplicatesExcluded: number;
  existingCustomersExcluded: number;
  blockedExcluded: number;
  totalCostUsd: number;
  discoveryCostUsd: number;
  auditCostUsd: number;
  studyUrl: string;
}): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 14px;color:#666;font-size:13px;border-top:1px solid #ececec;">${escapeHtml(label)}</td><td style="padding:8px 14px;color:#111;font-size:13px;border-top:1px solid #ececec;font-weight:600;">${value}</td></tr>`;

  const location = `${escapeHtml(args.city)}${args.state ? `, ${escapeHtml(args.state)}` : ""}`;
  const topFindingsHtml = args.topFindings.length
    ? args.topFindings.map((f) => `${escapeHtml(f.label)} (${f.count})`).join("; ")
    : "—";
  const failuresHtml = args.failureCounts.length
    ? args.failureCounts.map(([k, v]) => `${escapeHtml(k)}: ${v}`).join(", ")
    : "none";

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter','Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #ececec;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <div style="color:#ff6a1a;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">GeoViz · Daily Market Study</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <h1 style="margin:8px 0 14px;font-size:22px;line-height:1.3;color:#111;font-weight:700;letter-spacing:-0.01em;">
                  ${escapeHtml(args.dateLabel)} — ${escapeHtml(args.industry)} — ${location}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 14px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #ececec;border-radius:6px;">
                  ${row("Businesses collected", String(args.collected))}
                  ${row("Businesses qualified", String(args.qualified))}
                  ${row("Reports attempted", String(args.attempted))}
                  ${row("Reports completed", String(args.completed))}
                  ${row("Reports failed", String(args.failed))}
                  ${row("Avg / median score", `${args.avg ?? "—"} / ${args.median ?? "—"}`)}
                  ${row("Highest scoring", args.highest ? `${escapeHtml(args.highest.businessName)} (${args.highest.overallScore})` : "—")}
                  ${row("Lowest scoring", args.lowest ? `${escapeHtml(args.lowest.businessName)} (${args.lowest.overallScore})` : "—")}
                  ${row("Most common issues", topFindingsHtml)}
                  ${row("Provider/model failures", failuresHtml)}
                  ${row("New qualified leads", String(args.newQualifiedLeads))}
                  ${row("Duplicates / existing customers / blocked", `${args.duplicatesExcluded} / ${args.existingCustomersExcluded} / ${args.blockedExcluded}`)}
                  ${row("Estimated cost", `${money(args.totalCostUsd)} (discovery ${money(args.discoveryCostUsd)} + audits ${money(args.auditCostUsd)})`)}
                </table>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:4px 32px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:#ff6a1a;border-radius:6px;">
                      <a href="${escapeHtml(args.studyUrl)}" style="display:inline-block;padding:12px 22px;font-size:14.5px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">Open Market Study →</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 26px;border-top:1px solid #eee;">
                <p style="margin:0;font-size:11.5px;line-height:1.5;color:#888;">
                  GeoViz · Internal operator notification · do not forward. Numbers are deterministic database aggregates — no model was used to compute or narrate them.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
