# PRD: Agency Platform

## Purpose

White-label, multi-client dashboard letting an agency manage its whole book of business under one account — the CAC-efficient distribution wedge for Stage 3.

## Revenue Model / Justification

Agency plans $500–3K/mo per book of business. Per board consensus, the primary growth engine before enterprise sales exists — direct SMB paid acquisition CAC math doesn't work at this stage.

## User Stories

- As an agency owner, I want to run and monitor audits for my whole client book from one login, branded as my own service.
- As GeoViz, I want to grow revenue through a channel that already owns the SMB relationship, rather than acquiring each business directly.

## Acceptance Criteria

- An agency user only ever sees their own linked clients (tenant isolation).
- Bulk audit submission creates one order per client hostname.
- White-label branding renders on generated reports without exposing GeoViz branding when configured.

## Non-Goals

Not the same RBAC implementation as `enterprise` — deliberately lighter-weight, different stage/scale.

## Dependencies

Depends on `visibility-layer`, `telemetry`. Explicitly does not depend on `enterprise`.

## Engineering Estimate

6–9 weeks (v1).

## Moat Contribution

Medium directly; the channel itself is the primary Stage 3 revenue-growth lever more than a data-moat contributor.
