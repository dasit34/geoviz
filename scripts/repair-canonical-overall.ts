/* eslint-disable no-console */
/**
 * scripts/repair-canonical-overall.ts
 *
 * One-off repair for the historic-row stale-persisted-score case
 * surfaced during the 2026-05-15 launch-hardening pass.
 *
 * The bug: prior to PR #11 (Fix canonical report score consistency,
 * merged 2026-05-14 19:38 UTC), the worker persisted
 * `AuditIntelligence.overallScore` using the OLD parser path
 * (declared header). After PR #11 the parser returns the rubric
 * sum as canonical. Then 2026-05-15 launch-hardening found the
 * admin dashboard was reading a SECOND legacy parser
 * (`parseReportScore`) that ignored the canonical fix entirely —
 * showing the model's declared hero on admin while PDF/print
 * showed the canonical sum.
 *
 * This script repairs the persisted `AuditIntelligence.overallScore`
 * value to match what `parseReportScoreBreakdown(reportMarkdown)`
 * returns today. The admin dashboard's display already uses the
 * canonical parser (post-launch-hardening); this script aligns the
 * stored aggregate value (used by `intelligence:summary` and
 * benchmark queries) with the canonical value too.
 *
 * Dry-run by default. Pass `--apply` to write.
 *
 *   npx tsx scripts/repair-canonical-overall.ts            # dry-run
 *   npx tsx scripts/repair-canonical-overall.ts --apply    # write
 *
 * What this script does NOT touch:
 *   - reportMarkdown (customer-facing audit prose).
 *   - Any narrative findings, recommendations, scoring math, or band
 *     thresholds.
 *   - rawSignalSnapshot (forensic record of the parser's output at
 *     audit-write time — left intact as audit-trail).
 *   - Sub-scores on AuditIntelligence (semanticClarity / crawler /
 *     trust / structuredIdentity / recommendationReadiness) — those
 *     are tied to individual columns and unaffected by the
 *     canonical-overall fix.
 *
 * Safety:
 *   - Only updates rows where reportStatus = "generated" (skip
 *     pending / queued / running / failed).
 *   - Only updates when the live parser produces a non-null overall
 *     (skip rows where the parser fails — those can't be repaired
 *     safely from this surface).
 *   - Each row's update is a single Prisma `update` keyed by
 *     auditOrderId. No transactions across rows.
 *   - Idempotent: re-running matches zero rows after a successful
 *     apply.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { parseReportScoreBreakdown } from "../src/lib/parse-report";

const APPLY = process.argv.includes("--apply");

type Row = {
  id: string;
  auditOrderId: string;
  websiteUrl: string;
  overallScore: number | null;
  auditOrder: { reportMarkdown: string | null };
};

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  console.log(
    `\n[repair-canonical] mode=${APPLY ? "APPLY" : "DRY-RUN"}`,
  );

  const rows = (await prisma.auditIntelligence.findMany({
    where: {
      auditOrder: { reportStatus: "generated" },
    },
    select: {
      id: true,
      auditOrderId: true,
      websiteUrl: true,
      overallScore: true,
      auditOrder: { select: { reportMarkdown: true } },
    },
    orderBy: { createdAt: "asc" },
  })) as Row[];

  console.log(`[repair-canonical] scanned=${rows.length} rows`);

  let matched = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let skippedNoMarkdown = 0;
  let skippedParserNull = 0;
  let skippedAlreadyAligned = 0;
  let failed = 0;

  for (const r of rows) {
    matched += 1;
    const md = r.auditOrder.reportMarkdown ?? "";
    if (md.trim().length === 0) {
      skippedNoMarkdown += 1;
      continue;
    }
    const parsed = parseReportScoreBreakdown(md);
    if (typeof parsed.overall !== "number") {
      skippedParserNull += 1;
      continue;
    }
    if (parsed.overall === r.overallScore) {
      skippedAlreadyAligned += 1;
      continue;
    }
    wouldUpdate += 1;
    console.log(
      `  orderId=${r.auditOrderId.slice(-8)} url=${r.websiteUrl.slice(0, 50)}  persisted=${r.overallScore ?? "(null)"} → canonical=${parsed.overall}  declaredHero=${parsed.declaredOverall ?? "?"} rubricSum=${parsed.rubricSum ?? "?"}`,
    );
    if (APPLY) {
      try {
        await prisma.auditIntelligence.update({
          where: { id: r.id },
          data: { overallScore: parsed.overall },
        });
        updated += 1;
        console.log(
          `[geo-score-consistency] repaired orderId=${r.auditOrderId} old=${r.overallScore ?? "(null)"} new=${parsed.overall}`,
        );
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `  ✗ FAILED orderId=${r.auditOrderId}: ${message}`,
        );
      }
    }
  }

  console.log(
    `\n[repair-canonical] complete — scanned=${matched} wouldUpdate=${wouldUpdate} updated=${updated} skipped(noMarkdown=${skippedNoMarkdown}, parserNull=${skippedParserNull}, alreadyAligned=${skippedAlreadyAligned}) failed=${failed}`,
  );
  if (!APPLY && wouldUpdate > 0) {
    console.log(`\n[repair-canonical] DRY-RUN: re-run with --apply to write.`);
  }
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[repair-canonical] fatal:", err);
  process.exit(1);
});
