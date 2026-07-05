# Enterprise — Product/Technical Spec

Companion to `src/modules/enterprise/README.md`. Full business context: `docs/strategy/08_ENTERPRISE_ROADMAP.md` (already written) and `docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 5.

| Capability | Contract (`src/modules/enterprise/contracts.ts`) | Notes |
|---|---|---|
| API | (shared with `docs/api/API_SPEC.md`) | Enterprise tier includes full API access |
| RBAC | `RbacGrant`, `RbacRole` (account_owner / regional_manager / location_user) | Its own, fuller implementation vs. `agency-platform` |
| SSO | Proposed interface only — provider deferred until a real deal requires it | See `docs/security/SECURITY_BASELINE.md` |
| Audit history | `AuditTrailEntry` — append-only, never overwritten | Traces every score/alert/change to source + methodology version |
| SLA | Uptime + alert-latency monitoring (proposed, not built) | Never commit to an SLA the infra can't meet |
| Compliance | SOC 2 Type II target by Stage 5 exit | `docs/security/SECURITY_BASELINE.md` |
| SOC2 readiness | Begins as infrastructure ahead of sales, not reactively | Same |
| Franchise dashboards | `PortfolioMapCard`/`LocationTableCard` (page skeleton) | v3, Stage 6 |
| Multi-location | `bulkOnboard()`, `EnterpriseLocation` | The #1 blocker identified by the enterprise-buyer persona in the earlier strategic review |

## Enterprise sales motion gate

Per board consensus (`docs/strategy/01_FIVE_YEAR_ROADMAP.md` Stage 4→5 decision): enterprise sales does not start until RBAC, bulk onboarding, audit trail, and SOC 2 (or a demonstrable beta) actually exist — never sold from a roadmap slide.
