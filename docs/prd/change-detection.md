# PRD: Change Detection

## Purpose

Deterministic, diff-based detection of what changed for a business between two points in time — entity/schema, citation status, competitor scores. Never an LLM judgment call.

## Revenue Model / Justification

No direct price — powers `alerts` (the Monitoring retention hook) and `competitor-intelligence`'s change signals.

## User Stories

- As a Monitoring subscriber, I want to be told exactly what changed and when, with evidence, not a vague "something changed."
- As GeoViz, I want change detection to be cheap and auditable at scale, which rules out an LLM-judgment approach.

## Acceptance Criteria

- A deliberately mismatched fixture (NAP mismatch, missing schema field) is always flagged.
- An unchanged fixture never fires a false positive.
- No test path or implementation path calls an LLM.

## Non-Goals

Not a scoring mechanism. Not an alert-delivery mechanism (that's `alerts`).

## Dependencies

Depends on `visibility-layer`, `ai-answer-sampling`. `monitoring` and `alerts` depend on this module.

## Engineering Estimate

4–6 weeks (v1: entity/schema diff only).

## Moat Contribution

High — the installed-base change-detection dataset is one of the four assets competitors cannot recreate quickly.
