# GeoViz Playbook — Single Source of Truth

This is the front door. It synthesizes and cross-links every deeper document rather than duplicating them — if a section here feels thin, follow its link; the depth lives in the linked doc, not here.

## Vision

Become the operating system for AI Visibility: the default layer businesses install to be understood by AI systems, the default monitoring service that tells them when that visibility changes, and the default benchmark the industry cites when it talks about AI-driven discovery. Full statement: `docs/strategy/00_NORTH_STAR.md`.

## Mission

Make it possible for any business to know — with evidence, not guesswork — whether AI systems can find it, understand it, trust it, and recommend it.

## Category Definition

**AI Visibility**: the discipline of measuring and improving whether a business can be understood, retrieved, trusted, cited, and recommended by AI systems. Distinct from SEO (which optimizes for ranking in a list of links) — GeoViz optimizes for being the answer. Full definition and the "what GeoViz will never become" boundary: `docs/strategy/00_NORTH_STAR.md`.

## 5-Year Roadmap

Full stage-by-stage plan (Launch→$250K→$1M→$5M→$10M→$25M→$100M, each with products/pricing/hiring/GTM/risks/exit criteria): `docs/strategy/01_FIVE_YEAR_ROADMAP.md`. Engineering build-order view: `docs/roadmap/EXECUTION_STAGES.md`.

## Pricing Evolution

Audit $97–147 one-time → Fix $497–1,500 → Monitoring $29–199/mo (scaling with tier) → Agency $500–3K/mo per book → Enterprise $20K–100K/yr → Data Licensing $50K–500K/yr per licensee. Full table with stage gates: `docs/REVENUE_ROADMAP.md`.

## Revenue Roadmap

$0 → $100M table with the products live and the exit criteria at each milestone: `docs/REVENUE_ROADMAP.md`. Module-to-revenue-line mapping: `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Moat Strategy

GeoViz's defensibility is not the audit, the rubric, or any UI feature — it is a longitudinal, evidence-based dataset that cannot be backfilled or bought. Five-minute synthesis: `docs/DATA_MOAT_STRATEGY.md`. Business framing: `docs/strategy/03_DATA_MOAT.md`. Technical implementation (exact tables/fields, capture points): `docs/moat/MOAT_IMPLEMENTATION.md`.

## Architecture

Module-boundary diagram, V1-isolation guarantee, feature-flag gating pattern, deployment topology: `docs/architecture/SYSTEM_ARCHITECTURE.md`. Per-module engineering scaffolds (README + `contracts.ts` + UI skeleton where applicable): `src/modules/<name>/`. Build-order dependency graph: `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Data Strategy

What's captured, from day one, and what becomes valuable at each customer-count threshold: `docs/strategy/03_DATA_MOAT.md`. Warehouse design for millions of audits (retention, partitioning, PII boundaries): `docs/data/DATA_WAREHOUSE.md`.

## Telemetry Strategy

Generic, append-only event ingestion shared across every future module (`visibility-layer`, plugins, `monitoring`, `agency-platform`, `enterprise`): `src/modules/telemetry/README.md` and `contracts.ts`.

## Product Evolution

Audit → Foundation Fix → Monitoring → Visibility Layer → Alerts → Competitor Intelligence → Benchmark Engine → Agency Platform → Enterprise → API → Data Licensing → AI Visibility Network. Why each layer exists (the wedge, the retention bridge, the distribution multiplier, the terminal moat): `docs/strategy/02_PRODUCT_ROADMAP.md`. Concrete build order with dependencies and estimates: `docs/FIVE_YEAR_EXECUTION_PLAN.md`.

## Competitive Analysis

BrightLocal/Whitespark can ship a comparable feature in 6–9 months using existing SMB distribution; Semrush/Ahrefs in 3–6 months bundled into an existing subscription; Yext is the sharpest franchise-segment threat given their existing entity-data relationships. What's easy to copy: the audit format, schema/llms.txt generation, cross-model consensus. What isn't: multi-year sampling history, scoring-freeze discipline sustained under commercial pressure, installed-base telemetry requiring real distribution. Full analysis: prior strategic-review session (VC/Competitor/CTO/Enterprise-Buyer/Customer/Researcher perspectives) — condensed into `docs/DATA_MOAT_STRATEGY.md` "Why competitors structurally cannot recreate it quickly."

## Go-to-Market

Stage-by-stage GTM motion: founder-led direct sales (Stage 1) → agency channel (Stage 3, the CAC-efficient wedge) → CMS plugin distribution (Stage 4) → enterprise direct sales (Stage 5, only after readiness criteria are met) → licensing/BD (Stage 6). Full detail per stage: `docs/strategy/01_FIVE_YEAR_ROADMAP.md`.

## Hiring Roadmap

Ordered hiring sequence from fulfillment contractor through Chief Trust Officer: `docs/strategy/09_FOUNDER_OPERATING_SYSTEM.md` "Hiring Priorities in Order."

## Infrastructure Roadmap

Worker/queue pattern extends (never forks) for future scheduled jobs (sampling, change-detection); sampling-panel cost efficiency is the primary infra risk to engineer around early; SOC 2/compliance program begins ahead of enterprise sales, not reactively. Full detail: `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/security/SECURITY_BASELINE.md`.

## Engineering Principles

TypeScript only, App Router only, additive over destructive, provider-agnostic where possible, no premature abstraction (see `docs/MODULE_DEPENDENCY_GRAPH.md` "Deliberate non-dependencies" for a concrete example), every module boundary has an explicit typed interface before it has an implementation. Full list: `CLAUDE.md` "Engineering Rules" + the scaffold-specific constraints in every `src/modules/<name>/README.md`.

## Founder Operating Rules

Weekly CEO dashboard, quarterly planning discipline, what to stop doing at each stage, founder mistakes to avoid: `docs/strategy/09_FOUNDER_OPERATING_SYSTEM.md`.

## Decision Framework

Run every non-trivial decision through these filters, in order — if a decision fails an early filter, a strong revenue case does not override it:

1. **Trust** — does this touch scoring integrity, evidence standards, or a customer's live site without approval?
2. **Category** — does this reinforce "AI Visibility" as a distinct, evidence-based discipline?
3. **Moat** — does this generate proprietary data or switching costs?
4. **Phase** — does this stay additive across the audit→layer→monitoring→benchmarking→enterprise→network boundary?
5. **Scope** — does this stay within "thin machine-readable layer" (never a CMS, never a site rebuild)?
6. **Revenue** — only after the above four pass, does this move ARR/retention/ACV for the current stage?

Full text: `docs/strategy/00_NORTH_STAR.md` "Decision Filters."

## What Never Changes

| | |
|---|---|
| The canonical score is deterministic-evidence-only | `CLAUDE.md` "GeoViz Scoring Constitution" |
| LLMs validate, never author the score | same |
| No silent rescoring; every historical audit is replay-safe | same |
| The six frozen v1 categories, weights, and bands | `CLAUDE.md` "Scoring Freeze" |
| GeoViz is a thin layer, never a CMS or site rebuild | `docs/strategy/00_NORTH_STAR.md` |
| Automated actions require explicit approval + rollback | same |
| Trust > Growth, at every stage, without exception | same |

## What Changes Over Time

| | |
|---|---|
| Which products are live (audit-only → full Operating System) | `docs/strategy/01_FIVE_YEAR_ROADMAP.md` |
| Pricing and packaging per stage | `docs/REVENUE_ROADMAP.md` |
| GTM motion (founder-led → agency → plugin → enterprise → licensing) | `docs/strategy/01_FIVE_YEAR_ROADMAP.md` |
| Team size and hiring priorities | `docs/strategy/09_FOUNDER_OPERATING_SYSTEM.md` |
| Founder's own role (operator → team-builder → category-definer → steward) | same |
| Which `src/modules/` scaffolds have moved from scaffold to shipped v1/v2/v3 | `docs/MODULE_DEPENDENCY_GRAPH.md`, each module's own README "Future Roadmap" |
