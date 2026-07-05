# PRD: Competitor Intelligence

## Purpose

Relative positioning — category share-of-citation and cross-platform divergence against a defined competitor set. Per customer research, businesses care more about "am I losing to a competitor" than an absolute score.

## Revenue Model / Justification

Priced as a Monitoring add-on (per board decision, not a separate product line, to protect the core retention story).

## User Stories

- As a Monitoring subscriber, I want to see how I compare to specific named competitors in AI answers, not just my own trend.
- As GeoViz, I want every delta shown to include a human-readable reason, never a bare number.

## Acceptance Criteria

- Every delta returned by `compare()` includes a reason string.
- Share-of-citation sums sensibly across the defined competitor set.

## Non-Goals

Not a scraper of competitor private data — uses only already-public AI-answer content.

## Dependencies

Depends on `monitoring`, `ai-answer-sampling`.

## Engineering Estimate

5–7 weeks (v1).

## Moat Contribution

High — implements the `CompetitorTracker` interface already reserved in `src/lib/v2/contracts.ts`; strengthens retention via competitive anxiety, a validated stronger lever than absolute score.
