# Agency Platform — Product/Technical Spec

Companion to `src/modules/agency-platform/README.md`. Full business context: `docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 3.

| Capability | Contract (`src/modules/agency-platform/contracts.ts`) | Notes |
|---|---|---|
| White label | `AgencyAccount.whiteLabelBrandName` / `whiteLabelLogoUrl`, `setWhiteLabelBranding()` | Extends the existing V1 report-rendering module; does not fork it |
| Client dashboards | `portfolioSummary()` | Aggregated view across every `AgencyClientLink` |
| Bulk audits | `bulkAudit()` | One order per hostname |
| Monitoring | (composed from `monitoring` module per client hostname) | Not reimplemented here |
| Multi-user | Lightweight, agency-scoped — deliberately NOT shared with `enterprise`'s RBAC (see `docs/MODULE_DEPENDENCY_GRAPH.md`) | |
| Billing | Partner revenue-share tooling (proposed, extends existing V1 Stripe integration) | |
| Permissions | Tenant isolation: an agency user only ever sees `AgencyClientLink` rows for their own `agencyId` | Enforced server-side per `docs/security/SECURITY_BASELINE.md` |
| Portfolio analytics | `portfolioSummary()` v1; deeper competitor/benchmark analytics is a v3 addition once `competitor-intelligence`/`benchmark-engine` exist | |

## Why agency RBAC stays separate from enterprise RBAC

Different stage (3 vs. 5), different scale (agency book of ~dozens of clients vs. thousands of franchise locations), different buyer (agency owner vs. IT/procurement). Consolidating prematurely would block Stage 3 revenue on Stage 5 infrastructure — see `docs/MODULE_DEPENDENCY_GRAPH.md` "Deliberate non-dependencies."
