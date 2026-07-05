# GeoViz — North Star

Status: PERMANENT. This document is the constitution every other strategy doc, roadmap, and engineering decision must trace back to. Changes require explicit founder sign-off and a version bump at the bottom of this file.

## Mission

Make it possible for any business to know — with evidence, not guesswork — whether AI systems can find it, understand it, trust it, and recommend it.

## Vision

Become the operating system for AI Visibility: the default layer businesses install to be understood by AI systems, the default monitoring service that tells them when that visibility changes, and the default benchmark the industry cites when it talks about AI-driven discovery.

## 10-Year Goal

GeoViz is the Nielsen/Moody's-equivalent for AI visibility: a company that (1) sells a visibility layer and monitoring subscription directly to businesses and agencies, and (2) owns the largest, most trusted, longitudinal dataset of how AI systems discover, cite, and recommend businesses — licensed to agencies, platforms, analysts, and researchers. Revenue is durable because it comes from three compounding sources: subscriptions (Layer + Monitoring), enterprise contracts (multi-location platform), and data (Benchmarking + Licensing + Network).

## Category Definition

**AI Visibility** is the discipline of measuring and improving whether a business can be understood, retrieved, trusted, cited, and recommended by AI systems (ChatGPT, Claude, Gemini, Perplexity, Google AI Overviews, and successors). It is adjacent to but distinct from SEO: SEO optimizes for ranking in a list of links; AI Visibility optimizes for being the answer.

GeoViz owns this category definition. Every public artifact (reports, benchmarks, press, product naming) reinforces this distinction rather than borrowing SEO's vocabulary.

## Core Principles

1. **Trust > Growth.** Every decision that trades scoring integrity for revenue, speed, or a bigger logo is rejected, without exception, at every stage of the company.
2. **Evidence-based, always.** The canonical score is derived from deterministic evidence. LLMs validate and interpret; they never author the score. See the Scoring Constitution in `CLAUDE.md` — that document is upstream of this one and is never silently altered.
3. **Additive, never destructive.** New capability layers (monitoring, layer, benchmarking, enterprise) are built as additive systems on top of the audit, never as replacements that break historical comparability.
4. **Replay-safe, always.** Any historical audit or score must be reproducible from its stored snapshot. No silent rescoring, ever.
5. **Data compounds; features don't.** Every feature is evaluated first by what it does to the long-term dataset, second by what it does to this quarter's revenue.
6. **Thin layer, not a rebuild.** GeoViz augments a business's existing web presence. It is not a CMS, not a site builder, not a website replacement.
7. **Manual before automated; automated before autonomous.** Every capability proves itself as a manual/reviewed process before being automated, and as an automated-with-approval process before ever running autonomously against a customer's live property.

## What GeoViz Will NEVER Become

- A traditional SEO tool, ranking tracker, or keyword-volume product.
- A website builder, CMS, or general-purpose marketing platform.
- A system that deploys changes to a customer's live site without explicit approval and a rollback path.
- A system that adjusts, averages, or blends its canonical score based on LLM output.
- A lead-scraping or cold-outreach tool.
- A white-label reseller of someone else's scoring methodology — the benchmark must always be GeoViz's own, evidence-based, and versioned.
- A company that overclaims: no guaranteed rankings, no guaranteed AI recommendations, no "instant AI optimization" language, ever, at any company size.

## Decision Filters

Before committing engineering, sales, or capital to anything, run it through these filters in order. If it fails any filter, it does not ship, regardless of how compelling the opportunity looks.

1. **Trust filter** — Does this touch scoring integrity, evidence standards, or a customer's live site without approval? If yes → reject or redesign with a human/approval gate.
2. **Category filter** — Does this reinforce "AI Visibility" as a distinct, evidence-based discipline, or does it drift toward generic SEO/marketing positioning? If it drifts → reject or reposition.
3. **Moat filter** — Does this generate proprietary data, strengthen the dataset, or create switching costs (installed layer, integrated workflow, multi-year history)? If it is purely a feature with no data or lock-in contribution → deprioritize below anything that passes this filter.
4. **Phase filter** — Does this stay additive across the audit → layer → monitoring → benchmarking → enterprise → network phase boundary (per `CLAUDE.md` "Strategic Direction")? If it locks the product into a single phase's shape → redesign.
5. **Scope filter** — Does this stay within "thin machine-readable layer," or does it drift into rebuilding the customer's website/CMS? If it drifts → reject.
6. **Revenue filter** — Only after the above four pass: does this move ARR, retention, or ACV in the current stage's plan (`01_FIVE_YEAR_ROADMAP.md`)? If not tied to the current stage's exit criteria, it waits.

---
v1.0 — established from strategic review + board operating plan sessions. Do not silently amend; log changes below.
