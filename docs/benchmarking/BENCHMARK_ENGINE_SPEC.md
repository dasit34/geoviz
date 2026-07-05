# Benchmark Engine — Product/Technical Spec

Companion to `src/modules/benchmark-engine/README.md`. Full governance detail already written: `docs/strategy/06_BENCHMARK_ENGINE.md`.

| Capability | Contract (`src/modules/benchmark-engine/contracts.ts`) | Notes |
|---|---|---|
| Industry averages | `PublishedBenchmark` with `scope: "industry"` | Sourced from `cohort-analysis` |
| City averages | `scope: "city"` | |
| State averages | `scope: "state"` | |
| National averages | `scope: "national"` | |
| Top performers | `topPerformers()` | Aggregate-safe only — never exposes a specific losing business without consent |
| Bottom performers | `topPerformers()` (inverse selection) | Same constraint |
| Visibility Index | `PublishedBenchmark` recurring series once methodology is stable 2–3 quarters | Do not brand/launch before that stability bar, per `docs/strategy/06_BENCHMARK_ENGINE.md` |
| Annual benchmark reports | Aggregation of quarterly `PublishedBenchmark` history | Presentation concern, not a new data model |

## Governance

Every publish action requires the governance-board sign-off workflow (founder + CTO + Head of Data/ML) before shipping a methodology change to a published benchmark — enforced as an implementation-checklist item in `src/modules/benchmark-engine/README.md`, not left as a process convention alone.
