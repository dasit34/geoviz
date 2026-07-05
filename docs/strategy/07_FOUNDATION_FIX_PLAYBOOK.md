# GeoViz — Foundation Fix Playbook

Status: PERMANENT (process); specific templates and margins are reviewed quarterly. Foundation Fix is the ARPU multiplier and the on-ramp to the AI Visibility Layer (`CLAUDE.md` "AI Visibility Layer Direction") — it must scale without becoming a bespoke agency service that caps at founder/team bandwidth.

## What Foundation Fix Includes (unchanged from `CLAUDE.md`)

Schema implementation/repair, llms.txt creation, robots.txt optimization for AI crawlers, homepage/service-page clarity improvements, FAQ structure for AI readability, before/after comparison.

## Automation Opportunities (in priority order)

1. **Schema generation** — highest ROI to templatize first. Business-archetype templates (roofer, dentist, HVAC, lawyer, etc.) covering the LocalBusiness-family entity fields, auto-populated from audit findings + a short intake form, human-reviewed before delivery.
2. **llms.txt generation** — templated using audit findings + business profile; near-zero marginal cost once the template library covers the top archetypes.
3. **robots.txt optimization** — fully rules-based; the AI-crawler allow/disallow patterns are a known, finite set and do not require case-by-case judgment.
4. **FAQ structure drafting** — AI-assisted first draft (LLM-generated, human-reviewed and edited) based on the audit's identified content gaps; never delivered without human review since this is customer-facing prose.
5. **Homepage/service-page clarity rewrites** — the least automatable component; requires genuine judgment about the business's voice and offering. Keep this human-led longest; do not force premature automation here at the cost of quality.

## Human Review (never fully removed)

Every Fix deliverable passes through human QA before customer delivery, regardless of how automated the drafting step becomes — this mirrors the Audit's admin review queue and is where the labeled QA-correction dataset (`03_DATA_MOAT.md`) is generated. Automation reduces the time a human spends per Fix; it does not remove the human from the loop, ever, for customer-facing prose or any change destined for a customer's live site.

## Templates

Maintain a versioned template library organized by business archetype (not by individual customer). When a QA reviewer catches a recurring correction pattern, that pattern becomes a template update — the template library should visibly improve every quarter as a direct function of QA findings, not stay static.

## QA

QA checklist, minimum bar for every Fix delivery:
- Schema validates against the entity-field checklist (no missing required LocalBusiness fields).
- NAP consistency confirmed across schema, homepage, and footer.
- llms.txt and robots.txt syntactically valid and don't accidentally block a legitimate crawler.
- FAQ/homepage copy matches GeoViz tone rules (`CLAUDE.md` "Tone & Positioning Language") — no overclaiming language slipped in from an AI-assisted draft.
- Before/after comparison artifact generated and accurate.

## Delivery Workflow

Order → automated draft generation (schema, llms.txt, robots.txt, FAQ/copy first pass) → human QA pass → customer delivery → (if Monitoring attached) automatic follow-up re-audit scheduled to produce the before/after comparison. The goal by Stage 2 exit is: no step in this pipeline requires a human to do work a template or generator could do — humans review and correct, they do not produce from scratch.

## Margins

Track cost-per-Fix (engineering/compute + human review time) against price by archetype. As templates mature, review time (and therefore cost) should fall while price stays stable or increases with added Monitoring attach — margin expansion here directly funds the Stage 3+ sampling-panel investment.

## Future AI Assistance

As LLM capability and the template library both mature, expand AI-assisted drafting into more Fix categories (e.g., service-page rewrites) — but every expansion is validated the same way: run it through human QA at full rate for a defined trial period, measure correction frequency, and only reduce review intensity once correction rates are low and stable. Never skip this validation step to save time under revenue pressure — this is a direct application of `00_NORTH_STAR.md` Decision Filter #7 (manual before automated, automated before autonomous).
