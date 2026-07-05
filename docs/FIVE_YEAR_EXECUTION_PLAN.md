# GeoViz — Five-Year Execution Plan

Extends `docs/strategy/10_BACKLOG.md` (does not restate its Impact/Difficulty/Revenue/Moat ratings — cross-link, not copy) by adding an **expected engineering weeks** estimate per module and a single recommended build order across all 14 `src/modules/` scaffolds. Build order follows `docs/MODULE_DEPENDENCY_GRAPH.md` exactly — never reorder across a dependency boundary.

## Ranked build order with estimates

| Order | Module | Depends on | Eng weeks (v1) | Impact | Revenue | Moat | Stage |
|---|---|---|---|---|---|---|---|
| 1 | `ai-answer-sampling` | — | 6–10 (pilot scale) | Critical | Med (enables Monitoring retention) | Critical | 2–3 |
| 2 | `monitoring` (v1: re-score + evidence only) | `ai-answer-sampling` | 4–6 | Critical | Critical | High | 2 |
| 3 | `telemetry` | — | 1–2 | Med | Low | Med | 3–4 |
| 4 | `visibility-layer` | `telemetry` | 5–8 | High | Med | High | 4 |
| 5 | `cohort-analysis` | — | 3–5 | High | Low (near-term) | Critical | 3–4 |
| 6 | `agency-platform` | `visibility-layer`, `telemetry` | 6–9 | Critical | Critical | Med | 3 |
| 7 | `wordpress-plugin` | `visibility-layer` | 5–7 | Critical | High | Critical | 4 |
| 8 | `change-detection` | `ai-answer-sampling`, `visibility-layer` | 4–6 | High | Med | High | 4 |
| 9 | `benchmark-engine` | `ai-answer-sampling`, `cohort-analysis` | 5–7 | High | Med | Critical | 4 |
| 10 | `alerts` | `change-detection`, `ai-answer-sampling` | 3–5 | High | Med | Med | 4 |
| 11 | `monitoring` (v2: + change-detection + alerts) | `change-detection`, `alerts` | 3–4 | High | High | Med | 4–5 |
| 12 | `shopify-plugin` | `visibility-layer` | 6–9 (stricter app-review requirements than WordPress) | Med | Med | Med | 4–5 |
| 13 | `competitor-intelligence` | `monitoring`, `ai-answer-sampling` | 5–7 | High | High | High | 5 |
| 14 | `enterprise` | `monitoring`, `visibility-layer` | 10–14 (RBAC + audit trail + SOC 2 program) | Critical | Critical | Low (direct); High (via lock-in) | 5 |
| 15 | `data-licensing` | `benchmark-engine`, `cohort-analysis` | 4–6 | High | High | Critical | 6 |

Estimates are v1-scope only (per each module's own README "Future Roadmap" v1 line) — v2/v3 scope for every module adds further weeks not counted here, tracked instead in `docs/strategy/10_BACKLOG.md`'s per-epic backlog as those stages approach.

## Recommended build order, restated as a single sequence

`ai-answer-sampling` → `monitoring` v1 → `telemetry` → `cohort-analysis` → `agency-platform` → `visibility-layer` → `wordpress-plugin` → `change-detection` → `benchmark-engine` → `alerts` → `monitoring` v2 → `shopify-plugin` → `competitor-intelligence` → `enterprise` → `data-licensing`.

## How to use this document

Before starting item N, confirm every dependency listed for it is at v1-shipped status (not merely scaffolded — see `docs/MODULE_DEPENDENCY_GRAPH.md` "How to read this graph during planning"). Re-estimate the remaining rows at the start of each stage transition rather than treating these numbers as fixed five years out.
