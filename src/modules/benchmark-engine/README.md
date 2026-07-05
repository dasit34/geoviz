# Module: Benchmark Engine

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/benchmark-engine.md` and `docs/benchmarking/BENCHMARK_ENGINE_SPEC.md`.

## Purpose

Turn `cohort-analysis` output into published, citable benchmarks: industry/city/state/national averages, top/bottom performers, and eventually a recurring "AI Visibility Index." This is the category-authority engine described in `docs/strategy/06_BENCHMARK_ENGINE.md` — governance and versioning discipline here directly determines whether GeoViz's benchmark is trustworthy enough to be cited externally.

## Database Schema

See the proposed `PublishedBenchmark` model in `contracts.ts` — append-only, versioned, never restated without an explicit "restated under vX.X" annotation (per `docs/strategy/06_BENCHMARK_ENGINE.md` "Versioning").

## API Contracts / Service Interfaces

See `contracts.ts` — `BenchmarkEngineService`. Depends (type-only) on `CohortSnapshot`-shaped data from `cohort-analysis` and `AnswerVolatility` from `ai-answer-sampling`.

## React Page Skeleton

`page.skeleton.tsx` — static placeholder composed of `BenchmarkSummaryCard`, `TopPerformersCard`, `IndustryAverageCard` placeholder sections (component names only; no real components exist yet). Served at `/benchmark-engine` behind `GEO_MODULE_BENCHMARK_ENGINE_ENABLED` via `src/app/(future)/benchmark-engine/page.tsx`.

## Component Tree

```
BenchmarkEnginePageSkeleton
├── BenchmarkSummaryCard (placeholder)
├── IndustryAverageCard (placeholder)
├── GeoAverageCard (placeholder)
├── TopPerformersCard (placeholder)
└── BottomPerformersCard (placeholder)
```

## Telemetry Requirements

Log every publish event (methodology version, sample size, scope) — this is the audit trail that protects the benchmark's external credibility.

## Feature Flags

`GEO_MODULE_BENCHMARK_ENGINE_ENABLED`.

## Acceptance Tests

Future: `scripts/test-benchmark-engine.ts`. Planned assertions: a benchmark cannot publish below the minimum sample-size gate, a published benchmark's methodology version is always recorded, no publish action ever mutates a prior published snapshot.

## Implementation Checklist

- [ ] Governance-board sign-off workflow before any methodology change ships to a published benchmark (`docs/strategy/06_BENCHMARK_ENGINE.md` "Scoring Governance").
- [ ] Industry/geo/national report generators consuming `cohort-analysis`.
- [ ] Top/bottom performer selection (aggregate, anonymized — never expose a specific losing business without consent).
- [ ] Recurring "AI Visibility Index" publishing pipeline (only after 2–3 stable quarters of methodology, per `docs/strategy/06_BENCHMARK_ENGINE.md`).

## Dependencies

Depends on `cohort-analysis` (aggregation) and `ai-answer-sampling` (volatility signal). See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Technical Debt Notes

Do not publish a recurring, branded "Index" before the underlying methodology has survived 2–3 quarters unchanged — a retracted or revised public number costs more credibility than waiting.

## Security Review

All published output must be aggregate/anonymized. No cohort or benchmark may be publishable below its configured minimum sample-size threshold, enforced at the service layer, not just by convention.

## Future Roadmap

v1: internal benchmark reports (Stage 4). v2: public quarterly benchmark reports (Stage 4–5). v3: licensed data + recurring Index (Stage 6, feeds `data-licensing`).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code, not imported by any V1 file today.
- `page.skeleton.tsx` — static presentational skeleton, no data fetching, no real logic.

## What is intentionally NOT in this directory

- Cohort computation itself — lives in `cohort-analysis`.
- Licensing/export tooling — lives in `data-licensing`.
