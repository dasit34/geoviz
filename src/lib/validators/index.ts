/**
 * @module @/lib/validators
 *
 * AI VALIDATOR LAYER — DESIGN INVARIANTS
 *
 * 1. LLMs DO NOT CREATE THE GEOVIZ SCORE.
 *    The deterministic scoring engine in `src/lib/scoring/` remains
 *    the canonical source of truth. This module never modifies,
 *    replaces, or influences the score.
 *
 * 2. Validators are cross-model INTERPRETATION CHECKS.
 *    They run AFTER the deterministic score is produced and ask AI
 *    systems how they interpret the business — can they identify
 *    what it does, what services it offers, where it operates;
 *    would they recommend it; what facts are missing.
 *
 * 3. Disabled by default.
 *    ENABLE_AI_VALIDATORS defaults to false. When the master gate is
 *    off every provider returns `status: "skipped"`. When the gate is
 *    on but a provider's required API key is missing, that provider
 *    returns `status: "unavailable"`. Google AI Overviews has no
 *    public API and is permanently `unavailable`.
 *
 * 4. Scaffold only.
 *    Every provider currently returns mocked output regardless of env
 *    state — there are no real API calls, no network primitives, no
 *    SDK imports. Real provider integration is deferred until the
 *    operator decides to ship validator results; each provider file
 *    has a TODO(prod-integration) marker where the real call goes.
 *
 * 5. Public surface — ONE function.
 *    Only `runAiValidationLayer` is exported from this module.
 *    Internal types, registry, providers, devLog helper, and test
 *    fixtures are accessible by direct path import (e.g.,
 *    `@/lib/validators/types`) but are NOT re-exported here.
 *
 * 6. No caller in the production audit pipeline imports this layer.
 *    `runAiValidationLayer` is unreferenced by `src/lib/scoring/**`,
 *    `src/lib/audit-intelligence.ts`, `scripts/geo-worker.ts`, the
 *    web app routes under `src/app/**`, and every UI component.
 *    Wiring it up is a separate decision and a separate change.
 *
 * 7. No storage persistence.
 *    The orchestrator returns the `ValidationLayerResult` object.
 *    In dev it `console.log`s the result. In production it does
 *    nothing additional — there is no DB column reserved for it and
 *    no migration has been run.
 */

export { runAiValidationLayer } from "./runAiValidationLayer";
