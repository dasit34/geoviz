# PRD: AI Answer Sampling

## Purpose

Repeatedly query live AI systems with buyer-intent prompts per business/category/geo and store verbatim answers + citations over time — the ground-truth evidence layer everything else builds on.

## Revenue Model / Justification

No direct price tag — it's the input that makes `monitoring` (recurring $29–199/mo) credible and non-churning, and eventually feeds `benchmark-engine`/`data-licensing` revenue. Without it, Monitoring is "just a re-score," the #1 identified churn risk.

## User Stories

- As a Monitoring subscriber, I want to see the actual AI answer that mentions (or omits) my business, so I trust the score isn't abstract.
- As GeoViz, I want a cost-bounded sampling cadence so panel costs don't scale linearly with customer count.

## Acceptance Criteria

- A sampling run persists an immutable, timestamped snapshot per query/platform.
- Cost and latency are recorded per run.
- Re-running a query never mutates a prior snapshot.

## Non-Goals

Not a scoring input (evidence only, per the Scoring Constitution). Not a real-time system in v1 — scheduled/batch sampling only.

## Dependencies

None (Layer 0 / foundational). See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Engineering Estimate

6–10 weeks (v1, pilot scale). See `docs/FIVE_YEAR_EXECUTION_PLAN.md`.

## Moat Contribution

Critical. The single asset a competitor cannot backfill — see `docs/DATA_MOAT_STRATEGY.md`.
