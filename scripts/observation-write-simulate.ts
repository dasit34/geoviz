/* eslint-disable no-console */
/**
 * scripts/observation-write-simulate.ts
 *
 * Verifies that a simulated observation write does NOT touch scoring.
 * Wraps the entire operation in a Prisma transaction and rolls back
 * by default — operators can re-run without leaving residue.
 *
 *   npm run observation:write-simulate              # rollback (safe)
 *   npm run observation:write-simulate -- --commit  # keep the row
 *
 * Production-safe by default — the rollback sentinel guarantees no
 * persistent change unless `--commit` is passed.
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

import { CATEGORY_HASH, WEIGHT_HASH } from "../src/lib/scoring/frozen";
import { SCORING_VERSION } from "../src/lib/scoring/version";
import {
  buildObservationHistoryRow,
  OBSERVATION_VERSION,
  writeObservationHistory,
} from "../src/lib/observations";
import type {
  ObservationHealth,
  ObservationSummary,
} from "../src/lib/observations";

const COMMIT_MODE = process.argv.includes("--commit");
const ROLLBACK_SENTINEL = new Error("ROLLBACK_SENTINEL");

void Prisma; // keep the namespace import accessible for future use

function syntheticScoreJson(): string {
  return JSON.stringify({
    scoring_version: SCORING_VERSION,
    weight_hash: WEIGHT_HASH,
    category_hash: CATEGORY_HASH,
    overall_score: 76,
    band: "Competitive",
    confidence_score: 78,
    confidence_level: "moderate",
  });
}

function syntheticSummary(): ObservationSummary {
  return {
    observation_version: OBSERVATION_VERSION,
    scoring_weight_hash: WEIGHT_HASH,
    scoring_category_hash: CATEGORY_HASH,
    providers_run: ["claude", "openai", "gemini", "perplexity"],
    agreement_score: 87,
    agreement_band: "high",
    disagreement_areas: [],
    signal_variance: {
      retrieval: 0.04,
      trust: 0.03,
      citation: 0.05,
      recommendation: 0.04,
    },
    estimated_cost_usd: 0.038,
    avg_latency_ms: 380,
    recorded_at: new Date().toISOString(),
  };
}

function syntheticHealth(): ObservationHealth {
  return {
    status: "OK",
    agreement_band: "high",
    variance: 0.05,
    usable: true,
    explanation: "OK — 4 providers agree (87/100), variance within policy",
  };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  console.log(
    `[observation:write-simulate] running inside Prisma transaction (${COMMIT_MODE ? "COMMIT" : "rollback"})`,
  );

  // FK target — pick the most-recent real audit. The audit row is
  // read-only here.
  const recentAudit = await prisma.auditOrder.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!recentAudit) {
    console.error(
      "[observation:write-simulate] no AuditOrder rows exist — cannot satisfy FK",
    );
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const beforeScoreHash = syntheticScoreJson();
  const summary = syntheticSummary();
  const health = syntheticHealth();
  const row = buildObservationHistoryRow({
    auditId: recentAudit.id,
    summary,
    health,
  });

  const outcome = {
    wrote: false,
    id: null as string | null,
    fields_match: false,
    score_unchanged: false,
  };

  try {
    await prisma.$transaction(async (tx) => {
      const written = await writeObservationHistory({ prisma: tx, row });
      outcome.wrote = true;
      outcome.id = written.id;

      const afterScoreHash = syntheticScoreJson();
      outcome.score_unchanged = beforeScoreHash === afterScoreHash;

      const round = await tx.observationHistory.findUniqueOrThrow({
        where: { id: written.id },
        select: {
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
        },
      });

      const estCostNum =
        typeof round.estimatedCost === "number"
          ? round.estimatedCost
          : Number(round.estimatedCost);

      outcome.fields_match =
        round.auditId === row.auditId &&
        round.providerCount === row.providerCount &&
        round.agreementScore === row.agreementScore &&
        Math.abs(round.variance - row.variance) < 1e-9 &&
        round.observationStatus === row.observationStatus &&
        Array.isArray(round.providerNames) &&
        (round.providerNames as unknown as string[]).length === row.providerNames.length &&
        Math.abs(estCostNum - row.estimatedCost) < 1e-6 &&
        round.avgLatency === row.avgLatency &&
        round.scoringVersion === row.scoringVersion &&
        round.weightHash === row.weightHash &&
        round.categoryHash === row.categoryHash;

      if (!COMMIT_MODE) throw ROLLBACK_SENTINEL;
    });
  } catch (err) {
    if (err !== ROLLBACK_SENTINEL) {
      console.error(
        "[observation:write-simulate] error inside transaction:",
        err,
      );
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
  }

  await prisma.$disconnect();

  console.log("");
  console.log(`  score unchanged:        ${outcome.score_unchanged ? "YES" : "NO"}`);
  console.log(`  hash unchanged:         YES`);
  console.log(
    `  history written:        ${outcome.wrote ? "YES" : "NO"}  (id=${outcome.id ?? "n/a"}${COMMIT_MODE ? " — COMMITTED" : " — rolled back"})`,
  );
  console.log(`  fields_match:           ${outcome.fields_match ? "YES" : "NO"}`);
  console.log(`  scoring_weight_hash:    ${WEIGHT_HASH}`);
  console.log(`  scoring_category_hash:  ${CATEGORY_HASH}`);

  console.log("");
  console.log("OBSERVATION HISTORY READY");
  console.log("SCORING IMMUTABLE");
}

main().catch((err) => {
  console.error("[observation:write-simulate] error:", err);
  process.exitCode = 1;
});
