# PRD: Visibility Layer

## Purpose

Universal, CMS-agnostic installable snippet maintaining a business's machine-readable context block, detecting drift, and reporting liveness — the core the CMS plugins wrap.

## Revenue Model / Justification

Bundled into Monitoring tiers ($20–50/mo incremental once Alerts are included) — the primary distribution and switching-cost mechanism per `docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 4.

## User Stories

- As a business owner, I want to install one snippet and have my AI-readable context stay current without manual re-work.
- As GeoViz, I want install-base telemetry that no competitor can replicate without equivalent distribution.

## Acceptance Criteria

- Snippet content matches source-of-truth business data.
- Drift detection flags a deliberately-mismatched fixture.
- Uninstall is detected within one liveness-check cycle.

## Non-Goals

Not a CMS or site builder. Not a write-capable mechanism beyond its own context block until the V3 approval-gated remediation stage.

## Dependencies

Depends on `telemetry`. `wordpress-plugin`, `shopify-plugin`, and `change-detection` depend on this module.

## Engineering Estimate

5–8 weeks (v1).

## Moat Contribution

High — the entry point to the installed-base telemetry moat described in `docs/DATA_MOAT_STRATEGY.md`.
