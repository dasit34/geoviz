# GeoViz — Benchmark Engine

Status: PERMANENT. This document governs how GeoViz earns and keeps the right to be called "the benchmark" for AI visibility. Every rule here is downstream of the Scoring Constitution in `CLAUDE.md` — nothing here overrides it.

## Scoring Governance

- The canonical score remains deterministic-evidence-only, exactly as frozen in `CLAUDE.md` "Scoring Freeze" and "GeoViz Scoring Constitution." The Benchmark Engine consumes that score; it does not modify or reinterpret it.
- Any change to methodology (weights, bands, ladder anchors, new signal categories) requires: isolation (one change at a time), a versioned label (e.g., `Calibration v2.3`), and validation against the archetype set before rollout — exactly the process already defined in `CLAUDE.md`. The Benchmark Engine adds one requirement on top: **any methodology version used to produce a published external benchmark must be documented in a public methodology changelog**, so press/analysts/researchers citing GeoViz numbers can always trace which version produced them.
- A governance board (founder + CTO + Head of Data/ML once hired) must approve any methodology change before it ships to a published benchmark, separate from and in addition to internal calibration approval.

## Methodology

Published benchmarks always disclose: sample size, geographic/category scope, sampling cadence, and the scoring-rubric version used. GeoViz never publishes a benchmark number without the methodology available alongside it — this is what separates a defensible index from a marketing statistic.

## Versioning

Every published index/report is tied to an immutable methodology version. Historical published benchmarks are never restated using a newer methodology without an explicit, labeled "restated under vX.X" annotation — silently updating a historical number to look better (or worse) destroys the credibility the entire licensing business depends on.

## Public Benchmark Reports

First published once the customer cohort crosses statistical significance (~1,000 customers, Stage 3–4). Cadence: quarterly at first, moving toward a recurring index (see below) as the sampling panel matures. Each report: category-level and geo-level AI visibility trends, notable shifts, and plain-English interpretation — never raw data dumps without narrative context, and never customer-identifying data without consent.

## Industry Reports

Vertical-specific deep dives (HVAC, dental, legal, etc.) once sample size per vertical supports it — these double as sales collateral for the agency/franchise channel serving that vertical and as PR hooks for trade press in that industry.

## Local Benchmarks

Geo-segmented once density supports it (Stage 5+) — "AI Visibility in [Metro Area]" reports serve local press pickup and local agency sales motions simultaneously.

## AI Visibility Indexes

The long-term goal: a recurring, cited reference index (e.g., "GeoViz AI Visibility Index") analogous to how other categories have an industry-standard number everyone cites. This requires (a) sampling-panel maturity, (b) governance discipline sustained over multiple years, and (c) enough published history that the index itself becomes a trend line worth tracking. Do not attempt to brand/launch a formal recurring index before the methodology has been stable and published for at least 2–3 quarters — a premature index that gets restated or revised damages the exact credibility it's meant to build.

## Research Papers

Once the dataset and sampling methodology are mature (Stage 5–6), pursue academic-style publication (even informally, e.g., a public technical methodology paper) — this is a distinct credibility channel from press/PR and reaches a different audience (analysts, technical buyers, platform relationships) that pure marketing content cannot.

## Press Strategy

- Lead with methodology transparency, not superlatives — "here's exactly how we measured this" builds more durable authority than "AI visibility is exploding" framing.
- Every press cycle should reinforce the category definition (`00_NORTH_STAR.md`) — GeoViz is defining "AI Visibility" as a discipline, not just promoting a product.
- Avoid all overclaiming language prohibited in `CLAUDE.md` ("Tone & Positioning Language") in every press artifact, including headlines a journalist might paraphrase from a quote.

## Licensing

Once dataset scale supports it (100K+ businesses, Stage 6), license aggregated/anonymized benchmark data to agencies (for their own client positioning), analysts, adjacent platforms, and researchers. Licensing terms must never allow a licensee to represent GeoViz's methodology as their own or to publish a version of the data that has been altered in a way that misrepresents the underlying methodology — protecting the integrity of the number in the wild is as important as protecting it internally.
