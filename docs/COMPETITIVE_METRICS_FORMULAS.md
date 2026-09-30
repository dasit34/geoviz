# GeoViz — Competitive Intelligence Metrics: Formulas

Status: SNAPSHOT, Intelligence Engine Phase 1. Every metric below is a
plain, reproducible ratio or count computed directly from the
`Observation` / `ObservationCompetitorMention` / `QueryLibraryEntry`
tables (see `docs/INTELLIGENCE_ENGINE_GAP_ANALYSIS.md`). **None of
these are a new score.** None write to `src/lib/scoring/*` (frozen
per `CLAUDE.md`'s Scoring Freeze) or to any `AuditIntelligence` score
column. Implementation: `src/lib/intelligence/competitive/*`.

A note on vocabulary before the formulas: every `Observation` row has
a `callType` of either `"self_assessment"` (the validator's own
egocentric business-understanding call — the only call type with a
`recommended` verdict) or `"competitive_capture"` (the buyer-intent
"who are the best providers" call — the only call type with a
`mentioned` verdict and named-competitor data). The two call types
never share a signal; a metric scoped to one never reads the other.

## Mention rate

```
MentionRate(business, window) = mentionedCount / totalObservations
```

Over `Observation` rows for `business` where `mentioned` is non-null
(i.e. `callType = "competitive_capture"` rows only).
`self_assessment` rows always have `mentioned = null` and are
excluded — never counted as "not mentioned." `rate` is `null` when
`totalObservations = 0` — no fake precision.

Implementation: `mentionRate.ts`.

## Recommendation rate

```
RecommendationRate(business, window) = recommendedCount / totalObservations
```

Over `Observation` rows for `business` where `recommended` is
non-null (i.e. `callType = "self_assessment"` rows only, derived from
the validator's `would_recommend: YES → true, NO → false, PARTIAL →
null`). `competitive_capture` rows always have `recommended = null`
and are excluded — never counted as "not recommended."

Implementation: `recommendationRate.ts`.

## Share of Voice

```
entity_mentions(entity, industry, geo, window) =
    count(Observation WHERE businessId maps to entity, mentioned = true,
          callType = "competitive_capture",
          queryLibraryEntry.industryNormalized = industry,
          queryLibraryEntry.geographyRaw = geo,
          observedAt within window)
  + count(ObservationCompetitorMention WHERE competitorNormalized = normalize(entity),
          joined Observation.callType = "competitive_capture",
          Observation.queryLibraryEntry.industryNormalized = industry,
          .geographyRaw = geo, observedAt within window)

ShareOfVoice(entity) = entity_mentions(entity)
                        / SUM(entity_mentions(e) for every e named or audited
                              in this industry/geo/window)
```

Every entity in scope — the audited subject business(es) and every
named competitor — is counted on the same basis: how many times it
was named or self-identified as present in a `competitive_capture`
response, in the given industry/geography/time window. The subject's
own `entity_mentions` comes from its own `Observation.mentioned =
true` rows; a competitor's comes from `ObservationCompetitorMention`
rows. A plain ratio over counted appearances — reproducible at any
time by re-running the same `WHERE` conditions against raw table
rows, not a model or an inferred score.

Implementation: `shareOfVoice.ts`. `entityNormalized` for a subject
business is its `Business.normalizedDomain`; for a competitor it's
the lowercased/trimmed `competitorNormalized` value on the mention
row — a best-effort match, not full entity resolution (documented
limitation, see `ObservationCompetitorMention`'s schema comment).

## Competitor frequency

```
CompetitorFrequency(industry, geo, window) =
  GROUP BY competitorNormalized OVER
    ObservationCompetitorMention JOIN Observation ON observationId
    WHERE Observation.callType = "competitive_capture"
      AND Observation.queryLibraryEntry.industryNormalized = industry
      AND Observation.queryLibraryEntry.geographyRaw = geo
      AND Observation.observedAt within window
  COUNT(*) per group, ranked descending
```

The same underlying counts as Share of Voice's competitor side, but
returned as a ranked leaderboard rather than normalized into a share.
`competitorName` in the result is the most-recently-seen verbatim
name for that normalized identity (names can vary slightly run to
run; the most recent is kept for display, all are counted).

Implementation: `competitorFrequency.ts`.

## Query win/loss

```
QueryWinLoss(business, queryLibraryEntry) =
  for each provider that has ever observed this (business, query) pair:
    latest = the Observation with the MAX(observedAt) for that provider
    win(provider) = latest.mentioned === true OR latest.recommended === true

  wins   = count(provider WHERE win(provider) = true)
  losses = count(provider WHERE win(provider) = false)
```

**"Latest" is always the single most recent Observation per provider
— never averaged across a provider's re-runs.** This mirrors an
existing convention elsewhere in this codebase:
`RecommendationFrequency`'s upsert-current-state pattern (always the
newest value wins) as opposed to `AuditSnapshot`'s frozen-history
pattern (every value is preserved, nothing is overwritten) —
`Observation` rows themselves are append-only and never overwritten
(so history is preserved), but this *metric* deliberately reads only
each provider's current/latest state, since "did we win the most
recent read" is the meaningful question for a win/loss scoreboard, not
"did we win on average across every historical read."

Implementation: `queryWinLoss.ts`.

## Model win/loss

```
ModelWinLoss(business, window) =
  for each provider that has observed ANY query for this business, in window:
    latest = the Observation with the MAX(observedAt) for that provider
    win(provider) = latest.mentioned === true OR latest.recommended === true

  wins   = count(provider WHERE win(provider) = true)
  losses = count(provider WHERE win(provider) = false)
```

Identical mechanics to Query win/loss, but scoped to "any query" for
the business rather than one specific `QueryLibraryEntry` — answers
"which AI providers currently favor this business, across everything
we've asked them," rather than "did we win on this one query."

Implementation: `modelWinLoss.ts`.

## Hand-verification

Every formula above was unit-tested against seeded fixture rows in
`scripts/test-competitive-metrics.ts` (`npm run
test:competitive-metrics`), with expected values computed by hand
from the fixture data in code comments alongside each assertion —
e.g. the Share of Voice test seeds exactly 2 subject mentions + 3 +
2 competitor mentions and asserts `totalMentions === 7` and `acme
share === 2/7`, matching the formula above computed by hand. To
re-verify against a live database instead of fixtures, the same
`WHERE` conditions in each formula translate directly to a raw SQL
query over `Observation` / `ObservationCompetitorMention` for a given
business/industry/geo/window.
