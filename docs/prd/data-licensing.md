# PRD: Data Licensing

## Purpose

Monetize the aggregated dataset directly — the terminal-stage revenue line. Licenses anonymized cohort/benchmark output to agencies, analysts, adjacent platforms, and researchers.

## Revenue Model / Justification

Licensing deals $50K–500K/yr per licensee (Stage 6) — the highest-margin revenue line in the roadmap, entirely contingent on `benchmark-engine`/`cohort-analysis` having years of governed, trustworthy history first.

## User Stories

- As a media/analyst licensee, I want confidence that the data I'm licensing is methodologically stable and won't be silently revised out from under me.
- As GeoViz, I want to guarantee no licensed dataset can be used to reconstruct an individual business's private data.

## Acceptance Criteria

- No delivered dataset includes a cohort below the minimum sample-size floor.
- Every delivery is logged with the exact methodology version delivered.
- License-term violations are detectable from the delivery log.

## Non-Goals

Not a raw-data export tool — only ever licenses already-aggregated, already-governed output.

## Dependencies

Depends on `benchmark-engine`, `cohort-analysis`. Last module greenlit in the roadmap — do not start early.

## Engineering Estimate

4–6 weeks (v1: manual deals + batch export).

## Moat Contribution

Critical — converts the dataset from an internal asset into direct, high-margin revenue, the clearest evidence the moat is real.
