# GeoViz — Engineering Backlog

Status: LIVING (tasks move to done/deprioritized; the epic structure is permanent). Complexity: XS/S/M/L/XL. Business Impact: Low/Med/High/Critical. "Start Now" = can begin without delaying Stage 1 launch.

---

## EPIC A — Launch Core (Stage 1)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| A1 | Stripe checkout + webhook hardening | M | Critical | Critical | Low | Low | Low | Y |
| A2 | Order DB schema (nullable-safe, additive) | S | Critical | Critical | Med | Low | Low | Y |
| A3 | Admin review queue UI | M | Critical | High | Low | Low | Low | Y |
| A4 | Worker queue / atomic claim / poll loop hardening | L | Critical | Critical | Low | Low | Low | Y |
| A5 | PDF report generation + print CSS | M | High | High | Low | Low | Low | Y |
| A6 | Raw signal capture pipeline (HTML, schema, robots.txt, LLM verbatim) | S | Low (near-term) | Low | Critical | Low | Low | Y |
| A7 | Email notification (order + delivery) via Resend | S | High | Med | Low | Low | Low | Y |
| A8 | Rate limiting on public order form | S | Med | Low | Low | Low | Low | Y |
| A9 | Legal pages (terms, privacy) | XS | Med | Low | Low | Low | Low | Y |
| A10 | Sample report page | S | Med | Med | Low | Low | Low | Y |
| A11 | Admin password-gated access (`ADMIN_PASSWORD`) | XS | High | Low | Low | Low | Low | Y |
| A12 | Refund-rate / QA-pass-rate tracking (internal) | S | Med | Low | Low | Low | Low | Y |

## EPIC B — Foundation Fix Automation (Stage 2)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| B1 | Business-archetype schema template library | M | High | High | Low | Low | Low | N (post-launch) |
| B2 | llms.txt templated generator | M | Med | Med | Low | Low | Low | N |
| B3 | robots.txt rules-based optimizer | S | Med | Med | Low | Low | Low | N |
| B4 | AI-assisted FAQ draft generator (human-reviewed) | M | Med | Med | Low | Low | Low | N |
| B5 | Before/after comparison artifact generator | M | Med | Med | Med | Med | Low | N |
| B6 | QA-correction logging (feeds template improvement + labeled dataset) | S | Med | Low | High | Low | Low | N |
| B7 | Fix delivery cost/margin tracking dashboard (internal) | S | Med | Low | Low | Low | Low | N |

## EPIC C — Monitoring v1 (Stage 2)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| C1 | Scheduled re-score job (weekly/monthly) | M | Critical | Critical | Med | Critical | Low | N |
| C2 | Monitoring subscription billing (Stripe recurring) | M | Critical | Critical | Low | Critical | Low | N |
| C3 | Score-trend timeline (customer-facing) | M | High | High | Med | High | Low | N |
| C4 | Live-AI-answer sampling panel v0 (small-scale pilot) | XL | High | Med | Critical | Critical | High | N |
| C5 | Sampled-answer storage schema (immutable, versioned) | M | Med | Low | Critical | Med | Med | N |
| C6 | Churn-risk flagging (score plateau + no evidence viewed) | M | Med | Med | Low | High | Low | N |

## EPIC D — AI Visibility Layer (Stage 4)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| D1 | Universal JS snippet (v1 scope, read-only context block) | M | High | Med | High | Med | Med | N |
| D2 | Snippet CDN + subresource integrity | S | Med | Low | Low | Low | Low | N |
| D3 | Snippet liveness telemetry pipeline | M | Med | Low | High | Med | Low | N |
| D4 | WordPress plugin (settings UI, schema auto-sync) | L | Critical | High | Critical | High | High | N |
| D5 | WordPress.org plugin review/publish process | M | High | Med | Med | Med | Med | N |
| D6 | Shopify app | L | Med | Med | Med | Med | Low | N |
| D7 | Webflow / Wix / Squarespace integrations | M each | Med | Med | Low-Med | Med | Low | N |
| D8 | Custom-site manual install docs | S | Med | Low | Med | Low | Low | N |
| D9 | Deterministic change-detection engine (diff-based) | L | High | Med | High | High | Med | N |

## EPIC E — Alerts (Stage 4)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| E1 | Entity/schema drift alert triggers | M | High | Med | Med | High | Low | N |
| E2 | Alert delivery (email/SMS/webhook) | S | Med | Low | Low | Med | Low | N |
| E3 | Alert-with-evidence template (diff + recommended action) | M | High | Med | Low | High | Low | N |
| E4 | Competitor-change alert triggers | M | Med | Med | Med | Med | Med | N |
| E5 | Citation/recommendation-change alert triggers | L | High | High | High | High | High | N |
| E6 | Alert engagement analytics (internal) | S | Med | Low | Low | Med | Low | N |

## EPIC F — Competitor Intelligence (Stage 5)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| F1 | Competitor-set definition (customer-defined + auto-detected) | M | Med | Med | Med | Med | Low | N |
| F2 | Category share-of-citation calculation | L | High | High | High | Med | High | N |
| F3 | Cross-platform divergence report | L | Med | Med | High | Low | High | N |
| F4 | Competitor Intelligence dashboard view | M | High | High | Low | Med | Med | N |

## EPIC G — Benchmarks (Stage 4–6)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| G1 | Benchmark methodology documentation + versioning system | M | High | Low | Critical | Low | Critical | N |
| G2 | Public benchmark report generator (aggregate, anonymized) | L | High | Med | High | Low | Critical | N |
| G3 | Industry (vertical-specific) report templates | M | Med | Med | Med | Low | High | N |
| G4 | Local/geo benchmark report generator | M | Med | Med | High | Low | High | N |
| G5 | Recurring AI Visibility Index publishing pipeline | L | High | Med | Critical | Low | Critical | N |
| G6 | Governance-board sign-off workflow for methodology changes | S | High | Low | Critical | Low | Critical | N |

## EPIC H — Agency Platform (Stage 3)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| H1 | Multi-client dashboard (RBAC foundation) | L | Critical | Critical | Med | High | Low | N |
| H2 | White-label report branding | M | High | High | Low | Med | Low | N |
| H3 | Partner revenue-share billing tooling | M | Med | Med | Low | Med | Low | N |
| H4 | Bulk client onboarding/import | M | Med | Med | Low | Med | Low | N |
| H5 | Agency partner tier management (co-marketing, revenue share rules) | M | Med | Med | Low | Med | Low | N |

## EPIC I — Enterprise (Stage 5)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| I1 | Full RBAC (account/region/location tiers) | L | Critical | Critical | Low | High | Low | N |
| I2 | Bulk/multi-location ingestion pipeline | M | High | High | Low | Med | Low | N |
| I3 | Audit trail (score/alert/change provenance) | L | High | High | Low | Low | Low | N |
| I4 | SOC 2 Type II compliance program | XL | High | High | Low | Low | Low | N |
| I5 | Enterprise SLA infrastructure (uptime, alert-latency monitoring) | L | Med | Med | Low | Med | Low | N |
| I6 | Enterprise "readiness packet" (security overview, references, methodology docs) | S | High | Med | Low | Low | Low | N |

## EPIC J — API (Stage 5–6)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| J1 | Read API (scores, telemetry, alerts) | L | High | High | High | Med | Med | N |
| J2 | API authentication/rate limiting/multi-tenant hardening | M | High | Med | Low | Low | Low | N |
| J3 | Webhook event system (alerts, changes) | M | Med | Med | Med | Med | Low | N |
| J4 | Partner/platform integration API (POS, franchise mgmt) | L | High | High | Critical | Med | High | N |
| J5 | API usage telemetry + docs/developer portal | M | Med | Low | Med | Low | Low | N |

## EPIC K — Data Licensing (Stage 6)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| K1 | Anonymization/aggregation pipeline for licensable data | L | High | High | High | Low | High | N |
| K2 | Licensing agreement + usage-terms enforcement tooling | M | Med | Med | Med | Low | Med | N |
| K3 | Licensee data-delivery API/export pipeline | M | Med | High | Med | Low | Med | N |

## EPIC L — Automation & Network (Stage 6+)

| # | Task | Complexity | Business Impact | Revenue Impact | Moat Impact | Recurring Rev Impact | Category Leadership Impact | Start Now? |
|---|---|---|---|---|---|---|---|---|
| L1 | Human-approval workflow for automated remediation | L | Critical | Med | Med | Med | Med | N |
| L2 | Rollback infrastructure for any automated site change | L | Critical | Low | Low | Low | Low | N |
| L3 | Incident-transparency reporting pipeline | M | High | Low | Low | Low | Med | N |
| L4 | Two-sided Data Intelligence Network platform | XL | Critical | Critical | Critical | High | Critical | N |
| L5 | Agentic-Actionability Certification scoring module (V4 candidate) | L | Unknown | Unknown | High | Unknown | High | N |

---

## Backlog Usage Rules

- No task from Epics B–L begins before Epic A's Stage 1 exit criteria (`01_FIVE_YEAR_ROADMAP.md`) are met, except where explicitly marked "Start Now: Y" (Epic A only, plus A6's data-capture discipline, which by design starts on day one and never stops).
- Any task touching scoring logic, evidence standards, or automated site changes requires the Decision Filter check in `00_NORTH_STAR.md` before entering "in progress," regardless of which epic it's in.
- Complexity and impact ratings are reviewed at each stage transition, not continuously re-litigated.
