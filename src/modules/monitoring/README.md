# Module: Monitoring

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/monitoring.md` and `docs/monitoring/MONITORING_SPEC.md`.

## Purpose

The recurring-revenue anchor of the company (`docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 2). Composes `ai-answer-sampling`, `change-detection`, and `alerts` into a customer-facing score-trend timeline and alert feed. Per customer research (`docs/strategy` Agent 5), Monitoring must always show evidence (actual AI answers), never just a re-run score — this is the single highest-risk retention decision in the roadmap and this module's central design constraint.

## Database Schema

See the proposed `MonitoringSubscription` model in `contracts.ts` — the billing/cadence record; historical score/evidence data itself lives in `ai-answer-sampling` and the existing `ObservationHistory`/`AuditIntelligence` models, composed here rather than duplicated.

## API Contracts / Service Interfaces

See `contracts.ts` — `MonitoringService`. Depends (type-only) on `AnswerSnapshot` (`ai-answer-sampling`), `ChangeEvent` (`change-detection`), `AlertNotification` (`alerts`), and `VisibilitySnapshot`/`VisibilityHistory` (`src/lib/v2/contracts.ts`).

## React Page Skeleton

`page.skeleton.tsx` — static placeholder composed of `ScoreTrendCard`, `EvidenceTimelineCard`, `AlertFeedCard`, `ChurnRiskCard` (internal/admin variant) placeholder sections. Served at `/monitoring` behind `GEO_MODULE_MONITORING_ENABLED` via `src/app/(future)/monitoring/page.tsx`.

## Component Tree

```
MonitoringPageSkeleton
├── ScoreTrendCard (placeholder)
├── EvidenceTimelineCard (placeholder — the retention-critical surface)
├── AlertFeedCard (placeholder, sourced from `alerts`)
└── CompetitorGlanceCard (placeholder, sourced from `competitor-intelligence` once it exists)
```

## Telemetry Requirements

Evidence-view engagement (are customers actually looking at AI-answer snapshots, or just the score) is the specific metric that validates or invalidates the evidence-first retention thesis — track it explicitly, not as an afterthought.

## Feature Flags

`GEO_MODULE_MONITORING_ENABLED`.

## Acceptance Tests

Future: `scripts/test-monitoring.ts`. Planned assertions: a subscription's dashboard always includes at least one evidence snapshot when available (never score-only when evidence exists), churn-risk flag fires when score plateaus AND no evidence has been viewed in the window, cadence (weekly/daily) is enforced per plan tier.

## Implementation Checklist

- [ ] Scheduled re-score job (weekly/monthly) — v1, needs only `ai-answer-sampling`, not the fuller `change-detection`/`alerts` stack (those are v2 additions, Stage 4).
- [ ] Monitoring subscription billing (Stripe recurring) — extends existing V1 Stripe integration, does not fork it.
- [ ] Score-trend timeline UI.
- [ ] Churn-risk flagging job.
- [ ] v2: wire in `change-detection` + `alerts` for the full drift/alert experience.

## Dependencies

Depends on `ai-answer-sampling` (v1), `change-detection` + `alerts` (v2). `competitor-intelligence` and `enterprise` depend on this module. See `docs/MODULE_DEPENDENCY_GRAPH.md` for the explicit v1/v2 split.

## Technical Debt Notes

Do not ship v1 Monitoring without at least a pilot-scale `ai-answer-sampling` integration — a monitoring product that is only a re-score is the exact failure mode the customer-research agent flagged as the top churn risk.

## Security Review

Billing data reuses existing V1 Stripe patterns — no new payment-handling surface to review. Subscription cadence/tier gating must be enforced server-side, not just in the UI.

## Future Roadmap

v1: re-score + evidence snapshots (Stage 2). v2: change detection + alerts (Stage 4). v3: full timeline + churn-risk automation (Stage 4–5).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code, not imported by any V1 file today.
- `page.skeleton.tsx` — static presentational skeleton, no data fetching, no real logic.

## What is intentionally NOT in this directory

- Sampling logic itself — lives in `ai-answer-sampling`.
- Diff/alert logic itself — lives in `change-detection` / `alerts`.
- Competitor comparison — lives in `competitor-intelligence`.
