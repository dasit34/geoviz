# Module: Change Detection

Status: SCAFFOLD ONLY. Nothing in this directory is wired into the running app. See `docs/prd/change-detection.md`.

## Purpose

Deterministic, diff-based detection of what changed for a business between two points in time: schema/entity fields (from `visibility-layer`), citation/recommendation status (from `ai-answer-sampling`), competitor scores. Per CTO architecture guidance (`docs/strategy/02_PRODUCT_ROADMAP.md`), this is explicitly **never** an LLM judgment call — cost and auditability at monitoring scale require deterministic comparison logic. LLMs may summarize a detected change in plain English downstream, but never detect the change itself.

## Database Schema

See the proposed `ChangeEvent` model in `contracts.ts` — append-only, one row per detected diff.

## API Contracts / Service Interfaces

See `contracts.ts` — `ChangeDetectionService`. Depends (type-only) on `LayerContextBlock` from `visibility-layer` and `AnswerSnapshot` from `ai-answer-sampling`.

## React Page Skeleton

N/A — surfaces inside the `monitoring` and `alerts` surfaces, not its own route.

## Component Tree

N/A.

## Telemetry Requirements

Every detection run logs: comparison type, whether a change was found, and runtime — feeds the "installed-base change-detection dataset" described in `docs/strategy/03_DATA_MOAT.md` as one of the four data assets competitors cannot recreate quickly.

## Feature Flags

`GEO_MODULE_CHANGE_DETECTION_ENABLED`.

## Acceptance Tests

Future: `scripts/test-change-detection.ts`. Planned assertions: a deliberately mismatched fixture (NAP mismatch, missing schema field) is always flagged (deterministic, no false negatives on exact-match rules), an unchanged fixture never fires a false positive, no test path calls an LLM.

## Implementation Checklist

- [ ] Entity/schema diff comparator (structured field-by-field comparison, reusing `checkEntityConsistency`'s existing logic from `src/lib/intelligence/preflight/entityConsistency.ts` as the comparison basis rather than reinventing it).
- [ ] Citation/answer diff comparator (mention/position/citation-source changes between two `AnswerSnapshot` rows for the same query).
- [ ] Competitor-score diff comparator (feeds `competitor-intelligence` alerts).

## Dependencies

Depends on `visibility-layer` (entity/schema state) and `ai-answer-sampling` (citation state). `monitoring` and `alerts` depend on this module. See `docs/MODULE_DEPENDENCY_GRAPH.md`.

## Technical Debt Notes

Do not let this module's comparators diverge from the existing V1 `entityConsistency.ts` logic — extend/reuse it via a shared interface rather than duplicating the NAP-comparison algorithm.

## Security Review

No new PII surface — operates only on already-collected business/entity/answer data. No customer-authentication surface (backend-only).

## Future Roadmap

v1: entity/schema diff only (Stage 4, powers Alerts' drift notifications). v2: citation/answer diff (Stage 5, powers Competitor Intelligence + citation alerts). v3: real-time diffing via telemetry-driven triggers rather than scheduled batch (Stage 6).

## What is currently in this directory

- `README.md` — this file.
- `contracts.ts` — TypeScript interface declarations only. No runtime code. Not imported by any V1 file today.

## What is intentionally NOT in this directory

- Any LLM-based "did something change" judgment — explicitly forbidden by architecture rule.
- Alert delivery — lives in `alerts`.
