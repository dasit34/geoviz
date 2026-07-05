# Module: WordPress Plugin

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/wordpress-plugin.md` and `docs/plugin/VISIBILITY_LAYER_SPEC.md`.

## Purpose

Native WordPress install experience for the Visibility Layer — the largest SMB CMS install base, and per `docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 4, the single most important distribution channel for the installed-base data moat. A thin wrapper: settings UI inside wp-admin, one-click schema sync, auto-update — all actual context-serving logic lives in `visibility-layer`.

## Database Schema

No new model — reuses `LayerInstall` from `visibility-layer/contracts.ts` with `cms: "wordpress"`. This module's own concern is plugin-version/wp-admin-settings state, proposed as `WordPressPluginConfig` in `contracts.ts`.

## API Contracts / Service Interfaces

See `contracts.ts` — `WordPressPluginService`. Depends on `VisibilityLayerService` from the `visibility-layer` module (type-only import).

## React Page Skeleton

N/A as a Next.js route — this module's UI lives inside wp-admin (PHP/WP settings API), not the GeoViz app. No `page.skeleton.tsx` / placeholder route for this module.

## Component Tree

N/A (WordPress admin UI, not React).

## Telemetry Requirements

Emits `wordpress-plugin` events via `telemetry`: plugin activated, settings saved, schema sync run, plugin deactivated.

## Feature Flags

`GEO_MODULE_WORDPRESS_PLUGIN_ENABLED` — gates any future plugin-facing API endpoint the WP plugin would call.

## Acceptance Tests

Future: `scripts/test-wordpress-plugin.ts`. Planned assertions: plugin activation registers a `LayerInstall` row via the visibility-layer service, schema sync reflects the latest Fix/audit data, deactivation is detected within one liveness cycle.

## Implementation Checklist

- [ ] Scaffold the actual WordPress plugin (PHP) in a separate repo/directory once greenlit — this `src/modules/wordpress-plugin/` folder holds only the GeoViz-side API contract the plugin calls into, not the plugin code itself.
- [ ] wp-admin settings screen: connect account, view current score, view active alerts.
- [ ] One-click schema sync action calling `VisibilityLayerService.refreshContextBlock`.
- [ ] WordPress.org plugin directory submission + review process.

## Dependencies

Depends on `visibility-layer` (installs are `LayerInstall` rows with `cms: "wordpress"`) and `telemetry`. See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Technical Debt Notes

The actual PHP plugin code does not belong in this TypeScript repo long-term — this folder scaffolds the GeoViz-side contract only. Flag this clearly when implementation begins so the plugin repo split happens deliberately, not accidentally.

## Security Review

Plugin-to-GeoViz API calls require per-site API key authentication (proposed, not built) — never a shared secret across installs. wp-admin UI must never expose that key in plaintext to non-admin WP roles.

## Future Roadmap

v1: manual install + settings screen (Stage 4). v2: auto-update, in-admin alert display (Stage 4–5). v3: one-click approved-remediation apply (Stage 6, gated by the same approval/rollback rule as everywhere else).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only (the GeoViz-side API contract the eventual PHP plugin calls). No runtime code, no PHP.

## What is intentionally NOT in this directory

- Any PHP/WordPress plugin code.
- Snippet-serving/context-block logic — lives in `visibility-layer`.
