# PRD: Enterprise

## Purpose

Multi-location console for the 5,000-location buyer: RBAC, bulk onboarding, audit trail, API, and the compliance posture (SOC 2) required to survive real enterprise procurement.

## Revenue Model / Justification

Enterprise contracts $20K–100K/yr (Stage 5), scaling with location count and API/automation-action usage at Stage 6. Ships only after readiness criteria are demonstrably met, per board consensus — never sold from a roadmap slide.

## User Stories

- As a franchise operations manager, I want one console showing visibility across all my locations, with role-scoped access per region.
- As a CIO, I want an auditable, SOC 2-backed system before I'll approve it for budget-driving decisions.

## Acceptance Criteria

- A regional-manager-scoped RBAC grant never returns data outside its assigned locations.
- Bulk onboarding of N hostnames creates N properly-linked location rows.
- Every score/alert/change event is traceable via the audit trail to its source and methodology version.

## Non-Goals

Not the same RBAC implementation as `agency-platform`. Not a general-purpose site-management platform.

## Dependencies

Depends on `monitoring`, `visibility-layer`.

## Engineering Estimate

10–14 weeks (v1) — the RBAC + audit-trail + SOC 2 program together are the largest single-module estimate in the roadmap.

## Moat Contribution

Low directly (RBAC/compliance is table stakes, not proprietary); high indirectly via the deep API/workflow lock-in it creates once installed.
