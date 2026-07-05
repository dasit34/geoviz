# PRD: Alerts

## Purpose

Convert `change-detection` output into customer-facing, evidence-backed notifications with a specific recommended action — the "can't cancel, something might break" retention mechanism.

## Revenue Model / Justification

Bundled into Monitoring's premium tier; the strongest identified retention lever per the customer-research persona in the earlier strategic review.

## User Stories

- As a Monitoring subscriber, I want to be notified the moment something drifts, with a concrete next step, not just a data point.
- As GeoViz, I want to measure whether alerts are actually acted on, to validate the retention thesis.

## Acceptance Criteria

- Every alert includes a non-empty recommended action.
- Alert delivery is fail-soft (never silently fails without a logged warning).
- Engagement state transitions (unseen → viewed → acted) are tracked.

## Non-Goals

Not the change-detection logic itself. Not a general-purpose notification system for non-visibility events.

## Dependencies

Depends on `change-detection`, `ai-answer-sampling`. `monitoring` depends on this module.

## Engineering Estimate

3–5 weeks (v1: entity/schema drift alerts only).

## Moat Contribution

Medium directly; high via the churn-prevention data it generates for retention modeling.
