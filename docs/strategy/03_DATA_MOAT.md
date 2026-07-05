# GeoViz — Data Moat

Status: PERMANENT. This document governs what is captured, retained, and never discarded. Engineering must treat data capture as a first-class requirement of every feature, not an afterthought — see `00_NORTH_STAR.md` Decision Filter #3 (Moat filter).

## Exactly What GeoViz Stores

**Per-audit (every order, from day one):**
- Full raw HTML fetched at audit time (pre- and post-render where headless probing runs).
- Extracted structured data: JSON-LD blocks as found, parsed, and validated.
- robots.txt, sitemap.xml, meta-robots, canonical chain — raw and parsed.
- Extracted readable content (Readability-cleaned text) used for AI-readability heuristics.
- Entity fields extracted from schema, homepage prose, and footer (name, address, phone, hours) plus the consistency comparison result.
- Every LLM validator response **verbatim**, not just the derived score contribution — the raw text is a labeled reasoning trace, not disposable scratch output.
- The final canonical score, its category breakdown, and the exact rubric version used to produce it.
- Every human QA correction made to a report before delivery, tagged with what was wrong and what was changed — this is a labeled "ground truth vs. model output" dataset.

**Per-Monitoring-customer (recurring):**
- Timestamped re-score snapshots on the customer's monitoring cadence (weekly/monthly per plan).
- Actual sampled AI answers (verbatim) for a defined set of buyer-intent queries per business, per platform, per sampling interval — this is the ground-truth layer, distinct from and more valuable than the heuristic score.
- Citation-source attribution for each sampled answer: which URLs/sources the AI referenced, in what order, alongside or instead of the business.
- Structured change events: what changed between snapshots (schema, entity fields, robots.txt, content) — deterministic diffs, not LLM judgments.
- Alert firing history and customer response (did they act, ignore, or churn after an alert).

**Per-Layer-install (plugin/snippet customers):**
- Install timestamp, CMS platform, plugin version.
- Live telemetry: is the snippet actively serving, has it been removed, has the underlying page changed around it.
- Aggregate, anonymized usage patterns across the installed base (not individual customer content) for change-detection model tuning.

**Per-Enterprise-account:**
- All of the above at multi-location scale, plus API usage patterns (which endpoints, what cadence) — this is itself a valuable signal for what enterprise customers actually value operationally.

## Exactly What Raw Signals Are Collected

Crawlability signals, structured-data signals, trust signals (reviews, citations, NAP consistency), content-depth signals, entity-clarity signals, technical-accessibility signals — the six frozen audit categories (`CLAUDE.md` "Scoring Freeze") — plus, starting with the sampling panel (Stage 3+): actual live-AI-response signals (presence, citation, sentiment, position within the answer) sampled repeatedly over time per business per platform.

## Exactly What Telemetry Is Collected

- Report engagement telemetry (which sections customers actually read/click in the web report).
- Fix delivery telemetry (time-to-complete per Fix category, QA correction frequency per category — this tells you where the templates are weakest).
- Layer/plugin install-base telemetry (install rate, uninstall rate, time-to-first-alert).
- API usage telemetry once the API ships (Stage 5+).
- Sales/funnel telemetry (audit → Fix → Monitoring conversion at each step, segmented by channel, vertical, and acquisition source).

## Exactly What Historical Snapshots Are Stored

Every audit, every re-score, and every sampled AI answer is stored as an immutable, timestamped snapshot tied to the exact scoring-rubric version that produced it. Nothing is ever overwritten. This is what makes "replay old audits deterministically" (`CLAUDE.md`) possible and what makes multi-year trend claims defensible — a rescored/backfilled history would be worthless for benchmarking and is explicitly forbidden.

## Exactly What Becomes Proprietary

- The verbatim sampled-AI-answer corpus, tied to time, business, category, and geo — no one else has repeated, structured samples of what AI systems actually say about specific businesses over years.
- The human-QA-correction dataset — proprietary because it only exists as a byproduct of GeoViz's own fulfillment process.
- The calibrated scoring model once validated against enough real sampled-answer outcomes to move from "internally calibrated heuristic" to "empirically validated predictor" — this transition point is when the scoring model itself becomes a defensible asset, not just a rubric.
- The installed-base change-detection dataset (what kinds of site changes actually precede visibility changes) — only observable at scale with a real installed base, not a one-time crawl.

## Exactly What Creates Switching Costs

- The AI Visibility Layer once installed (removing it means losing the alerting and monitoring value the customer has come to depend on).
- Multi-year score history per business (a competitor's audit starts you at zero history; GeoViz's continues an established trend line the customer already trusts).
- API/workflow integrations at the enterprise tier (embedded into a customer's BI stack or franchise management system).
- Agency white-label workflows where GeoViz reporting is embedded into the agency's own client deliverables.

## Exactly How Competitors Would Fail to Recreate It

- **Sampling history cannot be backfilled.** A competitor starting today cannot retroactively produce three years of repeated AI-answer samples for a business — the only way to have that data is to have been sampling for three years.
- **Scoring-freeze discipline is a behavioral moat, not a technical one.** Most competitors will retune their scoring under commercial pressure (a bigger client wants a better number, a new model shifts internal calibration). Once they do, their own historical trend claims become unusable. GeoViz's discipline (versioned, replay-safe, never silently rescored) is easy to describe and hard for a commercially pressured competitor to actually sustain.
- **Installed-base telemetry requires real distribution, not just audit volume.** A competitor can run more audits faster than GeoViz; they cannot instantly have thousands of live plugin installs generating real-world change-detection data.
- **The QA-correction dataset is a byproduct of years of manual fulfillment discipline** — a competitor optimizing for automation-first from day one will never generate the same labeled "what humans caught that the model missed" corpus.

## How This Becomes a $100M Asset

At small scale, the data above is operational exhaust — useful for internal QA and calibration, not sellable. The transition to a $100M asset happens in three compounding steps:

1. **Statistical significance (10K+ businesses, Stage 5):** cohort and category benchmarks become defensible enough to publish and be cited externally — this is when the dataset starts generating inbound demand and press authority on its own.
2. **Licensable scale (100K+ businesses, Stage 6):** the dataset is large and current enough that media, analysts, adjacent platforms, and researchers will pay for access rather than try to approximate it themselves — this opens the Data Licensing revenue line.
3. **Network scale (1M+ businesses):** the dataset becomes valuable not just to businesses being measured but to anyone modeling AI-driven commerce discovery at a macro level, including potentially the AI platforms themselves — at this point GeoViz is infrastructure, not a vendor, and the revenue ceiling is no longer bounded by SMB/agency/enterprise seat counts alone but by the number of parties who need to understand this market.

The through-line: **none of this works if scoring integrity is ever compromised.** A licensable dataset is only valuable because it is trusted. This is why Trust > Growth is not a values statement — it is the specific mechanism by which the data becomes worth $100M instead of worth nothing.
