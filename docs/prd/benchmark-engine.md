# PRD: Benchmark Engine

## Purpose

Turn cohort data into published, citable benchmarks — industry/city/state/national averages, top/bottom performers, and eventually a recurring AI Visibility Index.

## Revenue Model / Justification

Indirect (PR/category-authority driving inbound) in v1–v2; direct via `data-licensing` in v3 (Stage 6, $50K–500K/yr per licensee).

## User Stories

- As a prospective customer, I want to see how my industry/city compares before I buy, so the offer feels evidence-based rather than salesy.
- As press/analysts, I want a citable, versioned benchmark I can reference without worrying it will be silently revised.

## Acceptance Criteria

- A benchmark cannot publish below its configured minimum sample-size floor.
- Every published benchmark records its methodology version.
- No publish action mutates a prior published snapshot.

## Non-Goals

Not a per-customer comparison tool (that's `competitor-intelligence`). Not licensable data delivery (that's `data-licensing`).

## Dependencies

Depends on `ai-answer-sampling`, `cohort-analysis`.

## Engineering Estimate

5–7 weeks (v1).

## Moat Contribution

Critical — the category-authority engine; governance discipline here is what makes the whole benchmark citable.
