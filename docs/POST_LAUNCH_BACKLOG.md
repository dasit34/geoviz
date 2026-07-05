# GeoViz — Post-Launch Backlog (First 1–2 Quarters)

Scope: what engineering actually does immediately after launch — distinct from `docs/FIVE_YEAR_EXECUTION_PLAN.md` (full 5-year view) and `docs/strategy/10_BACKLOG.md` (complete epic-by-epic reference). This is the short, concrete, near-term list. See the executive-summary answer in-conversation for the top-10 ranked version of this same list.

## Gate: nothing below begins until Stage 1 exit criteria are met

Per `docs/strategy/01_FIVE_YEAR_ROADMAP.md`: 60+ paying customers across 2–3 verticals, refund rate <10%, 3+ unprompted referrals, founder can state the ICP without hedging, fulfillment no longer founder-bottlenecked. Until then, engineering work is limited to MVP bug fixes only — see `docs/strategy/10_BACKLOG.md` Epic A.

## Quarter 1 after Stage 1 exit (Stage 2 opens)

1. Hire/onboard the first full-time engineer against the fulfillment bottleneck (not against any `src/modules/` scaffold).
2. Foundation Fix automation: business-archetype schema templates, llms.txt generator, robots.txt optimizer (`docs/strategy/10_BACKLOG.md` Epic B1–B3).
3. QA-correction logging pipeline (Epic B6) — starts the labeled dataset described in `docs/DATA_MOAT_STRATEGY.md`.
4. Before/after comparison artifact generator (Epic B5).
5. Monitoring v1 build begins: scheduled re-score job + Stripe recurring billing (Epic C1–C2) — implementing against the scaffold in `src/modules/monitoring/contracts.ts`.
6. `ai-answer-sampling` pilot-scale implementation (Epic C4) — small, cost-bounded, proving the panel before scaling; implementing against `src/modules/ai-answer-sampling/contracts.ts`.
7. Score-trend timeline UI (Epic C3) for Monitoring's customer-facing surface.
8. Churn-risk flagging job (Epic C6).

## Quarter 2 after Stage 1 exit

9. Agency Platform groundwork begins only once Stage 2 exit criteria (Monitoring NRR >90%) are visible on trend — multi-client dashboard + white-label branding (Epic H1–H2), implementing against `src/modules/agency-platform/contracts.ts`.
10. Cost-per-Fix / margin tracking dashboard (internal, Epic B7) — the margin expansion this produces is what funds the Stage 3 sampling-panel scale-up.

## What stays explicitly out of scope in this window

Visibility Layer / plugins, Change Detection, Alerts, Competitor Intelligence, Enterprise, Benchmark Engine, Data Licensing — all Stage 4+ per `docs/MODULE_DEPENDENCY_GRAPH.md`. Their `src/modules/` scaffolds exist so the seam is ready; implementation starts only when the gating stage's exit criteria are in sight, not on a calendar date.
