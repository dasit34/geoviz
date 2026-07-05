# Data Licensing — Product/Technical Spec

Companion to `src/modules/data-licensing/README.md`. Full business context: `docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 6 and `docs/DATA_MOAT_STRATEGY.md`.

| Capability | Contract (`src/modules/data-licensing/contracts.ts`) | Notes |
|---|---|---|
| License agreements | `LicenseAgreement` | Explicit usage terms; legal review required before delivery infra is built |
| Delivery pipeline | `deliver()`, `LicenseDelivery` | Only ever delivers already-aggregated `PublishedBenchmark`/`CohortRecomputation` output |
| Enforcement | `LicenseDeliveryLog` (append-only) | The record that lets GeoViz detect/prove license-term violations |

## The one hard rule

No delivered dataset ever includes a cohort below the minimum sample-size floor already enforced by `cohort-analysis`/`benchmark-engine` — this module cannot bypass that gate to satisfy a licensee's request for finer-grained data, under any commercial pressure.

## Greenlight condition

Do not begin implementation before `benchmark-engine`/`cohort-analysis` have real, governed history behind them (Stage 6) — a licensing product built on thin data damages the exact credibility the license is selling.
