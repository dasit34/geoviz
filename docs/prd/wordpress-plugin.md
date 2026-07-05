# PRD: WordPress Plugin

## Purpose

Native, one-click WordPress install experience for the Visibility Layer — the largest SMB CMS install base.

## Revenue Model / Justification

No separate price — drives Layer/Monitoring attach rate by removing install friction for the largest CMS segment, per `docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 4's "WordPress-first" decision.

## User Stories

- As a WordPress site owner, I want to install GeoViz's layer in under 2 minutes from wp-admin without touching code.
- As GeoViz, I want plugin-activation telemetry that measures real adoption, not just audit volume.

## Acceptance Criteria

- Plugin activation registers a `LayerInstall` row via the visibility-layer service.
- Schema sync reflects the latest Fix/audit data.
- Deactivation detected within one liveness cycle.

## Non-Goals

The PHP plugin codebase itself is out of scope for this TypeScript repo — this module scaffolds only the GeoViz-side API contract.

## Dependencies

Depends on `visibility-layer`, `telemetry`.

## Engineering Estimate

5–7 weeks (v1), plus WordPress.org review-process lead time.

## Moat Contribution

Critical — the single most important distribution channel for the installed-base moat.
