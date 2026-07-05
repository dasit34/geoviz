# PRD: Monitoring

## Purpose

The recurring-revenue anchor of the company. Composes `ai-answer-sampling`, `change-detection`, and `alerts` into a customer-facing score-trend timeline and alert feed, always evidence-backed, never a bare re-score.

## Revenue Model / Justification

$29–79/mo (Stage 2 launch) scaling to $79–199/mo/location (Stage 3+) by tier depth (sampling frequency, competitor tracking, alert granularity). The first recurring-revenue product in the roadmap — its retention design is the single highest-risk decision in the five-year plan per customer research.

## User Stories

- As a customer who paid $97 once, I want a reason to keep paying monthly — actual evidence of my AI visibility changing, not just a re-run number.
- As GeoViz, I want to detect churn risk (score plateau + no evidence viewed) before a customer cancels, not after.

## Acceptance Criteria

- A subscription's dashboard always includes at least one evidence snapshot when available.
- Churn-risk flag fires when score plateaus AND no evidence has been viewed in the window.
- Cadence (weekly/daily) is enforced per plan tier.

## Non-Goals

Not a competitor-comparison tool (that's `competitor-intelligence`). v1 does not require `change-detection`/`alerts` — those are v2 additions (Stage 4).

## Dependencies

Depends on `ai-answer-sampling` (v1), `change-detection` + `alerts` (v2). `competitor-intelligence` and `enterprise` depend on this module.

## Engineering Estimate

4–6 weeks (v1: re-score + evidence only); 3–4 additional weeks for v2 (change detection + alerts integration).

## Moat Contribution

High — the customer-facing surface that proves the evidence-first thesis and generates the engagement telemetry that validates (or invalidates) the entire recurring-revenue model.
