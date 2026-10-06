/* eslint-disable no-console */
/**
 * Proof Engine — writes docs/proof-engine/geoviz-internal-case.md: the
 * proposed v1 question set, baseline setup, highest-confidence finding and
 * one experiment ready for approval. DB-free, no network, no provider calls.
 *
 *   DATABASE_URL="postgresql://x@no-database.invalid/x" npx tsx scripts/proof-geoviz-proposal.ts
 */
import "./lib/require-nonprod-db";
import { writeFileSync } from "node:fs";
import { GEOVIZ_CASE as C } from "./proof-geoviz-case";
import { INTENT_LABELS, proposeQuestionSet, QUESTION_SET_GENERATOR_VERSION } from "../src/lib/monitoring/proof/question-set";
import { MATERIAL_MENTION_CHANGE, MATERIAL_RATE_CHANGE, MIN_COMPARABLE_SAMPLES, NO_CAUSATION_NOTE, OUTCOME_VERSION } from "../src/lib/monitoring/proof/experiment";

const qs = proposeQuestionSet({ ...C.context, services: [...C.context.services], competitorNames: [...C.context.competitorNames] });
const md = `# GeoViz internal proof case (v1 — proposed, not approved)

Website: ${C.websiteUrl} · generator \`${QUESTION_SET_GENERATOR_VERSION}\` · business type: online software (no local questions) · competitors: none supplied (none invented).

## Proposed question set v1 (${qs.length} questions)

| # | Intent | Question | Why |
|---|---|---|---|
${qs.map((q, i) => `| ${i + 1} | ${INTENT_LABELS[q.intent].split(" — ")[0]} | ${q.text} | ${q.rationale} |`).join("\n")}

Not included: local commercial-intent questions (GeoViz has no service area) and competitor comparisons (add real competitor names, then create v2 before the baseline is measured).

## Baseline setup

- AI systems: ${C.baseline.providers.join(", ")} — via their APIs, which are not identical to the consumer ChatGPT, Claude, Gemini or Perplexity apps.
- Samples per question per AI system: ${C.baseline.samplesPerPrompt}.
- ${C.baseline.note}
- Steps: approve → activate the set (tracked questions replaced by the set's questions) → run one cycle → the cycle is tagged with the set version and the set is frozen.

## Highest-confidence finding

**${C.finding.title}** (\`${C.finding.id}\`, observed ${C.finding.observedAt})

${C.finding.evidence.map((e) => `- ${e}`).join("\n")}

Why this one: ${C.finding.whyHighestConfidence}

## First experiment (ready for approval)

- Action: ${C.experiment.action}
- Proposed fix: ${C.experiment.proposedFix}
- Target URL: ${C.experiment.targetUrl}
- Expected category: \`${C.experiment.expectedCategory}\`
- Verification: ${C.experiment.verification}
- Follow-up: ${C.experiment.followUp}
- Outcome rules \`${OUTCOME_VERSION}\`: ≥ ${MIN_COMPARABLE_SAMPLES} comparable answers on each side; a change of ±${Math.round(MATERIAL_RATE_CHANGE * 100)} points in the share of answers naming GeoViz and ≥ ${MATERIAL_MENTION_CHANGE} answers → improvement/decline observed; otherwise no material change.
- Status: ${C.experiment.status}

> ${NO_CAUSATION_NOTE}
`;
writeFileSync("docs/proof-engine/geoviz-internal-case.md", md);
console.log(md);
