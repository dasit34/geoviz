# Module: Shopify Plugin

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/shopify-plugin.md` and `docs/plugin/VISIBILITY_LAYER_SPEC.md`.

## Purpose

Native Shopify app experience for the Visibility Layer, reaching e-commerce-adjacent local/service businesses. Same relationship to `visibility-layer` as `wordpress-plugin`: a thin, CMS-specific install wrapper, not a reimplementation of the context-serving logic.

## Database Schema

No new model — reuses `LayerInstall` from `visibility-layer/contracts.ts` with `cms: "shopify"`. Shopify-specific config proposed as `ShopifyPluginConfig` in `contracts.ts`.

## API Contracts / Service Interfaces

See `contracts.ts` — `ShopifyPluginService`. Depends on `VisibilityLayerService` from `visibility-layer` (type-only import).

## React Page Skeleton

N/A as a Next.js route in this app — the Shopify app UI lives inside the Shopify admin embedded-app surface (a separate app build, likely Remix per Shopify's own tooling), not this Next.js codebase.

## Component Tree

N/A here (belongs to the future Shopify embedded-app codebase).

## Telemetry Requirements

Emits `shopify-plugin` events via `telemetry`: app installed, settings saved, sync run, app uninstalled.

## Feature Flags

`GEO_MODULE_SHOPIFY_PLUGIN_ENABLED` — gates any future Shopify-facing API endpoint.

## Acceptance Tests

Future: `scripts/test-shopify-plugin.ts`. Same shape as the WordPress plugin's test plan: activation registers a `LayerInstall`, sync reflects latest data, uninstall detected within one liveness cycle.

## Implementation Checklist

- [ ] Scaffold the actual Shopify app (likely a separate Remix/Node app per Shopify's app requirements) once greenlit — out of scope for this repo beyond the API contract.
- [ ] Shopify App Store listing + review process.
- [ ] OAuth install flow (Shopify-specific, distinct from the WordPress plugin-key model).

## Dependencies

Depends on `visibility-layer` and `telemetry`. See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Technical Debt Notes

Shopify's app review requirements (OAuth, webhooks for app-uninstalled, GDPR webhooks) are stricter than WordPress's — budget more implementation time here than the WordPress plugin despite the similar conceptual scope. Reflected in the higher engineering estimate in `docs/prd/shopify-plugin.md`.

## Security Review

OAuth-based install (not a shared API key) per Shopify's platform requirements. Must implement Shopify's mandatory GDPR/data-erasure webhooks before app-store approval — track this explicitly in the implementation checklist when work begins.

## Future Roadmap

v1: manual install via Shopify App Store (Stage 4, after WordPress). v2: in-admin alert display. v3: approved-remediation apply, same gating as WordPress plugin.

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only (the GeoViz-side API contract). No runtime code, no Shopify app code.

## What is intentionally NOT in this directory

- Any Shopify app codebase (Remix/Node, OAuth flow, webhook handlers).
- Snippet-serving/context-block logic — lives in `visibility-layer`.
