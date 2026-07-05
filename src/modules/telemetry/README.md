# Module: Telemetry

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/telemetry.md` for the full product spec.

## Purpose

A shared, generic event-ingestion seam for everything downstream of the frozen V1 core: Visibility Layer install/liveness events, WordPress/Shopify plugin events, Monitoring engagement events, Agency/Enterprise usage events. Telemetry is a sink other modules push into, not a product with its own customer surface — see `docs/strategy/03_DATA_MOAT.md` for why this operational exhaust becomes a compounding asset (change-detection tuning, install-base analytics, retention modeling).

## Database Schema

See the proposed `TelemetryEvent` model in `contracts.ts` — one generic, append-only event table with a typed `source` + `eventType` + `payload` Json, rather than a bespoke table per module. This keeps the ingestion path uniform as new modules are added.

## API Contracts / Service Interfaces

See `contracts.ts` — `TelemetryService`.

## React Page Skeleton

N/A — backend/data module. Internal telemetry health may eventually surface in an admin-only view, not a customer-facing route.

## Component Tree

N/A.

## Telemetry Requirements

N/A (this module *is* the telemetry requirement for everything else).

## Feature Flags

`GEO_MODULE_TELEMETRY_ENABLED` — gates the ingestion endpoint once built. Unset/false today.

## Acceptance Tests

Future: `scripts/test-telemetry.ts`. Planned assertions: events are append-only (no update path exists), a malformed `payload` never crashes ingestion (fail-soft, matching the `AuditIntelligence` ingestion pattern), event volume is queryable by `source` and `eventType`.

## Implementation Checklist

- [ ] Define the closed set of `source` values as new modules are greenlit (start with `visibility-layer`, `wordpress-plugin`, `shopify-plugin`).
- [ ] Build one ingestion function other modules call — no module writes its own bespoke event table.
- [ ] Add retention/archival policy consistent with `docs/data/DATA_WAREHOUSE.md` (never delete, partition by month once volume justifies it).

## Dependencies

None — Layer 0 / foundational module. Every other module that emits events depends on this one, not the reverse. See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Technical Debt Notes

Resist the urge to let `payload` become a dumping ground for ad hoc fields — every new `eventType` should get a documented shape (a TS type in the emitting module's own `contracts.ts`), even though the column itself stays generic Json.

## Security Review

No PII beyond what a module's own event legitimately needs (e.g., hostname, not visitor identity — Visibility Layer telemetry is explicitly not visitor analytics, see `docs/plugin/VISIBILITY_LAYER_SPEC.md`). Ingestion endpoint (once built) must be authenticated per-source to prevent event spoofing.

## Future Roadmap

v1: internal ingestion function only, no external endpoint (Stage 3–4, backing Visibility Layer telemetry). v2: authenticated public ingestion endpoint for plugin telemetry at scale (Stage 4+). v3: real-time event stream (webhooks/queue) feeding Alerts and Change Detection directly (Stage 5+).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code. Not imported by any V1 file today.

## What is intentionally NOT in this directory

- Any actual event pipeline/queue infrastructure.
- Module-specific event shape definitions — those live in the emitting module's own `contracts.ts` and reference `TelemetryEvent["payload"]`'s generic shape only.
