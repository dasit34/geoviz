# GeoViz Proof Engine v1

Measures whether a supervised website change was followed by a change in the
same AI measurements — without claiming the change caused it.

Code: `src/lib/monitoring/proof/` · migration `20261007100000_proof_engine_v1`
(additive: 3 new tables, 2 nullable columns on `MonitoringCycle`).

## Flags

| Surface | Requires |
|---|---|
| Operator page `/admin/proof/<subscriptionId>`, `POST /api/admin/proof` | `GEO_MODULE_MONITORING_ENABLED` + admin session or `ADMIN_SECRET` |
| Customer "Proof" tab on `/monitoring/account/<subscriptionId>` | the above flag **and** `GEO_MODULE_PROOF_ENGINE_ENABLED=true` (off everywhere), plus `requireOwnedSubscription` |
| Cycle tagging (`MonitoringCycle.questionSetId/Version`) | an **active** question set; subscriptions without one run exactly as before |

## Pieces

- **Question sets** (`question-set.ts`, `TrackingQuestionSet` + `…Item`,
  `proof-questions@1.0.0`): ≤ 10 questions, intents `branded_accuracy`,
  `unbranded_discovery`, `service_specific`, `local_commercial_intent`,
  `competitor_comparison`; category/city/state/service area recorded.
  Lifecycle draft → approved → active → retired. Wording is editable only on
  an unmeasured draft; approval and first measurement freeze it; changes mean
  a new version (n+1). Activation syncs `TrackedPrompt`s (link/reactivate,
  create, deactivate — never edits text). Local questions only with a known
  place; competitor questions only with supplied names.
- **Evidence** (`evidence.ts`, `sentiment@1.0.0`): per answer — provider,
  model, time, question, response, named or not, position (numbered lists
  only), competitors, sentiment only when explicit language sits in the same
  sentence as the business name, sources **only** from provider-returned
  citations ("No source returned by this provider" otherwise; URLs written in
  the answer are listed separately), status/error. Always labelled as an API
  measurement, not the consumer apps. Computed at read time from immutable
  `PromptRunResult` rows.
- **Comparability** (`compare.ts`): wraps `compareCycles`; not comparable when
  the question set or version, AI systems, samples per question, or the
  configuration fingerprint differ. Competitor share alone is not comparable
  when tracked competitors changed. Failed samples never count as "not named".
- **Experiments** (`experiment.ts`, `ProofExperiment`, `proof-outcome@1.0.0`):
  one per approved `ImprovementTask` (action, URL, approval, implementation and
  verification are reused from the task, not copied). Baseline cycle and
  finding evidence frozen at creation. Outcomes: `implementation_not_verified`,
  `insufficient_evidence` (no follow-up after implementation, or < 8
  comparable answers), `measurement_not_comparable`, `improvement_observed` /
  `decline_observed` (±15 points and ≥ 2 answers), `no_material_change`. The
  first two can be re-assessed; the rest are frozen once recorded. Every
  summary carries the no-causation note.
- **Proof view** (`view.ts`) and **monthly owner summary** (`owner-summary.ts`):
  counted facts from stored rows only — no percentiles, averages or rankings;
  limitations and provider failures always listed. Nothing is emailed.

## GeoViz internal case

`npm run proof:geoviz-proposal` (DB-free) regenerates
[`geoviz-internal-case.md`](./geoviz-internal-case.md).
`scripts/proof-geoviz-staging.ts` applies it to a **staging** subscription
(strict non-prod guard, no provider calls).

## Tests

`npm run test:proof` (DB-free; also part of `npm run test:no-db`).
