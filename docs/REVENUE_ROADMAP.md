# GeoViz — Revenue Roadmap

Standalone $0→$100M reference. Full stage-by-stage business narrative lives in `docs/strategy/01_FIVE_YEAR_ROADMAP.md`; this doc is the compact table the master playbook and investor/board conversations link to instead of re-deriving.

| Milestone | Core products live | Pricing at this stage | What unlocks the next milestone |
|---|---|---|---|
| **$0** (Launch) | AI Visibility Audit, Foundation Fix | Audit $97 one-time, Fix $497+ quoted | 60+ customers, <10% refund rate, referral signal (`strategy/01` Stage 1 exit) |
| **$250K** | + Monitoring v1 (re-score + evidence) | Audit $97–147, Fix $497–1,500, Monitoring $29–79/mo | Monitoring NRR >90%, first engineer hired, fulfillment automated |
| **$1M** | + Agency Platform | Agency plans $500–3K/mo per book | 3+ agency partners >10% combined revenue, no partner >25%, 1,000-customer cohort |
| **$5M** | + Visibility Layer, WordPress Plugin, Change Detection, Alerts, first Benchmark report | Layer/Alerts bundled into Monitoring tiers ($20–50/mo add-on) | Sampling panel live for a meaningful subset, NRR >100% |
| **$10M** | + Competitor Intelligence (beta), Enterprise (beta) | Enterprise $20K–100K/yr; Competitor Intelligence as Monitoring add-on | Plugin install base in the thousands, published benchmark achieving external citations |
| **$25M** | + Enterprise GA, Competitor Intelligence GA | Enterprise contracts scale with location count + API usage | 5+ enterprise logos renewed once, SOC 2 Type II, 10,000-customer cohort |
| **$50M** | + Benchmark licensing (Data Licensing v1), early Data Intelligence Network | Licensing deals $50K–500K/yr per licensee | First signed licensing deal with a recognizable brand, automated remediation live with clean incident record |
| **$100M** | Full "AI Visibility Operating System" — Monitoring, Layer, Alerts, Competitor Intelligence, Benchmarking, Enterprise, API, Data Licensing, Network | Fully segmented GTM pricing (SMB self-serve, mid-market/agency, enterprise, licensing/BD) | Dataset defensibly larger than any named competitor's, path to default-alive |

## Build status (2026-10-02)

- **Live in Production:** $97 AI Visibility Audit, $59 manual re-audit, Foundation Fix (manual).
- **Released to Production 2026-10-02 (#45 `0720077`, #46 `4e7a322`), behind `GEO_MODULE_MONITORING_ENABLED` and OFF:** all monitoring/tracking tables are live and empty; no monitoring price, no scheduler. Built: monthly AI Visibility Monitoring subscription — Stripe subscription checkout + idempotent webhooks, scheduled full re-audits, tokenized customer dashboard (Overview, Score History, Tracked Questions, Competitors, Citations, Reports, Recommended Actions), visibility tracking v1 (organic tracked questions across OpenAI/Anthropic/Google/Perplexity APIs, competitor share of voice, citation intelligence, evidence-backed recommendations). Entitlements are configurable per plan (Early Access: 10 questions, 3 competitors, 1 full re-audit/cycle).
- **Measurement reliability (PR #46):** 2 samples per question per AI system, coverage shown on every metric, positions only from clear ordered lists, configuration-aware comparisons, explicit provider-call states with an at-most-one-automatic-request guarantee (unknown outcomes go to operator review). Measured operating cost ≈ $1.64 per Early Access cycle (80 API calls; conservative Gemini grounding estimate).
- **Scope note:** competitor tracking measures presence in AI answers only; competitor-website crawling, website-change detection, and alerts are not built.
- **Remaining before launch:** recurring Stripe price, webhook subscription events, Stripe Customer Portal, scheduler cron, Stripe test-mode end-to-end, two deferred production smoke checks, then enable the flag.
- **Next build:** competitor website snapshots + change detection (immutable site snapshots for the customer and tracked competitors, diffed for schema/content/crawlability/entity changes and correlated with tracking movement).
- **After that:** alerts, then supervised improvement/fix workflows (operator-reviewed fix packages, measured by the next monitoring cycle).

## Which modules unlock which revenue line

See `docs/MODULE_DEPENDENCY_GRAPH.md` "Which modules unlock each stage's exit criteria" for the module-to-stage mapping. In revenue-line terms:

- **Subscription revenue** (the durable core): `monitoring` → `visibility-layer`/`wordpress-plugin`/`shopify-plugin` → `alerts` → `competitor-intelligence`.
- **Channel revenue**: `agency-platform` (Stage 3+), `enterprise` (Stage 5+).
- **Data revenue** (the long-run ceiling-raiser): `cohort-analysis` → `benchmark-engine` → `data-licensing`.

## Discipline note

Every number in this table assumes the Trust > Growth principle in `docs/strategy/00_NORTH_STAR.md` holds at every stage. A revenue milestone reached by compromising scoring integrity, evidence standards, or the automated-remediation approval gate does not count as reaching that milestone — it counts as having built a company that will lose it.
