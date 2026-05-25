# Figma → Code Design System Rules (GeoViz)

These rules govern every Figma-driven UI change in this repo. They
translate Figma MCP output into GeoViz's existing Next.js 14 + Tailwind
conventions. `CLAUDE.md` and `CLAUDE_DESIGN.md` remain the product /
visual source of truth — when a Figma mockup conflicts with them, the
GeoViz rules win and the conflict is flagged, not silently shipped.

## Required Figma-to-Code Flow (do not skip)

1. Run `get_design_context` for the exact node(s) being implemented.
2. If the response is truncated/too large, run `get_metadata` for the
   node map, then re-fetch only the needed node(s) with
   `get_design_context`.
3. Run `get_screenshot` for a visual reference of the node variant.
4. Only after you have both `get_design_context` and `get_screenshot`,
   download required assets and begin implementation.
5. Translate the React + Tailwind output into GeoViz conventions
   (token-mapped Tailwind, existing utility classes, existing
   components) — never paste raw MCP output as final code.
6. Validate the rendered UI against the Figma screenshot for 1:1 look
   and behavior before marking complete.

## Component Organization

- Reusable components live flat in `src/components/*.tsx`. Pages and
  routes live in `src/app/**` (App Router).
- IMPORTANT: Before creating a component, check `src/components/` for
  an existing one to reuse or extend. Current set includes `Header`,
  `Footer`, `Logo`, `OrderForm`, `ReportCtaCard`, `CategoryScoreCard`,
  `StrengthCard`, `RadarChart`, `HeroRadar`, `ReportView`,
  `ReportScoreCard`, `Prose`, `Header`, etc.
- Filenames are `PascalCase.tsx`. Export a **named** function:
  `export function ComponentName() { ... }` — match `Header.tsx`. Do
  not use default exports for components.
- One named component per section block. Marketing surfaces compose
  from small named components (`WhatCard`, `HowItWorksStep`,
  `MeasureCard`, `ProblemCard`, …) — do not emit large inline JSX
  trees for a whole page.
- Import with the `@/` alias (`@/components/...`, `@/lib/...`). It
  maps to `./src/*` (`tsconfig.json`). No deep relative `../../` paths.
- TypeScript only. App Router only. Type every prop interface
  explicitly; components that compose into others accept `className`.

## Styling & Design Tokens

- IMPORTANT: Tailwind is the only styling system. No inline `style`,
  no CSS-in-JS, no new styling libraries.
- IMPORTANT: `tailwind.config.ts` is the single token source of truth.
  Map every Figma color/spacing/shadow value to an existing token —
  never introduce ad-hoc hex in component files.
  - Surfaces: `ink.950 #05070d` (page bg) → `ink.600` — deep ink
    backgrounds.
  - Accent: `accent.DEFAULT #ff7a18`, `accent.glow #ff9a3c`,
    `accent.blue #2b8bff`. Use accent for **one** element per viewport,
    not every CTA (per `CLAUDE_DESIGN.md`).
  - Status: `severity.{critical,warning,info}` for error/advisory/safe
    states.
  - `cyan.{DEFAULT,dim}` is reserved for radar + telemetry accents
    only — never body text, CTAs, or score values.
  - Fonts: `font-sans` / `font-display` for UI, `font-mono` for data
    values (scores, IDs, %, timestamps).
  - Shadows: `shadow-glow`, `shadow-glow-blue`, `shadow-card`.
  - Motion: only `animate-pulseSoft`, `animate-floatY`,
    `animate-radarSweep` exist and are the sanctioned exceptions.
    Restrained motion only — a new keyframe needs a clear purpose and
    goes in `tailwind.config.ts`, not a component.
- Prefer the existing component utility classes from
  `src/app/globals.css` over re-deriving Tailwind chains:
  `.container-page`, `.card`, `.card-hover`, `.btn-primary`,
  `.btn-ghost`, `.input-field`, `.pill`, `.section-eyebrow`,
  `.h1` / `.h2` / `.h3`, `.muted`, `.mono-data`, plus
  `.bg-radial-orange`, `.grid-bg`, `.report-prose`. If a Figma element
  matches one of these, use the class; if it's a near-match, prefer
  extending the class over a one-off.
- Rounding: default `rounded-md` / `rounded-lg`. IMPORTANT: do not put
  `rounded-xl` on every container — over-rounding breaks the
  intelligence-product read (`CLAUDE_DESIGN.md` avoid-list).
- Report / PDF surfaces: report styling lives in
  `src/app/report/[id]/print/print.css` and is consumed by both the
  browser view **and** Puppeteer PDF generation. Any Figma change to a
  report surface must render cleanly in both — verify before merging.
- Foundation Fix CTA and AI Visibility Layer surfaces must match the
  `cta-card` styling in `src/components/ReportCtaCard.tsx` + the
  matching CSS in `print.css`, so the offer reads identically across
  surfaces.

## Asset Handling

- IMPORTANT: If the Figma MCP server returns a localhost source for an
  image/SVG, use that source directly. Do not create or substitute
  placeholders when a localhost source exists.
- IMPORTANT: Do NOT add icon or illustration packages. `CLAUDE.md`
  forbids unnecessary libraries; icons are inline SVG (see existing
  set in `src/components/` and inline defs in `src/app/page.tsx`).
- Store downloaded static assets under `public/` (served at site
  root by Next.js). Reference them with a root-absolute path.
- IMPORTANT: No emoji-as-icon. Convert any emoji/icon in the mockup to
  inline SVG matching the existing icon style.

## Brand, Tone & Scope Guardrails (GeoViz-specific)

- IMPORTANT: Figma mockups often carry placeholder marketing copy.
  Customer-facing text must follow the binding tone rules in
  `CLAUDE.md` ("Tone & Positioning Language", "Positioning
  (CRITICAL)"): intelligence-grade voice, no hype words
  ("supercharge", "magic", "10x", "guaranteed"), never claim
  guaranteed rankings/AI recommendations. If the mockup's copy
  violates this, implement the layout but flag the copy — do not ship
  the hype wording.
- IMPORTANT: Respect the MVP scope in `CLAUDE.md` ("MVP Scope
  (STRICT)"). If a Figma design implies a dashboard, login, account
  area, subscription UI, or agency portal, stop and flag it — these
  are explicitly out of scope; do not build them from a mockup.
- IMPORTANT: Never let a Figma-driven change alter scoring, the
  audit/worker pipeline, or report score parsing. The scoring rubric
  is frozen (`CLAUDE.md` "Scoring Freeze"). UI/visual changes only.
- Keep visual identity coherent with `CLAUDE_DESIGN.md`: dark premium,
  serious, no generic SaaS aesthetics (purple gradients, fake "trusted
  by" logo strips, illustrated/3D heroes, mascots), no dashboard
  clutter. Flag mockups that drift into these.
- No fake data in shipped UI. Mockup placeholder numbers/names must be
  wired to real props or clearly marked sample data on sample/preview
  surfaces only.

## Validation

- After implementing, compare the running UI to the `get_screenshot`
  output for both layout and interactive behavior.
- Confirm: tokens used (no stray hex), existing utility classes
  reused, named export + `@/` imports, no new dependencies, motion
  restrained, copy on-tone, scope respected.
- Run the project's typecheck/lint before marking complete; the build
  must stay green (`CLAUDE.md` "Code must run").
