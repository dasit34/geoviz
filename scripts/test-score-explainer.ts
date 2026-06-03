/* eslint-disable no-console */
/**
 * scripts/test-score-explainer.ts
 *
 * Phase 4 (score clarity) guard. The single most-asked customer
 * question about the report is: "If my Technical Access is 100 and AI
 * Readability is 90, why is my overall only 43?" `deriveScoreExplanation`
 * answers it deterministically from the six category ratios — no model
 * generation, no fabrication risk — and only when there's a genuine
 * spread worth explaining.
 *
 * Pins the gate + the content:
 *   - fires for a wide-spread sub-70 score (>=1 cat >=80%, >=1 cat <40%);
 *   - names the strong AND the weak categories;
 *   - states the actual overall number;
 *   - stays SILENT for high scores, narrow spreads, and the exact
 *     "Technical 100 / Trust 10 -> Overall 43" confusion case is
 *     covered explicitly.
 */

import assert from "node:assert/strict";

import { deriveScoreExplanation } from "../src/components/ReportScoreCard";
import type { ReportScore, ScoreCategory } from "../src/lib/parse-report";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (err) {
    const line = `  ✗ ${label} — ${(err as Error).message}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

// Category display metadata (short labels are what the explainer uses).
const META: Record<ScoreCategory["key"], { label: string; short: string; max: number }> = {
  schema: { label: "Structured Data / Schema", short: "Recommendation Ready", max: 25 },
  crawler: { label: "AI Crawler Readiness", short: "Technical Access", max: 20 },
  trust: { label: "Local Trust Signals", short: "Trust Signals", max: 20 },
  content: { label: "Content Depth + FAQ Quality", short: "Content Depth", max: 15 },
  brand: { label: "Brand / Entity Clarity", short: "Brand Presence", max: 10 },
  tech: { label: "Technical Accessibility", short: "AI Readability", max: 10 },
};

function cat(key: ScoreCategory["key"], score: number | null): ScoreCategory {
  const m = META[key];
  return { key, label: m.label, short: m.short, tooltip: "", max: m.max, score };
}

function score(overall: number | null, cells: Partial<Record<ScoreCategory["key"], number | null>>): ReportScore {
  const categories = (Object.keys(META) as ScoreCategory["key"][]).map((k) =>
    cat(k, k in cells ? (cells[k] as number | null) : 0),
  );
  return { overall, status: null, categories };
}

console.log("[score-explainer] running...");

// ── The flagship confusion case ─────────────────────────────────────
check("Technical 100 / Trust 10 -> Overall 43 produces an explainer", () => {
  // crawler (Technical Access) = 20/20 = 100%, tech (AI Readability) =
  // 9/10 = 90%, trust = 2/20 = 10%, schema = 2/25 = 8%.
  const s = score(43, { crawler: 20, tech: 9, trust: 2, schema: 2, content: 8, brand: 2 });
  const out = deriveScoreExplanation(s);
  assert.ok(out, "expected a non-null explainer");
  assert.match(out!, /Technical Access|AI Readability/, "names a strong category");
  assert.match(out!, /Trust Signals|Recommendation Ready/, "names a weak category");
  assert.match(out!, /\b43\b/, "states the actual overall number");
});

// ── Gate: silent when the score is high ─────────────────────────────
check("no explainer when overall >= 70", () => {
  const s = score(82, { crawler: 20, tech: 10, trust: 18, schema: 20, content: 12, brand: 8 });
  assert.equal(deriveScoreExplanation(s), null);
});

// ── Gate: silent when the spread is narrow (no strong category) ─────
check("no explainer when no category reaches 80%", () => {
  const s = score(50, { crawler: 12, tech: 6, trust: 10, schema: 12, content: 7, brand: 5 });
  assert.equal(deriveScoreExplanation(s), null, "max ratio 60% < 80% gate");
});

// ── Gate: silent when the spread is narrow (no weak category) ───────
check("no explainer when no category is below 40%", () => {
  const s = score(60, { crawler: 18, tech: 9, trust: 12, schema: 15, content: 9, brand: 6 });
  assert.equal(deriveScoreExplanation(s), null, "min ratio >= 40% gate");
});

// ── Gate: silent when overall is null (pending) ─────────────────────
check("no explainer when overall is null", () => {
  const s = score(null, { crawler: 20, trust: 2, schema: 2, tech: 9, content: 8, brand: 2 });
  assert.equal(deriveScoreExplanation(s), null);
});

if (failed > 0) {
  console.log(`[score-explainer] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[score-explainer] passed=${passed} failed=0`);
