/* eslint-disable no-console */
/**
 * scripts/replay-audits.ts
 *
 * Replay deterministic scoring against historical AuditIntelligence
 * rows and report calibration drift. Read-only by design: no LLM
 * calls, no DB writes, no Stripe/Resend/worker side effects, no
 * recrawls. Cost is $0 in the default deterministic-only mode.
 *
 * Usage:
 *   npx tsx scripts/replay-audits.ts                          # 20 most-recent
 *   npx tsx scripts/replay-audits.ts --limit 50
 *   npx tsx scripts/replay-audits.ts --since 2026-05-01
 *   npx tsx scripts/replay-audits.ts --audit-id <cuid>
 *   npx tsx scripts/replay-audits.ts --cal-prefix             # [CAL]-prefixed orders
 *   npx tsx scripts/replay-audits.ts --validators skip
 *   npx tsx scripts/replay-audits.ts --validators live        # opt-in LLM re-call
 *   npx tsx scripts/replay-audits.ts --json                   # machine-readable
 *
 * Pairs with the existing one-row `npm run audit:replay-test`. This
 * generalizes that pattern over a cohort and adds delta + status
 * reporting. See plan: /Users/davidshinavar/.claude/plans/sprightly-meandering-peach.md
 */

import "dotenv/config";
import { Prisma } from "@prisma/client";

import { prisma } from "../src/lib/db";
import { computeConsensusIndex } from "../src/lib/consensus";
import { parseReportScoreBreakdown } from "../src/lib/parse-report";
import { scoreAudit } from "../src/lib/scoring";
import { bandFor } from "../src/lib/scoring/bands";
import { CATEGORY_HASH, WEIGHT_HASH } from "../src/lib/scoring/frozen";
import type { ReplayBundle } from "../src/lib/scoring/replay-bundle";
import type {
  Band,
  DeterministicScore,
  Finding,
} from "../src/lib/scoring/types";
import { runAiValidationLayer } from "../src/lib/validators";
import type {
  ValidationInput,
  ValidationLayerResult,
} from "../src/lib/validators/types";

// ─── flag parsing ───────────────────────────────────────────────

type ValidatorMode = "stored" | "skip" | "live";

type Cohort =
  | { kind: "audit-id"; id: string }
  | { kind: "since"; iso: string }
  | { kind: "limit"; n: number }
  | { kind: "cal-prefix" };

type Args = {
  cohort: Cohort;
  validators: ValidatorMode;
  json: boolean;
  persist: boolean;
  yes: boolean;
};

const PERSIST_CONFIRMATION_THRESHOLD = 500;

function die(msg: string): never {
  console.error(`[replay-audits] error: ${msg}`);
  process.exit(2);
}

function printHelp(): void {
  console.log(
    [
      "Usage: npx tsx scripts/replay-audits.ts [options]",
      "",
      "Cohort (mutually exclusive; default: --limit 20):",
      "  --audit-id <cuid>     Replay a single AuditIntelligence row",
      "  --since <ISO>         Replay all audits with createdAt >= ISO",
      "  --limit <N>           Replay the N most-recent audits",
      "  --cal-prefix          Replay [CAL]-prefixed orders only",
      "",
      "Behavior:",
      "  --validators stored   (default) reuse stored aiValidations; recompute consensus only",
      "  --validators skip     skip validator/consensus replay entirely",
      "  --validators live     re-call LLM validators (requires the per-provider *_API_KEY envs)",
      "",
      "Output:",
      "  --json                emit machine-readable JSON instead of human report",
      "",
      "Persistence (opt-in):",
      "  --persist             write each ReplayResult to CalibrationReplay table",
      `  --yes                 skip the safety prompt when cohort > ${PERSIST_CONFIRMATION_THRESHOLD} rows`,
      "",
      "Exit codes: 0 success · 2 bad args · 1 runtime failure",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    cohort: { kind: "limit", n: 20 },
    validators: "stored",
    json: false,
    persist: false,
    yes: false,
  };
  let cohortSet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const setCohort = (c: Cohort) => {
      if (cohortSet) die("multiple cohort flags supplied");
      cohortSet = true;
      out.cohort = c;
    };
    switch (a) {
      case "--audit-id": {
        const id = argv[++i];
        if (!id) die("--audit-id requires a value");
        setCohort({ kind: "audit-id", id });
        break;
      }
      case "--since": {
        const iso = argv[++i];
        if (!iso || Number.isNaN(Date.parse(iso))) {
          die("--since requires a valid ISO date string");
        }
        setCohort({ kind: "since", iso });
        break;
      }
      case "--limit": {
        const n = parseInt(argv[++i] ?? "", 10);
        if (!Number.isFinite(n) || n <= 0) {
          die("--limit requires a positive integer");
        }
        setCohort({ kind: "limit", n });
        break;
      }
      case "--cal-prefix":
        setCohort({ kind: "cal-prefix" });
        break;
      case "--validators": {
        const m = argv[++i];
        if (m !== "stored" && m !== "skip" && m !== "live") {
          die(`--validators must be one of stored|skip|live (got ${m})`);
        }
        out.validators = m;
        break;
      }
      case "--json":
        out.json = true;
        break;
      case "--persist":
        out.persist = true;
        break;
      case "--yes":
        out.yes = true;
        break;
      case "--archetypes":
        die(
          "--archetypes is not supported in v1 (synthetic per-category inputs, not stored audits). " +
            "Use scripts/calibration-recalc.ts --archetypes instead.",
        );
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        die(`unknown argument: ${a}`);
    }
  }
  return out;
}

// ─── result types ───────────────────────────────────────────────

type CalibrationStatus =
  | "stable"
  | "minor_drift"
  | "major_drift"
  | "band_moved"
  | "partial_replay"
  | "hash_mismatch"
  | "unreplayable";

type ReplayResult = {
  audit_id: string;
  created_at: string;
  original_overall: number | null;
  original_band: Band | null;
  recalculated_overall: number | null;
  recalculated_band: Band | null;
  delta: number | null;
  band_change: boolean;
  changed_findings: { added: string[]; removed: string[] } | null;
  runtime_ms: number;
  estimated_cost_usd: number;
  scoring_version_original: string | null;
  weight_hash_match: boolean | null;
  category_hash_match: boolean | null;
  consensus_recomputed: boolean;
  calibration_status: CalibrationStatus;
  notes: string[];
};

// ─── cohort selection ───────────────────────────────────────────

type LoadedRow = {
  auditOrderId: string;
  createdAt: Date;
  overallScore: number | null;
  scoringVersion: string | null;
  replayBundle: ReplayBundle | null;
  deterministicScore: DeterministicScore | null;
  aiValidations: ValidationLayerResult | null;
  reportMarkdown: string | null;
  businessName: string | null;
  websiteUrl: string | null;
};

const SELECT_FIELDS = {
  auditOrderId: true,
  createdAt: true,
  overallScore: true,
  scoringVersion: true,
  replayBundle: true,
  deterministicScore: true,
  aiValidations: true,
  businessName: true,
  websiteUrl: true,
  auditOrder: { select: { reportMarkdown: true } },
} as const;

async function selectCohort(args: Args): Promise<LoadedRow[]> {
  const c = args.cohort;
  const rows = await (() => {
    switch (c.kind) {
      case "audit-id":
        return prisma.auditIntelligence.findMany({
          where: { auditOrderId: c.id },
          select: SELECT_FIELDS,
        });
      case "since":
        return prisma.auditIntelligence.findMany({
          where: { createdAt: { gte: new Date(c.iso) } },
          orderBy: { createdAt: "desc" },
          select: SELECT_FIELDS,
        });
      case "limit":
        return prisma.auditIntelligence.findMany({
          orderBy: { createdAt: "desc" },
          take: c.n,
          select: SELECT_FIELDS,
        });
      case "cal-prefix":
        return prisma.auditIntelligence.findMany({
          where: { businessName: { startsWith: "[CAL]" } },
          orderBy: { createdAt: "desc" },
          select: SELECT_FIELDS,
        });
    }
  })();

  return rows.map((r) => ({
    auditOrderId: r.auditOrderId,
    createdAt: r.createdAt,
    overallScore: r.overallScore,
    scoringVersion: r.scoringVersion,
    replayBundle: (r.replayBundle as unknown as ReplayBundle | null) ?? null,
    deterministicScore:
      (r.deterministicScore as unknown as DeterministicScore | null) ?? null,
    aiValidations:
      (r.aiValidations as unknown as ValidationLayerResult | null) ?? null,
    reportMarkdown: r.auditOrder?.reportMarkdown ?? null,
    businessName: r.businessName,
    websiteUrl: r.websiteUrl,
  }));
}

// ─── per-row replay ─────────────────────────────────────────────

// Per-call cost estimates for the validator layer in `live` mode.
// Sourced from scripts/test-live-validators.ts ESTIMATED_COST_PER_CALL_USD.
const VALIDATOR_COST_PER_CALL_USD: Record<string, number> = {
  openai: 0.0008,
  claude: 0.002,
  gemini: 0.0006,
  perplexity: 0.006,
  google_ai_overview: 0,
};

function findingIds(findings: Finding[] | undefined): string[] {
  return findings ? findings.map((f) => f.id) : [];
}

function diffIds(
  before: string[],
  after: string[],
): { added: string[]; removed: string[] } {
  const a = new Set(before);
  const b = new Set(after);
  return {
    added: [...b].filter((x) => !a.has(x)),
    removed: [...a].filter((x) => !b.has(x)),
  };
}

function classify(
  delta: number | null,
  bandChanged: boolean,
  hashMismatch: boolean,
  partial: boolean,
): CalibrationStatus {
  if (delta === null) return "unreplayable";
  if (partial) return "partial_replay";
  if (hashMismatch) return "hash_mismatch";
  if (bandChanged) return "band_moved";
  const abs = Math.abs(delta);
  if (abs <= 1) return "stable";
  if (abs <= 4) return "minor_drift";
  return "major_drift";
}

async function replayOne(
  row: LoadedRow,
  validatorMode: ValidatorMode,
): Promise<ReplayResult> {
  const t0 = Date.now();
  const notes: string[] = [];
  let recomputed: DeterministicScore | null = null;
  let partial = false;
  let estimatedCost = 0;
  let consensusRecomputed = false;

  // ── deterministic replay ──
  if (row.replayBundle) {
    try {
      recomputed = scoreAudit({
        preflightSignals: row.replayBundle.inputs.preflightSignals,
        intelligenceIngest: row.replayBundle.inputs.intelligenceIngest,
        renderResult: row.replayBundle.inputs.renderResult,
        history: row.replayBundle.inputs.history ?? undefined,
      });
    } catch (err) {
      notes.push(`scoreAudit threw: ${(err as Error).message.slice(0, 120)}`);
    }
  } else if (row.reportMarkdown) {
    // Legacy fallback — derive overall from per-category sums in the
    // stored markdown. No Evidence, so caps/synergy/penalties may not
    // match the original run. Mark as partial.
    const parsed = parseReportScoreBreakdown(row.reportMarkdown);
    if (parsed.overall !== null) {
      partial = true;
      notes.push(
        "no replayBundle — partial replay from reportMarkdown (per-category sum only; caps/synergy not applied)",
      );
      // Synthesize a minimal DeterministicScore-shaped object for the
      // overall + band fields used below. We never let it leak as the
      // canonical output.
      recomputed = {
        overall_score: parsed.overall,
        band: bandFor(parsed.overall),
        // unused fields blanked so callers can't accidentally treat this as
        // a real DeterministicScore
        scoring_version: "partial-from-markdown",
        weight_hash: "",
        category_hash: "",
        category_scores: {} as DeterministicScore["category_scores"],
        public_bucket_scores: {} as DeterministicScore["public_bucket_scores"],
        synergy_bonus_applied: 0,
        synergy_bonus_reason: null,
        synergy_bonus_tier: "none",
        recommendation_lift_applied: 0,
        recommendation_lift_reason: null,
        applied_caps: [],
        applied_penalties: [],
        top_3_findings: [],
        top_3_recommended_fixes: [],
        confidence_level: "low",
        confidence_score: 0,
        confidence_inputs: {
          evidence_completeness: 0,
          preflight_success: 0,
          schema_certainty: 0,
          entity_certainty: 0,
          content_extraction_quality: 0,
          render_coverage: 0,
        },
        score_stability_index: null,
        score_stability_reason: "n/a (partial replay)",
        evidence_summary: {
          preflight_ok: false,
          schema_validated: false,
          crawlability_audited: false,
          entity_checked: false,
          ingest_present: false,
          render_attempted: false,
        },
        trace: { stages: [] },
        computed_at: new Date().toISOString(),
      };
    } else {
      notes.push("reportMarkdown could not be parsed for per-category sum");
    }
  } else {
    notes.push("no replayBundle and no reportMarkdown — cannot replay");
  }

  // ── validator/consensus replay ──
  if (validatorMode === "stored" && row.aiValidations && recomputed) {
    try {
      computeConsensusIndex({
        deterministicScore: recomputed,
        validatorResult: row.aiValidations,
        nowIso: row.replayBundle?.computed_at,
      });
      consensusRecomputed = true;
    } catch (err) {
      notes.push(
        `consensus replay failed: ${(err as Error).message.slice(0, 120)}`,
      );
    }
  } else if (validatorMode === "live" && recomputed && row.websiteUrl) {
    try {
      const input: ValidationInput = {
        businessName: row.businessName,
        url: row.websiteUrl,
        deterministicScore: recomputed,
        categoryScores: recomputed.category_scores,
        extractedEvidence: row.replayBundle?.evidence ?? null,
        reportContext: { audit_id: row.auditOrderId },
      };
      const result = await runAiValidationLayer(input);
      for (const o of result.outputs) {
        if (o.status === "passed") {
          estimatedCost += VALIDATOR_COST_PER_CALL_USD[o.provider] ?? 0;
        }
      }
      computeConsensusIndex({
        deterministicScore: recomputed,
        validatorResult: result,
      });
      consensusRecomputed = true;
    } catch (err) {
      notes.push(
        `live validator replay failed: ${(err as Error).message.slice(0, 120)}`,
      );
    }
  }

  // ── deltas ──
  const original =
    row.replayBundle?.output.overall_score ??
    row.deterministicScore?.overall_score ??
    row.overallScore ??
    null;
  const recalc = recomputed ? recomputed.overall_score : null;
  const delta = original !== null && recalc !== null ? recalc - original : null;
  const originalBand: Band | null =
    row.replayBundle?.output.band ??
    row.deterministicScore?.band ??
    (original !== null ? bandFor(original) : null);
  const recalcBand: Band | null = recomputed ? recomputed.band : null;
  const bandChanged =
    originalBand !== null &&
    recalcBand !== null &&
    originalBand !== recalcBand;

  // Hash drift — only meaningful for full (non-partial) replays
  const originalWeightHash = row.replayBundle?.weight_hash ?? null;
  const originalCategoryHash = row.replayBundle?.category_hash ?? null;
  const weightHashMatch =
    originalWeightHash !== null ? originalWeightHash === WEIGHT_HASH : null;
  const categoryHashMatch =
    originalCategoryHash !== null
      ? originalCategoryHash === CATEGORY_HASH
      : null;
  const hashMismatch =
    (weightHashMatch === false || categoryHashMatch === false) && !partial;

  // Findings diff — only when both sides have populated findings
  const originalFindings = findingIds(
    row.replayBundle?.output.top_3_findings ??
      row.deterministicScore?.top_3_findings,
  );
  const recalcFindings = findingIds(recomputed?.top_3_findings);
  const changedFindings =
    originalFindings.length || recalcFindings.length
      ? diffIds(originalFindings, recalcFindings)
      : null;

  const calibration_status = classify(delta, bandChanged, hashMismatch, partial);

  return {
    audit_id: row.auditOrderId,
    created_at: row.createdAt.toISOString(),
    original_overall: original,
    original_band: originalBand,
    recalculated_overall: recalc,
    recalculated_band: recalcBand,
    delta,
    band_change: bandChanged,
    changed_findings: changedFindings,
    runtime_ms: Date.now() - t0,
    estimated_cost_usd: estimatedCost,
    scoring_version_original:
      row.replayBundle?.scoring_version ??
      row.deterministicScore?.scoring_version ??
      row.scoringVersion,
    weight_hash_match: weightHashMatch,
    category_hash_match: categoryHashMatch,
    consensus_recomputed: consensusRecomputed,
    calibration_status,
    notes,
  };
}

// ─── output formatting ─────────────────────────────────────────

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

function fmtNum(n: number | null, width: number): string {
  return (n === null ? "—" : String(n)).padStart(width);
}

function fmtDelta(d: number | null): string {
  if (d === null) return "  —";
  if (d === 0) return "   0";
  return (d > 0 ? `+${d}` : String(d)).padStart(4);
}

function fmtBandChange(orig: Band | null, recalc: Band | null): string {
  if (!orig && !recalc) return "—";
  if (orig === recalc) return `${orig} → −`;
  return `${orig ?? "—"} → ${recalc ?? "—"}`;
}

function printHumanReport(results: ReplayResult[], args: Args): void {
  const validatorLabel =
    args.validators === "stored"
      ? "stored"
      : args.validators === "skip"
        ? "skip"
        : "live (LLM re-call)";
  const cohortLabel = (() => {
    switch (args.cohort.kind) {
      case "audit-id":
        return `--audit-id ${args.cohort.id}`;
      case "since":
        return `--since ${args.cohort.iso}`;
      case "limit":
        return `--limit ${args.cohort.n}`;
      case "cal-prefix":
        return "--cal-prefix";
    }
  })();
  console.log(
    `[replay] cohort: ${cohortLabel}  ·  validators: ${validatorLabel}  ·  total: ${results.length} audits`,
  );
  console.log("");

  const header =
    "  audit_id     original  recalc  delta  band_change            runtime  status";
  console.log(header);
  console.log("  ".padEnd(header.length, "─"));
  for (const r of results) {
    const bandDisplay = fmtBandChange(
      r.original_band,
      r.recalculated_band,
    ).padEnd(22);
    const status = r.calibration_status;
    const extra = r.weight_hash_match === false ? "  ⚠ hash_mismatch" : "";
    console.log(
      `  ${shortId(r.audit_id).padEnd(12)} ${fmtNum(r.original_overall, 8)}  ${fmtNum(r.recalculated_overall, 6)}  ${fmtDelta(r.delta)}  ${bandDisplay}  ${String(r.runtime_ms).padStart(5)}ms  ${status}${extra}`,
    );
  }

  // aggregate
  const counts: Record<CalibrationStatus, number> = {
    stable: 0,
    minor_drift: 0,
    major_drift: 0,
    band_moved: 0,
    partial_replay: 0,
    hash_mismatch: 0,
    unreplayable: 0,
  };
  let totalRuntime = 0;
  let totalCost = 0;
  let deltaSumAbs = 0;
  let deltaCount = 0;
  for (const r of results) {
    counts[r.calibration_status] += 1;
    totalRuntime += r.runtime_ms;
    totalCost += r.estimated_cost_usd;
    if (r.delta !== null) {
      deltaSumAbs += Math.abs(r.delta);
      deltaCount += 1;
    }
  }
  const pct = (n: number) =>
    results.length === 0 ? "0%" : `${Math.round((100 * n) / results.length)}%`;
  console.log("");
  console.log("Aggregate:");
  console.log(`  stable:          ${counts.stable.toString().padStart(3)} (${pct(counts.stable)})`);
  console.log(`  minor_drift:     ${counts.minor_drift.toString().padStart(3)} (${pct(counts.minor_drift)})`);
  console.log(`  major_drift:     ${counts.major_drift.toString().padStart(3)} (${pct(counts.major_drift)})`);
  console.log(`  band_moved:      ${counts.band_moved.toString().padStart(3)} (${pct(counts.band_moved)})`);
  console.log(`  hash_mismatch:   ${counts.hash_mismatch.toString().padStart(3)} (rubric changed since audit ran)`);
  console.log(`  partial_replay:  ${counts.partial_replay.toString().padStart(3)}`);
  console.log(`  unreplayable:    ${counts.unreplayable.toString().padStart(3)}`);
  console.log("");
  console.log(
    `  mean |delta|:    ${deltaCount === 0 ? "—" : (deltaSumAbs / deltaCount).toFixed(2)}`,
  );
  console.log(`  total runtime:   ${totalRuntime}ms`);
  console.log(
    `  estimated cost:  $${totalCost.toFixed(4)}  (${args.validators === "live" ? "live validators" : "deterministic-only"})`,
  );
}

// ─── persistence (opt-in via --persist) ─────────────────────────

type CategoryDelta = {
  category: string;
  original: number | null;
  recalculated: number | null;
  delta: number | null;
};

/**
 * Build the optional drill-down payload (`categoryDeltas`) from
 * before/after category scores. Returns null when either side is
 * unavailable (e.g. partial_replay rows that lack a replayBundle).
 */
function buildCategoryDeltas(
  row: LoadedRow,
  recomputedCategoryScores: DeterministicScore["category_scores"] | undefined,
): CategoryDelta[] | null {
  const originalCats =
    row.replayBundle?.output.category_scores ??
    row.deterministicScore?.category_scores ??
    null;
  if (!originalCats || !recomputedCategoryScores) return null;
  const keys = Object.keys(recomputedCategoryScores) as Array<
    keyof DeterministicScore["category_scores"]
  >;
  return keys.map((k) => {
    const o = (originalCats as DeterministicScore["category_scores"])[k]?.score ?? null;
    const r = recomputedCategoryScores[k]?.score ?? null;
    return {
      category: String(k),
      original: o,
      recalculated: r,
      delta: o !== null && r !== null ? r - o : null,
    };
  });
}

async function persistReplay(
  row: LoadedRow,
  result: ReplayResult,
  replayMode: ValidatorMode,
): Promise<void> {
  // Re-derive category_scores from the same stored inputs so we can
  // emit categoryDeltas. Cheap pure call (~ms). Skips when the row
  // didn't carry a replayBundle (partial_replay / unreplayable) —
  // categoryDeltas stays null in that case.
  let recomputedCats: DeterministicScore["category_scores"] | undefined;
  if (row.replayBundle && result.calibration_status !== "unreplayable") {
    try {
      const score = scoreAudit({
        preflightSignals: row.replayBundle.inputs.preflightSignals,
        intelligenceIngest: row.replayBundle.inputs.intelligenceIngest,
        renderResult: row.replayBundle.inputs.renderResult,
        history: row.replayBundle.inputs.history ?? undefined,
      });
      recomputedCats = score.category_scores;
    } catch {
      // Already noted in result.notes by replayOne; just skip the
      // drill-down payload.
    }
  }
  const categoryDeltas = buildCategoryDeltas(row, recomputedCats);
  await prisma.calibrationReplay.create({
    data: {
      auditId: result.audit_id,
      originalScore: result.original_overall,
      recalculatedScore: result.recalculated_overall,
      delta: result.delta,
      previousBand: result.original_band ?? null,
      currentBand: result.recalculated_band ?? null,
      bandChanged: result.band_change,
      replayStatus: result.calibration_status,
      runtimeMs: result.runtime_ms,
      replayMode,
      scoringVersion: result.scoring_version_original,
      weightHashMatch: result.weight_hash_match,
      categoryHashMatch: result.category_hash_match,
      // Hash lineage — capture the actual stamped values from the
      // source bundle so analysts can query "drift from rows stamped
      // with weight_hash=abc123" without rerunning. Null when the
      // source row has no replayBundle (partial_replay fallback).
      weightHashOriginal: row.replayBundle?.weight_hash ?? null,
      categoryHashOriginal: row.replayBundle?.category_hash ?? null,
      categoryDeltas: categoryDeltas ?? undefined,
      changedFindings: result.changed_findings ?? undefined,
    },
  });
}

// ─── main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let cohort: LoadedRow[];
  try {
    cohort = await selectCohort(args);
  } catch (err) {
    die(`cohort selection failed: ${(err as Error).message}`);
  }

  if (cohort.length === 0) {
    console.log("[replay] no audits matched the cohort selection.");
    await prisma.$disconnect();
    return;
  }

  if (args.validators === "live") {
    if (!args.json) {
      // Rough upper-bound estimate to warn the operator
      const perAudit = Object.values(VALIDATOR_COST_PER_CALL_USD).reduce(
        (a, b) => a + b,
        0,
      );
      console.log(
        `[replay] --validators live — estimated upper-bound cost: ~$${(perAudit * cohort.length).toFixed(4)} across ${cohort.length} audits`,
      );
    }
  }

  if (
    args.persist &&
    cohort.length > PERSIST_CONFIRMATION_THRESHOLD &&
    !args.yes
  ) {
    die(
      `--persist would write ${cohort.length} rows to CalibrationReplay (> ${PERSIST_CONFIRMATION_THRESHOLD} threshold). ` +
        "Re-run with --yes to confirm.",
    );
  }

  const results: ReplayResult[] = [];
  let persistedCount = 0;
  for (const row of cohort) {
    const result = await replayOne(row, args.validators);
    results.push(result);
    if (args.persist) {
      try {
        await persistReplay(row, result, args.validators);
        persistedCount += 1;
      } catch (err) {
        console.error(
          `[replay] persist failed for audit ${result.audit_id}: ${(err as Error).message.slice(0, 200)}`,
        );
      }
    }
  }

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printHumanReport(results, args);
    if (args.persist) {
      console.log("");
      console.log(
        `[replay] persisted ${persistedCount} row${persistedCount === 1 ? "" : "s"} to CalibrationReplay${persistedCount < results.length ? ` (${results.length - persistedCount} skipped — see errors above)` : ""}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[replay-audits] unhandled error:", err);
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 1;
});
