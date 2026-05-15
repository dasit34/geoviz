/* eslint-disable no-console */
/**
 * scripts/test-report-copy-defensibility.ts
 *
 *   npm run test:report-copy-defensibility
 *
 * Two-layer guard for the report copy polish:
 *
 *   1. The worker prompt (scripts/geo-worker.ts) contains the
 *      DEFENSIBLE LANGUAGE block + the DISTINCT SECTION ROLES block
 *      + the SCORE FRAMING block. If anyone deletes them, the
 *      prompt loses its anti-overclaim guardrails and the model can
 *      drift back into the absolute language we explicitly banned.
 *
 *   2. Static customer-facing strings (ReportCtaCard + Platform
 *      Visibility labels in parse-report.ts) MUST NOT contain the
 *      specific absolute phrases the reviewed PDF flagged.
 *
 * NOTE: this test cannot guard the model's runtime output — that's
 * the prompt's job. It guards (a) the prompt itself and (b) the
 * hand-authored strings in the codebase.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}\n      ${message}`);
  }
}

const REPO = join(__dirname, "..");
const WORKER = readFileSync(join(REPO, "scripts/geo-worker.ts"), "utf-8");
const CTA = readFileSync(
  join(REPO, "src/components/ReportCtaCard.tsx"),
  "utf-8",
);
const PARSE = readFileSync(
  join(REPO, "src/lib/parse-report.ts"),
  "utf-8",
);

// ─── 1. Worker prompt contains the new guardrail blocks ──────────
console.log("\n[1] Worker prompt — guardrail blocks present");

test("DEFENSIBLE LANGUAGE block is present in worker prompt", () => {
  // Block must appear in BOTH the fast and full prompts. Two matches.
  const matches = WORKER.match(/DEFENSIBLE LANGUAGE \(mandatory/g) ?? [];
  assert.equal(
    matches.length,
    2,
    `expected DEFENSIBLE LANGUAGE in BOTH prompts (fast + full), found ${matches.length}`,
  );
});

test("DISTINCT SECTION ROLES block is present in BOTH prompts", () => {
  const matches = WORKER.match(/DISTINCT SECTION ROLES \(mandatory/g) ?? [];
  assert.equal(matches.length, 2);
});

test("SCORE FRAMING block is present in BOTH prompts", () => {
  const matches = WORKER.match(/SCORE FRAMING \(mandatory/g) ?? [];
  assert.equal(matches.length, 2);
});

test("worker prompt explicitly bans absolute phrases the review flagged", () => {
  // Each of these strings must appear in the BAN list (it's prose,
  // so we test substring presence of the literal phrase the prompt
  // lists as forbidden).
  const banned = [
    "nothing to offer",
    "showing up nowhere",
    "AI tools found nothing",
    "every AI system will skip you",
    "guaranteed to rank",
    "completely invisible",
  ];
  for (const phrase of banned) {
    assert.ok(
      WORKER.includes(phrase),
      `expected the worker prompt's banned-phrase list to include "${phrase}"`,
    );
  }
});

// The prompt is hand-formatted with line-wraps, so multi-word phrases
// may straddle newlines. Normalize whitespace before substring tests.
const WORKER_FLAT = WORKER.replace(/\s+/g, " ");
const CTA_FLAT = CTA.replace(/\s+/g, " ");

test("worker prompt provides defensible replacements", () => {
  const preferred = [
    "found very limited usable visibility signals",
    "machine-readable information to AI-driven recommendations",
    "minimal verified signals connected to this domain",
    "low confidence recommending this business",
    "Based on available site and visibility signals, AI",
  ];
  for (const phrase of preferred) {
    assert.ok(
      WORKER_FLAT.includes(phrase),
      `expected the worker prompt's preferred-replacement list to include "${phrase}"`,
    );
  }
});

test("worker prompt forbids direct-platform-query claims", () => {
  assert.ok(
    WORKER_FLAT.includes("Do NOT claim we queried"),
    "prompt should explicitly forbid claims that we queried platforms directly",
  );
});

test("worker prompt frames score as directional, not a ranking guarantee", () => {
  // 2026-05-15 polish: prompt now uses plain business-owner wording
  // ("estimate how clearly AI systems can understand and recommend
  // the business") instead of "directional / machine-readable
  // confidence" jargon. The non-ranking-guarantee discipline must
  // still be present.
  assert.ok(
    /estimate how clearly AI systems can understand/i.test(WORKER) ||
      /score is directional/i.test(WORKER),
    "score framing should explain in plain language that the score estimates AI-recommendation clarity",
  );
  assert.ok(
    /NOT a ranking guarantee/i.test(WORKER),
    "score framing should still disclaim rankings",
  );
});

// ─── 2. Static CTA copy — premium + conversion-oriented ──────────
console.log("\n[2] CTA card — premium + non-absolute static copy");

test("CTA headline matches the AI Visibility Foundation Fix framing", () => {
  // 2026-05-15 rename: "AI Visibility Profile Setup" → "AI Visibility
  // Foundation Fix" — the offer name now emphasizes infrastructure
  // repair, not profile setup. Headline shifted from "Set up your
  // …" passive framing to "Fix the foundation …" active framing.
  assert.ok(
    /Fix the foundation/i.test(CTA),
    "expected the Foundation Fix headline to be present",
  );
  assert.ok(
    !CTA.includes("Install your AI Visibility Profile"),
    "legacy 'Install your AI Visibility Profile' headline must be replaced",
  );
  assert.ok(
    !CTA.includes("Set up your AI Visibility Profile"),
    "intermediate 'Set up your AI Visibility Profile' headline must be replaced",
  );
});

test("CTA eyebrow/label uses the new 'AI Visibility Foundation Fix' name", () => {
  assert.ok(
    CTA.includes("AI Visibility Foundation Fix"),
    "expected the renamed offer label in the CTA card",
  );
  // No remnant of the legacy name except where it might appear as
  // legacy-context comments; ensure the customer-visible eyebrow
  // text doesn't carry the old name.
  assert.ok(
    !/cta-card-eyebrow"\s*>\s*AI Visibility Profile Setup\s*<\/div>/.test(CTA),
    "eyebrow tag must render the new Foundation Fix name",
  );
});

test("CTA preserves $497 price and 3–5 business days", () => {
  assert.ok(CTA.includes("$497"));
  assert.ok(CTA.includes("3–5 business days"));
});

test("CTA preserves 'complex websites may require custom scoping'", () => {
  assert.match(CTA_FLAT, /complex websites may require custom scoping/i);
});

test("CTA contains no banned absolute phrases", () => {
  const banned = [
    /\bnothing to offer\b/i,
    /\bshowing up nowhere\b/i,
    /\bfound nothing\b/i,
    /\bevery AI (?:system|tool)\b/i,
    /\bcompletely invisible\b/i,
    /\bguaranteed to rank\b/i,
  ];
  for (const rx of banned) {
    assert.ok(!rx.test(CTA), `CTA must not contain ${rx.source}`);
  }
});

// ─── 3. Platform Visibility labels — defensible "bad" tier ───────
console.log("\n[3] Platform Visibility labels — defensible tier markers");

test("'bad'-tier labels avoid blunt absolutes", () => {
  // Specifically: no label should say "Weak X" alone — pair it with
  // a defensible reason. The new bad-tier labels each explain WHY.
  const badLabels = [
    "Limited content for AI to interpret",
    "AI may struggle to verify identity",
    "Limited structured data to confirm identity",
    "Few verifiable citations found",
  ];
  for (const label of badLabels) {
    assert.ok(
      PARSE.includes(label),
      `expected platform-visibility 'bad' label "${label}"`,
    );
  }
});

test("'bad'-tier labels are not absolute or overclaim", () => {
  // The new strings must not contain banned absolutes.
  const newLabels = [
    "Limited content for AI to interpret",
    "AI may struggle to verify identity",
    "Limited structured data to confirm identity",
    "Few verifiable citations found",
  ];
  const banned = [/\binvisible\b/i, /\bnothing\b/i, /\bnowhere\b/i, /\bskip\b/i];
  for (const label of newLabels) {
    for (const rx of banned) {
      assert.ok(!rx.test(label), `label "${label}" contains banned ${rx.source}`);
    }
  }
});

// ─── 4. "AI Discoverability / Machine Trust" positioning ─────────
console.log("\n[4] AI Discoverability + machine-trust positioning (final polish 2026-05-15)");

test("worker prompt names the canonical audit-shape options", () => {
  // The prompt should explicitly name the four positioning options
  // the user specified in the final-polish pass so the model never
  // drifts back to "AI SEO" framing.
  const shapes = [
    "AI Visibility Audit",
    "AI Discoverability Audit",
    "Machine Readability Audit",
    "Recommendation Readiness Audit",
  ];
  for (const shape of shapes) {
    assert.ok(
      WORKER_FLAT.includes(shape),
      `worker prompt must explicitly name the audit shape "${shape}"`,
    );
  }
});

test("worker prompt includes the canonical evidence-based framing line", () => {
  // The user-specified canonical framing line that the model can
  // use when explaining what was evaluated. Must appear verbatim
  // so the model has a stock phrase to reach for.
  assert.ok(
    WORKER_FLAT.includes(
      "We evaluated whether modern AI systems can confidently identify, retrieve, interpret, and recommend this business based on publicly accessible signals",
    ),
    "worker prompt must include the canonical evidence-based framing line",
  );
});

test("worker prompt bans the 10 hype phrases from the final-polish spec", () => {
  // The exact 10 banned phrases from the user's final-polish spec.
  // These must all appear in the worker prompt's banned list so the
  // model can never emit them.
  const banned = [
    "AI SEO",
    "AI hack",
    "dominate AI",
    "rank higher in AI",
    "AI ranking",
    "ChatGPT visibility",
    "Claude ranking",
    "Perplexity score",
    "guaranteed recommendations",
    "guaranteed ranking",
  ];
  for (const phrase of banned) {
    assert.ok(
      WORKER_FLAT.includes(phrase),
      `worker prompt must include "${phrase}" in its banned-phrase list (so the model sees it labeled as forbidden)`,
    );
  }
});

test("worker prompt forbids direct-platform-query claims explicitly", () => {
  // Final-polish hardening: ensure the prompt explicitly tells the
  // model NEVER to say or imply that we queried any specific
  // platform live.
  assert.ok(
    WORKER_FLAT.includes("We tested ChatGPT/Claude/Gemini live") ||
      WORKER_FLAT.includes("We queried <platform> directly"),
    "prompt should list explicit forbidden direct-query phrasings",
  );
  assert.ok(
    WORKER_FLAT.includes("Based on available site and visibility signals"),
    "prompt should provide the preferred inference-shaped opener",
  );
});

test("AuditReportContent score-clarification line uses the evidence-based framing", () => {
  // The customer-visible score-clarification line must use the
  // exact evidence-based wording the user specified, not the
  // earlier shorter version.
  const audit = readFileSync(
    join(REPO, "src/components/AuditReportContent.tsx"),
    "utf-8",
  ).replace(/\s+/g, " ");
  assert.ok(
    audit.includes(
      "The GeoViz score reflects how confidently modern AI systems can identify, interpret, and reference your business using publicly accessible website and trust signals",
    ),
    "score-clarification line should use the canonical evidence-based wording",
  );
});

test("CTA lede frames the offer as scoped infrastructure work, not magic", () => {
  // The CTA lede must read as foundational infrastructure
  // engagement — calm, technical, NOT "magic ranking service".
  const flat = CTA.replace(/\s+/g, " ");
  assert.ok(
    flat.includes("scoped infrastructure engagement"),
    "CTA lede should describe the offer as a scoped infrastructure engagement",
  );
  // And must not contain any of the banned hype phrases.
  const bannedInCta = [
    /\bmagic\b/i,
    /\binstant fix\b/i,
    /\bguaranteed\b/i,
    /\bdominate\b/i,
    /\bAI SEO\b/i,
  ];
  for (const rx of bannedInCta) {
    assert.ok(!rx.test(CTA), `CTA must not contain hype pattern ${rx.source}`);
  }
});

console.log(
  `\n[report-copy-defensibility] passed=${passed} failed=${failed} total=${passed + failed}`,
);
if (failed > 0) process.exit(1);
