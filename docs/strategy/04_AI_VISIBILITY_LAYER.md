# GeoViz — AI Visibility Layer

Status: PERMANENT (architecture); implementation ships per `01_FIVE_YEAR_ROADMAP.md` Stage 4 timing. This is the distribution and switching-cost engine of the company — see `03_DATA_MOAT.md`.

Scope reminder (`CLAUDE.md`): the Layer is a thin, machine-readable context layer that coexists with a customer's existing site. It is never a CMS, never a site rebuild, never a replacement for the customer's own web presence.

## V1 — Universal Snippet (Stage 4 launch)

A single JavaScript snippet the customer drops into their site (same install pattern as an analytics tag). V1 scope:
- Serves a machine-readable AI-context block (services, service area, hours, trust signals) pre-formatted for AI retrieval, sourced from the audit/Fix data already on file.
- Passive telemetry only: confirms the snippet is live, reports basic page context (URL, last-modified signal) back to GeoViz.
- No write access to the customer's site beyond the snippet's own injected content.
- Manually installed or installed via copy-paste instructions; no CMS-specific plugin yet.

## V2 — CMS Plugins (Stage 4–5)

Native install experience per platform, in priority order:
1. **WordPress** — largest SMB CMS install base; ships first and gets the deepest investment (auto-updates, settings UI inside wp-admin, one-click schema sync).
2. **Shopify** — reaches e-commerce-adjacent local/service businesses; app-store distribution.
3. **Webflow** — designer/agency-built sites; integrates via Webflow's embed/custom-code mechanism.
4. **Wix** — broad SMB reach; Wix App Market listing.
5. **Squarespace** — broad SMB reach; code-injection-based install (Squarespace has no native app marketplace equivalent at time of writing — verify current platform capability before build).
6. **Custom/unsupported sites** — always supported via the V1 universal snippet + documented manual install; no customer is ever locked out for lacking a supported CMS.

Each plugin adds: automatic schema sync when the customer's Fix/audit data changes, in-CMS visibility into the current score and any active alerts, and update-without-reinstall behavior.

## V3 — Adaptive Layer (Stage 6)

- Snippet content adapts dynamically based on monitoring findings (e.g., automatically reflects updated hours/services once the customer confirms a change) rather than requiring a manual re-sync.
- Becomes the delivery mechanism for human-approved automated remediation (V3 per `01_FIVE_YEAR_ROADMAP.md` Stage 6) — the Layer is the actual surface where an approved fix gets deployed, with the same rollback guarantees as everywhere else in the automation stack.
- Deeper platform partnerships (franchise management systems, POS) can consume Layer data via the API rather than requiring a separate install per location.

## Telemetry

Collected: snippet liveness, install/uninstall events, CMS platform + version, page-load context (aggregate, not individual-visitor tracking — this is a business-visibility tool, not a site analytics/tracking product). See `03_DATA_MOAT.md` for how this telemetry compounds into the change-detection dataset.

Explicitly NOT collected: end-visitor personal data, browsing behavior of the business's site visitors, anything that would make the snippet function as a tracking pixel. The Layer measures the business's machine-readable footprint, not its human visitors.

## Change Detection

Deterministic, diff-based comparison of structured snapshots (schema fields, entity data, snippet content state) between monitoring intervals — never an LLM judgment call on "did something change" (per CTO architecture guidance in `02_PRODUCT_ROADMAP.md`: cost and auditability at monitoring scale require deterministic logic here). LLMs may be used downstream to summarize a detected change in plain English for the customer, but never to detect the change itself.

## Monitoring Integration

The Layer is the primary sensor for Monitoring (`05_MONITORING_ARCHITECTURE.md`) — once installed, it enables higher-frequency, lower-cost checks than a full external audit re-crawl, because the snippet can self-report state changes rather than requiring GeoViz to re-fetch and re-parse the entire page.

## Recommendations

When the Layer detects drift (e.g., NAP mismatch introduced by a site redesign, schema field gone stale), it surfaces a specific, actionable recommendation tied to the exact detected diff — never a generic "improve your AI visibility" nudge. Recommendations reuse the same remediation content library as Foundation Fix (`07_FOUNDATION_FIX_PLAYBOOK.md`) so guidance stays consistent across products.

## Security

- Snippet is served from a GeoViz-controlled CDN with subresource integrity; customers can verify exactly what code is running.
- No snippet update is ever pushed that changes its behavior beyond its documented scope without a version bump and changelog — customers running an older snippet version should never be surprised by new behavior.
- Any V3 automated-remediation deployment through the Layer requires explicit per-change customer approval and a one-click rollback, full stop — this inherits the same non-negotiable rule as `00_NORTH_STAR.md` "What GeoViz Will Never Become."

## Privacy

- The Layer collects business-facing structured data and its own liveness telemetry — not personal data about the business's site visitors.
- Data-processing terms are explicit in the install flow: what is collected, why, and how it's used in aggregate benchmark data (opt-out available for benchmark aggregation, not for core monitoring function).

## Installation

Every install path (universal snippet, WordPress, Shopify, Webflow, Wix, Squarespace, custom) must be completable by a non-technical business owner in under 10 minutes, or by their agency/webmaster in under 2 minutes. Installation friction is the single biggest lever on Layer adoption rate, which is the single biggest lever on the installed-base moat.

## Switching Costs

- Removing the Layer means losing active monitoring, alerts, and the visible score trend — a business that has come to check its GeoViz alerts is unlikely to walk away from that habit.
- Agencies that have embedded Layer installation into their own client onboarding checklist create switching costs at the agency-relationship level, not just the individual business level.
- Enterprise/franchise deployments with API-connected Layer data feeding into internal dashboards create the deepest switching cost — ripping out GeoViz means breaking an internal reporting pipeline, not just canceling a subscription.

## Long-Term Moat

The Layer converts GeoViz from "a company businesses buy a report from" into "infrastructure running on thousands of live business websites, continuously feeding a dataset no one else has permission or history to replicate." This is the mechanism, not just a feature — see `03_DATA_MOAT.md` for why installed-base telemetry is one of the four data assets competitors structurally cannot recreate quickly.
