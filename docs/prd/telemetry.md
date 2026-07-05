# PRD: Telemetry

## Purpose

Shared, generic event-ingestion seam for every future module's operational events (installs, syncs, engagement) — a sink, not a product.

## Revenue Model / Justification

No direct revenue — indirect via the install-base and engagement data it collects, which informs retention and churn-risk modeling across `monitoring`, `agency-platform`, `enterprise`.

## User Stories

- As an engineer building any future module, I want one place to emit events rather than inventing a bespoke event table per module.
- As GeoViz, I want event volume queryable by source/type without a schema migration each time a new module ships.

## Acceptance Criteria

- Events are append-only (no update path).
- A malformed payload never crashes ingestion (fail-soft, matching `AuditIntelligence`'s pattern).
- Event volume is queryable by `source` and `eventType`.

## Non-Goals

Not a real-time stream/queue system in v1 — an internal function call is sufficient until a plugin needs external ingestion.

## Dependencies

None (Layer 0 / foundational). Every emitting module depends on this one.

## Engineering Estimate

1–2 weeks (v1, internal ingestion only).

## Moat Contribution

Medium directly; high indirectly (it's the pipe every install-base/engagement moat signal flows through).
