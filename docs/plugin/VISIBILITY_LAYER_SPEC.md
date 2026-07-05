# Visibility Layer — Product/Technical Spec

Joint spec covering `src/modules/visibility-layer`, `src/modules/wordpress-plugin`, and `src/modules/shopify-plugin`. Companion to `docs/strategy/04_AI_VISIBILITY_LAYER.md` (business architecture, already written).

## Install flow per platform

| Platform | Owning module | Install mechanism | Stage |
|---|---|---|---|
| Universal (any site) | `visibility-layer` | Copy-paste JS snippet | 4 |
| WordPress | `wordpress-plugin` | wp-admin plugin, one-click | 4 |
| Shopify | `shopify-plugin` | Shopify App Store, OAuth | 4–5 |
| Webflow | (future, not yet a module) | Embed/custom-code | Stage 4–5, per `docs/strategy/04_AI_VISIBILITY_LAYER.md` V2 |
| Wix | (future, not yet a module) | Wix App Market | Stage 4–5 |
| Squarespace | (future, not yet a module) | Code-injection based | Stage 4–5 |
| Custom sites | `visibility-layer` | Manual snippet + docs, always available | 4 |

Webflow/Wix/Squarespace are not separate `src/modules/` scaffolds — they're planned as additional install-path implementations of `visibility-layer`'s `VisibilityLayerService.install()` for their respective `SupportedCms` values, not new services. A dedicated module scaffold is only justified when a CMS's platform requirements (like Shopify's OAuth + mandatory webhooks) are complex enough to need one — reassess if any of these three grow that complex.

## Schema / llms.txt / entity-identity maintenance

`visibility-layer`'s `LayerContextBlock` reuses the entity-field taxonomy already validated by `src/lib/intelligence/preflight/schemaValidation.ts` — no second, divergent schema taxonomy.

## Drift detection

Delegated entirely to `change-detection` — `visibility-layer` owns *what* is compared (the context block), not *how* the diff algorithm works.

## Approved-push mechanism (V3, future)

Any write capability beyond serving the context block requires the approval/rollback gate in `docs/strategy/00_NORTH_STAR.md` "What GeoViz Will Never Become" — no exceptions, regardless of competitive pressure.

## Telemetry

All three modules emit through the shared `telemetry` module (`src/modules/telemetry/contracts.ts`) — install, liveness, sync, uninstall events. See "Privacy" below for what is explicitly excluded.

## Security / Privacy

Full baseline: `docs/security/SECURITY_BASELINE.md` "Plugin-specific security." Key point: the Layer is a business-context-serving mechanism, not a visitor-analytics/tracking pixel — it collects business-facing structured data and its own liveness telemetry, never end-visitor browsing behavior.
