# GeoViz — Monitoring Architecture

Status: PERMANENT (architecture); ships per `01_FIVE_YEAR_ROADMAP.md` Stage 2 (v1) through Stage 5 (Competitor Intelligence). Monitoring is the recurring-revenue anchor of the entire company — see `CLAUDE.md` "AI Visibility Layer Direction."

## Scoring Cadence

- **Weekly scoring** (default paid tier): deterministic-signal re-checks (schema, crawlability, entity consistency) via the Layer's self-reporting where installed, or a lightweight re-crawl where not.
- **Daily scoring** (premium/enterprise tier): adds change-detection polling frequency for accounts where drift risk is high (active site redevelopment, multi-location franchise rollout) or where Alerts are the primary purchased value.
- Full deterministic-signal re-audit (all six frozen categories) runs on a slower cadence (monthly) regardless of tier — this is the expensive, thorough pass; weekly/daily cadences are lighter-weight drift checks layered on top.
- **AI-answer sampling cadence is separate and slower** than deterministic re-scoring (see below) — live-model sampling is costly and noisy at high frequency; it runs on a schedule tuned for statistical usefulness, not customer-visible daily churn.

## Alerts

Alert categories, each tied to a deterministic trigger (never an LLM judgment call on "should I alert"):
- **Entity/schema drift** — NAP mismatch, missing/broken JSON-LD, robots.txt change that blocks a known AI crawler.
- **Competitor changes** — a tracked competitor's score or citation share crosses a meaningful threshold.
- **Citation/recommendation changes** — a sampled AI answer starts or stops citing the business for a tracked buyer-intent query.
- **Technical regressions** — page-weight spike, hydration/blank-shell risk detected by the render-intelligence probe.

Every alert includes: what changed, the evidence (snapshot diff or answer excerpt), and a specific recommended action — never a bare notification with no context.

## Competitor Changes

Tracked via the same sampling panel used for the customer's own citation monitoring, applied to a customer-defined or auto-detected competitor set. Competitor Intelligence (Stage 5) packages this into its own view; Monitoring v1–v2 surfaces it only as an alert trigger, not a full dashboard.

## Entity Changes / Schema Changes

Deterministic diff against the last known-good snapshot. This reuses the Layer's change-detection engine (`04_AI_VISIBILITY_LAYER.md`) where installed; falls back to periodic re-crawl comparison where the Layer isn't installed (lower fidelity, longer detection lag — this gap is itself a sales argument for Layer adoption).

## Citation Changes / Recommendation Changes

The highest-value, highest-cost signal. Sourced from the live-AI-answer sampling panel: a fixed set of buyer-intent queries per business/category/geo, sampled on a schedule, with the raw answer text and citation sources stored verbatim (see `03_DATA_MOAT.md`). A "recommendation change" event fires when the business's presence, position, or citation status in a sampled answer changes between sampling passes.

## AI Answer Snapshots

Every sampled answer is stored immutably, timestamped, tied to the exact query, platform, and model version where knowable. This is the ground-truth evidence layer that makes Monitoring defensible against the "it's just a re-run score" churn risk identified in customer research — customers should be able to see the actual AI text, not just trust a number.

## Timeline

Customer-facing history view: score trend line, alert history, and a scrollable timeline of AI-answer snapshots — the "before/after" story of the business's AI visibility over the life of the subscription. This is the single strongest renewal-justification artifact Monitoring produces (a multi-month trend line is much harder to walk away from than a single score).

## Customer Dashboard

Scope discipline: Monitoring's customer-facing surface is a **report + timeline + alerts view**, not a general-purpose analytics dashboard. It must not creep into subscription-management/account/login complexity beyond what monitoring itself requires (per `CLAUDE.md` MVP scope discipline — this expands only as Stage 3+ agency/enterprise multi-client needs justify it, not preemptively).

## Retention Metrics

- Net revenue retention (target >90% by Stage 2 exit, >100% by Stage 3 exit, >120% by Stage 6).
- Alert engagement rate (did the customer open/act on the alert).
- Evidence-view engagement (are customers actually looking at AI-answer snapshots, or just the score — this validates or invalidates the evidence-first retention thesis).
- Time-to-churn correlation with "score plateaued with no new evidence shown" — the specific failure mode to watch for and design against.

## Pricing Model

- Monitoring: $29–79/mo (SMB, Stage 2) scaling to $79–199/mo/location (Stage 3+) as evidence depth (sampling frequency, competitor tracking, alert granularity) increases by tier.
- Alerts: bundled at base tier, premium event types (citation/recommendation changes) reserved for higher tiers given their higher sampling cost.
- Competitor Intelligence: priced as a Monitoring add-on (per `01_FIVE_YEAR_ROADMAP.md` Stage 5 decision), not a separate product line, to keep the core retention narrative unified.
- Enterprise/franchise: volume-tiered per-location pricing with API access included at the top tier.
