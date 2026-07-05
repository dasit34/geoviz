# Module: Visibility Layer

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/visibility-layer.md` for the full product spec, and `docs/plugin/VISIBILITY_LAYER_SPEC.md` for the joint spec covering this module + `wordpress-plugin` + `shopify-plugin`.

## Purpose

The universal, CMS-agnostic core of the installable AI-readable context layer: a JS snippet a business drops into any site (any CMS, or none). Maintains a machine-readable business context block (services, area, hours, trust signals), detects drift against the last known-good state, and reports liveness telemetry. `wordpress-plugin`/`shopify-plugin` are thin, CMS-specific install wrappers around this core — they depend on it, not the reverse.

## Database Schema

See the proposed `LayerInstall` model in `contracts.ts`.

## API Contracts / Service Interfaces

See `contracts.ts` — `VisibilityLayerService`.

## React Page Skeleton

N/A — the Layer itself has no dashboard; install status surfaces inside the `monitoring` dashboard skeleton.

## Component Tree

N/A for this module's own surface. The snippet itself renders a small, static, non-interactive context block on the customer's site — not a React component (it must work on any site, framework-agnostic, per `docs/plugin/VISIBILITY_LAYER_SPEC.md`).

## Telemetry Requirements

Emits `visibility-layer` events via the `telemetry` module: install, liveness ping, uninstall/removal-detected. See `src/modules/telemetry/contracts.ts`.

## Feature Flags

`GEO_MODULE_VISIBILITY_LAYER_ENABLED` — gates snippet-serving infrastructure once built.

## Acceptance Tests

Future: `scripts/test-visibility-layer.ts`. Planned assertions: snippet content matches the source-of-truth business data, drift detection flags a deliberately-mismatched fixture, uninstall is detected within one liveness-check cycle.

## Implementation Checklist

- [ ] Define the snippet's served JSON-LD/context-block shape (reuses schema fields already validated by `src/lib/intelligence/preflight/schemaValidation.ts` — do not reinvent the entity-field taxonomy).
- [ ] CDN hosting + subresource integrity for the snippet script.
- [ ] Liveness telemetry emission via `telemetry` module.
- [ ] Drift detection (delegates the actual diff algorithm to `change-detection`; this module owns *what* is compared, not *how* diffs are computed).

## Dependencies

Consumes V1 entity/schema data (via `src/lib/v2/contracts.ts` + existing `AuditIntelligence` fields) and emits into `telemetry`. `change-detection` depends on this module for its entity/schema diff inputs — not the reverse. `wordpress-plugin` and `shopify-plugin` depend on this module. Layer 0 / foundational. See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Technical Debt Notes

Keep the served context block's schema strictly aligned with what `schemaValidation.ts` already validates — a second, divergent entity-field taxonomy here would fragment the data model.

## Security Review

Snippet is read-only context serving in v1/v2 — no write access to the customer's site. Any future write capability (V3 automated remediation) requires the approval/rollback gate defined in `docs/strategy/00_NORTH_STAR.md` "What GeoViz Will Never Become," without exception.

## Future Roadmap

v1: universal snippet, manual install (Stage 4). v2: CMS plugins built on top (Stage 4). v3: adaptive layer + approved-remediation delivery surface (Stage 6, see `docs/strategy/04_AI_VISIBILITY_LAYER.md`).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code. Not imported by any V1 file today.

## What is intentionally NOT in this directory

- CMS-specific install code — lives in `wordpress-plugin` / `shopify-plugin`.
- Diff/drift algorithm implementation — lives in `change-detection`.
- Any write/remediation logic against a customer's live site.
