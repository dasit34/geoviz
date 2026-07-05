# Module: Enterprise

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/enterprise.md` and `docs/enterprise/ENTERPRISE_SPEC.md`.

## Purpose

Multi-location console for the 5,000-location buyer: RBAC, bulk onboarding, audit trail, and the API/SLA/compliance posture required to survive real enterprise procurement. Per `docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 5 board decision, this module ships *before* enterprise sales is pursued — never the reverse.

## Database Schema

See the proposed `EnterpriseAccount`, `EnterpriseLocation`, and `RbacGrant` models in `contracts.ts`.

## API Contracts / Service Interfaces

See `contracts.ts` — `EnterpriseService`. Depends (type-only) on `MonitoringDashboardView` (`monitoring`) and `LayerInstallRecord` (`visibility-layer`).

## React Page Skeleton

`page.skeleton.tsx` — static placeholder composed of `PortfolioMapCard`, `LocationTableCard`, `RbacManagementCard`, `AuditTrailCard` placeholder sections. Served at `/enterprise` behind `GEO_MODULE_ENTERPRISE_ENABLED` via `src/app/(future)/enterprise/page.tsx`.

## Component Tree

```
EnterprisePageSkeleton
├── PortfolioMapCard (placeholder)
├── LocationTableCard (placeholder)
├── RbacManagementCard (placeholder)
└── AuditTrailCard (placeholder)
```

## Telemetry Requirements

API usage telemetry (which endpoints, cadence) once the API ships — this is itself a valuable signal for what enterprise customers value operationally (per `docs/strategy/03_DATA_MOAT.md`).

## Feature Flags

`GEO_MODULE_ENTERPRISE_ENABLED`.

## Acceptance Tests

Future: `scripts/test-enterprise.ts`. Planned assertions: a regional-manager-scoped RBAC grant never returns data outside its assigned locations, bulk onboarding of N hostnames creates N properly-linked `EnterpriseLocation` rows, every score/alert/change event exposed via the audit trail is traceable to its source and methodology version.

## Implementation Checklist

- [ ] RBAC (account → region → location tiers) — deliberately its own, fuller implementation; does not reuse `agency-platform`'s lightweight model (different stage, different scale requirement — see `agency-platform/README.md`).
- [ ] Bulk/multi-location ingestion pipeline.
- [ ] Audit trail (every score/alert/change traceable to source + methodology version).
- [ ] SOC 2 program (tracked in `docs/enterprise/ENTERPRISE_SPEC.md` and `docs/security/SECURITY_BASELINE.md`, not owned solely by this module).
- [ ] SLA infrastructure (uptime, alert-latency monitoring).

## Dependencies

Depends on `monitoring` (per-location dashboards) and `visibility-layer` (multi-location layer deployment). Depends on the future `api` surface for external integration. See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Technical Debt Notes

Do not attempt to share RBAC code with `agency-platform` prematurely — they solve genuinely different problems at different scales; forcing a shared abstraction before both are mature would be the premature-abstraction failure mode this codebase explicitly avoids.

## Security Review

Full detail in `docs/security/SECURITY_BASELINE.md`. This module is the primary consumer of that baseline: RBAC enforcement, SOC 2 scope, audit-trail integrity, SLA monitoring.

## Future Roadmap

v1: RBAC + bulk onboarding + audit trail (Stage 5). v2: SOC 2 Type II + SLA infrastructure (Stage 5). v3: franchise-specific dashboards + deep API embedding (Stage 6).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code, not imported by any V1 file today.
- `page.skeleton.tsx` — static presentational skeleton, no data fetching, no real logic.

## What is intentionally NOT in this directory

- Agency-tier lightweight RBAC — lives in `agency-platform`, a deliberately separate, earlier-stage implementation.
- SSO provider integration code — proposed interface only until a stage-5 SSO provider is selected.
