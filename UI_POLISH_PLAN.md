# GeoViz — UI Polish Plan

> Visual audit of the four highest-traffic customer surfaces, with a
> ranked polish plan to shift GeoViz from "polished startup" toward
> **dark data terminal meets premium intelligence report.**
>
> **Source of truth:** `CLAUDE_DESIGN.md` (visual identity). The
> "avoid" list there — generic SaaS UI, excessive gradients,
> `rounded-xl` everywhere, dashboard clutter, startup illustration
> aesthetics — translates directly into the observation tags used
> below.
>
> **Scope (per user instruction):** audit only. No code changes
> accompany this PR. No audit logic, no payments, no database, no
> scoring rubric touched.
>
> **Finding tag legend:**
> - **GENERIC** — feels like default Tailwind / friendly SaaS
> - **TYPOGRAPHY** — scale, mono-gap, or hierarchy issue
> - **HIERARCHY** — competing elements; no single focal point
> - **ROUNDING** — `rounded-xl/2xl` where sharper edge is correct
> - **GRADIENT** — decorative gradient with no information weight
> - **PALETTE** — color outside the `ink-*` / `accent-*` token set
> - **DENSITY** — too much whitespace ceremony for the content weight

---

## 0. Executive summary

GeoViz today is **structurally sound but aesthetically soft**. The
component architecture is solid (modular cards, clean typography
scale, proper responsive breakpoints), and the report-specific
styling in `print.css` is sophisticated. But the overall aesthetic
drifts toward "friendly SaaS" rather than "intelligence-grade data
terminal" — over-rounded surfaces, decorative gradients, sans-serif
for data values, weak CTA hierarchy.

The gap is closeable in **three focused PRs after a shared
design-tokens prelude**. Highest leverage in priority order: (1)
rounding consolidation, (2) mono font enforcement for all data
values, (3) decorative-gradient removal. Together those three
changes account for ~70% of the visual delta to the target
aesthetic. The remaining 30% is report-surface polish (score
promotion + radar legibility + ceremony reduction) and palette
discipline (eliminate the one-off `bg-amber-300` and standardize
severity tokens).

The product is 70% of the way to where it needs to be. This doc
maps the remaining 30%.

---

## 1. Aesthetic target — "Dark data terminal meets premium intelligence report"

Three concrete reference points, in order of weight:

### 1.1 Datadog / Grafana consoles
- Dense information per viewport — content earns its space.
- Sharp edges (4–6px rounding) on data surfaces; `rounded-full`
  only on status badges.
- Mono fonts for all numbers, IDs, technical values.
- Semantic color: green = safe, amber = warning, red = critical.
  Color *informs* — it doesn't decorate.
- White space is intentional negative space, not "atmospheric air."

### 1.2 Bloomberg terminal
- Color *only* indicates status or urgency. No decorative gradients.
- Tabular data dominates; chrome recedes.
- High contrast — the data reads first, the UI second.
- Restrained palette — black/ink + 2–3 semantic accents max.

### 1.3 Stratechery / Stripe Atlas premium reports
- Premium typography hierarchy — clear h1 → h2 → h3 → caption scale.
- Generous internal padding *with tight semantic line-heights*.
- Pull-quote moments — the surface highlights what matters.
- Restrained accent use — one element per viewport carries the eye.

### What we are NOT
- ❌ Friendly-SaaS empty states with mascots and gradient blobs.
- ❌ Startup-coming-soon pulsing badges and "we just launched"
  energy.
- ❌ Notion-illustrative — hand-drawn icons, isometric 3D heroes.
- ❌ Generic Tailwind palette — `bg-emerald-400`, `text-rose-500`
  outside the defined accent slots.
- ❌ Over-rounded everything — 16px and 32px radii read as soft;
  data terminals are sharp.

---

## 2. Page-by-page critique

### 2.1 Homepage — `src/app/page.tsx`

| # | Finding | Tag | Ref |
|---|---|---|---|
| 1 | Hero pill badge `<span className="pill animate-pulseSoft">` reads "startup coming soon" — the soft pulse + bright orange dot are friendly-SaaS energy, not data-terminal | **GENERIC** | line 42 |
| 2 | Hero has two equal-weight CTAs (primary + ghost) side-by-side; neither dominates the viewport | **HIERARCHY** | lines 59–66 |
| 3 | Decorative `bg-radial-orange` + `grid-bg opacity-[0.35]` carry no information — pure atmospheric decoration | **GENERIC**, **GRADIENT** | lines 38–39 |
| 4 | `bg-radial-orange opacity-60` repeated under hero-right (line 93), under sample-report section (line 357), under pricing section (line 420) — same decorative pattern 3+ times | **GRADIENT** | lines 93, 357, 420 |
| 5 | "What is GeoViz" — 4-card grid (8 items total across both sections) renders as info dump without visual rhythm | **DENSITY**, **GENERIC** | lines 118–139 |
| 6 | "What we measure" — 8 identical `MeasureCard` items in a 2×4 grid; no hierarchy, no "this one matters most" pull | **DENSITY** | lines 228–261 |
| 7 | Pricing card `rounded-2xl` (32px) — softens the most important surface; should be sharp | **ROUNDING** | line 420 |
| 8 | Pricing card decorative blur-blob `<div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />` — friendly-SaaS flourish | **GRADIENT**, **GENERIC** | inside line 420 block |
| 9 | $97 audit card and $497 Foundation Fix card render at identical visual weight (both 5xl numbers); pricing anchor diluted | **HIERARCHY** | lines 370–410 vs 420–501 |
| 10 | Section eyebrow uppercase + tracking is consistent across the page, but the eyebrow → h2 → muted-paragraph triad is unvaried — every section uses the same beat | **TYPOGRAPHY** | every `<section>` |

### 2.2 Order page — `src/app/order/page.tsx`

| # | Finding | Tag | Ref |
|---|---|---|---|
| 1 | Generally clean — inherits OrderForm + dark-premium tokens; well-formed | (clean) | — |
| 2 | "Platforms analyzed" info box uses `rounded-xl` — minor over-rounding | **ROUNDING** | line 51 |
| 3 | URL input field sans-serif; for a technical input, mono would signal "this is a system field" | **TYPOGRAPHY** | via `<OrderForm>` |
| 4 | "Step 1 of 2" section-eyebrow is correct, but the page is single-step (it's the only step); the eyebrow promises a multi-step flow that doesn't exist | **HIERARCHY** | line 29 |

### 2.3 Foundation Fix — `src/app/foundation-fix/page.tsx` + `src/app/foundation-fix/FoundationFixForm.tsx`

| # | Finding | Tag | Ref |
|---|---|---|---|
| 1 | Form structure mirrors `/order` cleanly — design-language consistency is good | (clean) | — |
| 2 | "Audit / report ID" input uses sans-serif — the field literally captures a `cmxxxxxxx` cuid; mono would signal data-grade | **TYPOGRAPHY** | `FoundationFixForm.tsx` line 179 area |
| 3 | All form field labels render at `text-sm font-medium text-white/85` — no differentiation between user-readable fields (name, email) and technical fields (orderId) | **TYPOGRAPHY** | `FoundationFixForm.tsx` |
| 4 | Pricing strip ("$497 one-time · 3–5 business days · complex sites may require custom scoping") uses small italic — could use a tighter data-card treatment | **TYPOGRAPHY**, **DENSITY** | bottom of form |

### 2.4 Customer report — shell + body

#### `src/app/report/[id]/print/page.tsx`

| # | Finding | Tag | Ref |
|---|---|---|---|
| 1 | `ReportInFlight` state uses pulsing pill — same "startup coming soon" critique as homepage | **GENERIC** | lines 117–165 |
| 2 | `ReportFailed` state uses `bg-amber-300` — **palette violation**; not in the `ink-*` / `accent-*` token set | **PALETTE** | line 184 |
| 3 | Failed-state copy "We hit a snag generating your audit" — friendly-SaaS phrasing; should read "Audit generation encountered an error. Our team is investigating." | **GENERIC** | line 188 |
| 4 | "Contact support" button in failed state uses `btn-primary` (correct emphasis) but the "Back to homepage" `btn-ghost` next to it dilutes urgency; failed state should have ONE action | **HIERARCHY** | lines 215–222 |
| 5 | In-flight state has no visual progress indicator beyond static copy + auto-refresh; a thin animated progress bar or pulsing horizontal line would reinforce "active state" | **GENERIC** | inside ReportInFlight |
| 6 | In-flight copy ("Most audits finish within a couple of minutes") could read as "Analysis in progress. Typical completion time: 90–120 seconds." — data-terminal voice | **GENERIC** | lines 141–146 |

#### `src/components/AuditReportContent.tsx`

| # | Finding | Tag | Ref |
|---|---|---|---|
| 7 | Report hero subtitle + band-pill (lines 123–159) visually ambiguous — neither clearly primary; reader's eye wanders | **HIERARCHY** | lines 123–159 |
| 8 | `.report-meta` three-column grid reads as admin record (Date / URL / Report ID stacked left-aligned) rather than premium report header | **GENERIC**, **TYPOGRAPHY** | lines 135–159 |
| 9 | Category Breakdown intro has 4 layers of ceremony — section eyebrow, "6 dimensions scored" pill, `<h2>` heading, prose subhead — before a simple 6-bar grid | **DENSITY** | lines 195–211 |
| 10 | Strong signals / gaps / fixes block (the Executive `ExecutiveAtAGlance`) uses checkmarks + arrows + dashes but the gaps between groups are generous (~22px) — too loose for data-terminal | **DENSITY** | lines 368–435 |
| 11 | Top Strengths fallback copy "These are the strongest current signals…" reads like placeholder text, not a premium caveat | **GENERIC** | line 225 area |
| 12 | Issues/Fixes items carry FOUR separate badges per card (severity + difficulty + profile-setup + count) — visual noise | **DENSITY**, **HIERARCHY** | `ItemCard` rendering |
| 13 | Tech Appendix `<details>` summary copy "Click to expand — for your developer" is human-friendly, not data-grade — should read "Technical details (advanced)" with mono treatment | **GENERIC** | lines 329–343 |
| 14 | Markdown tables in appendix lack visual prominence — they're rendered at `0.875rem` with muted borders; data-terminal would give tables stronger contrast | **DENSITY**, **TYPOGRAPHY** | `print.css` line 1309 |

#### Score surface specifically

**`src/components/ReportScoreCard.tsx` + `print.css`**

| # | Finding | Tag | Ref |
|---|---|---|---|
| 15 | Overall score number at `font-size: 64px` — should be 72–80px to dominate the surface as the report's primary data point | **HIERARCHY**, **TYPOGRAPHY** | `print.css` line 188 |
| 16 | Score number renders in regular `font-bold` — sans-serif undermines the "data" reading; should use `ui-monospace` | **TYPOGRAPHY** | `ReportScoreCard.tsx` line 52 |
| 17 | Score `.score-card-explainer` (13px) sits between the label and the big number — pushes the number visually downward; should move BELOW the number so the score reads first | **HIERARCHY** | `print.css` line 216 |
| 18 | `.score-card` border-radius 16px — same `rounded-xl` over-softening; should be 10–12px | **ROUNDING** | `print.css` line 126 |
| 19 | Advisory line (JS-heavy site warning) wrapped in a pale background box — should use color-coded warning (orange/red) for context urgency | **PALETTE**, **HIERARCHY** | `print.css` lines 225–234 |

**`src/components/CategoryScoreCard.tsx`**

| # | Finding | Tag | Ref |
|---|---|---|---|
| 20 | Category score numbers (e.g. "14 / 25") render in sans-serif — same mono-gap as the overall score | **TYPOGRAPHY** | `CategoryScoreCard.tsx` line 41 |
| 21 | Six bars side-by-side with no "strongest domain" call-out — customer scans all 6 to extract insight; data-terminal would visually elevate the lead category | **HIERARCHY** | render path |
| 22 | `.report-section-card` (`.report-section-category-breakdown` wrapper) at 16px radius — over-softens the section | **ROUNDING** | `print.css` line 972 |

**`src/components/RadarChart.tsx`**

| # | Finding | Tag | Ref |
|---|---|---|---|
| 23 | Radar rings render at `rgba(255, 255, 255, 0.02)` — nearly invisible; data-terminal radars are slightly more visible (e.g. `0.06`–`0.08` opacity) | **HIERARCHY**, **DENSITY** | `print.css` line 604 |
| 24 | Data polygon stroke at `stroke-width: 2` — thick relative to the 320×320 viewBox; Datadog uses 1–1.5px for cleaner read | **TYPOGRAPHY** (chart-typography) | `print.css` lines 616–619 |

**`src/components/StrengthCard.tsx`**

| # | Finding | Tag | Ref |
|---|---|---|---|
| 25 | Solid execution — green checkmark + label is data-terminal-correct (compact, semantic-color, sharp) | (clean) | — |

**`src/components/ReportCtaCard.tsx`** (in-report Foundation Fix CTA)

| # | Finding | Tag | Ref |
|---|---|---|---|
| 26 | `.cta-card-accent` bar uses 3-color horizontal gradient (`#ff7a18 → #ff9a3c → #ff7a18`) — the middle softening color carries no information | **GRADIENT** | `print.css` line 1346–1347 |
| 27 | CTA card is the strongest moment in the report (the upsell) — but visual treatment doesn't elevate it above the diagnosis/action sections | **HIERARCHY** | overall |

### 2.5 Order ID + Report ID rendering across surfaces

A cross-cutting **TYPOGRAPHY** finding: order IDs and report IDs are 25-char cuids (`cmxxxxxxx…`). They appear in:

| Surface | File | Treatment | Tag |
|---|---|---|---|
| Report footer | `print.css` line ~1502 | mono ✓ | (clean) |
| Print page report-meta | `AuditReportContent.tsx` line ~157 | sans | **TYPOGRAPHY** |
| In-flight state | `print/page.tsx` line ~159 | sans uppercase | **TYPOGRAPHY** |
| Failed state | `print/page.tsx` line ~218 | sans uppercase | **TYPOGRAPHY** |
| Admin queue cards | `AdminReportCard.tsx` | mixed | **TYPOGRAPHY** |

Inconsistent. Should be **uniformly mono** wherever a customer or
operator reads a system-generated reference.

---

## 3. Cross-cutting design-token gaps

`tailwind.config.ts` + `src/app/globals.css` + `print.css` together
define the design tokens. Six concrete gaps:

### 3.1 No `font-mono` utility / no `ui-monospace` family in theme
- Currently every mono usage is one-off CSS (`print.css:1301`,
  `print.css:1502`).
- Should add: `fontFamily.mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "monospace"]` to `tailwind.config.ts`.
- Adoption surfaces: all score numbers, all order/report IDs, all
  technical inputs, code blocks in appendix.

### 3.2 No `.mono-data` utility class
- Currently no utility for "mono + tight line-height + slight
  negative letter-spacing" — the canonical data-cell treatment.
- Should add to `globals.css`: `.mono-data { font-family: ui-monospace, monospace; line-height: 1.0; letter-spacing: -0.01em; }`.
- Adoption: score values, percentages, timestamps, IDs.

### 3.3 `.card` default rounding too soft
- `globals.css:39` defaults `.card` to `rounded-xl` (16px).
- Should be `rounded-lg` (12px) for data-terminal; reserve 16px+
  for marketing surfaces specifically and even then sparingly.

### 3.4 No fine-grained sharp-edge utilities
- Tailwind's default scale is `rounded-sm` (2px) → `rounded` (4px) →
  `rounded-md` (6px) → `rounded-lg` (8px) → `rounded-xl` (12px).
- We don't currently make use of `rounded-sm` / `rounded` — the
  sharpest tier we reach for is `rounded-md`. For data tables, KV
  pairs, status pills, sharper is correct.

### 3.5 No semantic status-color tier in Tailwind config
- `print.css:1051–1090` defines CSS-only `severity-critical`,
  `severity-high`, `severity-medium`, `severity-quick` classes.
- These should also exist as Tailwind tokens so JSX can reach for
  `bg-severity-critical` / `text-severity-warning` consistently.
- Failed-state currently uses `bg-amber-300` — outside the palette.
  Standardized tokens would prevent this.

### 3.6 No dense-table / definition-list utility
- Data-terminal aesthetic depends on tight KV / table rendering.
- No `.table-dense`, `.def-list`, or similar utility.
- Each data presentation reinvents spacing locally.

---

## 4. Highest-impact visual fixes (ranked)

### Fix #1 — Consolidate rounding (impact ~40%)
- **Title**: Replace every `rounded-xl` / `rounded-2xl` with `rounded-lg` (12px); reserve `rounded-xl` only for explicit "soft" exceptions (e.g. the report-preview floating card).
- **Files involved**:
  - `src/app/globals.css:39` — `.card` default
  - `src/app/page.tsx:420` — pricing card
  - `src/app/report/[id]/print/print.css:126, 972` — `.score-card`, `.report-section-card`
  - All `rounded-xl` instances in `src/app/order/page.tsx:51`, `src/app/foundation-fix/page.tsx` (info boxes), `src/components/AdminReportCard.tsx`, `src/components/CalibrationDashboard.tsx`
- **Scope**: Single mechanical pass. Ripgrep `rounded-(xl|2xl)`, swap to `rounded-lg`. Spot-verify each swap doesn't break a hover/focus state.
- **Validation**: Visual diff — every primary surface should read sharper. The pricing card especially: from "soft" to "sharp."

### Fix #2 — Add and enforce mono font for all data values (impact ~30%)
- **Title**: Add `font-mono` token + `.mono-data` utility, then apply across all score numbers, IDs, and technical values.
- **Files involved**:
  - `tailwind.config.ts` — add `fontFamily.mono`
  - `src/app/globals.css` — add `.mono-data` utility
  - `src/components/ReportScoreCard.tsx:52` — overall score
  - `src/components/CategoryScoreCard.tsx:41` — category scores
  - `src/components/AuditReportContent.tsx` — report-meta order ID
  - `src/app/report/[id]/print/page.tsx:159, 218` — in-flight + failed-state IDs
  - `src/app/foundation-fix/FoundationFixForm.tsx` — auditOrderId input
- **Scope**: Token additions + 6–8 component touches.
- **Validation**: Score values + IDs immediately read as data. No layout shifts (mono fonts are usually wider; verify with a long score string).

### Fix #3 — Remove decorative radial gradients; replace with restrained semantic accents (impact ~20%)
- **Title**: Drop the 3 decorative `bg-radial-orange` instances; replace with thin (2px) top-border accents where a section break needs marking.
- **Files involved**:
  - `src/app/page.tsx:38, 93, 357, 420` — radial-orange instances
  - Pricing card decorative blur-blob (inside the line 420 block)
  - `src/app/order/page.tsx`, `src/app/foundation-fix/page.tsx` — similar `bg-radial-orange opacity-60` instances
- **Scope**: Remove the divs; optionally replace with a single 1–2px top border in `accent` color for one section to mark "this is the inflection."
- **Validation**: Hero and pricing surfaces should feel "tighter" without losing identifiability.

### Fix #4 — Promote the overall score card (impact ~15%)
- **Title**: Bump score number to 80px, move explainer text below the number (not beside), enforce tone-class always applied.
- **Files involved**:
  - `src/app/report/[id]/print/print.css:188, 216` — `.score-card-overall-num`, `.score-card-explainer`
  - `src/components/ReportScoreCard.tsx` — re-order JSX so the explainer renders after the number
- **Scope**: CSS bump + JSX reorder. Apply `.mono-data` from Fix #2 here.
- **Validation**: The score is the first visual hit on the report page. Reader's eye should land on it within 200ms.

### Fix #5 — Standardize severity / status tokens (impact ~10%)
- **Title**: Define `severity-critical` / `severity-warning` / `severity-info` tokens in `tailwind.config.ts`; eliminate one-off `bg-amber-300` etc.
- **Files involved**:
  - `tailwind.config.ts` — extend colors with `severity` group
  - `src/app/report/[id]/print/page.tsx:184` — failed-state pill swaps `bg-amber-300` for `bg-severity-warning`
  - `src/components/AuditReportContent.tsx` — issue/fix badges adopt tokens
- **Scope**: Token definitions + grep-and-replace.
- **Validation**: Every warning state in the product uses the same color. No `bg-amber-*` / `text-rose-*` / `border-emerald-*` outside the defined accent slots.

---

## 5. Report-specific intelligence-grade polish

The customer report is the **post-purchase showcase surface** —
where customers form their lasting impression of "is this a real
intelligence product?" Six focused improvements:

### 5.1 Score-card promotion
Already detailed as Fix #4. Critical for the report's gravity.

### 5.2 Radar chart legibility
- Ring opacity: `rgba(255, 255, 255, 0.02)` → `rgba(255, 255, 255, 0.07)` so they read.
- Data polygon stroke: `stroke-width: 2` → `stroke-width: 1.25` for cleaner perimeter.
- Vertex labels (`.radar-chart-label`): apply `.mono-data` for axis-text feel.
- File: `src/app/report/[id]/print/print.css` lines 604, 616–619.

### 5.3 Category breakdown ceremony reduction
Currently 4 layers before the 6-bar grid (eyebrow + pill + h2 + prose).
Collapse to 2: eyebrow + h2. Pill ("6 dimensions scored") becomes a
subtle right-aligned data label on the section title row. Prose
subhead drops.
- File: `src/components/AuditReportContent.tsx` lines 195–211.

### 5.4 Issues/Fixes badge consolidation
Each issue/fix card carries 4 badges (severity + difficulty + profile + count).
Collapse to 1 compact row at the bottom of the card: `[severity-icon] · [difficulty-icon] · [count]` — mono, single-line, no separators-by-pill.
- File: `src/components/AuditReportContent.tsx` `ItemCard` + `print.css:1043+`.

### 5.5 Strong signals / gaps / fixes block densification
The `ExecutiveAtAGlance` three-group block (lines 368–435) uses 22px gaps between groups. Tighten to 12px. Use smaller body text (13px) so density increases. Add small mono-formatted count chips (e.g., `[3 found]`) per group.
- File: `src/components/AuditReportContent.tsx` lines 368–435 + `print.css` block.

### 5.6 Tech Appendix data-terminal treatment
- `<details>` summary copy "Click to expand — for your developer" → "Technical details (advanced)" in mono, no parenthetical.
- Code blocks: already use `ui-monospace`, but background contrast (`rgba(0,0,0,0.4)`) could go to `rgba(0,0,0,0.55)` for stronger separation.
- Tables: bump from `0.875rem` to a styled `.table-dense` utility with stronger row separators.
- Files: `src/components/AuditReportContent.tsx:329–343`, `src/app/report/[id]/print/print.css:1211–1325`.

---

## 6. Explicitly out of scope

Per user instruction:
- ❌ No audit logic changes.
- ❌ No payments / Stripe / checkout changes.
- ❌ No database / Prisma changes.
- ❌ No scoring rubric (Scoring Freeze).
- ❌ No worker prompt.
- ❌ No new pages or routes.
- ❌ No new components beyond what existing files need.
- ❌ No marketing-copy edits (PR #17 territory).

---

## 7. Sequencing recommendation (follow-up PRs)

Tokens first means every later PR pulls from a coherent system
instead of one-off hex values. Suggested order:

| PR | Title | Scope | ETA |
|---|---|---|---|
| A | Design tokens prelude | Add `fontFamily.mono`, `.mono-data`, `severity-*` colors to `tailwind.config.ts` + `globals.css`. Zero behavior change. | 30min |
| B | Rounding consolidation | Fix #1 — mechanical `rounded-xl` → `rounded-lg` sweep. | 1h |
| C | Mono-font enforcement | Fix #2 — apply mono to scores, IDs, technical values across 6–8 files. | 1.5h |
| D | Score-card promotion + radar legibility | Fix #4 + section 5.2. Focused report-surface polish. | 1.5h |
| E | Gradient removal + palette violation fixes | Fix #3 + Fix #5 + section 5.6. Final intelligence-grade polish. | 2h |

Total estimated effort: ~6.5 hours across 5 narrow PRs. Each PR
should be visually screenshot-able before/after for review.

---

## 8. Verification (this PR specifically)

This PR's verification is doc-only:

1. Re-read `UI_POLISH_PLAN.md` end-to-end after writing — confirm all 4 page sections present.
2. Spot-check via grep that each of the 7 tag types (GENERIC / TYPOGRAPHY / HIERARCHY / ROUNDING / GRADIENT / PALETTE / DENSITY) appears at least once.
3. Spot-check that every file path referenced exists.
4. Confirm the doc references `CLAUDE_DESIGN.md` as source of truth.
5. No code change → no lint / typecheck / build needed.

---

> End of plan. Generated against `main` branch state post-PR #23
> (Phase 1 LAUNCH BLOCKER fixes). Cross-references:
> `CLAUDE_DESIGN.md` for visual identity, `PHASE_1_HARDENING_PLAN.md`
> for non-visual launch work, `SYSTEM_AUDIT.md` for full system
> snapshot.
