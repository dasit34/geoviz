# GeoViz — Five-Year Roadmap

Status: PERMANENT. This is the execution spine. Every quarterly plan derives from whichever stage the company is currently in. Do not skip a stage's exit criteria to chase the next stage's products.

Stage boundaries: Launch → $250K → $1M → $5M → $10M → $25M → $100M ARR.

---

## STAGE 1 — Launch → $250K ARR

**Products:** AI Visibility Audit ($97), Foundation Fix ($497+, quoted manually).
**Pricing:** One-time only. No subscription — there is nothing yet to retain.
**Hiring:** Founder + 1 fulfillment/ops contractor. First part-time engineer only if fulfillment throughput becomes the bottleneck.
**Engineering:** Harden the audit worker pipeline, admin queue, Stripe checkout, report QA loop. No dashboards, no customer logins beyond admin.
**Marketing:** Founder-led content and outreach in one committed vertical. No paid spend until the ICP is proven.
**Sales:** Founder sells every deal personally — this is how the ICP and objections get learned firsthand.
**Customer Success:** Founder or ops contractor handles delivery and any post-sale questions directly.
**Data:** Begin capturing full raw audit inputs (HTML, schema, robots.txt/sitemap, LLM validator responses verbatim) for every order, even with no immediate use — this habit is the seed of the entire future data moat.
**Moat:** None yet by design. The only "moat" activity at this stage is disciplined data capture.
**KPIs:** Orders/week, refund rate, report QA pass rate, time-to-delivery, referral rate.
**Exit Criteria:** 60+ paying customers across 2–3 verticals, refund rate <10%, at least 3 unprompted referrals, founder can state the ICP without hedging, fulfillment no longer requires founder's full-time attention.
**Largest Risks:** Founder burnout from full-stack fulfillment; false-positive validation from a small, friendly early cohort.
**Cash Requirements:** Bootstrap or pre-seed ($50–150K). Outside capital not required to clear this stage.
**Founder Priorities:** Sell. Deliver. Listen. Do not delegate fulfillment until you have personally felt every failure mode.
**Three decisions that matter most:**
1. Commit to one vertical instead of staying generic.
2. Templatize Foundation Fix scoping early to protect founder time.
3. Refuse to build monitoring/dashboard/subscription infrastructure before repeat-purchase demand is proven.

**STOP:** nothing yet — this is day one.
**START:** vertical-specific outreach; raw-signal data capture on every order.
**NEVER BUILD:** dashboards, login systems, subscription billing, white-label features, automation pipelines (all explicitly out of MVP scope per `CLAUDE.md`).

---

## STAGE 2 — $250K → $1M ARR

**Products:** Audit + Fix (unchanged), Monitoring v1 (re-score + evidence-backed change alert), first agency-facing multi-client view (minimum viable, not a full platform).
**Pricing:** Audit $97–147, Fix $497–1,500, Monitoring $29–79/mo.
**Hiring:** First full-time engineer (kills the fulfillment bottleneck), first Customer Success hire, part-time growth marketer. Team size ~6–10.
**Engineering:** Semi-automate Fix delivery (templated schema/llms.txt generation reduces manual QA to spot-checks). Formalize scoring versioning. Stand up the `AuditIntelligence` telemetry pipeline for real, not just as a schema.
**Marketing:** SEO content that educates the "AI visibility" category; case studies from Stage 1 customers; begin building category vocabulary ahead of competitors naming it.
**Sales:** Founder + 1 inside sales hire, templated pitch/demo, still high-touch.
**Customer Success:** First dedicated hire — owns Monitoring onboarding and churn-risk conversations.
**Data:** First repeat-customer cohort — the first data that can start to validate (or invalidate) score-to-outcome correlation.
**Moat:** Longitudinal tracking begins on every Monitoring customer. Scoring-freeze discipline formalized in writing and versioned.
**KPIs:** MRR from Monitoring, Audit→Fix attach rate, Fix→Monitoring attach rate, CAC by channel, % revenue from agency-sourced customers.
**Exit Criteria:** $1M ARR run-rate, Monitoring net revenue retention >90%, 3+ agency partners generating >10% of revenue combined, fulfillment no longer founder-bottlenecked.
**Largest Risks:** Monitoring churns if it's perceived as "just a re-score" with no new evidence; manual fulfillment still caps throughput if automation lags hiring.
**Cash Requirements:** Optional seed ($500K–1.5M) if paid acquisition needs priming; otherwise reinvest revenue.
**Founder Priorities:** Hire and trust the first engineer to own fulfillment automation. Personally run the first 5 agency relationships to learn the channel before handing it off.
**Three decisions that matter most:**
1. Monitoring ships with real evidence (actual AI answer snapshots) or it does not ship — a bare re-score is rejected.
2. Automate the highest-QA-cost, lowest-judgment parts of Fix delivery first (schema/llms.txt generation).
3. Commit to the agency channel as the primary growth engine over direct-SMB paid acquisition.

**STOP:** founder personally running every audit end-to-end.
**START:** agency channel development; formal scoring version control; real telemetry capture at the `AuditIntelligence` layer.
**NEVER BUILD:** enterprise sales motion, white-label infrastructure, automated website changes.

---

## STAGE 3 — $1M → $5M ARR

**Products:** Agency Platform (white-label, multi-client dashboard), Competitor comparison view (audit-time snapshot, not yet live monitoring).
**Pricing:** Agency plans $500–3K/mo per book of business; Monitoring $79–199/mo/location; Fix increasingly bundled into annual Monitoring plans.
**Hiring:** VP Engineering, first data scientist (calibration model validation), 2–3 more CS hires, first dedicated marketer, first AE for agency deals. Team size ~20–30.
**Engineering:** Begin the live-AI-answer sampling panel — small scale, proving cost-efficiency before scaling. Bulk/multi-location onboarding. Role-based access (regional manager views) for the agency platform.
**Marketing:** Own the "AI Visibility" category publicly — published methodology, first benchmark-style content, PR around category naming.
**Sales:** Stand up a real agency-focused sales motion (this is the VP Sales trigger point). No enterprise sales team yet — deliberately.
**Customer Success:** Formal agency partner program (tiered, co-marketing, revenue share) with a dedicated partner success function.
**Data:** Cross the 1,000-customer threshold — cohort benchmark data becomes statistically meaningful for the first time.
**Moat:** Sampling panel infrastructure begins; this is the single highest-leverage, longest-lead-time investment in the company and must start now, not when "needed."
**KPIs:** Net revenue retention, agency book penetration rate, sampling panel cost-per-query, category share-of-voice.
**Exit Criteria:** $5M ARR, sampling panel live for a meaningful customer subset, NRR >100%, no single agency partner >25% of revenue.
**Largest Risks:** Better-capitalized competitors (BrightLocal/Whitespark/Semrush-class) out-market before the sampling-panel differentiation lands; agency channel concentration risk.
**Cash Requirements:** Series A ($4–8M), funding the sampling panel build and agency sales team primarily.
**Founder Priorities:** Shift from doing sales to building the sales system. Personally own category narrative and PR.
**Three decisions that matter most:**
1. Reject premature enterprise push — the product is not enterprise-ready and pretending otherwise wastes the stage.
2. Fund the sampling panel now, years before its full payoff.
3. Formalize the agency channel as a real partner program, not an ad hoc customer segment.

**STOP:** treating every segment (agency, franchise, direct SMB) identically.
**START:** the sampling panel build (small scale); public category-defining content.
**NEVER BUILD:** a full enterprise sales org before API/SLA/audit-trail readiness exists.

---

## STAGE 4 — $5M → $10M ARR

**Products:** AI Visibility Layer (installable snippet/CMS plugin), Alerts (event-driven monitoring).
**Pricing:** Layer/plugin bundled into Monitoring tiers; Alerts as a premium add-on ($20–50/mo incremental).
**Hiring:** Head of Partnerships (CMS platforms), ML engineers for the sampling panel, quiet start on an enterprise-readiness team (API, SLA, security). Team size ~40–60.
**Engineering:** WordPress plugin first (largest SMB install base). Change-detection engine — deterministic/diff-based, never LLM-judged (per architecture rule: cost and auditability at monitoring scale demand this). Citation-source attribution v1.
**Marketing:** Publish the first real benchmark report using panel data — the PR moment that separates GeoViz from "another SEO tool."
**Sales:** Add a small franchise/multi-location motion; agency sales team scales.
**Customer Success:** Alerts-driven engagement playbook — proactive outreach when an alert fires, not just reactive support.
**Data:** Installed plugin base begins generating first-party usage telemetry no scraped competitor can replicate.
**Moat:** Plugin distribution + telemetry becomes a distribution and retention asset simultaneously.
**KPIs:** Plugin install count, Alert engagement rate, NRR, benchmark report citations/backlinks.
**Exit Criteria:** $10M ARR, plugin installed base in the thousands, first published benchmark report achieving external citations, franchise pilot converted into a repeatable playbook.
**Largest Risks:** Plugin/CMS support burden if not engineered for low-touch scale; Yext-class competitors (who already own multi-location entity data) target the franchise segment directly.
**Cash Requirements:** Series A extension or early Series B ($10–15M).
**Founder Priorities:** Own the benchmark-report narrative personally. Personally recruit the Head of Partnerships — this hire determines plugin distribution success.
**Three decisions that matter most:**
1. Build enterprise-readiness infrastructure before enterprise sales exists, so Stage 5 isn't a cold start.
2. Commit to WordPress-first plugin strategy rather than spreading thin across CMS platforms.
3. Publish the first benchmark report even with an imperfect dataset — first-mover category ownership outweighs the risk.

**STOP:** hand-crafted, bespoke Foundation Fix delivery as the default for the median customer.
**START:** publishing benchmark data externally; enterprise-readiness engineering ahead of enterprise sales.
**NEVER BUILD:** automated remediation that deploys without customer approval.

---

## STAGE 5 — $10M → $25M ARR

**Products:** Competitor Intelligence (live competitive tracking), Enterprise Platform beta (API, SLA, RBAC).
**Pricing:** Enterprise contracts $20K–100K/yr; Competitor Intelligence as a premium Monitoring add-on.
**Hiring:** CRO (if not already seated), enterprise AEs + sales engineers, security/compliance lead, VP Data/ML. Team size ~80–120.
**Engineering:** Full multi-location enterprise console, RBAC at scale, Competitor Intelligence GA, SOC 2 program begins, API rate-limiting and multi-tenant hardening.
**Marketing:** Analyst-relations push — get GeoViz cited as the category reference by industry analysts and press covering AI search.
**Sales:** Stand up real enterprise sales now that CIO-stated blockers (API, SLA, audit trail, RBAC) are actually shipped, not promised.
**Customer Success:** Enterprise onboarding motion distinct from SMB/agency — implementation, integration support, dedicated CSM per major account.
**Data:** Cross the 10,000-customer threshold — benchmark data becomes defensible at the industry-category level.
**Moat:** Multi-year enterprise contracts anchored on API integration depth (higher switching cost by design).
**KPIs:** Enterprise ACV, enterprise logo count, API call volume, analyst mentions, SOC 2 completion.
**Exit Criteria:** $25M ARR, 5+ enterprise logos signed and renewed at least once, SOC 2 Type II achieved, Competitor Intelligence proven to retain customers independent of raw score movement.
**Largest Risks:** Enterprise sales cycle length drains cash faster than modeled; a platform-native competing feature (Google/OpenAI) ships during this window.
**Cash Requirements:** Series B ($20–35M).
**Founder Priorities:** Shift further from GTM into competitive/platform-risk monitoring. Personally sponsor the first 3 enterprise logos.
**Three decisions that matter most:**
1. Time the enterprise investment to actual readiness, not competitive pressure to "look enterprise."
2. Fund SOC 2/compliance as infrastructure, before it blocks a deal.
3. Price Competitor Intelligence as a Monitoring add-on, not a separate product line, to protect the core retention story.

**STOP:** selling enterprise on roadmap slides — every pitch references a shipped capability.
**START:** formal security/compliance program; real analyst relations function.
**NEVER BUILD:** a general-purpose website builder or CMS replacement, regardless of enterprise pressure to "just manage the whole site."

---

## STAGE 6 — $25M → $100M ARR

**Products:** AI Visibility Benchmarking as a licensed product, Data Intelligence Network (early two-sided version), human-approved Automated Remediation (V3, narrow scope, hard rollback gate), API as a first-class product, full "AI Visibility Operating System" positioning by the top of this stage.
**Pricing:** Benchmark/data licensing deals ($50K–500K/yr per licensee); enterprise tiers expand with usage-based automation actions; platform-tiered SaaS across all segments.
**Hiring:** Dedicated data-licensing/BD team, ML team scaling the calibration model on the full dataset, Trust & Safety/Chief Trust Officer function, GMs per product line (Enterprise, Agency, Data/Licensing), international expansion lead. Team size ~150–500 across the stage.
**Engineering:** Full trust/rollback infrastructure for any automated site change, licensing-grade dataset infrastructure, global multi-region compliance (as international expansion happens), continued sampling-panel cost efficiency at massive scale.
**Marketing:** GeoViz benchmark becomes the industry-cited reference; marketing shifts from category creation to category defense and adjacent expansion.
**Sales:** Fully segmented GTM — SMB self-serve, mid-market/agency, enterprise, licensing/BD — each with dedicated leadership.
**Customer Success:** Category-leader retention model — switching cost is the multi-year dataset history and embedded workflows, not feature lock-in.
**Data:** Cross the 100,000-business and eventually 1M-business thresholds — the dataset becomes close to irreproducible by a new entrant regardless of funding.
**Moat:** Two-sided Data Intelligence Network; deep platform embeds (CMS, franchise systems, POS); benchmark licensing revenue.
**KPIs:** ARR, NRR >120%, dataset size/freshness vs. any named competitor, automated-remediation incident rate (target: near zero), category share of analyst/press citations.
**Exit Criteria (top of defined roadmap):** $100M ARR, automated remediation live with a clean incident record, at least one signed data-licensing deal with a recognizable brand, dataset defensibly larger than any named competitor's, path to default-alive established.
**Largest Risks:** A single automated-remediation incident could be catastrophic to trust; platform absorption risk (Google/OpenAI native tooling) is at its peak; feature-parity competition from well-funded entrants compresses margins; complacency in category defense.
**Cash Requirements:** Series C/D if pursued ($40–75M+), raised only if it buys dataset lead time — not to inflate headcount. By $100M ARR the company should be default-alive; further capital is optional.
**Founder Priorities:** Protect the mission and scoring integrity as final arbiter. Ensure growth-at-any-cost pressure never compromises the trust the entire dataset moat depends on. Decide personal role — operator vs. strategic/board-level — honestly.
**Three decisions that matter most:**
1. How conservatively to gate automated remediation (start with only the lowest-risk fix categories, publish an incident-transparency policy).
2. Whether to expand into adjacent categories (e.g., agentic-commerce readiness) or stay disciplined on AI visibility.
3. How aggressively to pursue platform partnerships vs. risking commoditization by the platforms being measured.

**STOP:** treating any single product line as "the business" — GeoViz is now a data company with multiple GTM motions.
**START:** deep platform embedding as the primary defense against platform-native competition.
**NEVER BUILD:** anything — at any revenue size, at any competitive pressure — that trades scoring integrity or automated-action safety for growth. This is the line the whole company is built to hold.
