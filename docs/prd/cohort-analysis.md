# PRD: Cohort Analysis

## Purpose

Aggregate individual audit/monitoring data into statistically meaningful cohorts (industry, geo, business size) once volume justifies it — the aggregation layer feeding `benchmark-engine` and `data-licensing`.

## Revenue Model / Justification

No direct price — the internal engine that makes `benchmark-engine`'s (indirect) and `data-licensing`'s (direct, $50K–500K/yr) revenue possible.

## User Stories

- As GeoViz, I want cohort computations to refuse publishing below a minimum sample size, so early benchmarks don't overclaim precision.
- As an analyst consuming a benchmark, I want every published number traceable to the exact methodology version and sample size that produced it.

## Acceptance Criteria

- `cohortsFor()` refuses to return a cohort below the minimum sample-size gate.
- Every recomputation is versioned; prior versions remain queryable.

## Non-Goals

Not a published-report renderer (that's `benchmark-engine`). Not a licensing/export tool (that's `data-licensing`).

## Dependencies

None (Layer 0 / foundational). Implements the `BenchmarkStore` interface already declared in `src/lib/v2/contracts.ts`.

## Engineering Estimate

3–5 weeks (v1).

## Moat Contribution

Critical — the statistical backbone that makes the dataset's category/geo claims defensible rather than anecdotal.
