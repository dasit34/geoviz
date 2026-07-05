# GeoViz — Enterprise Roadmap

Status: PERMANENT. Enterprise readiness must be built *before* enterprise sales is pursued (`01_FIVE_YEAR_ROADMAP.md` Stage 4→5 decision) — selling against a roadmap slide here is explicitly rejected by board consensus.

## RBAC

Multi-tier access model: account owner → regional/district manager → individual location. Each tier sees only its scoped data. Required before any multi-location deal beyond a handful of locations closes, because franchise/enterprise buyers will not accept a flat, ungated view across their entire book.

## API

Read API first (scores, telemetry, alert history), webhook events second, partner/platform integration API third (per `02_PRODUCT_ROADMAP.md` sequencing). The API is not a nice-to-have for enterprise — it is the mechanism by which GeoViz becomes embedded in a customer's existing BI/reporting stack, which is the actual switching-cost lever at this tier (`03_DATA_MOAT.md`).

## Audit Trail

Every score, every alert, every change event must be traceable: what triggered it, what data produced it, what methodology version was in effect. This is a direct requirement for enterprise procurement/board-reporting use cases (an enterprise CIO will not accept an unauditable number driving budget decisions) and is a natural extension of the replay-safety principle already required by `CLAUDE.md`.

## SOC 2

Begin the compliance program in Stage 5 as infrastructure, not as a reaction to a blocked deal. Target: SOC 2 Type II completion by Stage 5 exit criteria. Treat this as a cost of doing enterprise business at all, budgeted and staffed (dedicated security/compliance lead) ahead of the first enterprise sales push, not scrambled together mid-deal.

## Security

Standard practice: encryption at rest/in transit, least-privilege access internally, regular penetration testing once handling enterprise data volumes, incident-response plan documented before the first enterprise contract signs (not after the first incident).

## Compliance

As international expansion becomes relevant (Stage 6), extend compliance posture to relevant regimes (e.g., GDPR-class requirements) proactively in the region being entered, not retroactively after a customer or regulator flags a gap.

## SLAs

Enterprise contracts require defined uptime and data-freshness commitments (e.g., monitoring cadence guarantees, alert-latency guarantees). Do not commit to an SLA the current infrastructure cannot actually meet — an SLA breach on a flagship enterprise account is a worse outcome than losing the deal for lacking one in the first place.

## Enterprise Sales Motion

Only stood up once RBAC, API, audit trail, and SOC 2 are shipped or in a demonstrable beta a prospect can actually test (per Stage 5 plan). Enterprise AEs and sales engineers are hired at that point, not before — hiring enterprise sales ahead of enterprise-readiness just produces a team with nothing sellable and a credibility-damaging first pitch cycle.

## Procurement

Expect and prepare for: security questionnaires, data-processing agreements, multi-stakeholder sign-off (IT, legal, marketing/ops), and reference calls with existing multi-location customers. Maintain a standing "enterprise readiness packet" (security overview, SOC 2 report, methodology documentation, reference customer list) so the sales cycle isn't reinvented per deal.

## Pricing

Enterprise contracts: $20K–100K/yr at Stage 5, scaling with location count and API/automation-action usage at Stage 6. Price on value delivered at the account level (visibility across the full location portfolio + competitive intelligence + API embedding), not as a simple per-location multiple of the SMB Monitoring price — enterprise buyers are paying for the console, RBAC, API, and support tier as much as for the underlying score.
