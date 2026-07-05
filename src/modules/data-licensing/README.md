# Module: Data Licensing

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/data-licensing.md` and `docs/licensing/DATA_LICENSING_SPEC.md`.

## Purpose

Monetize the aggregated dataset directly — the terminal-stage revenue line described in `docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 6. Licenses anonymized `cohort-analysis`/`benchmark-engine` output to agencies, analysts, adjacent platforms, and researchers. Never sells raw, individually-identifiable business data.

## Database Schema

See the proposed `LicenseAgreement` and `LicenseDeliveryLog` models in `contracts.ts`.

## API Contracts / Service Interfaces

See `contracts.ts` — `DataLicensingService`. Depends (type-only) on `PublishedBenchmark` (`benchmark-engine`) and `CohortRecomputation` (`cohort-analysis`).

## React Page Skeleton

N/A — this module has no customer-facing dashboard; licensees receive data via export/API, not a GeoViz UI surface.

## Component Tree

N/A.

## Telemetry Requirements

Log every data delivery (licensee, dataset scope, methodology version delivered) — this is the enforcement record for licensing terms.

## Feature Flags

`GEO_MODULE_DATA_LICENSING_ENABLED`.

## Acceptance Tests

Future: `scripts/test-data-licensing.ts`. Planned assertions: no delivered dataset ever includes a cohort below the minimum sample-size floor, every delivery is logged with the exact methodology version delivered, license-term violations (e.g., attempted re-licensing) are detectable from the delivery log.

## Implementation Checklist

- [ ] Anonymization/aggregation pipeline enforcing the sample-size floor already defined in `cohort-analysis`/`benchmark-engine`.
- [ ] Licensing agreement + usage-terms enforcement tooling.
- [ ] Licensee data-delivery export pipeline (batch export first; API access later, shared with the `api` module).

## Dependencies

Depends on `benchmark-engine` and `cohort-analysis` — this module only ever licenses their already-aggregated, already-governed output, never raw audit data directly. See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Technical Debt Notes

Never bypass `cohort-analysis`'s sample-size gate to satisfy a licensee's request for finer-grained data — this is a hard boundary, not a negotiable configuration.

## Security Review

The single most important security property of this module: a licensee must never be able to reconstruct an individual business's data from a licensed dataset. Enforce aggregate-only delivery at the service layer, and require legal review of every licensing agreement's usage terms before delivery infrastructure is built.

## Future Roadmap

v1: manual, ad hoc licensing deals with batch export (Stage 6). v2: self-serve licensee portal + API-based delivery (Stage 6+, shared with `api`).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code, not imported by any V1 file today.

## What is intentionally NOT in this directory

- Cohort computation itself — lives in `cohort-analysis`.
- Benchmark publishing itself — lives in `benchmark-engine`.
