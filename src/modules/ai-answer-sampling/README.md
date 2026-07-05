# Module: AI Answer Sampling

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/ai-answer-sampling.md` for the full product spec (revenue, engineering estimate, moat contribution) — this README is the engineering-scaffold layer only.

## Purpose

Repeatedly query live AI systems (ChatGPT, Claude, Gemini, Perplexity, Google AI Overviews) with realistic buyer-intent prompts for a given business/category/geo, and store the verbatim answers and citation sources over time. This is the ground-truth layer that everything else in the Monitoring, Competitor Intelligence, and Benchmark Engine modules builds on — see `docs/strategy/03_DATA_MOAT.md` for why this is the single highest-leverage long-run investment in the company.

## Database Schema

See the proposed `AiAnswerSnapshot` model in `contracts.ts`. Append-only, immutable, never rescored — mirrors the `ObservationHistory` pattern in `prisma/schema.prisma` (cuid PK, `@@index([hostname])`, `@@index([capturedAt])`, cascade delete tied to the owning `AuditOrder`/monitoring subscription).

## API Contracts / Service Interfaces

See `contracts.ts` — `AnswerSamplingService`.

## React Page Skeleton

N/A — this module has no standalone customer-facing route. Its output is surfaced inside the `monitoring` and `competitor-intelligence` dashboards (see those modules' `page.skeleton.tsx`).

## Component Tree

N/A — backend/data module. Downstream dashboards render `AnswerSnapshot` data via their own components (e.g. a future `AnswerEvidenceCard`).

## Telemetry Requirements

Every sampling run logs: query text, platform, model version (where knowable), latency, cost, and success/failure — this operational telemetry is distinct from the sampled answer content itself and feeds cost-efficiency tuning (see `docs/strategy/10_BACKLOG.md` Epic C4).

## Feature Flags

`GEO_MODULE_AI_ANSWER_SAMPLING_ENABLED` — gates any future scheduled sampling job. Unset/false today; no job exists to gate yet.

## Acceptance Tests

Future: `scripts/test-ai-answer-sampling.ts`, following the existing `tsx scripts/test-*.ts` convention. Planned assertions: a sampling run persists an immutable snapshot, re-running never mutates a prior snapshot (append-only), cost/latency are recorded per run.

## Implementation Checklist

- [ ] Define the fixed buyer-intent query set per business archetype (reuse `src/lib/intelligence/industry-taxonomy.ts` categories).
- [ ] Build provider adapters (OpenAI, Anthropic, Google, Perplexity) behind one `AnswerSamplingService` interface — provider-agnostic per `src/lib/v2/README.md` architecture rules.
- [ ] Implement citation-source extraction where the provider exposes it (Perplexity, Gemini); document as unavailable where it doesn't (ChatGPT web, ungrounded Claude).
- [ ] Persist `AiAnswerSnapshot` rows; never update/delete.
- [ ] Cost-per-query tracking dashboard (internal, admin-only).

## Dependencies

None on other new modules — this is a Layer 0 / foundational module. See `docs/MODULE_DEPENDENCY_GRAPH.md`. Consumes existing V1 business/entity data via `src/lib/v2/contracts.ts` primitives only.

## Technical Debt Notes

Sampling cost at scale is the primary technical risk (per `docs/strategy` VC/competitor analysis) — do not build a naive per-customer-per-day sampler; cadence and query-set size must be cost-modeled before any real implementation begins.

## Security Review

Stores third-party model output verbatim — no PII beyond what a public AI answer already contains. No customer-authentication surface (backend-only). Rate-limit and budget-cap every provider adapter to prevent runaway spend from being triggerable by any code path outside billing-gated Monitoring subscriptions.

## Future Roadmap

v1: manual/scheduled sampling for a small pilot cohort (Stage 3). v2: full scheduled panel across all Monitoring subscribers (Stage 4+). v3: statistically-tuned sampling cadence and cost model at 10K+ customer scale (Stage 5+).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code. Not imported by any V1 file today.

## What is intentionally NOT in this directory

- Actual provider API clients/keys — would live in a future `src/modules/ai-answer-sampling/providers/` when implementation begins.
- Any scheduling/cron logic — would extend the existing worker queue pattern in `scripts/geo-worker.ts`, not duplicate it.
- Scoring logic of any kind — sampled answers are evidence, never a scoring input per the Scoring Constitution in `CLAUDE.md`.
