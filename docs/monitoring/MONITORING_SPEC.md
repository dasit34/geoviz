# Monitoring — Product/Technical Spec

Companion to `src/modules/monitoring/README.md` (engineering scaffold) and `docs/strategy/05_MONITORING_ARCHITECTURE.md` (business architecture, already written). This doc maps the specific capabilities requested for the Monitoring roadmap to their owning module.

| Capability | Owning module | Notes |
|---|---|---|
| Weekly AI visibility score | `monitoring` (v1) | Scheduled re-score job, needs only `ai-answer-sampling` |
| Daily change detection | `change-detection` | v2 addition, Stage 4 |
| Competitor movement | `competitor-intelligence` | Stage 5, packaged as a Monitoring add-on per board pricing decision |
| Prompt volatility | `ai-answer-sampling` (`AnswerVolatility`) | Mention-rate stability over a sampling window |
| AI answer snapshots | `ai-answer-sampling` (`AnswerSnapshot`) | The evidence-first retention surface |
| Trend graphs | `monitoring` (`VisibilityHistory`, from `src/lib/v2/contracts.ts`) | Customer-facing timeline |
| Alert engine | `alerts` | v2 addition, Stage 4 |
| Recommendations | `alerts` (`recommendedAction` field) | Every alert carries one — never a bare notification |
| Monthly executive report | `monitoring` (future v3) | Aggregates the above into a periodic summary; not scaffolded as a separate module — it's a `monitoring` presentation concern |
| Renewal risk | `monitoring` (`computeChurnRisk`) | Score plateau + no evidence viewed = the specific failure mode being guarded against |

## Why this split

Monitoring is a **composition layer**, not an implementation of any of the above capabilities itself — this keeps `ai-answer-sampling`, `change-detection`, and `alerts` independently testable and independently valuable to other modules (`competitor-intelligence`, `enterprise` also consume them directly).
