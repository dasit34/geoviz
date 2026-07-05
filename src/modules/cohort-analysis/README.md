# Module: Cohort Analysis

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/cohort-analysis.md` for the full product spec.

## Purpose

Aggregate individual audit/monitoring data into statistically meaningful cohorts (by industry, geo, business size) once volume justifies it. This is the aggregation layer that feeds the Benchmark Engine and Data Licensing modules — see `docs/strategy/03_DATA_MOAT.md` "Valuable after 1,000/10,000/100,000 customers."

## Database Schema

See the proposed `CohortSnapshot` model in `contracts.ts` — a derived, recomputable table (unlike the append-only evidence tables in `ai-answer-sampling`/`telemetry`, cohort snapshots may be recalculated as more data arrives, but every recalculation is versioned, never silently overwritten — see the Benchmark Engine's governance rules in `docs/strategy/06_BENCHMARK_ENGINE.md`).

## API Contracts / Service Interfaces

See `contracts.ts` — `CohortAnalysisService`.

## React Page Skeleton

N/A — backend/data module. Its output surfaces inside the `benchmark-engine` dashboard and published reports.

## Component Tree

N/A.

## Telemetry Requirements

Log every cohort recomputation (cohort label, sample size, methodology version) so `docs/moat/MOAT_IMPLEMENTATION.md`'s "captured today vs. proposed" tracking stays accurate.

## Feature Flags

`GEO_MODULE_COHORT_ANALYSIS_ENABLED` — gates any scheduled recomputation job.

## Acceptance Tests

Future: `scripts/test-cohort-analysis.ts`. Planned assertions: `cohortsFor()` refuses to return a cohort below the minimum sample-size gate (reuses the exact gating behavior already declared in `src/lib/v2/contracts.ts`'s `BenchmarkStore.cohortsFor`), every recomputation is versioned and the prior version remains queryable.

## Implementation Checklist

- [ ] Define minimum sample-size thresholds per cohort granularity (industry, geo, size) before any cohort is externally published.
- [ ] Build the recomputation job as a scheduled batch, not a live query, to keep published-report numbers stable within a period.
- [ ] Version every recomputation; never overwrite a prior published cohort snapshot.

## Dependencies

Consumes existing V1 audit data via `src/lib/v2/contracts.ts` primitives (`VisibilitySnapshot`, `BenchmarkCohort`) — this module is the implementation home for the `BenchmarkStore` interface already declared there. Layer 0 / foundational relative to other new modules; `benchmark-engine` and `data-licensing` depend on this module, not the reverse. See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Technical Debt Notes

The existing `src/lib/v2/contracts.ts` already declares `BenchmarkCohort`/`BenchmarkStore` — this module implements those interfaces rather than redefining them. Do not create a second, divergent cohort type here.

## Security Review

Cohort output must be aggregate-only (no single-business data reconstructable from a published cohort) — apply a minimum sample-size floor before any cohort is queryable outside internal admin tooling.

## Future Roadmap

v1: internal cohort computation feeding internal calibration only (Stage 3). v2: cohorts feed published Benchmark Engine reports (Stage 4+). v3: cohorts feed licensable datasets (Stage 6, `data-licensing`).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code. Not imported by any V1 file today.

## What is intentionally NOT in this directory

- Any published-report rendering — lives in `benchmark-engine`.
- Licensing/export tooling — lives in `data-licensing`.
