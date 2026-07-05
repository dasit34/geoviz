# Module: Alerts

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/alerts.md` and `docs/monitoring/MONITORING_SPEC.md`.

## Purpose

Convert `change-detection` output into customer-facing, evidence-backed notifications. Per customer-research findings in `docs/strategy` (Agent 5 — Customer), this is the "can't cancel, something might break" retention mechanism — every alert must include what changed, the evidence, and a specific recommended action, never a bare notification.

## Database Schema

See the proposed `AlertNotification` model in `contracts.ts` — append-only, one row per fired alert plus customer engagement state (viewed/acted/ignored).

## API Contracts / Service Interfaces

See `contracts.ts` — `AlertsService`. Depends (type-only) on `ChangeEvent` from `change-detection`.

## React Page Skeleton

N/A — surfaces inside the `monitoring` dashboard's alert feed, not its own route.

## Component Tree

N/A directly, but defines the shape consumed by `monitoring`'s `AlertFeedCard` placeholder.

## Telemetry Requirements

Log alert delivery + engagement (opened, acted-on, ignored) — feeds the churn-risk signal described in `docs/strategy/05_MONITORING_ARCHITECTURE.md` "Retention Metrics."

## Feature Flags

`GEO_MODULE_ALERTS_ENABLED`.

## Acceptance Tests

Future: `scripts/test-alerts.ts`. Planned assertions: every alert includes a non-empty recommended action, alert delivery never blocks or fails silently (fail-soft with logged warning), engagement state transitions (unseen → viewed → acted) are tracked.

## Implementation Checklist

- [ ] Map each `ChangeCategory` (from `change-detection`) to an alert template with a specific recommended action.
- [ ] Delivery channels: email first, webhook/SMS later.
- [ ] Engagement tracking (open, click-through to evidence).

## Dependencies

Depends on `change-detection` (trigger source) and `ai-answer-sampling` (citation-change alerts specifically). `monitoring` depends on this module to populate its alert feed. See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Technical Debt Notes

Resist adding alert types faster than the recommended-action content library can keep up — an alert without a concrete action is explicitly the failure mode this module exists to prevent.

## Security Review

Alert delivery must not leak one customer's data into another's notification (straightforward but worth a specific test given multi-tenant/agency scenarios in later stages).

## Future Roadmap

v1: entity/schema drift alerts only (Stage 4). v2: competitor-change + citation-change alerts (Stage 5, depends on `competitor-intelligence` + expanded `ai-answer-sampling`). v3: real-time delivery via telemetry-driven triggers (Stage 6).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code, not imported by any V1 file today.

## What is intentionally NOT in this directory

- Change detection logic itself — lives in `change-detection`.
- Dashboard rendering — lives in `monitoring`.
