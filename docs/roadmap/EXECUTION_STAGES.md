# Execution Stages — Engineering View

Engineering-oriented companion to `docs/strategy/01_FIVE_YEAR_ROADMAP.md` (which carries the full business narrative per stage). This doc answers one question per stage: **what does engineering actually build, in what order, and how long does it take.** Feeds `docs/FIVE_YEAR_EXECUTION_PLAN.md`.

| Stage | Engineering focus | Modules touched | Eng-weeks (cumulative from `docs/FIVE_YEAR_EXECUTION_PLAN.md`) |
|---|---|---|---|
| 1 (Launch → $250K) | MVP hardening only — no `src/modules/` work | none | 0 (pre-scaffold) |
| 2 ($250K → $1M) | Foundation Fix automation, Monitoring v1, sampling pilot | `ai-answer-sampling`, `monitoring` (v1) | ~10–16 |
| 3 ($1M → $5M) | Agency Platform, telemetry foundation, cohort analysis start | `agency-platform`, `telemetry`, `cohort-analysis` | ~10–16 |
| 4 ($5M → $10M) | Visibility Layer + WordPress plugin, Monitoring v2, first Benchmark report | `visibility-layer`, `wordpress-plugin`, `change-detection`, `alerts`, `benchmark-engine`, `monitoring` (v2) | ~26–37 |
| 5 ($10M → $25M) | Competitor Intelligence, Enterprise (RBAC/API/SOC2) | `competitor-intelligence`, `enterprise` | ~15–21 |
| 6 ($25M → $100M) | Data Licensing, Shopify plugin, recurring Index | `data-licensing`, `shopify-plugin` | ~10–15 |

## Rule

No stage's engineering work begins before the prior stage's exit criteria (`docs/strategy/01_FIVE_YEAR_ROADMAP.md`) are met — a stage's eng-weeks estimate is not a calendar commitment, it is the estimate *once that stage is actually open*.
