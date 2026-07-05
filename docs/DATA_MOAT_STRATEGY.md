# GeoViz — Data Moat Strategy (Top-Level Synthesis)

Audience: anyone (board, investor, new hire) who needs the moat argument in five minutes without reading `docs/strategy/03_DATA_MOAT.md` (business framing) or `docs/moat/MOAT_IMPLEMENTATION.md` (technical implementation) in full. This doc is a pointer-rich summary, not a third copy of either.

## The one-sentence version

GeoViz's defensibility does not come from the audit, the scoring rubric, or any UI feature — all of those are replicable by a well-funded competitor within two quarters. It comes from a longitudinal, evidence-based dataset of how AI systems actually discover, cite, and recommend businesses over years — a dataset that cannot be backfilled, bought, or approximated after the fact.

## What's proprietary (full detail: `docs/strategy/03_DATA_MOAT.md`)

1. Verbatim, timestamped AI-answer samples per business/category/geo, collected via `src/modules/ai-answer-sampling`.
2. Human QA-correction data — a byproduct of GeoViz's own fulfillment discipline, not purchasable.
3. The calibrated scoring model, once validated against enough real sampled-answer outcomes to move from heuristic to empirically-validated predictor.
4. Installed-base change-detection data from `src/modules/visibility-layer` + CMS plugins — only observable with real distribution, not a one-time crawl.

## What creates switching costs (full detail: `docs/plugin/VISIBILITY_LAYER_SPEC.md`, `docs/enterprise/ENTERPRISE_SPEC.md`)

- The Visibility Layer once installed (removing it forfeits active monitoring/alerts).
- Multi-year score history per business (a competitor's audit starts a customer at zero history).
- Enterprise API/workflow embedding (ripping out GeoViz breaks an internal reporting pipeline, not just a subscription).
- Agency white-label workflows embedded into the agency's own client onboarding.

## Why competitors structurally cannot recreate it quickly

- **Sampling history cannot be backfilled.** No amount of funding produces three years of repeated AI-answer samples retroactively.
- **Scoring-freeze discipline is behavioral, not technical.** Most competitors will retune scoring under commercial pressure, which destroys their own historical trend claims. GeoViz's versioned, replay-safe discipline (`docs/strategy/00_NORTH_STAR.md` Core Principle #4, enforced technically per the `AuditIntelligence`/`ObservationHistory` append-only pattern) is easy to describe and hard for a pressured competitor to sustain.
- **Installed-base telemetry requires real distribution**, not just audit volume — a competitor can out-audit GeoViz on volume; they cannot instantly have thousands of live plugin installs.

## How this becomes a $100M asset

Three compounding thresholds (full detail: `docs/strategy/03_DATA_MOAT.md` "How This Becomes a $100M Asset"):

1. **~1,000 businesses** — cohort/category benchmarks become directionally credible (`cohort-analysis` first recomputation).
2. **~10,000–100,000 businesses** — benchmarks become statistically defensible and licensable (`benchmark-engine`, `data-licensing`).
3. **~1M businesses** — the dataset becomes a two-sided network valuable to anyone modeling AI-driven commerce discovery, not just the businesses in it.

## The load-bearing dependency

None of this works if scoring integrity is ever compromised. A licensable, citable dataset is only valuable because it is trusted — this is why "Trust > Growth" (`docs/strategy/00_NORTH_STAR.md`) is a mechanism, not a values statement.
