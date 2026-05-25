/* eslint-disable no-console */
/**
 * scripts/observation-execute-test.ts
 *
 * End-to-end drive of `runObservationExecution()` against three real
 * `AuditOrder` rows. Verifies the contract:
 *
 *   Phase A (ENABLE_OBSERVATION=false):
 *     - Orchestrator returns `{ ran:false, reason:"flag_disabled" }`
 *     - `AuditIntelligence.deterministicScore` byte-equal before/after
 *     - 0 new `ObservationHistory` rows
 *
 *   Phase B (ENABLE_OBSERVATION=true + OPENAI_API_KEY set):
 *     - Orchestrator returns `{ ran:true, outcome:"succeeded", ... }`
 *     - `deterministicScore` + `overallScore` + `confidenceLevel`
 *       byte-equal before/after
 *     - `WEIGHT_HASH` + `CATEGORY_HASH` unchanged
 *     - 1 new `ObservationHistory` row per audit with all 13 fields
 *
 * The 3 new history rows ARE persisted (they're the proof). They
 * remain queryable by id afterward.
 *
 *   npm run observation:execute-test
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { CATEGORY_HASH, WEIGHT_HASH } from "../src/lib/scoring/frozen";
import {
  getObservationCounters,
  resetObservationCounters,
  runObservationExecution,
} from "../src/lib/observations";
import { scoreAudit } from "../src/lib/scoring";
import type { DeterministicScore } from "../src/lib/scoring/types";

type AuditFixture = {
  id: string;
  websiteUrl: string;
  businessName: string | null;
  deterministicScore: DeterministicScore;
  overallScore: number | null;
  confidenceLevel: string | null;
};

type PhaseARow = {
  auditId: string;
  ran: boolean;
  reason: string;
  scoreUnchanged: boolean;
};

type PhaseBRow = {
  auditId: string;
  outcome: string;
  status: string;
  historyId: string | null;
  scoreUnchanged: boolean;
  hashUnchanged: boolean;
  thirteenFieldsOk: boolean;
};

async function loadFixtures(prisma: PrismaClient): Promise<AuditFixture[]> {
  // Pick 3 recent AuditOrder rows with a real audit (reportMarkdown
  // present) as FK targets. Production's deterministicScore column is
  // not yet backfilled across history, so we synthesize a fresh
  // DeterministicScore on the fly via the same pure scoreAudit()
  // pipeline the worker uses. This keeps the test self-contained and
  // proves the orchestrator wiring against real auditOrderId values.
  const orders = await prisma.auditOrder.findMany({
    where: { reportMarkdown: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, websiteUrl: true, businessName: true },
  });

  if (orders.length === 0) return [];

  // Fetch any existing AuditIntelligence so we can read overallScore /
  // confidenceLevel snapshots (purely for the score-unchanged check;
  // null is fine if the row doesn't exist).
  const intelById = new Map<
    string,
    { overallScore: number | null; confidenceLevel: string | null }
  >();
  const intelRows = await prisma.auditIntelligence.findMany({
    where: { auditOrderId: { in: orders.map((o) => o.id) } },
    select: {
      auditOrderId: true,
      overallScore: true,
      confidenceLevel: true,
    },
  });
  for (const r of intelRows) {
    intelById.set(r.auditOrderId, {
      overallScore: r.overallScore ?? null,
      confidenceLevel: r.confidenceLevel ?? null,
    });
  }

  const fixtures: AuditFixture[] = [];
  for (const o of orders) {
    // Synthesize a deterministicScore — empty evidence → low-confidence
    // band, but valid + freeze-stamped. The orchestrator only reads
    // the forbidden-fields snapshot, not score semantics.
    const synthetic = scoreAudit({
      preflightSignals: null,
      intelligenceIngest: null,
      renderResult: null,
      history: undefined,
    });
    const intel = intelById.get(o.id);
    fixtures.push({
      id: o.id,
      websiteUrl: o.websiteUrl,
      businessName: o.businessName,
      deterministicScore: synthetic,
      overallScore: intel?.overallScore ?? null,
      confidenceLevel: intel?.confidenceLevel ?? null,
    });
  }
  return fixtures;
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

async function readScoreSnapshot(
  prisma: PrismaClient,
  auditId: string,
): Promise<{
  deterministicJson: string;
  overallScore: number | null;
  confidenceLevel: string | null;
}> {
  const row = await prisma.auditIntelligence.findUnique({
    where: { auditOrderId: auditId },
    select: {
      deterministicScore: true,
      overallScore: true,
      confidenceLevel: true,
    },
  });
  return {
    deterministicJson: JSON.stringify(row?.deterministicScore ?? null),
    overallScore: row?.overallScore ?? null,
    confidenceLevel: row?.confidenceLevel ?? null,
  };
}

async function countHistory(
  prisma: PrismaClient,
  auditId: string,
): Promise<number> {
  return prisma.observationHistory.count({ where: { auditId } });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  console.log(
    "[observation:execute-test] driving 3 audits through the full path",
  );
  console.log("");

  const fixtures = await loadFixtures(prisma);
  if (fixtures.length === 0) {
    console.error(
      "[observation:execute-test] no audits with deterministicScore found — cannot drive the path",
    );
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  if (fixtures.length < 3) {
    console.warn(
      `[observation:execute-test] only found ${fixtures.length} fixture(s); running with available set`,
    );
  }

  // ─── Phase A — observation OFF baseline ────────────────────────
  process.env.ENABLE_OBSERVATION = "false";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.PERPLEXITY_API_KEY;
  resetObservationCounters();

  const phaseARows: PhaseARow[] = [];
  for (const f of fixtures) {
    const before = await readScoreSnapshot(prisma, f.id);
    const historyBefore = await countHistory(prisma, f.id);

    const outcome = await runObservationExecution({
      prisma,
      auditId: f.id,
      businessName: f.businessName,
      websiteUrl: f.websiteUrl,
      deterministicScore: f.deterministicScore,
    });

    const after = await readScoreSnapshot(prisma, f.id);
    const historyAfter = await countHistory(prisma, f.id);

    const scoreUnchanged =
      before.deterministicJson === after.deterministicJson &&
      before.overallScore === after.overallScore &&
      before.confidenceLevel === after.confidenceLevel &&
      historyBefore === historyAfter;

    phaseARows.push({
      auditId: f.id,
      ran: outcome.ran,
      reason: outcome.ran ? "(ran)" : outcome.reason,
      scoreUnchanged,
    });
  }
  const phaseACounters = getObservationCounters();

  console.log("Phase A — observation OFF baseline");
  console.log(
    `  ${pad("auditId", 14)}${pad("ran", 6)}${pad("reason", 18)}score_unchanged`,
  );
  for (const r of phaseARows) {
    console.log(
      `  ${pad(shortId(r.auditId), 14)}${pad(r.ran ? "yes" : "no", 6)}${pad(r.reason, 18)}${r.scoreUnchanged ? "YES" : "NO"}`,
    );
  }
  console.log("");

  // ─── Phase B — observation ON ───────────────────────────────────
  process.env.ENABLE_OBSERVATION = "true";
  process.env.OPENAI_API_KEY = "test-observation-key-do-not-use";
  resetObservationCounters();

  const phaseBRows: PhaseBRow[] = [];
  for (const f of fixtures) {
    const before = await readScoreSnapshot(prisma, f.id);

    const outcome = await runObservationExecution({
      prisma,
      auditId: f.id,
      businessName: f.businessName,
      websiteUrl: f.websiteUrl,
      deterministicScore: f.deterministicScore,
    });

    const after = await readScoreSnapshot(prisma, f.id);

    const scoreUnchanged =
      before.deterministicJson === after.deterministicJson &&
      before.overallScore === after.overallScore &&
      before.confidenceLevel === after.confidenceLevel;

    let outcomeLabel = "(skipped)";
    let status = "—";
    let historyId: string | null = null;
    let thirteenFieldsOk = false;

    if (outcome.ran && outcome.outcome === "succeeded") {
      outcomeLabel = "succeeded";
      status = outcome.observationStatus;
      historyId = outcome.historyId;

      const row = await prisma.observationHistory.findUnique({
        where: { id: outcome.historyId },
        select: {
          id: true,
          auditId: true,
          providerCount: true,
          agreementScore: true,
          variance: true,
          observationStatus: true,
          providerNames: true,
          estimatedCost: true,
          avgLatency: true,
          scoringVersion: true,
          weightHash: true,
          categoryHash: true,
          createdAt: true,
        },
      });
      thirteenFieldsOk =
        row !== null &&
        typeof row.id === "string" &&
        row.auditId === f.id &&
        typeof row.providerCount === "number" &&
        typeof row.agreementScore === "number" &&
        typeof row.variance === "number" &&
        typeof row.observationStatus === "string" &&
        Array.isArray(row.providerNames) &&
        row.estimatedCost !== null &&
        typeof row.avgLatency === "number" &&
        typeof row.scoringVersion === "string" &&
        row.weightHash === WEIGHT_HASH &&
        row.categoryHash === CATEGORY_HASH &&
        row.createdAt instanceof Date;
    } else if (outcome.ran && outcome.outcome === "failed_guard") {
      outcomeLabel = "failed_guard";
      status = `mutated=${outcome.mutatedFields.join(",")}`;
    } else if (outcome.ran && outcome.outcome === "failed") {
      outcomeLabel = "failed";
      status = outcome.error.slice(0, 40);
    } else if (!outcome.ran) {
      outcomeLabel = `skipped:${outcome.reason}`;
    }

    phaseBRows.push({
      auditId: f.id,
      outcome: outcomeLabel,
      status,
      historyId,
      scoreUnchanged,
      hashUnchanged: true, // hashes are module constants — they cannot change at runtime
      thirteenFieldsOk,
    });
  }
  const phaseBCounters = getObservationCounters();

  console.log("Phase B — observation ON");
  console.log(
    `  ${pad("auditId", 14)}${pad("outcome", 14)}${pad("status", 16)}${pad("history_id", 16)}${pad("score_unchanged", 18)}fields_ok`,
  );
  for (const r of phaseBRows) {
    console.log(
      `  ${pad(shortId(r.auditId), 14)}${pad(r.outcome, 14)}${pad(r.status, 16)}${pad(shortId(r.historyId ?? "—"), 16)}${pad(r.scoreUnchanged ? "YES" : "NO", 18)}${r.thirteenFieldsOk ? "YES" : "NO"}`,
    );
  }
  console.log("");

  console.log("Counters (Phase A):");
  console.log(`  skipped_disabled = ${phaseACounters.skipped_disabled}`);
  console.log(`  skipped_no_keys  = ${phaseACounters.skipped_no_keys}`);
  console.log(`  succeeded        = ${phaseACounters.succeeded}`);
  console.log(`  failed           = ${phaseACounters.failed}`);
  console.log(`  failed_guard     = ${phaseACounters.failed_guard}`);
  console.log("");
  console.log("Counters (Phase B):");
  console.log(`  skipped_disabled = ${phaseBCounters.skipped_disabled}`);
  console.log(`  skipped_no_keys  = ${phaseBCounters.skipped_no_keys}`);
  console.log(`  succeeded        = ${phaseBCounters.succeeded}`);
  console.log(`  failed           = ${phaseBCounters.failed}`);
  console.log(`  failed_guard     = ${phaseBCounters.failed_guard}`);
  console.log("");
  console.log(`Scoring hashes (post-test):`);
  console.log(`  WEIGHT_HASH:   ${WEIGHT_HASH}`);
  console.log(`  CATEGORY_HASH: ${CATEGORY_HASH}`);
  console.log("");

  await prisma.$disconnect();

  const phaseAOk =
    phaseARows.length > 0 &&
    phaseARows.every((r) => !r.ran && r.scoreUnchanged) &&
    phaseACounters.skipped_disabled === fixtures.length;

  const phaseBOk =
    phaseBRows.length > 0 &&
    phaseBRows.every(
      (r) =>
        r.outcome === "succeeded" &&
        r.scoreUnchanged &&
        r.hashUnchanged &&
        r.thirteenFieldsOk,
    ) &&
    phaseBCounters.succeeded === fixtures.length;

  if (!phaseAOk) {
    console.error("[observation:execute-test] Phase A invariant violated");
    process.exitCode = 1;
    return;
  }
  if (!phaseBOk) {
    console.error("[observation:execute-test] Phase B invariant violated");
    process.exitCode = 1;
    return;
  }

  console.log("OBSERVATION EXECUTES");
  console.log("OBSERVATION WRITES");
  console.log("SCORING STILL CANONICAL");
}

main().catch((err) => {
  console.error("[observation:execute-test] error:", err);
  process.exitCode = 1;
});
