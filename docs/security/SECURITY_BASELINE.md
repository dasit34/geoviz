# Security Baseline (Shared)

Cross-cutting security/compliance requirements referenced by `docs/enterprise/ENTERPRISE_SPEC.md`, `docs/agency/AGENCY_PLATFORM_SPEC.md`, `docs/api/API_SPEC.md`, and `docs/plugin/VISIBILITY_LAYER_SPEC.md` — defined once here rather than repeated per doc.

## RBAC

Role-based access wherever multi-tenant data exists. Two independent implementations by design (see `docs/MODULE_DEPENDENCY_GRAPH.md` "Deliberate non-dependencies"): `agency-platform`'s lightweight per-agency scoping, and `enterprise`'s fuller account/region/location tiering. Both must enforce scoping server-side, never in the UI layer alone.

## SSO

Enterprise-tier requirement (Stage 5+). Proposed as an interface in `src/modules/enterprise/contracts.ts`'s future scope — provider selection (Okta, Azure AD, etc.) deferred until a real enterprise deal requires it; do not build against a guessed provider.

## Audit Trail

Every score, alert, and change event must be traceable to its source and methodology version — implemented as the append-only `AuditTrailEntry` model proposed in `src/modules/enterprise/contracts.ts`, itself built on the same "never updated, never overwritten" pattern as `ObservationHistory`.

## SOC 2

Begins as infrastructure ahead of enterprise sales (Stage 5), not reactively. Target: SOC 2 Type II by Stage 5 exit criteria (`docs/strategy/01_FIVE_YEAR_ROADMAP.md`).

## Encryption & Access Control

Standard practice once any module handles account-level data beyond public business/audit data: encryption at rest/in transit, least-privilege internal access, regular penetration testing at enterprise-relevant data volumes.

## Incident Response

Documented plan required before the first enterprise contract signs, not after the first incident. Extends to the automated-remediation incident-transparency policy referenced in `docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 6 — any automated action against a customer's live site carries its own incident-disclosure obligation on top of standard security incident response.

## Plugin-specific security (Visibility Layer / WordPress / Shopify)

- Per-site API key (WordPress) or OAuth (Shopify, per platform requirement) — never a shared secret across installs.
- Snippet served with subresource integrity from a GeoViz-controlled CDN.
- No write access to a customer's site beyond the snippet's own injected content unless the V3 approval/rollback gate (`docs/strategy/00_NORTH_STAR.md`) is satisfied.
- Shopify's mandatory GDPR/data-erasure webhooks implemented before app-store submission (see `src/modules/shopify-plugin/contracts.ts`'s `eraseShopData`).

## Data-licensing-specific security

No licensed dataset may permit reconstruction of an individual business's data — enforced at the service layer via the same sample-size floor `cohort-analysis`/`benchmark-engine` already apply, never bypassed for a licensee's request.
