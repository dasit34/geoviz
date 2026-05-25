/* eslint-disable no-console */
/**
 * scripts/audit-replay-test.ts
 *
 * Picks the most-recent `AuditIntelligence` row that has both a
 * `replayBundle` and a `deterministicScore`, replays the audit via
 * `scoreAudit(bundle.inputs)`, and asserts byte-equal output +
 * freeze-hash invariance.
 *
 *   npm run audit:replay-test
 *
 * Exit code 1 on assertion failure (CI-friendly). If no audit yet
 * has a `replayBundle`, prints a graceful message and exits 0 — the
 * column was just added; the next new audit will populate it.
 *
 * Read-only. NEVER writes to production.
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

import { gatherEvidence, scoreAudit } from "../src/lib/scoring";
import { CATEGORY_HASH, WEIGHT_HASH } from "../src/lib/scoring/frozen";
import {
  REPLAY_BUNDLE_VERSION,
  type ReplayBundle,
} from "../src/lib/scoring/replay-bundle";
import type {
  DeterministicScore,
  Evidence,
} from "../src/lib/scoring/types";

function shortId(id: string): string {
  return id.length > 16 ? id.slice(0, 16) : id;
}

function ok(b: boolean): string {
  return b ? "YES" : "NO";
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  // Pull the most-recent row that has BOTH replayBundle and
  // deterministicScore set. AnyNull covers both SQL NULL and JSON
  // null literal.
  const target = await prisma.auditIntelligence.findFirst({
    where: {
      NOT: [
        { replayBundle: { equals: Prisma.AnyNull } },
        { deterministicScore: { equals: Prisma.AnyNull } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      auditOrderId: true,
      replayBundle: true,
      deterministicScore: true,
      preflightSignals: true,
      createdAt: true,
    },
  });

  if (!target) {
    console.log(
      "[audit:replay-test] no AuditIntelligence row has replayBundle yet.",
    );
    console.log(
      "  → trigger an audit: POST /api/admin/orders/:id/run-geo-audit",
    );
    console.log("  → then retry: npm run audit:replay-test");
    await prisma.$disconnect();
    return;
  }

  const bundle = target.replayBundle as unknown as ReplayBundle;
  const storedScore = target.deterministicScore as unknown as DeterministicScore;
  const auditId = target.auditOrderId;

  console.log(
    `[audit:replay-test] target audit: ${shortId(auditId)}  computed_at=${bundle.computed_at}`,
  );

  // Replay via scoreAudit with the bundle's stored inputs.
  const recomputed = scoreAudit({
    preflightSignals: bundle.inputs.preflightSignals,
    intelligenceIngest: bundle.inputs.intelligenceIngest,
    renderResult: bundle.inputs.renderResult,
    history: bundle.inputs.history ?? undefined,
  });

  // Re-compute evidence from the same inputs and compare to stored.
  const recomputedEvidence: Evidence = gatherEvidence({
    preflightSignals: bundle.inputs.preflightSignals,
    intelligenceIngest: bundle.inputs.intelligenceIngest,
    renderResult: bundle.inputs.renderResult,
  });

  // Assertions
  const bundleVersionOk = bundle.bundle_version === REPLAY_BUNDLE_VERSION;
  const preflightPresent = target.preflightSignals !== null;
  const deterministicPresent = storedScore !== null;
  const bundlePresent = bundle !== null;

  // `computed_at` differs between bundle.output and recomputed (each
  // scoring run stamps its own timestamp). Compare the score ignoring
  // that single impure field.
  const normalize = (s: DeterministicScore): unknown => {
    const { computed_at: _ignored, ...rest } = s;
    return rest;
  };
  const recomputedJson = JSON.stringify(normalize(recomputed));
  const bundleOutputJson = JSON.stringify(normalize(bundle.output));
  const storedScoreJson = JSON.stringify(normalize(storedScore));

  const scoreUnchangedVsBundle = recomputedJson === bundleOutputJson;
  const scoreUnchangedVsStored = bundleOutputJson === storedScoreJson;
  const weightHashOk =
    recomputed.weight_hash === WEIGHT_HASH &&
    bundle.weight_hash === WEIGHT_HASH;
  const categoryHashOk =
    recomputed.category_hash === CATEGORY_HASH &&
    bundle.category_hash === CATEGORY_HASH;
  const evidenceShapeOk =
    JSON.stringify(recomputedEvidence) === JSON.stringify(bundle.evidence);

  console.log(
    `  bundle_version (replay@1):          ${ok(bundleVersionOk)}   (${bundle.bundle_version})`,
  );
  console.log(
    `  preflightSignals present:           ${ok(preflightPresent)}`,
  );
  console.log(
    `  deterministicScore present:         ${ok(deterministicPresent)}`,
  );
  console.log(`  replayBundle present:               ${ok(bundlePresent)}`);
  console.log(
    `  score unchanged on replay:          ${ok(scoreUnchangedVsBundle)}   (overall=${recomputed.overall_score} band=${recomputed.band})`,
  );
  console.log(
    `  bundle.output matches deterministicScore: ${ok(scoreUnchangedVsStored)}`,
  );
  console.log(
    `  weight_hash unchanged:              ${ok(weightHashOk)}   (${WEIGHT_HASH})`,
  );
  console.log(
    `  category_hash unchanged:            ${ok(categoryHashOk)}   (${CATEGORY_HASH})`,
  );
  console.log(`  evidence shape stable:              ${ok(evidenceShapeOk)}`);
  console.log("");

  const allOk =
    bundleVersionOk &&
    preflightPresent &&
    deterministicPresent &&
    bundlePresent &&
    scoreUnchangedVsBundle &&
    scoreUnchangedVsStored &&
    weightHashOk &&
    categoryHashOk &&
    evidenceShapeOk;

  if (!allOk) {
    console.log("REPLAY FAILED");
    if (!scoreUnchangedVsBundle) {
      console.log("  Diagnostic — recomputed score JSON:");
      console.log(`    ${recomputedJson.slice(0, 200)}…`);
      console.log("  Diagnostic — bundle.output JSON:");
      console.log(`    ${bundleOutputJson.slice(0, 200)}…`);
    }
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  console.log("NEW AUDITS REPLAYABLE");
  console.log("SCORING STILL CANONICAL");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[audit:replay-test] unhandled error:", err);
  process.exitCode = 1;
});
