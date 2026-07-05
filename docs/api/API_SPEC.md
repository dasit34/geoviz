# API — Product/Technical Spec

No dedicated `src/modules/api` scaffold — the API is a cross-cutting surface exposing capabilities already scaffolded in `monitoring`, `competitor-intelligence`, `enterprise`, and `data-licensing`. This doc is the contract-overview layer; the actual request/response types live in each module's own `contracts.ts`.

## Scope (Stage 5+)

- **Read API**: scores, telemetry, alert history — sourced from `monitoring`'s `MonitoringDashboardView` and `alerts`' `AlertNotification`.
- **Webhook events**: alerts and changes — sourced from `alerts`/`change-detection`.
- **Partner/platform integration API** (Stage 6): embeds GeoViz data inside adjacent platforms (POS, franchise management) — the mechanism `data-licensing` v2 uses for delivery.

## Versioning, auth, rate limits

- Version in the URL path once built (`/api/v1/...`) — never break a shipped version silently.
- Authentication: per-account API keys, scoped by the same RBAC grants defined in `src/modules/enterprise/contracts.ts`.
- Rate limits: tiered by plan, enforced server-side, documented per-endpoint once endpoints exist.

## Source of truth

Every response shape referenced here is defined once, in the owning module's `contracts.ts` — this doc never re-specifies a type, only points to it, to avoid the exact drift risk `docs/architecture/SYSTEM_ARCHITECTURE.md` is designed to prevent.
