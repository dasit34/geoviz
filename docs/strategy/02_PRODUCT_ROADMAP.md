# GeoViz — Product Roadmap

Status: PERMANENT (feature-level detail evolves; grouping and sequencing do not without a strategy review). Priority: P0 = blocks the current stage's exit criteria, P1 = next stage enabler, P2 = valuable but deferrable, P3 = future/optional.

Complexity: XS / S / M / L / XL. Moat Impact and Revenue Impact: Low / Med / High / Critical.

---

## 1. Launch (Audit + Fix core)

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| AI Visibility Audit | Low-friction wedge product | "Am I invisible to AI?" answered with evidence | Cheap customer acquisition | Seeds raw data capture | M | Worker pipeline, LLM validators | P0 | Critical | Med |
| Foundation Fix | Monetize diagnostic into action | Fixes what audit finds | ARPU multiplier | Validates willingness-to-pay beyond entry price | L | Audit output, templates | P0 | Critical | Low |
| Report generation (PDF/web) | Deliver evidence-based findings credibly | Professional, trustworthy deliverable | Conversion + perceived value | None directly | M | Score parser, print CSS | P0 | High | Low |
| Admin review queue | Guarantee QA before delivery | Confidence report is accurate | Protects refund rate + trust | Human QA corrections become labeled training data | S | Order DB | P0 | Med | Med |
| Raw signal capture (HTML, schema, robots.txt, LLM verbatim responses) | Seed the future dataset | Invisible to customer | Zero near-term revenue | This is the single highest long-run moat action in this group | S | Worker pipeline | P0 | Low | Critical |

## 2. Foundation Fix (scaling the service)

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| Templated schema/llms.txt generators | Reduce manual QA time per Fix | Faster delivery | Higher margin per Fix | Standardizes signal capture | M | Audit findings taxonomy | P0 (Stage 2) | High | Low |
| Business-archetype templates | Speed up scoping/quoting | Consistent quality | Scales Fix without linear headcount growth | None | M | Vertical taxonomy | P1 | Med | Low |
| Before/after comparison artifact | Proves Fix worked | Tangible evidence of value | Retention/upsell trigger into Monitoring | First outcome-delta data | M | Audit re-run capability | P1 | Med | Med |
| AI-assisted draft generation (human-reviewed) | Speed up copywriting/content parts of Fix | Faster turnaround | Lower cost per Fix | None (LLM output, human-gated) | M | LLM providers | P2 | Med | Low |

## 3. Monitoring

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| Re-score on schedule (weekly/monthly) | Detect drift over time | "Did my fix work / did I regress?" | Recurring revenue anchor | Longitudinal score history | M | Audit pipeline, scheduler | P0 (Stage 2) | Critical | High |
| Evidence snapshots (actual AI answers, not just score) | Make the number trustworthy and concrete | Proof, not abstraction | Directly prevents the #1 churn reason (per customer research) | Raw AI-answer corpus over time | L | Sampling panel v1 | P0 (Stage 2) | Critical | Critical |
| Change-detection engine (deterministic diff) | Flag what changed since last scan | Actionable, not just descriptive | Reduces support load vs. LLM-judged detection | Structured change-event dataset | L | Structured snapshots | P1 (Stage 4) | High | High |
| Competitor Intelligence | Relative, not absolute, positioning | Answers "am I losing to a competitor" | Stronger upsell/retention lever than base score | Category-relative dataset | L | Sampling panel at scale | P1 (Stage 5) | High | High |

## 4. AI Visibility Layer

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| JS snippet (universal) | Lightweight AI-readable context block, any site | Coexists with existing site, zero rebuild | Low-friction install path | First-party telemetry begins at install | M | Snippet CDN/hosting | P0 (Stage 4) | High | High |
| WordPress plugin | Largest SMB CMS install base | One-click install, no code | Primary distribution channel | Installed-base telemetry at scale | L | Snippet core, WP plugin review process | P0 (Stage 4) | High | Critical |
| Shopify app | Reach e-commerce-adjacent local businesses | Native install experience | Secondary distribution channel | Additional install-base telemetry | L | Snippet core, Shopify app review | P2 | Med | Med |
| Webflow / Wix / Squarespace integrations | Broaden CMS coverage | Native install where available | Incremental reach | Incremental telemetry | M each | Snippet core | P2 | Med | Low-Med |
| Custom-site install docs + support | Cover the long tail without a plugin | Works even without a supported CMS | No channel lock-out | Telemetry still flows via snippet | S | Snippet core | P1 | Med | Med |

## 5. Alerts

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| Entity/schema drift alerts | Catch broken NAP/schema before it costs visibility | Prevents silent decay | The "can't cancel, something might break" retention hook | Alert-response dataset | M | Change-detection engine | P0 (Stage 4) | High | Med |
| Competitor-change alerts | Notify when a competitor's visibility shifts | Competitive awareness | Strong upsell trigger | Cross-business event correlation | M | Competitor Intelligence | P1 (Stage 5) | Med | Med |
| Citation/recommendation-change alerts | Notify when AI answers start/stop citing the business | Directly ties to the core promise | Highest-value alert type | Citation-event dataset | L | Sampling panel, citation attribution | P1 (Stage 5) | High | High |

## 6. Competitor Intelligence

(See Monitoring/Alerts groups above for the core features — this group covers the packaging/analysis layer.)

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| Category share-of-citation view | Show % of category answers citing this business vs. named competitors | Concrete competitive positioning | Premium add-on, high perceived value | Category-level benchmark dataset | L | Sampling panel at scale | P1 (Stage 5) | High | High |
| Cross-platform divergence report | Visible on Perplexity, invisible on Google AI Overview, etc. | Diagnostic gold — explains *why* to fix what | Differentiates from single-model competitors | Multi-platform sampling dataset | L | Multi-provider sampling | P2 | Med | High |

## 7. Benchmarks

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| Published industry/category benchmark reports | Establish category authority | Context for "is my score good" | PR + inbound lead engine | Public proof of dataset scale | M | 1,000+ customer cohort | P0 (Stage 4) | High | Critical |
| Local/geo benchmarks | Localize the authority claim | Hyper-relevant comparison | Deepens agency/franchise sales pitch | Geo-segmented dataset | M | Sufficient geo density | P1 (Stage 5) | Med | High |
| AI Visibility Index (recurring published index) | Become the cited reference metric | Ongoing credibility signal | Recurring press/analyst hook | Requires versioned, stable methodology | L | Benchmark governance (see doc 06) | P1 (Stage 5–6) | Med | Critical |

## 8. Agency Platform

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| Multi-client dashboard | One view across an agency's book | Operational efficiency for the agency | Primary CAC-efficient distribution channel | Aggregated agency-book telemetry | L | RBAC foundation | P0 (Stage 3) | Critical | Med |
| White-label reporting | Agency can present under their own brand | Preserves agency's client relationship | Removes the biggest agency-adoption objection | None directly | M | Report rendering module | P0 (Stage 3) | High | Low |
| Partner revenue-share tooling | Formalize the partner program | Predictable partner economics | Scales the channel without linear sales headcount | None directly | M | Billing infra | P1 | Med | Low |

## 9. Enterprise

(Full detail in `08_ENTERPRISE_ROADMAP.md`.)

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| RBAC (regional/franchise-level access) | Support 100s–1,000s of locations under one account | Right data to the right role | Unlocks enterprise ACV | None directly | L | Multi-tenant data model | P0 (Stage 5) | Critical | Low |
| Bulk/multi-location onboarding | Ingest thousands of locations at once | Feasible deployment at scale | Removes the #1 enterprise-buyer blocker | None directly | M | Ingestion pipeline | P0 (Stage 4–5) | High | Low |
| Audit trail / SOC 2 | Meet procurement requirements | Compliance confidence | Unlocks regulated/enterprise buyers | None directly | L | Security infra | P0 (Stage 5) | High | Low |

## 10. API

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| Read API (scores, telemetry, alerts) | Let GeoViz embed in customer BI/workflow tools | Data where the customer already works | Increases switching cost | Usage telemetry on API consumption patterns | L | Stable data model, rate limiting | P0 (Stage 5) | High | High |
| Webhook events (alerts, changes) | Real-time integration | Automation-friendly | Deepens embedding, reduces churn | Event-stream dataset | M | Change-detection engine | P1 | Med | Med |
| Partner/platform integration API | Embed GeoViz data inside adjacent platforms (POS, franchise mgmt) | Native experience inside tools already used | Distribution without direct CAC | Cross-platform usage dataset | L | Partnership agreements | P1 (Stage 6) | High | Critical |

## 11. Data Licensing

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| Aggregated benchmark data licensing (media/analysts) | Monetize the dataset directly | N/A (B2B2B, not end-customer facing) | New, high-margin revenue line | Reinforces category-authority position | M | Sufficient dataset scale (100K+ businesses) | P1 (Stage 6) | High | Critical |
| Anonymized trend data feeds (platforms/researchers) | Position GeoViz as infrastructure, not just a vendor | N/A | Strategic revenue + platform relationships | Deepens the "impossible to recreate" dataset advantage | L | Privacy/anonymization pipeline | P2 (Stage 6) | Med | High |

## 12. AI Visibility Network

| Feature | Purpose | Customer Value | Business Value | Moat Contribution | Complexity | Dependencies | Priority | Revenue Impact | Moat Impact |
|---|---|---|---|---|---|---|---|---|---|
| Two-sided network (businesses supply signal, consumers of benchmark data pay for it) | Terminal-stage moat: dataset compounds instead of depreciating | Indirect (better benchmarks, better recommendations) | Highest long-term revenue ceiling of any product line | This IS the moat, fully realized | XL | Everything above at scale | P2 (Stage 6+) | Critical (long-run) | Critical |
| Agentic-Actionability Certification (V4 candidate) | Score whether an AI agent can complete a real task (book/quote/purchase) on a business's site | Prepares customer for agentic-commerce shift | New scored/sold capability once "visibility" alone is table stakes | New signal category unique to GeoViz's positioning | L | Agentic browsing standards maturing | P3 (post-$100M horizon) | Unknown (forward-looking) | High (forward-looking) |
