# Module: Agency Platform

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/agency-platform.md` and `docs/agency/AGENCY_PLATFORM_SPEC.md`.

## Purpose

CAC-efficient distribution channel: white-label, multi-client dashboard letting an agency manage its whole book of business under one account. Per `docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 3, this is the primary growth engine before enterprise sales exists — deliberately scoped as its own lightweight multi-user/RBAC model, not a dependency on the fuller `enterprise` RBAC (which ships two stages later; agency must not be blocked waiting on it).

## Database Schema

See the proposed `AgencyAccount` and `AgencyClientLink` models in `contracts.ts`.

## API Contracts / Service Interfaces

See `contracts.ts` — `AgencyPlatformService`.

## React Page Skeleton

`page.skeleton.tsx` — static placeholder composed of `ClientListCard`, `PortfolioSummaryCard`, `WhiteLabelSettingsCard` placeholder sections. Served at `/agency-platform` behind `GEO_MODULE_AGENCY_PLATFORM_ENABLED` via `src/app/(future)/agency-platform/page.tsx`.

## Component Tree

```
AgencyPlatformPageSkeleton
├── PortfolioSummaryCard (placeholder)
├── ClientListCard (placeholder)
├── BulkAuditActionCard (placeholder)
└── WhiteLabelSettingsCard (placeholder)
```

## Telemetry Requirements

Emits `agency-platform` events via `telemetry`: client added, bulk audit run, white-label branding updated.

## Feature Flags

`GEO_MODULE_AGENCY_PLATFORM_ENABLED`.

## Acceptance Tests

Future: `scripts/test-agency-platform.ts`. Planned assertions: an agency user only ever sees their own linked clients (tenant isolation), bulk audit submission creates one order per client hostname, white-label branding renders on generated reports without exposing GeoViz branding when configured.

## Implementation Checklist

- [ ] Lightweight multi-user auth scoped to one agency account (does not need to share code with the fuller `enterprise` RBAC — different stage, different scale requirement).
- [ ] Multi-client dashboard (aggregated view across linked hostnames).
- [ ] White-label report branding (extends existing report-rendering module, does not fork it).
- [ ] Partner revenue-share billing tooling.
- [ ] Bulk client import/onboarding.

## Dependencies

Depends on `visibility-layer` (agency clients install the Layer) and `telemetry`. Explicitly does NOT depend on `enterprise` — see `docs/MODULE_DEPENDENCY_GRAPH.md` for why these stay decoupled despite similar-sounding RBAC concerns.

## Technical Debt Notes

If `enterprise`'s RBAC model matures before Agency Platform is rebuilt, consider consolidating — but do not block Stage 3 agency work waiting for Stage 5 enterprise infrastructure.

## Security Review

Tenant isolation is the primary security requirement — an agency user must never see another agency's client data. White-label mode must not leak GeoViz branding/URLs into a report rendered for an agency's end client.

## Future Roadmap

v1: multi-client dashboard + white-label reports (Stage 3). v2: bulk onboarding + revenue-share billing (Stage 3–4). v3: portfolio-level competitor/benchmark analytics (Stage 5, once `competitor-intelligence`/`benchmark-engine` exist).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code, not imported by any V1 file today.
- `page.skeleton.tsx` — static presentational skeleton, no data fetching, no real logic.

## What is intentionally NOT in this directory

- Enterprise-grade RBAC/SSO — lives in `enterprise`, a deliberately separate, later-stage implementation.
- Report rendering logic itself — extends the existing V1 report module, not duplicated here.
