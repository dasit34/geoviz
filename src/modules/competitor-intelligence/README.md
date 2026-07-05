# Module: Competitor Intelligence

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/competitor-intelligence.md`.

## Purpose

Relative, not absolute, positioning — per customer research, businesses care more about "am I losing to a competitor in AI answers" than an absolute score. Packages `ai-answer-sampling` output into category share-of-citation and cross-platform divergence views, sold as a `monitoring` add-on (per `docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 5 board decision — priced as an add-on, not a separate product line, to protect the core retention story).

## Database Schema

No new evidence store — this module is a read/aggregation layer over `ai-answer-sampling`'s `AiAnswerSnapshot` data, scoped to a customer-defined or auto-detected competitor set. See the proposed `CompetitorSet` model in `contracts.ts` for the one new piece of state this module owns.

## API Contracts / Service Interfaces

See `contracts.ts` — `CompetitorIntelligenceService`. Depends (type-only) on `AnswerSnapshot` (`ai-answer-sampling`) and `VisibilitySnapshot`/`CompetitorComparison` (`src/lib/v2/contracts.ts` — this module is the implementation home for the `CompetitorTracker` interface already declared there).

## React Page Skeleton

`page.skeleton.tsx` — static placeholder composed of `ShareOfCitationCard`, `CompetitorComparisonCard`, `CrossPlatformDivergenceCard` placeholder sections. Served at `/competitor-intelligence` behind `GEO_MODULE_COMPETITOR_INTELLIGENCE_ENABLED` via `src/app/(future)/competitor-intelligence/page.tsx`.

## Component Tree

```
CompetitorIntelligencePageSkeleton
├── ShareOfCitationCard (placeholder)
├── CompetitorComparisonCard (placeholder)
└── CrossPlatformDivergenceCard (placeholder)
```

## Telemetry Requirements

Log competitor-set definitions and comparison-view engagement — informs whether this module functions as intended retention/upsell lever.

## Feature Flags

`GEO_MODULE_COMPETITOR_INTELLIGENCE_ENABLED`.

## Acceptance Tests

Future: `scripts/test-competitor-intelligence.ts`. Planned assertions: every delta returned by `compare()` includes a human-readable reason string (never a bare number, per the existing `CompetitorComparison` contract in `src/lib/v2/contracts.ts`), share-of-citation always sums sensibly across the defined competitor set.

## Implementation Checklist

- [ ] Competitor-set definition (customer-defined + auto-detected via category/geo).
- [ ] Category share-of-citation calculation over `ai-answer-sampling` data.
- [ ] Cross-platform divergence report (visible on Perplexity, invisible on Google AI Overview, etc.).
- [ ] Implement the `CompetitorTracker` interface already declared in `src/lib/v2/contracts.ts` rather than redefining it.

## Dependencies

Depends on `ai-answer-sampling` and `monitoring` (shares `VisibilitySnapshot`). See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Technical Debt Notes

`src/lib/v2/contracts.ts` already declares `CompetitorComparison`/`CompetitorTracker` — this module implements those interfaces; do not create a second, divergent comparison type here.

## Security Review

Comparing against a named competitor's data must only ever use already-public AI-answer content (no scraping of a competitor's private data) — the underlying `ai-answer-sampling` evidence is itself sourced from public AI system responses.

## Future Roadmap

v1: category share-of-citation (Stage 5). v2: cross-platform divergence (Stage 5–6). v3: automated competitor-set discovery at scale (Stage 6).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code, not imported by any V1 file today.
- `page.skeleton.tsx` — static presentational skeleton, no data fetching, no real logic.

## What is intentionally NOT in this directory

- Sampling logic itself — lives in `ai-answer-sampling`.
- Alert delivery for competitor-change events — lives in `alerts`.
