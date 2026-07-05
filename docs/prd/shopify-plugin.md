# PRD: Shopify Plugin

## Purpose

Native Shopify embedded-app install experience for the Visibility Layer, reaching e-commerce-adjacent local/service businesses.

## Revenue Model / Justification

Same mechanism as WordPress Plugin — drives Layer/Monitoring attach for the Shopify segment. Lower priority than WordPress (smaller relevant segment for local-service GeoViz customers), hence later in build order.

## User Stories

- As a Shopify merchant, I want to install GeoViz via the App Store with standard OAuth, not a manual key.
- As GeoViz, I want Shopify's mandatory uninstall/GDPR webhooks handled correctly to pass app review.

## Acceptance Criteria

- OAuth install registers a `LayerInstall` row.
- `app/uninstalled` and GDPR data-erasure webhooks are handled per Shopify's mandatory requirements.
- Sync reflects latest audit/Fix data.

## Non-Goals

The Shopify app codebase (likely Remix, per Shopify's own tooling) is out of scope for this repo beyond the API contract.

## Dependencies

Depends on `visibility-layer`, `telemetry`.

## Engineering Estimate

6–9 weeks (v1) — higher than WordPress due to stricter OAuth/webhook/app-review requirements.

## Moat Contribution

Medium — secondary distribution channel, same telemetry mechanism as WordPress.
