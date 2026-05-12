# GeoViz V2 — Intelligence Layer (placeholder)

This directory is the architectural seam where the V2 Intelligence
Layer will live. **Nothing here is wired into the running V1 app yet.**
Files here are intentionally not imported by any production code path
and exist only to:

1. Document where each future module will live, so V2 work doesn't
   require finding the "right" place mid-implementation.
2. Encode the module **contracts** (TypeScript interfaces) up front,
   so V1 surfaces that will later call into V2 can already think in
   terms of those types without depending on the implementation.
3. Make the V1 → V2 boundary obvious during code review — if a PR
   adds business logic outside this directory that should live here
   (recurring monitoring, competitor tracking, etc.), reviewers know
   to push back.

## Module map

| Future module                  | Future file (planned)               | Status      |
| ------------------------------ | ----------------------------------- | ----------- |
| Recurring monitoring           | `src/lib/v2/monitoring.ts`          | not built   |
| Competitor tracking            | `src/lib/v2/competitor.ts`          | not built   |
| Historical visibility tracking | `src/lib/v2/history.ts`             | not built   |
| Benchmark datasets             | `src/lib/v2/benchmark.ts`           | not built   |
| Crawler intelligence           | `src/lib/v2/crawler.ts`             | not built   |
| Renderability analysis         | `src/lib/v2/renderability.ts`       | not built   |

All six modules will consume the existing V1 surfaces (Prisma rows,
parsed report scores, etc.) through narrow interfaces declared in
`contracts.ts` — never by importing V1 code directly. This keeps the
V1 ↔ V2 dependency direction one-way and prevents V2 work from
silently coupling to V1 implementation details.

## Architecture rules (mirrors CLAUDE.md)

- Loosely coupled — V2 modules call V1 surfaces only through the
  contracts in `contracts.ts`. No direct Prisma access from this
  directory. No cross-module imports between V2 files.
- Additive — building V2 must never require a V1 rewrite.
- Provider-agnostic — crawler / renderability modules must support
  swapping the underlying engine (Playwright, custom UA, hosted
  rendering service) without changing the call sites.
- Statistically grounded — benchmark and history modules must not
  ship customer-facing claims before sample sizes justify them.
- Explainable — every score, delta, or alert produced by V2 must
  carry a human-readable reason string, not a raw model dump.

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime
  code. Not imported by any V1 file today.

## What is intentionally NOT in this directory

- V1 audit engine code — lives in `scripts/geo-worker.ts` and
  `src/lib/run-geo-audit.ts`.
- Report rendering — lives in `src/components/AuditReportContent.tsx`
  and `src/app/report/[id]/print/print.css`.
- Scoring math — lives in `scripts/geo-worker.ts` (rubric prompt) and
  `src/lib/parse-report.ts` (extraction).
- Email delivery, Stripe, PDF — separate V1 modules; the V2
  Notification & Workflow surface will call those via thin contracts
  declared here, not the other way around.
