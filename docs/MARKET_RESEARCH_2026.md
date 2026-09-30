# GeoViz — Strategic Market Research (August 2026)

Status: SNAPSHOT, external evidence only, dated 2026-08. Complements — does not
replace — the internal strategic corpus (`docs/strategy/`, `docs/DATA_MOAT_STRATEGY.md`,
`docs/REVENUE_ROADMAP.md`, `docs/MODULE_BUILD_ORDER.md`, `docs/DO_NOT_BUILD_YET.md`).
Those docs answer "what GeoViz has decided to build and when." This doc answers
a question the internal corpus has never asked: **has anyone checked that
reasoning against a real competitor's product, pricing, or positioning?** Before
this pass, every "competitor" reference anywhere in `docs/` was generic/
hypothetical ("a well-funded competitor," `DATA_MOAT_STRATEGY.md` L7) — no named
external AI-visibility player, no market-sizing data, no competitive-landscape
doc existed. This report closes that gap and cross-references specific internal
line items wherever the evidence supports, contradicts, or should re-time them.

Produced from four parallel research passes (competitive landscape, customer
pain points, hypothesis pressure-testing, adjacent markets) — see `## Sources`.
Every load-bearing claim below is tagged **[Verified]** (sourced, cross-checked)
or **[Assumption]** (inference without a direct source) — see `## Verified vs.
Assumed Index` for the full accounting.

## Executive summary — be skeptical first

Three findings should change how GeoViz thinks about its own roadmap:

1. **GeoViz already has a near-identical direct competitor selling into its
   exact vertical.** [AI Find My Business](https://aifindmybusiness.com/)
   sells a $300 one-time audit → $349–$3,000+/mo monitoring/DFY retainer to
   dentists, roofers, HVAC companies, attorneys, solar installers, and vet
   clinics — the same customer list in `CLAUDE.md`'s "Target Customers"
   **[Verified]**. This is not a hypothetical "well-funded competitor" the
   moat strategy gestures at — it is a live, named, vertically-identical
   business already operating GeoViz's planned audit→monitoring→fix arc.
2. **The "AI visibility" feature is being absorbed into categories GeoViz
   doesn't compete in yet, from platforms with existing SMB distribution.**
   BirdEye (reputation management, $299+/mo) shipped "Search AI" as a GEO
   feature in September 2025; Yext markets a "reputation agent" doing the
   same thing. Both already sell to the same local-business buyer at
   $300–600/mo **[Verified]**. GeoViz's technical infrastructure gives no
   edge here — these platforms have more distribution and more review-data
   integrations than GeoViz could build from scratch.
3. **Two of the five hypotheses this research was asked to pressure-test are
   already well-served by the market, not whitespace.** Industry/local AI-
   visibility benchmarks already exist in a strong, free form covering
   GeoViz's exact target verticals (SOCi's Local Visibility Index, Scope's
   industry benchmark report). A causal change→signal→outcome experimentation
   product already exists (Siftly.ai). Building either as a primary bet would
   be entering a contested field, not an empty one.

None of this means GeoViz's core thesis is wrong. It means the "we'll figure
out differentiation later" posture implicit in staging Monitoring/Competitor
Intelligence/Benchmark Engine years out (`MODULE_BUILD_ORDER.md`) needs a
sharper answer now for *why GeoViz specifically wins* those categories, because
competitors already occupy the generic version of each. The sharpest
differentiated opening found in this research — a **local-SMB ROI/lead-
attribution layer** (visibility tied to actual phone calls and bookings, not
just citation counts) — is not on the internal roadmap at all today. See
`## Top 3 opportunities`.

---

## 1. Market map

The AI-visibility/GEO/AEO market as of August 2026 sits in three structurally
distinct tiers. GeoViz's current $97 audit + $497 Foundation Fix bundle does
not map cleanly onto any of them — see the structural gap called out at the
end of this section.

| Tier | Who | Buyer | Shape | Examples |
|---|---|---|---|---|
| **1 — Dedicated GEO/AI-visibility monitoring SaaS** | Venture-funded specialists | Marketing teams at funded/mid-market brands | Subscription dashboards, $20–800+/mo self-serve, custom enterprise | Profound, Peec AI, Otterly.AI, AthenaHQ, Scrunch AI, Rankscale, Evertune |
| **2 — Incumbent SEO/martech platforms bolting on AI-visibility modules** | Established SEO suites | Existing SEO-suite customers | AI-visibility as an add-on/module inside a suite already being paid for | Semrush AI Toolkit, Ahrefs Brand Radar, BrightEdge, Conductor, Surfer SEO, Writesonic |
| **3 — Local-business-facing audit/lead-gen tools & agencies** | Lead-gen tools, boutique agencies, verticalized competitors | SMBs directly, or agencies serving SMBs | Free/cheap one-time audits funneling into retainers or monitoring upsells | HubSpot AI Search Grader (free), Insites (free, agency white-label), BizWhiz ($249 + $99/mo), AI Find My Business ($300 + $349–3K/mo), assorted white-label resellers (Ayzeo, White Label IQ, Searchify, VisibAI, Am I Cited) |

**Adjacent tiers actively encroaching, not yet counted above:**
- **Reputation-management platforms** (Podium $249–599/mo, BirdEye $299+/mo,
  Yext $199–1,500/location/yr) are shipping AI-visibility as a bolted-on
  feature inside suites SMBs already buy for review management — this is the
  single most important competitive-encroachment signal in this research
  **[Verified]**.
- **Local-SEO citation tools** (Moz Local, BrightLocal, Whitespark, $16–100/mo)
  are the traditional-SEO analog to GeoViz's entity-consistency check and are
  fully commoditized; their own marketing now concedes NAP-consistency alone
  doesn't explain AI Overview inclusion **[Verified]**.

**Structural gap GeoViz currently occupies alone:** across every tier
researched, no competitor combines a *cheap, one-time* diagnostic with a
*cheap, one-time* implementation fee the way GeoViz's $97 audit + $497
Foundation Fix does. The market is bifurcated between subscription-monitoring
SaaS (Tier 1/2) and retainer-priced agency implementation ($1,500–$30,000/mo,
per aggregated GEO-agency pricing guidance) **[Verified]**. This is GeoViz's
real, defensible current positioning — worth stating explicitly in customer-
facing copy, since it is not a hypothetical differentiator, it's an observed
market gap.

## 2. Competitor comparison

Depth on the most significant players. Pricing sourced to third-party review/
aggregator sites where noted — most Tier 1 vendors do not publish primary
pricing pages (flagged **[Assumption/3rd-party]** where that applies).

| Company | Tier | Pricing | Monitoring | Competitor intel | Fix/implementation | Notes |
|---|---|---|---|---|---|---|
| Profound | 1 | $99–399+/mo self-serve; enterprise custom, reportedly $2–5K+/mo **[3rd-party]** | ✅ multi-engine | ✅ prompt-level gap analysis | ❌ diagnostic only | Reportedly ~$1B valuation; pricing page is demo-gated |
| Peec AI | 1 | $89–499/mo, agency tier | ✅ | Visibility/sentiment vs. competitors, not causal | ❌ | Dedicated agency pricing |
| Otterly.AI | 1 | $29–489/mo; entry $29 tier "not enough for a real program" per reviews | ✅ | Thin | ❌ | Cheapest credible entry point |
| AthenaHQ | 1 | $95 first month, then $295/mo | ✅ 8 engines from base tier | ✅ share-of-voice | **✅ "Action Center" — automated content-gap-filling agents** | Closest Tier-1 example of closing diagnosis→action loop |
| Scrunch AI | 1 | $250–300/mo, **free tier now live** | ✅ + persona/ICP segmentation | ✅ | Partial — edge/CDN-level agent-traffic control (AXP) | **Acquired by Sitecore, June 2026** — consolidation signal |
| Rankscale | 1 | €20–780/mo, credit-based | ✅ 17+ engines (broadest found) | ✅ | Audit + recommendations only | |
| Evertune | 1 | $800/mo Pro; enterprise ~$3K+/mo | ✅ 100K+ prompts | — | "Content activation," unverified depth | Fortune-500-oriented |
| Goodie AI | 1 | Was ~$495/mo | — | — | — | **Apparent shutdown** — domain reportedly listed for sale ~March 2026 **[single-source, unverified]** |
| Semrush AI Toolkit | 2 | $99/mo add-on, or bundled $199–549/mo suite | ✅ | ✅ | Audit flags only | Positioned as core suite layer, not afterthought |
| Ahrefs Brand Radar | 2 | $199/mo per platform, $699/mo all 6 + base subscription (~$828/mo real cost) | ✅ 6 platforms | ✅ citation frequency | ❌ | Differentiator: 260M+ real prompts, not synthetic |
| BrightEdge | 2 | Unpublished, signals $2–10K+/mo | ✅ daily, by industry | — | ❌ | Enterprise-only, weeks of onboarding |
| Conductor | 2 | $26.8K–500K+/yr, quote-based | ✅ ("AgentStack") | — | — | Not price-competing below six figures |
| Writesonic | 2 | $199–399+/mo | ✅ | — | **✅ native AI content generation + "Action Center"** | Second clearest diagnosis→action example |
| Surfer SEO | 2 | Bundled into existing plans | ✅ + "Mention Gap Analysis" | ✅ | ❌ | "Fanout Queries" anticipates AI follow-up questions |
| HubSpot AI Search Grader | 3 | **Free** | Single-run | Basic | ❌ | Lead-gen for HubSpot's AEO line; sets a *free* bar for basic checks |
| Insites | 3 | Free instant audit; paid platform pricing undisclosed | — | ✅ basic | ❌ | White-label lead-gen tool *for agencies*, not a direct-to-business product |
| BizWhiz | 3 | $249 one-time report; $99/mo monitoring add-on; $1–2.5K/mo agency programs | ✅ (add-on) | Basic | ❌ (agency tier only) | Closest direct pricing-model analog to GeoViz found |
| **AI Find My Business** | 3 | **$300 one-time audit; $349/mo–$3,000+/mo DFY retainers** | ✅ | Basic | ✅ consultative | **Near-identical vertical + funnel shape to GeoViz** |
| White-label resellers (Ayzeo, White Label IQ, Searchify, VisibAI, Am I Cited) | 3 | Audits €150–500 resold; monitoring €99–299/mo resold | ✅ | Varies | Varies | Already-saturated agency-reseller cottage industry |

**Commoditized / table stakes across nearly every Tier 1–2 player:** basic
"does the AI mention my brand" checks (now free via HubSpot/Insites),
multi-engine tracking, sentiment scoring, basic competitor share-of-voice,
dashboard/CSV export, schema-presence checks **[Verified]**.

**Rare / genuinely differentiated where it exists:** closing diagnosis→action
(AthenaHQ, Writesonic — still only 2 of ~15 researched players); persona/ICP-
segmented visibility (Scrunch); AI-crawler-traffic-to-GA4 analytics (Scrunch);
edge/CDN-level agent-traffic control (Scrunch AXP); real-search-behavior-
derived prompts at scale (Ahrefs' 260M+); deep *causal* "why does my
competitor get cited" explanation — **not clearly demonstrated by any
researched competitor at the mechanistic level** (see hypothesis 1 below)
**[Verified]**.

## 3. Evidence-backed customer pain points

Ranked by strength of evidence found, not by the order the hypotheses were
proposed in.

### Strongest: AI-answer data reliability / non-determinism
**[Verified, multiple independent sources]** — the best-evidenced finding in
this entire research pass, and one with real implications for GeoViz's own
scoring credibility, not just competitors':
- SparkToro/Rand Fishkin: "<1 in 100 chance that ChatGPT... will give you the
  same list of brands in any two responses"; ordering consistency closer to
  "1 in 1,000 runs."
- AirOps (via Arcalea): only **2.3% of citations remained consistent** across
  three identical ChatGPT runs of the same prompt.
- SISTRIX: Google AI Mode replaces **56%** of cited sources weekly; ChatGPT
  replaces **74%**.
- An independent arXiv study ("The Discovery Gap," arxiv.org/abs/2601.00912,
  112 startups / 2,240 queries) found brand-name recognition near-universal
  (99.4% ChatGPT) but unprompted discovery collapsed to 3.3–8.3%, and a
  GEO-optimization score correlated with actual discovery at **r = −0.001**
  — essentially zero — while Reddit presence correlated at **r = +0.40**, the
  strongest predictor found. The author's own writeup: *"All that
  optimization? It didn't move the needle."*

This is directly relevant to GeoViz's Scoring Constitution's "directional,
not guaranteed" framing (`CLAUDE.md`) — it validates that framing (single-run
"AI ranking" claims are, per SparkToro, "full of baloney") but also means any
future Evidence/Experimentation feature needs real multi-run sampling and
matched controls to be credible, not a single audit snapshot.

### Strong: "Can't prove ROI"
**[Verified]** — GoodFirms' 2026 survey of 100+ marketers: **51.4%** cite ROI
measurement as a top challenge; only 14% currently use AI citation tracking
despite 43% naming AI search optimization a core 2026 strategy. Neil Patel
(Search Engine Land): "increased ROI from these AI efforts... doesn't look
that great." AI referral traffic is still roughly 1% of global web traffic
today. This is the pain point with the cleanest quantification and the
clearest product opening — see `Top 3 opportunities` below.

### Strong: "AI recommendations change constantly" / volatility
**[Verified]** — same evidence base as data-reliability above; practitioners
treat this as one lived complaint ("the ground keeps moving") rather than a
separate issue from non-determinism.

### Moderate: "Score without action" (execution wall)
**[Verified, moderate confidence]** — reviewer synthesis of Otterly.AI and
Scrunch AI G2 reviews: "it identifies the problem well but leaves the
solution to you"; Search Engine Land's Dan Taylor: "an audit shows where your
brand stands, but can't fix the visibility gap." Confidence is moderate
because much of the underlying G2 text was only reachable via third-party
synthesis, not direct quotes.

### Moderate: causality gap ("why does my competitor appear and I don't")
**[Verified as a structural, industry-wide limitation, not a single-tool
complaint]** — Dan Taylor: the "infinite" prompt space plus vendor-proprietary
denominators means results "should be treated as directional signals rather
than hard numbers"; a named GEO consultant flags agencies that "pull a
handful of queries... and call that visibility" while charging for it. Feature-
level competitive gap analysis is common (Profound, AthenaHQ, Scrunch, Peec)
but true causal/mechanistic explanation is not (see hypothesis 1).

### Weak/thin: fix→outcome causal attribution
**[Assumption, thinly evidenced]** — logically downstream of the reliability
and ROI gaps above, but no practitioner was found naming this as its own
standalone frustration distinct from those two.

### Additional findings not on the original hypothesis list
- **Agency multi-account gaps**: Profound (otherwise 4.5–4.6★ on G2) has "no
  multi-account support," a named limit for agencies managing several client
  brands.
- **Entry-tier pricing traps**: Otterly's $29/mo tier (15 prompts) is "not
  enough to run a real monitoring program," forcing a 6x jump to $189/mo —
  called the most common Otterly complaint.
- **Market-immaturity meta-finding**: a large share of content that looks
  like "GEO tool review roundups" is itself programmatic marketing content
  from adjacent vendors, not primary user testimony. This is itself a
  differentiation opening consistent with GeoViz's existing "intelligence-
  grade, evidence-driven" positioning (`CLAUDE.md`) — verifiable, sourced
  reporting is scarce in this category.

### Pricing / willingness-to-pay signal
**[Verified, indirect]** — mid-market AEO/GEO retainers commonly run
$2,000–$10,000/mo; SMB-focused AI-SEO engagements $1,000–$5,000/mo ongoing;
one-time audits/schema work $1,500–$50,000; one source explicitly warns that
AI-SEO priced under ~$1,000/mo "should read as a warning" for thin/automated
work. GeoViz's $97/$497 price points sit well below these anchors —
consistent with the "low-friction entry point" framing already in `CLAUDE.md`,
and better read as a deliberate wedge than an underpricing risk at current
scale.

## 4. Top 10 potential gaps

Each gap answers: who has the problem, how painful, what they do today, is it
already paid for, how crowded, can GeoViz realistically build it, does
existing infrastructure help, recurring-revenue potential, and moat/copy
difficulty.

**1. Local-SMB AI-visibility-to-ROI attribution layer** (tie AI-driven
visibility to actual phone calls/bookings, not just citation counts) — Who:
every local-service business owner, the exact GeoViz buyer. Pain: the
best-quantified pain point found (GoodFirms 51.4%). Status quo: nobody
researched does call-tracking/CRM-outcome attribution for phone-call/booking
businesses specifically — AthenaHQ's outcome-tracking integrates GA4/Shopify/
Webflow, which fits e-commerce, not a plumber. Already paid for: not directly
— GA4 attribution tools exist generically, not GEO-specific for local
service businesses. Crowding: low for this specific buyer/outcome pairing.
Buildable: yes, but requires new integration surface (call tracking/CRM) not
in GeoViz's current stack. Infra advantage: moderate — builds on existing
audit relationship, not on crawler/schema tech directly. Recurring revenue:
yes, natural Monitoring upsell. Moat: compounds with GeoViz's own audit +
outcome data over time (ties to `DATA_MOAT_STRATEGY.md`'s thesis).

**2. Local-vertical, semi-automated fix/implementation layer priced for
SMBs** — Who: Foundation Fix buyers wanting more than a one-time manual fix.
Pain: real but secondary to reliability/ROI. Status quo: DIY end
(free WordPress llms.txt plugins) is commoditizing fast; enterprise end
(WordLift $950+/mo, Scrunch AXP) is priced far above local SMBs. Already
paid for: yes, at both extremes, thin in the middle. Crowding: lower than
monitoring or competitive intel. Buildable: yes — directly extends the
existing Foundation Fix and `AI Visibility Layer Direction` roadmap section.
Infra advantage: high — reuses `validateSchema`, entity-consistency, and
crawlability analyzers already shipped. Recurring revenue: moderate (layer
maintenance subscription). Moat: moderate — service-quality/trust moat more
than data moat.

**3. Rigor/transparency-first evidence layer** (multi-run sampling, matched
controls, explicit confidence labeling — as differentiation, not novelty) —
Who: any buyer who has been burned by a single-run "AI ranking" claim. Pain:
emerging but real, directly validated by the SparkToro/arXiv findings above
that most vendors' point-in-time scores don't correlate with real discovery
outcomes. Status quo: almost nobody in the researched set positions on
rigor — most vendors imply more precision than the data supports. Already
paid for: not explicitly as a "rigor" pitch, though Ahrefs' 260M-prompt real-
data claim is adjacent. Crowding: low as a positioning angle, even though the
underlying capability (sampling) is not new. Buildable: yes — extends
`ai-answer-sampling` (already scaffolded, Layer 0, `MODULE_DEPENDENCY_GRAPH.md`).
Infra advantage: high, ties directly into the existing Data Moat thesis.
Recurring revenue: moderate. Moat: high — compounds with sampling history,
which per `DATA_MOAT_STRATEGY.md` "cannot be backfilled."

**4. Franchise/multi-location AI-readiness compliance audits** — Who:
franchisor HQs and multi-location brand operators, not individual SMBs. Pain:
unvalidated (no direct evidence found of demand), but structurally
attractive — a small number of high-value buyers instead of a large SMB
funnel. Status quo: franchise-compliance tools (Wooqer, Delightree, SOCi,
BirdEye listings) do brand/NAP consistency across locations; none frame it as
"AI-readiness" per location yet. Already paid for: yes, for the adjacent NAP/
brand-consistency problem — not yet for the AI-specific angle. Crowding: low.
Buildable: yes, near-unchanged reuse of the existing crawler + schema
validator + entity-consistency checker, run N times per network. Infra
advantage: high. Recurring revenue: yes, contract-based. Moat: moderate —
requires real relationship/distribution to franchise HQs, not just data.

**5. Credible causal experimentation product (change → signal → outcome)** —
Who: businesses that have already had a Foundation Fix and want proof it
worked. Pain: real but contested even among sophisticated actors — Ahrefs'
1,885-page matched-control study found *no* meaningful citation lift from
schema; a competing Naridon study found a 68% lift from the same intervention.
Status quo: **Siftly.ai already ships this** (test/control clustering,
2–4 week tracking). Already paid for: yes, Siftly and its category. Crowding:
low-moderate — the category exists but is early and the underlying causal
claims are still disputed, which raises rather than lowers the bar. Buildable:
yes, but requires real statistical rigor (sample size, matched controls) to
avoid the same credibility trap the market itself has already exposed in
Ahrefs vs. Naridon. Infra advantage: moderate. Recurring revenue: moderate.
Moat: high if done credibly — ties directly to `DATA_MOAT_STRATEGY.md`'s
"scoring-freeze discipline is behavioral, not technical" argument.

**6. AI-visibility monitoring subscription (generic)** — Who: any Foundation
Fix customer wanting an ongoing view. Pain: real, but this is the single most
crowded gap researched. Status quo: paid at every tier from $20/mo (Rankscale)
to enterprise; **AI Find My Business already sells this to GeoViz's exact
vertical**; Semrush/Ahrefs bundle a version into suites customers already
own; Scrunch offers a free tier. Already paid for: extensively. Crowding:
high. Buildable: yes, trivially (already scaffolded as `monitoring`,
`MODULE_BUILD_ORDER.md` #2). Infra advantage: moderate. Recurring revenue:
yes — but likely price-compressed by the free/bundled competition above
unless meaningfully differentiated (see Top 3). Moat: low unless bundled with
#1 or #3 above.

**7. Local/vertical AI-visibility benchmark index (standalone, monetized)**
— Who: businesses wanting to know how they compare to category peers. Pain:
real curiosity/status pain, low urgency. Status quo: **already solved and
free** — SOCi's Local Visibility Index (350,000 locations, 2,751 brands) and
Scope's industry benchmark report (20 verticals, including GeoViz's exact
target trades — dentists, plumbers, HVAC) are both published as free lead-gen
content. Already paid for: no, given as free marketing. Crowding: high, and
specifically covers GeoViz's exact verticals already. Buildable: yes
eventually, once audit volume is large enough (`MODULE_BUILD_ORDER.md` #9,
gated on cohort density) — but not defensible as a standalone paid product;
useful only as content marketing once volume exists. Recurring revenue: none
directly. Moat: none as a standalone bet; possible long-run PR asset only.

**8. Competitor-explanation feature (causal "why they and not you")** — Who:
same buyer as #6. Pain: real (see Section 3), but the feature-level version
is already common across Tier 1 (Profound, AthenaHQ's ACE model, Scrunch,
Peec). Status quo: correlational/checklist explanations exist broadly; true
mechanistic, prompt-level causal explanation does not, per this research.
Already paid for: yes, the shallow version. Crowding: high for the shallow
version, low for the deep version — but building the deep version is a
research problem, not a straightforward engineering one. Buildable: partial —
plain-English narrative generation on top of GeoViz's existing intelligence
layer is buildable now; true causal depth is not close. Infra advantage:
moderate. Recurring revenue: moderate, likely as a Monitoring/Competitor
Intelligence feature rather than standalone. Moat: low-moderate.

**9. White-label GEO audits for agencies** — Who: marketing agencies serving
local SMBs. Pain: real, agencies want to resell. Status quo: **already
saturated** — Ayzeo, White Label IQ, Insites, Searchify, VisibAI, and Am I
Cited all sell this today at €150–500/audit, €99–299/mo monitoring,
undercutting on price. Already paid for: yes, extensively. Crowding: high.
Buildable: yes (`agency-platform`, `MODULE_BUILD_ORDER.md` #6, Stage 3) but
entering a red ocean, not an overlooked niche. Recurring revenue: yes, if
GeoViz can win distribution against better-funded incumbents — unproven.
Moat: low as a product; the internal roadmap's Stage-3 agency bet is
justified more as a CAC-efficient channel than a differentiated product,
which still holds, but expectations should be reset given how populated this
specific reseller-audit niche already is.

**10. API/data licensing to existing agency-reporting platforms**
(AgencyAnalytics, DashThis) as a backend supplier, not a competing front end
— Who: agency-reporting platforms wanting an AI-visibility data source.
Pain: unproven — speculative. Status quo: these platforms are pure BI shells
today with no AI-visibility engine of their own; no evidence they've sought
one publicly. Already paid for: no. Crowding: n/a (partnership, not product
competition). Buildable: yes, an API wrapper around the existing engine is
low-effort. Infra advantage: high. Recurring revenue: possible, B2B API
licensing. Moat: low — nothing stops a switch to another supplier once one
exists. Explore via conversation only; do not build toward this.

## 5. Opportunity scoring (1–10)

Higher is better for Demand, Monetization, Defensibility. Higher is *worse*
for Competition and Build Difficulty (i.e., 10 = most crowded / hardest to
build) — read the table as risk-adjusted, not a simple sum.

| # | Opportunity | Demand | Competition | Build difficulty | Monetization | Defensibility |
|---|---|---|---|---|---|---|
| 1 | ROI/lead-attribution layer | 8 | 3 | 6 | 8 | 6 |
| 2 | Local-vertical fix/implementation layer | 6 | 4 | 3 | 6 | 5 |
| 3 | Rigor/transparency evidence layer | 6 | 3 | 5 | 5 | 8 |
| 4 | Franchise/multi-location compliance audits | 5 | 3 | 3 | 7 | 5 |
| 5 | Causal experimentation product | 5 | 5 | 7 | 5 | 7 |
| 6 | Generic monitoring subscription | 7 | 9 | 3 | 5 | 3 |
| 7 | Standalone monetized benchmark index | 3 | 9 | 4 | 2 | 2 |
| 8 | Competitor-explanation feature | 6 | 8 | 6 | 4 | 4 |
| 9 | White-label agency audits | 6 | 8 | 4 | 5 | 3 |
| 10 | API/data licensing to reporting platforms | 3 | 2 | 3 | 4 | 2 |

## 6. Top 3 opportunities GeoViz should seriously investigate

**1. Local-SMB AI-visibility-to-ROI attribution layer.** This is the
strongest opportunity found in this research and it is **not currently on the
internal roadmap in this form**. The best-evidenced customer pain point
(GoodFirms: 51.4% cite ROI measurement as their top challenge) has no
well-served answer for phone-call/booking local businesses specifically —
every researched competitor's outcome-tracking (AthenaHQ's GA4/Shopify
integration is the closest example) is built for e-commerce, not a plumber
whose conversion event is a phone call. This is also the cleanest answer to
"why would a customer pay recurring" that doesn't require out-competing
Profound/Scrunch/Semrush on raw monitoring features — it wins on a different
axis (attribution to revenue) that none of them address for this buyer.
Recommend: fold into the `monitoring` PRD (`docs/prd/monitoring.md`) as a
named differentiator before Stage 2 build begins, not as an afterthought
added later.

**2. Rigor/transparency-first evidence layer.** The SparkToro/arXiv findings
that single-run "AI ranking" scores are close to meaningless (r = −0.001
correlation with actual discovery in the arXiv study) is a real risk to the
entire category's credibility, GeoViz included — but flipped around, it is
also GeoViz's cleanest moat argument, because `DATA_MOAT_STRATEGY.md`'s
existing thesis (sampling history "cannot be backfilled," scoring-freeze
discipline is "behavioral, not technical" and competitors under commercial
pressure will compromise it) is *exactly* the credible answer to a market
problem that is now externally documented, not just internally asserted.
Recommend: when `ai-answer-sampling` ships, market it explicitly against the
category's demonstrated reliability problem — this reframes Stage 2–3 gating
from "nice to have" to "the actual differentiator," and should influence how
urgently it's prioritized relative to Monitoring itself.

**3. Local-vertical, semi-automated fix/implementation layer for SMBs.** The
least crowded of the five original hypotheses (Section 4, #2) and the one
most directly buildable on infrastructure GeoViz already has (schema
validation, entity-consistency, crawlability auditing already shipped per
`CLAUDE.md`'s "Intelligence Layer Vocabulary"). The market is bracketed by
free DIY plugins (thin) and $950+/mo enterprise tools (wrong buyer) with a
real gap in the middle for GeoViz's actual customer. Recommend: this is the
natural next increment on the *already-shipping* Foundation Fix, not a new
module — lower risk than the other two.

## 7. What GeoViz should NOT build

- **A feature-parity clone of Tier-1 monitoring dashboards** (Profound/
  Otterly/Peec-style). This lane is crowded, actively consolidating (Scrunch→
  Sitecore acquisition, June 2026), being bundled free/cheap into suites
  customers already own (Semrush, Ahrefs), and directly contested in GeoViz's
  own vertical by AI Find My Business. If Monitoring ships per
  `MODULE_BUILD_ORDER.md` #2, it must ship with the ROI-attribution
  differentiator (Top 3, #1) — not as a bare re-score, which the module's own
  PRD already names as the #1 churn risk (`DO_NOT_BUILD_YET.md`).
- **A standalone monetized benchmark/index product.** SOCi and Scope already
  publish free, credible, vertical-specific AI-visibility benchmarks covering
  GeoViz's exact target trades. `MODULE_BUILD_ORDER.md` #9 gates
  Benchmark Engine on cohort density, which is directionally right, but the
  monetization assumption should be revised: treat it as a free content-
  marketing/PR asset once volume exists, not a `data-licensing`-adjacent
  revenue line, unless GeoViz's dataset becomes provably larger or fresher
  than Scope's/SOCi's.
- **A white-label agency-reseller platform positioned as a product bet.**
  Already saturated by several look-alike startups undercutting on price
  (Ayzeo, White Label IQ, Insites, Searchify, VisibAI, Am I Cited). The
  existing `agency-platform` Stage-3 plan should be understood purely as a
  distribution channel, not a product differentiator — set expectations
  accordingly rather than treating it as a defensible revenue line on its own.
- **An enterprise competitive-intelligence platform** (Klue/Crayon-style).
  Wrong buyer (enterprise CI teams, not local SMBs), wrong sales motion
  (quote-based, $16K–100K+/yr, multi-month cycles) for a founder-led team.
- **KYB/business-verification data APIs.** Wrong data sources (legal/
  financial registries, not websites) and a compliance bar (regulated fintech/
  bank buyers) a two-person team cannot credibly meet.
- **A remediation-overlay-style accessibility (ADA/WCAG) product.** Real
  technical adjacency to the existing render/blank-shell analyzer, but the
  category carries live reputational/legal risk (accessiBe's FTC action over
  overlay-widget claims). If pursued at all, audit-only, never remediation-
  overlay — and only as a later, narrower exploration, not a near-term bet.

## 8. Recommended 90-day product direction

Per `CLAUDE.md`'s explicit MVP scope and `POST_LAUNCH_BACKLOG.md`'s Stage 1
exit gate (60+ paying customers, <10% refund rate, 3+ unprompted referrals),
**customer acquisition on the existing $97/$497 bundle remains priority one**
— nothing in this research changes that; the findings here are about what to
prepare for and how to sequence what comes after Stage 1, not a case for
accelerating build-out now.

Within that constraint, three research-informed adjustments for the next
90 days:

1. **Cheap to do now, high future value: start capturing multi-run/confidence
   data in the audit pipeline wherever it's already low-cost** (e.g., if the
   worker already touches an AI provider, note run-to-run variance) — without
   turning it into a customer-facing feature yet. This is a zero-risk way to
   start the sampling-history clock for the future Evidence Layer (Top 3, #2),
   since `DATA_MOAT_STRATEGY.md` is explicit that "sampling history cannot be
   backfilled" — every week of delay here is a week of moat that can never be
   recovered later.
2. **Update `docs/prd/monitoring.md` and `docs/REVENUE_ROADMAP.md`'s Monitoring
   pricing line now, before Stage 2 build starts**, to name the ROI-
   attribution angle (Top 3, #1) as the differentiator, given a
   near-identical direct competitor (AI Find My Business) already exists.
   This is a documentation update, not a build — cheap now, expensive to
   retrofit later once Monitoring's PRD is treated as settled.
3. **Set an explicit competitive tripwire on reputation-platform encroachment**:
   if BirdEye's Search AI or Yext's reputation-agent AI-visibility features
   move from their current positioning into broad self-serve availability at
   the SMB price tier GeoViz competes at (roughly $100–300/mo), that
   meaningfully compresses the self-serve monitoring window and should
   accelerate — not delay — the Stage 2 Monitoring trigger review in
   `DO_NOT_BUILD_YET.md`. Revisit this specific signal at the next roadmap
   review, not as a new standing monitoring task.

Explicitly do not start engineering work this quarter on: Competitor
Intelligence, Benchmark Engine, Data Licensing, Agency Platform, Enterprise,
or any monitoring-dashboard build — all remain correctly gated by
`DO_NOT_BUILD_YET.md`'s existing triggers, which this research does not
override.

## Sources

Competitive landscape: [Trakkr — Profound](https://trakkr.ai/reviews/profound-review/pricing) ·
[Scalenut — Peec AI](https://www.scalenut.com/blogs/peec-ai-review) ·
[Otterly.AI pricing](https://otterly.ai/pricing) ·
[Indexly — AthenaHQ](https://indexly.ai/blog/athenahq-pricing/) ·
[Radarkit — AthenaHQ](https://radarkit.ai/blog/athenahq-ai-review/) ·
[Scalenut — Scrunch AI](https://www.scalenut.com/blogs/scrunch-ai-review) ·
[Rankscale pricing](https://rankscale.ai/pricing) ·
[Trakkr — Evertune](https://trakkr.ai/reviews/evertune-review/pricing) ·
[dageno.ai — Goodie AI](https://dageno.ai/blog/goodie-ai-review) ·
[Semrush AI Toolkit pricing](https://www.semrush.com/pricing/ai/) ·
[AEO Labs — Ahrefs Brand Radar](https://www.aeolabs.ai/blog/ahrefs-brand-radar-review) ·
[SalesHive — BrightEdge](https://saleshive.com/vendors/brightedge) ·
[checkthat.ai — Conductor](https://checkthat.ai/brands/conductor/pricing) ·
[Demand Gen Report — Conductor AgentStack](https://www.demandgenreport.com/industry-news/news-brief/conductor-introduces-agentstack-to-scale-ai-search-visibility/52636/) ·
[eesel.ai — Writesonic](https://www.eesel.ai/blog/writesonic-pricing) ·
[Surfer SEO AI Tracker](https://www.surferseo.com/ai-tracker) ·
[HubSpot AI Search Grader](https://www.hubspot.com/ai-search-grader) ·
[Insites — free audit](https://insites.com/resources/free-ai-visibility-audit/) ·
[BizWhiz pricing](https://bizwhiz.ai/learn/ai-visibility-audit-cost/) ·
[DemandLocal — GEO services pricing](https://www.demandlocal.com/blog/how-to-price-geo-services/) ·
[AI Find My Business](https://aifindmybusiness.com/)

Hypothesis pressure-test: [Rankability — Profound review](https://www.rankability.com/blog/profound-ai-review/) ·
[DataDab GEO tool comparison](https://www.datadab.com/research/profound-vs-hubspot-aeo-vs-scrunch-vs-otterly-vs-peec-vs-athenahq) ·
[AthenaHQ ACE announcement](https://athenahq.ai/blog/announcing-athena-citation-engine-ace) ·
[amicited.com — AI visibility tools pricing 2026](https://www.amicited.com/blog/ai-visibility-tools-pricing-2026/) ·
[Rivo — AI visibility tracking tools](https://www.rivo.io/blog/ai-visibility-tracking-tools) ·
[menra.ai — Semrush AI Toolkit vs Ahrefs Brand Radar](https://www.menra.ai/vs/semrush-ai-toolkit-vs-ahrefs-brand-radar) ·
[WordPress.org — llms.txt plugin](https://wordpress.org/plugins/aiready-llms-txt-generator/) ·
[Siftly.ai — AI Visibility Experiments](https://siftly.ai/features/experimentation) ·
[Search Engine Journal — Ahrefs schema study](https://www.searchenginejournal.com/schema-markup-didnt-move-ai-citations-in-ahrefs-test/574568/) ·
[Naridon — structured data study](https://naridon.com/en/blog/does-structured-data-improve-ai-citations) ·
[Search Engine Land — AI local visibility report 2026 (SOCi)](https://searchengineland.com/ai-local-visibility-report-2026-468085) ·
[Scope — AI visibility benchmarks by industry 2026](https://scope.online/learn/ai-visibility-benchmarks-by-industry-2026)

Customer pain points: SparkToro/Rand Fishkin research (via Arcalea synthesis) ·
[arXiv — "The Discovery Gap"](https://arxiv.org/abs/2601.00912) ·
Search Engine Land, Dan Taylor, GEO measurement columns · seo-stack.io,
Daniel Foley Carter · GoodFirms 2026 marketer survey (100+ respondents) ·
contentmonk.io Otterly.AI review synthesis · G2 (Scrunch AI, Profound listings).

Adjacent markets: [BusinessNewsDaily — Podium](https://www.businessnewsdaily.com/16139-podium.html) ·
[PRNewswire — BirdEye Search AI launch](https://www.prnewswire.com/news-releases/birdeye-launches-search-ai-to-put-multi-location-brands-at-the-top-of-ai-answers-302544631.html) ·
[BirdEye Search AI](https://birdeye.com/search-ai/) ·
[TrustRadius — Yext pricing](https://www.trustradius.com/products/yext-search-experience-cloud/pricing) ·
[Tekpon — Moz Local vs BrightLocal](https://tekpon.com/compare/moz-local-vs-brightlocal/) ·
[Vendr — SimilarWeb](https://www.vendr.com/marketplace/similarweb) ·
[userintuition.ai — CI platform pricing](https://www.userintuition.ai/posts/competitive-intelligence-pricing/) ·
[checkthat.ai — AgencyAnalytics pricing](https://checkthat.ai/brands/agencyanalytics/pricing) ·
[twominutereports.com — DashThis pricing](https://twominutereports.com/blog/dashthis-pricing) ·
[Ayzeo — white-label AI visibility](https://ayzeo.com/blog/white-label-ai-visibility-platform-for-agencies) ·
[White Label IQ](https://www.whitelabeliq.com/white-label-website-audit-services/ai-visibility-audit/) ·
[Miratag — franchise compliance software](https://miratag.com/en/blog/franchise-compliance-software-brand-consistency) ·
[Cobalt Intelligence — KYB API market](https://blog.cobaltintelligence.com/post/best-business-verification-apis-2026) ·
[RatedWithAI — UserWay pricing](https://ratedwithai.com/blog/userway-pricing-review-2026) ·
[checkthat.ai — accessiBe pricing](https://checkthat.ai/brands/accessibe/pricing).

Internal cross-references: `docs/DATA_MOAT_STRATEGY.md`, `docs/REVENUE_ROADMAP.md`,
`docs/MODULE_BUILD_ORDER.md`, `docs/DO_NOT_BUILD_YET.md`, `docs/strategy/00_NORTH_STAR.md`,
`docs/prd/monitoring.md`.

## Verified vs. assumed index

**Verified (sourced, load-bearing):** the AI Find My Business direct-
competitor finding; BirdEye/Yext AI-visibility feature launches; the
structural "no competitor combines cheap one-time diagnostic + cheap one-time
fix" gap; the SparkToro/AirOps/SISTRIX/arXiv non-determinism findings; the
GoodFirms ROI-challenge statistic; SOCi's and Scope's existing free benchmark
publications; Siftly.ai's existing causal-experimentation feature; the
white-label reseller saturation (Ayzeo et al.); Scrunch AI's acquisition by
Sitecore.

**Assumption / inference (flagged inline, not independently confirmed):**
Goodie AI's shutdown (single secondary source); AI Search Optimization
Agency's $99/$290 pricing tiers (WebFetch-blocked, search-summary only);
most Tier-1 enterprise pricing above the self-serve tier (Profound, BrightEdge,
Conductor, Evertune all gate real pricing behind sales calls — figures above
are third-party estimates); the causal strength of the Scope benchmark's
"schema correlates with 18 points higher score" claim, which itself conflicts
with Ahrefs' matched-control finding of no meaningful schema lift — both are
cited above, and the contradiction between them is itself evidence that
causal claims in this space remain unsettled, not a resolved fact either way.
