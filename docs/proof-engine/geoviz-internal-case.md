# GeoViz internal proof case (v1 — proposed, not approved)

Website: https://www.geoviz.ai · generator `proof-questions@1.0.0` · business type: online software (no local questions) · competitors: none supplied (none invented).

## Proposed question set v1 (7 questions)

| # | Intent | Question | Why |
|---|---|---|---|
| 1 | Branded accuracy | What does GeoViz do, and who is it for? | Checks whether AI describes the business accurately when asked by name. |
| 2 | Branded accuracy | Is GeoViz a trustworthy AI visibility audit service? | Checks how AI characterises the business's credibility when asked by name. |
| 3 | Unbranded discovery | What are the best AI visibility audit services? | Checks whether the business is named for its category without being mentioned. |
| 4 | Unbranded discovery | Can you recommend a reliable AI visibility audit service? | A buying question for the category, without a location. |
| 5 | Service-specific | Who offers AI visibility audits? | Checks whether the business is named for "AI visibility audits". |
| 6 | Service-specific | Which AI visibility audit services are best for AI visibility monitoring? | Checks whether the business is named for "AI visibility monitoring". |
| 7 | Unbranded discovery | What should I look for when choosing an AI visibility audit service? | A research-stage question for the category; shows which businesses and sources AI cites. |

Not included: local commercial-intent questions (GeoViz has no service area) and competitor comparisons (add real competitor names, then create v2 before the baseline is measured).

## Baseline setup

- AI systems: openai, claude, gemini, perplexity — via their APIs, which are not identical to the consumer ChatGPT, Claude, Gemini or Perplexity apps.
- Samples per question per AI system: 2.
- Existing monitoring cycle runner (tracking-prompt@2.0.0, pinned validator models, web-grounded where available). ~7 questions × 4 AI systems × 2 samples = 56 provider calls; staging measured ~$0.02 per call → roughly $1.15 per cycle (estimate).
- Steps: approve → activate the set (tracked questions replaced by the set's questions) → run one cycle → the cycle is tagged with the set version and the set is frozen.

## Highest-confidence finding

**Homepage has Organization JSON-LD only — no WebSite or SoftwareApplication/Service entity** (`schema:website-softwareapplication-missing`, observed 2026-10-06)

- https://www.geoviz.ai/ — one application/ld+json block; @type: Organization (read-only fetch, 2026-10-06).
- No WebSite, SoftwareApplication or Service JSON-LD on the homepage.
- Free check v1.3 (Production, online business type): score 53; Organization/WebSite/product checklist 3 of 6.
- llms.txt and sitemap.xml both return 200 (not part of this finding).

Why this one: It is deterministic and directly re-checkable by the website scanner (schema types are extracted on every scan), unlike content or citation findings that depend on judgement or third parties.

## First experiment (ready for approval)

- Action: Add WebSite and SoftwareApplication JSON-LD to the homepage
- Proposed fix: Add a WebSite entity (name, url) and a SoftwareApplication entity (name, applicationCategory BusinessApplication, operatingSystem Web, url, offers only with the published price) alongside the existing Organization block. Use only facts already published on the site.
- Target URL: https://www.geoviz.ai/
- Expected category: `structured_data`
- Verification: Website scanner re-check after implementation: WebSite and SoftwareApplication present in the homepage JSON-LD types (baseline frozen at the last scan before implementation).
- Follow-up: First completed cycle of the same question-set version after the implementation date (monthly cadence → ~30 days).
- Outcome rules `proof-outcome@1.0.0`: ≥ 8 comparable answers on each side; a change of ±15 points in the share of answers naming GeoViz and ≥ 2 answers → improvement/decline observed; otherwise no material change.
- Status: Ready for operator approval — NOT implemented. The GeoViz site was not modified in this task.

> This describes what was measured after the change was implemented. It does not show that the change caused any difference — AI answers vary, and other things change over time.
