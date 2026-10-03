# GeoViz — Design Direction (Visual Source of Truth)

This file is the visual companion to `CLAUDE.md`. The strategic /
product / engineering rules live in `CLAUDE.md`. This file captures
only the visual identity decisions — colors, surfaces, motion,
density, what to avoid — so that frontend choices stay coherent as
the product grows.

## Visual identity

GeoViz should read as **intelligence-grade**: serious, evidence-
driven, technically credible. Closer to a security / observability
product than a marketing-page SaaS. Customers paying $97 for a
reviewed AI visibility audit need the surface to match that
positioning.

**Surface:**
- **Dark premium UI** — deep ink backgrounds, high-contrast
  foreground. The dark palette is the default for both marketing
  pages and the report itself.
- **Accent color**: orange (the existing `--accent` /
  `accent-glow` Tailwind tokens) or electric blue when an
  alternative accent is needed. Use sparingly — accent should call
  attention to one element per viewport, not coat every CTA.
- **Mobile responsive** is a baseline requirement, not an
  enhancement. Every customer-facing page (landing, order, report
  preview, sample report, foundation-fix form) ships responsive.

**Tone:**
- **Restrained animations**. The hero pulse + report-preview float
  are deliberate exceptions; new motion needs a clear purpose.
- **Clean and serious**. No gimmicks, no mascots, no celebratory
  micro-interactions.
- **Intelligence-grade presentation**. Information density should
  feel deliberate, not dashboard-bloated.

## Motion principles (homepage, `framer-motion`)

- One provider: `MotionRoot` (LazyMotion, features loaded async, `MotionConfig reducedMotion="user"`). Components use `m.*` only.
- Motion explains the product, never decorates: the hero readout assembles (score ring + count-up → category bars → four AI-system cards → derived readiness), the loop rail tracks scroll, previews gain depth as they arrive. Each runs once; nothing loops except the existing pulse.
- The LCP element (H1 + hero copy) is server-rendered and never starts invisible.
- Under prefers-reduced-motion every final value renders immediately.
- Budget: homepage First Load JS ≤ +25 KB gzipped over the pre-relaunch baseline (101 kB → 124 kB).
- Every product demonstration built from `src/lib/home/example-data.ts` carries the `ExampleDataBadge`.

## Avoid

These are the recurring failure modes for AI / SaaS frontends; any
of them flagged in review is a blocker:

- Generic SaaS UI aesthetics (purple gradients, generic illustrated
  heroes, "trusted by" logo strips with fake logos).
- Excessive gradients — gradients are reserved for specific
  intentional accents (the hero radial, the score-gauge fill).
- `rounded-xl` on every container — over-rounding flattens the
  intelligence-product read. Use `rounded-md` / `rounded-lg` for
  most surfaces; reserve heavier rounding for special elements.
- Dashboard clutter — small numbers in tiny cards arranged in
  grids the user can't scan.
- Startup illustration aesthetics (Notion-style hand-drawn icons,
  3D blobs, AI-generated "isometric" hero images).
- Emoji-as-icon. Use SVG (the existing icon set in `src/components/`
  and inline definitions in `src/app/page.tsx`).

## Conventions

- **Reusable components, modular sections.** Marketing surfaces
  (`src/app/page.tsx`) compose from small named components
  (`WhatCard`, `HowItWorksStep`, `MeasureCard`, `PricingBullet`,
  `ProblemCard`, etc.). New marketing modules should follow the
  same pattern — one named component per section block, not large
  inline JSX trees.
- **Single Tailwind source of truth.** Colors, spacing, accents are
  defined in `tailwind.config.ts`. Don't introduce ad-hoc hex
  colors in component files.
- **Report-page CSS lives in `src/app/report/[id]/print/print.css`.**
  The print page is read by both the customer browser view and
  puppeteer for PDF generation; CSS changes need to render
  cleanly in both contexts.
- **Foundation Fix CTA + AI Visibility Layer surfaces** should
  match the report-CTA `cta-card` styling (see
  `src/components/ReportCtaCard.tsx` and the matching CSS in
  `src/app/report/[id]/print/print.css`) so the offer reads the
  same across surfaces.

## Concrete implementation references

- **Tailwind config**: `tailwind.config.ts` — palette tokens,
  `bg-radial-orange`, `animate-pulseSoft`, `animate-floatY`.
- **Global tokens**: `src/app/globals.css` — `.btn-primary`,
  `.btn-ghost`, `.card`, `.input-field`, `.section-eyebrow`,
  `.pill`, `.muted`, `.h1` / `.h2` / `.h3`.
- **Report typography**: `src/app/report/[id]/print/print.css` —
  the print-friendly stylesheet that drives both the screen view
  and PDF render.
- **Existing reusable components**: `src/components/Header.tsx`,
  `src/components/Footer.tsx`, `src/components/OrderForm.tsx`,
  `src/components/ReportCtaCard.tsx`,
  `src/components/CategoryScoreCard.tsx`,
  `src/components/StrengthCard.tsx`, `src/components/RadarChart.tsx`.

## When to expand this doc

Today this is intentionally a stub. Expand it when:
- A real design system gets formalized (token spec, component
  inventory, motion principles documented as code).
- A new accent color or surface tier gets introduced — document the
  decision and its scope here so future contributors don't drift.
- A specific frontend regression keeps recurring — add the rule
  here so it becomes a checklist item rather than a re-litigated
  judgment call.

**Homepage graphics v2 (hero field, loop glyphs, Compare + Prove):**
- `HeroSignalField` is server-rendered SVG animated with CSS only (`motion-safe:animate-radarSweep`, `animate-signalDash`, `animate-pulseSoft`), desktop only, `aria-hidden`. It names only the four API-queried systems — never AI Overviews.
- `LoopGlyph` strokes draw from the existing loop scroll progress; `CompareCharts` (line chart with a labelled 40–70 axis, presence bars) and `ProveSnapshot` (before/after snapshot, scan line, "Verified · newly observed") animate once on view.
- Under reduced motion every graphic renders in its final state. Every graphic built from example data carries the Example data badge; chart values also exist as accessible text.
