/* eslint-disable no-console */
/**
 * GEO audit worker — processes ONE queued job per invocation, with
 * full execution logging and a hard guarantee that every code path
 * writes a final status back to the database.
 *
 * Reliability contract:
 *   - 120-second hard timeout — if the wrapper runs longer it's killed
 *     and the row is marked failed with reason "timeout".
 *   - Every stdout / stderr chunk is logged with size + preview.
 *   - Every successful path writes reportStatus = "generated" + markdown.
 *   - Every failure path writes reportStatus = "failed" + reportError.
 *   - Even an unexpected exception in the worker still attempts to mark
 *     the claimed row as failed before exiting (try/finally guard).
 *   - Every log line is also appended to tmp/geo-worker.log.
 *
 * Run with:
 *   npm run geo-worker          # one-shot (process one job, exit)
 *   npm run geo-worker:dev      # loop mode (poll forever)
 *
 * Loop mode flag (any of these enables it):
 *   - --loop on argv
 *   - GEO_WORKER_LOOP=true in env
 *
 * Loop mode is intended for long-running hosts: Railway service start
 * command, a local dev terminal, etc. Handles SIGINT / SIGTERM cleanly:
 * finishes the current job, disconnects Prisma, exits 0.
 *
 * Exit codes:
 *   0  graceful — single-shot processed / queue empty / loop received SIGINT
 *   1  fatal startup error (DATABASE_URL missing, wrapper script absent, etc.)
 */
import "dotenv/config";

import { spawn, spawnSync } from "node:child_process";
import {
  accessSync,
  appendFileSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
} from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import { getDbFingerprint } from "../src/lib/db-fingerprint";

const TIMEOUT_MS = Number(process.env.GEO_WORKER_TIMEOUT_MS ?? 300_000); // 5 min hard cap
const POLL_MS = Number(process.env.GEO_WORKER_POLL_MS ?? 12_000); // loop-mode poll cadence
const LOOP_MODE =
  process.env.GEO_WORKER_LOOP === "true" || process.argv.includes("--loop");
// "api"  (production default — direct Anthropic SDK call, full 6-section audit)
// "fast" (API call with abbreviated prompt — summary + quick wins + score only,
//         target <60s)
// "cli"  (dev fallback — spawns scripts/run-geo-audit.sh; requires Claude CLI)
//
// Env-parse is whitespace- and case-insensitive so a value like " API " or
// "api\r" (which can happen with copy/pasted values in some hosts) still
// resolves to "api". Empty / unset → defaults to "api".
const AUDIT_MODE =
  (process.env.GEO_AUDIT_MODE ?? "").trim().toLowerCase() || "api";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
// Hard default 8000 even if the env var is set to a malformed value.
const ANTHROPIC_MAX_TOKENS = (() => {
  const raw = Number(process.env.ANTHROPIC_MAX_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : 8_000;
})();
// Warn (don't fail) when a single audit takes longer than this. Helps spot
// trends before they hit the hard timeout.
const SLOW_WARN_MS = Number(process.env.GEO_WORKER_SLOW_WARN_MS ?? 90_000);
const SCRIPT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "run-geo-audit.sh",
);
const LOG_FILE = path.resolve(process.cwd(), "tmp", "geo-worker.log");

// ---- logging ----
mkdirSync(path.dirname(LOG_FILE), { recursive: true });

function ts(): string {
  return new Date().toISOString();
}

function appendLog(line: string): void {
  try {
    appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // best-effort — never fail the worker for a logging issue
  }
}

function log(...args: unknown[]): void {
  const message = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ");
  const line = `[${ts()}] ${message}`;
  console.log(line);
  appendLog(line);
}

function logErr(...args: unknown[]): void {
  const message = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ");
  const line = `[${ts()}] ERROR ${message}`;
  console.error(line);
  appendLog(line);
}

// ---- wrapper execution ----

type WrapperResult =
  | { ok: true; markdown: string; exitCode: number; stderr: string; elapsedMs: number }
  | {
      ok: false;
      reason: "spawn-failed" | "timeout" | "non-zero-exit" | "empty-output";
      error: string;
      stderr: string;
      exitCode: number | null;
      elapsedMs: number;
    };

// ---- audit mode dispatcher ----
function runAudit(
  websiteUrl: string,
  competitorUrl: string | null,
): Promise<WrapperResult> {
  if (AUDIT_MODE === "cli") return runWrapperCli(websiteUrl, competitorUrl);
  return runViaApi(websiteUrl, competitorUrl, { fast: AUDIT_MODE === "fast" });
}

// ---- API mode (production default) ----
//
// Direct call to the Anthropic Messages API with the web_search tool
// enabled so the model can fetch the target page, robots.txt, sitemap.xml,
// and llms.txt itself. Returns the assistant's text content as the
// markdown report. NEVER fabricates findings — every claim must come
// from a search the model performed during this single call.
function buildAuditPrompt(
  websiteUrl: string,
  competitorUrl: string | null,
  options: { fast?: boolean } = {},
): string {
  const competitorClause = competitorUrl
    ? `\n**Competitor URL** (compare against this): ${competitorUrl}\n`
    : "\n**Competitor URL**: (none provided)\n";

  if (options.fast) {
    // Fast mode — sections 1-5 only (no Tech Details). Target <60s.
    return `You are a senior digital visibility consultant — not an SEO technician.
You are writing for a local business owner who paid for this audit.
They want to know what is broken, why it costs them leads, and what to
fix first. They are NOT a developer.

**Target URL**: ${websiteUrl}${competitorClause}
**AI visibility** = whether AI tools (ChatGPT, Claude, Perplexity,
Gemini, Google AI Overviews) can confidently understand, trust,
and recommend the business when a local customer asks "who
should I hire near me?" This phrase — *AI visibility* — is the
front-of-house framing throughout the customer-facing report
(sections 1–5). Avoid "GEO", "Generative Engine Optimization",
"machine readability" in customer-facing prose; those terms can
appear in section 6 (Technical Details) only.

**Web access — minimal.** Fetch ONLY:
  1. The target homepage
  2. /robots.txt
Do NOT crawl. Do NOT fabricate findings — every claim must come from
one of those fetches.

**Output budget: 350–550 words.** Markdown only. No preamble, no
closing remarks. The customer-facing report is an executive
audit — terse, scannable, no novel-length explanations.

**Language rules — STRICT.** You are writing for a roofer, an HVAC
owner, a contractor, a dentist. They have NEVER heard of "schema",
"crawlers", "entity signals", or "structured data". Talk to them
like their smart friend, not their developer.
- Plain English only. Short sentences. No SEO jargon.
- BAD: "AI crawler readiness is low because GPTBot is disallowed."
  GOOD: "ChatGPT can't read your site, so it has nothing to recommend
  when customers ask."
- BAD: "Schema markup is missing."
  GOOD: "AI tools can't tell what your business does or where you
  serve, so you get skipped."
- Every issue must answer three things, in plain words: WHAT'S
  WRONG · WHY IT MATTERS (lost jobs / missed calls) · WHAT HAPPENS
  IF FIXED.
- **No repeat explanations.** Each per-category "why" line in the
  score breakdown must point at a DIFFERENT specific finding (e.g.
  "no LocalBusiness JSON-LD on the homepage" for Schema vs "no FAQ
  section, no pricing ranges" for Content Depth). Vague boilerplate
  like "this could be improved" is unacceptable — name the evidence.
- **Vary the consequence framing across sections.** When the same
  root issue (e.g. no schema) shows up in Sections 1, 2, and 3,
  frame the consequence DIFFERENTLY each time — visibility →
  trust → revenue → fix path. Recurring phrases like "this could
  cost you customers", "AI tools can't find you", "missing schema
  markup" should appear ONCE across the whole report, not in
  every paragraph.
- **Kitchen-table test.** Every customer-facing sentence must
  pass this self-check: would a roofer, dentist, or contractor
  reading this across the kitchen table understand it on the
  first read, without a developer? If not, rewrite it. If you
  must use a technical term in sections 1–5, define it once in
  plain English on the same line.
- No fabricated traffic numbers. No score promises.

**Never omit the "GEO Foundation Fix" section.** It is mandatory.
Paste it verbatim from the template below as section 5 — do not
paraphrase, do not change wording, do not change pricing, do not
drop bullets.

**Scoring rubric — REQUIRED.** Score each category from the evidence
you actually fetched. The total MUST equal the sum of the six
category scores (no rounding, no fudging). Do NOT default to a
preset score (e.g. 28/100) — every score must be tied to specific
findings on this site. Score conservatively when evidence is
missing and explain why in the relevant report section.

**Evidence rule.** Every sub-check below must be tied to something
you actually saw on the homepage / robots.txt / llms.txt fetches.
If you can't point to evidence, the sub-check fails — score it
conservatively and say "no evidence found" in the report.

**Calibration v2 — explicit ladder anchors with partial credit.**
Each category uses a 0-to-max ladder of named rungs. Find the rung
the site genuinely sits on and award the rung's points. Partial
credit BETWEEN rungs is allowed (e.g. 11/25 if the site is between
"basic readable HTML" and "decent JSON-LD"). The intent is to use
the FULL range — do NOT cluster at the bottom because no schema
markup exists. A small business with clear HTML identity, working
site, and visible reviews is mid-tier, not "At Risk."

Floors / ceilings remain only for fatal gaps: noindex on a
customer-facing page, citation bots blocked, marketing-only
homepage with no real content.

  - Structured Data / Schema (a.k.a. "Business Info AI Can Read"): 0–25
    This category was over-suppressing every small-business site by
    requiring schema markup to clear mid-tier. v2.1 rebalance: a
    site that's clearly understandable to a human reader IS
    understandable to AI — schema unlocks the upper bands but is NOT
    required for mid-tier credit.

    Ladder (use partial credit between rungs; do NOT clamp to 0):

      0–3  : Broken, inaccessible, OR no clear business identity at
             all (page won't render, completely empty, parked domain,
             obvious spam).
      4–7  : Minimal — only a business name is visible, no clear
             services / no contact / no location info anywhere on
             the page.
      8–12 : **Default rung for any working small-business site.**
             The page makes the business reasonably clear to a
             reader: business name AND at least one of {what they
             do (clear service name) / phone / city or service
             area / address}. Clean HTML is enough — JSON-LD NOT
             required to earn this band. Most local operators
             without dev resources should land HERE, not at 4.
      13–17: Strong human-readable structure. The page has a clear
             service/location hierarchy: multiple service pages
             AND/OR named service-area pages, crawlable nav between
             them, consistent brand name across pages, an /about or
             /contact page reachable from the homepage. Still no
             JSON-LD required. **A site with 3+ distinct service
             pages, an about page, AND a clear contact section
             belongs at 15–17, not at 12.** When the entity comes
             through clearly across multiple pages — even without
             markup — that IS strong structure.
      18–22: Machine-readable structure. Earned by EITHER path:
             (a) JSON-LD schema is present — Organization,
                 LocalBusiness, or Service, even partial. Treat
                 LocalBusiness with at least name + telephone +
                 address as 19; full LocalBusiness + areaServed +
                 hours as 21.
             (b) Strong semantic HTML5 layout WITHOUT JSON-LD —
                 the page uses <address> for NAP, ContactPoint
                 markup, rich Open Graph (og:title / og:type /
                 og:locale + og:image), well-structured headings
                 naming the entity, AND the site shows entity
                 coherence (LocalBusiness + about-page + service
                 hierarchy + FAQ section all reinforcing the same
                 business). This path matters — many genuinely
                 strong local operators have polished semantic HTML
                 but no schema. They belong at 18–20, not capped at
                 17.
      23–25: Elite — full LocalBusiness or Service JSON-LD
             (industry subtype like Plumber/Dentist/Roofer/
             HVACBusiness preferred) WITH AggregateRating + FAQPage
             schema AND sameAs links to GBP/BBB/Yelp/Facebook AND
             the human-readable structure already at 17. Genuinely
             rare and stays hard to earn — but when all five
             signals line up, do not under-award.

    Reward partial credit for each of: clear business name, visible
    services, visible phone/contact, clear city or service area,
    crawlable navigation, service/location page structure, consistent
    brand/entity naming. Each adds confidence — accumulating five or
    six of those signals on a clean HTML site is exactly what 8–12
    is for.

    **Structural Synergy Bonus (NEW — only fires when the site is
    genuinely structured).** When ALL of the following are true,
    add up to +3 to the Schema score (capped at 25 still):
      • Content score ≥ 12 (multiple deep service pages + FAQ)
      • Brand score ≥ 8 (consistent entity naming, clear identity)
      • Tech score ≥ 7 (clean meta + sitemap + reachable)
      • Crawler score ≥ 15 (citation bots reachable + sitemap)
      • At least ONE of: LocalBusiness JSON-LD (any), strong
        semantic HTML5 layout (<address>, ContactPoint), sameAs
        links to authoritative profiles
    This bonus rewards entity coherence — the site, the schema,
    the about page, the service hierarchy, and the FAQ all point to
    the same business. It will NEVER fire for a weak site because
    Content + Brand + Tech + Crawler must already be strong before
    the bonus engages. Genuinely elite sites can clear 80+; weak
    sites cannot.

  - AI Crawler Readiness: 0–20
    Ladder:
      0  : everything blocked OR fatal "User-agent: * / Disallow: /"
      4  : most citation bots blocked / unclear robots.txt
      8  : 2–3 citation bots reachable, no sitemap, no llms.txt
      12 : all 5 citation bots reachable (OAI-SearchBot, ClaudeBot,
           PerplexityBot, Bingbot, Google-Extended)
      15 : above + sitemap.xml referenced from robots.txt + key
           pages reachable from homepage (no JS-only nav)
      18 : above + structured /llms.txt (H1 + blockquote + H2 sections)
      20 : elite — full llms.txt suite + AI Discovery hints
    Note: training-only bots (GPTBot, anthropic-ai, CCBot,
    Bytespider) may be blocked — does NOT lower this score.
    Note: missing llms.txt is NOT a ceiling. A site with citation
    bots reachable + sitemap + crawlable can reach 15/20 — that's
    "well-prepared without bleeding-edge."

  - Local Trust Signals: 0–20  (stricter — no inflation)
    Ladder. Each "signal" must be visible on the homepage or a
    one-click-away page; mention without supporting evidence does
    NOT count. Be evidence-based, not generous.
      0  : zero visible trust signals
      4  : ONE clear signal (e.g. "4.8 stars" alone, OR years in
           business stated, OR a license number)
      8  : TWO signals (reviews + years, or license + warranty)
      12 : THREE signals (reviews + years + license, etc.)
      16 : FOUR or more signals AND NAP consistency across pages
      20 : elite — five+ signals INCLUDING verifiable third-party
           proof (BBB rating page, Google reviews count visible)
    Demote 2 pts for NAP mismatches (different phone numbers,
    inconsistent business name). A bare "5 stars" claim with no
    count or third-party source is worth +2, not +5.

  - Content Depth + FAQ Quality: 0–15
    Ladder:
      0  : no real content — error / parked / spam
      3  : marketing-only homepage, no separate service content
      6  : 1–2 thin service pages, no FAQ
      9  : 2+ service pages with real depth (>250 words each,
           sub-headings) — OR — clear FAQ with answers (one or
           the other)
      12 : 2+ deep service pages AND FAQ section AND pricing /
           service-expectation clarity ("starts at $X", "free
           estimate", "typical 1–3 days")
      15 : elite — all of the above + concrete numbers (turnaround,
           warranty years, projects completed) + before/after proof
           or case studies + location-specific landing pages
    Bonus: real FAQPage schema markup that machines can extract
    cleanly → +2 (already partially captured in Schema, but
    double-rewarded here for content depth).

  - Brand / Entity Clarity: 0–10
    Ladder:
      0  : confusing — multiple businesses, no clear identity
      2  : bare business name visible, nothing else
      4  : name + phone visible
      6  : name + phone + service area + one-sentence what-we-do
      8  : above + consistent across header/footer/title/schema
      10 : elite — all above + clear /about + no conflicting claims
           (no "30 years" alongside "Established 2018")
    Demote 2 pts for any conflicting claim (years, founder, location).

  - Technical Accessibility: 0–10
    Ladder:
      0  : home page broken (5xx) OR noindex on customer-facing pages
      2  : loads but missing title/meta description, no h1
      4  : basic — title + meta description + single h1 + reachable
      6  : above + sitemap referenced from robots.txt
      8  : above + mobile viewport tag + no broken homepage links +
           reasonable page weight
      10 : elite — all hygiene + structured headings + accessible
           markup + fast (<2s LCP)

  **Bonus multipliers — push strong implementations into the
  upper bands.** Award after summing the six categories. Cap at 100.
    +2  : entire site has consistent semantic heading hierarchy
          (single h1 per page, ordered h2/h3, no skipped levels)
    +2  : visible internal linking between service / location /
          about / contact pages — a clear site graph
    +2  : evidence the site renders without JavaScript (server-
          rendered HTML, content visible in initial response)
    +2  : multi-language signals (lang attribute, hreflang) — only
          when relevant for the business's audience
    +2  : real visible expertise (named professionals with bios,
          dated case studies, recent project photos with locations)
  These bonuses can lift a strong site from 70 → 78 — exactly the
  spread the rubric should produce when implementation is genuinely
  excellent.

**Score bands — MANDATORY.** After summing the six category
scores, classify the overall and explain WHY in the report:

  • 0–25  → "Invisible"   — essentially absent from AI search.
  • 26–45 → "At Risk"     — foundational signals missing.
  • 46–65 → "Needs Work"  — partial visibility, real gaps.
  • 66–80 → "Competitive" — solid foundation, room for polish.
  • 81–100 → "AI-Ready"   — fully optimized for AI citation.

**Calibration v1 targets — natural distribution across bands:**
  • SPAMMY / abandoned (broken site, no real content,
    blocked crawlers, no contact info)                   → **0–25 Invisible**.
  • WEAK (basic site, almost no trust signals,
    blocked or unclear crawler access)                   → **20–40 At Risk**.
  • AVERAGE small biz (some reviews, basic content,
    no schema or llms.txt, citation bots OK)             → **40–60 Needs Work**.
  • STRONG local operator (LocalBusiness schema,
    several trust pillars, FAQ, multiple service pages)  → **60–75 Competitive**.
  • ELITE (full schema with reviews + FAQ + sameAs,
    llms.txt, deep content, all signals present)         → **80+ AI-Ready**.

  Real-world separation rules:
  • A legitimate small business with visible contact info, some
    reviews, and a working site should NOT score below 40 just
    because they lack schema/llms.txt. Trust + clarity + tech
    contribute meaningfully.
  • A site with strong real-world fundamentals (reviews, license,
    warranty, named service area, working site) should land at
    50+ even with zero AI-specific signals.
  • An 81+ AI-Ready score still must be earned across ALL six
    categories — don't inflate.
  • Anti-clustering: do NOT default to a familiar number. If two
    different sites land within 3 points of each other, recheck
    each sub-check independently — variance is a feature.

# GEO Visibility Report

**Site:** ${websiteUrl}  ·  **Generated:** <today, plain English>

## 1. AI Visibility Score
**Overall Score: <N>/100 — <Band>** (Band ∈ Invisible / At Risk /
Needs Work / Competitive / AI-Ready, picked from the band rules above)

Breakdown (every line MUST end with a one-sentence plain-English
WHY tied to a specific finding from the page — name the actual
evidence, not the rubric anchor; no jargon; do NOT repeat the same
explanation across two lines):

- Structured Data / Schema: <n>/25 — <why, plain English, evidence-based>
- AI Crawler Readiness: <n>/20 — <why>
- Local Trust Signals: <n>/20 — <why>
- Content Depth + FAQ Quality: <n>/15 — <why>
- Brand / Entity Clarity: <n>/10 — <why>
- Technical Accessibility: <n>/10 — <why>

**Why this band:** 2–3 plain-English sentences naming the specific
findings that pushed the score into this band — what's working,
what's missing, what the customer outcome is. NO jargon. Tie at
least one sentence to lost calls / missed jobs / customers picking
competitors.

**Score reasoning (internal — keep brief):**
- *Biggest positive contributors:* 2–3 short bullets naming the
  sub-checks that earned the most points (e.g. "Strong reviews
  visible (+5 trust)", "Citation bots reachable (+10 crawler)").
- *Biggest negative contributors:* 2–3 short bullets naming the
  sub-checks that cost the most points (e.g. "No LocalBusiness
  JSON-LD (–10 schema)", "Thin service pages (–4 content)").

This reasoning block is intentionally short and concrete — it's how
the audit explains the scoring math to the customer (and to us
during calibration) without listing every single sub-check.

## 2. Top 3 Issues
Top 3 issues only. Numbered. For each, render the **EXACT** three
labeled fields below — Problem / Impact / Fix — each on its own
line. NO long paragraphs. NO additional fields. The renderer
parses these labels into a clean grid.

### {N}. {Plain-English headline — one short line, no jargon}
- **Problem** — one sentence on what's wrong, anyone can understand.
- **Impact** — one sentence in lost jobs / missed calls / customers
  picking a competitor instead.
- **Fix** — one sentence preview of the corrective action (the
  detailed fix lives in section 3).

## 3. Top 3 Fixes
Top 3 fixes only. Numbered. Render each as a tight implementation
checklist — short, scannable, NO dense paragraphs. Use **EXACTLY**
these six labeled fields per fix, in this order, each on its own
line. The renderer parses these labels into a clean grid + chips;
do not collapse fields, do not invent extra labels.

### {N}. {Fix name — one short, plain-English imperative line}
- **Priority** — one of: Critical / High / Medium / Quick Win
- **Difficulty** — one of: Easy / Moderate / Technical
- **Can GeoViz Foundation Fix handle this?** — Yes or No (one
  word). Yes when the fix involves schema, llms.txt, robots.txt,
  metadata, FAQ structure, or service-page setup. No when it
  requires creative work the customer must own (writing reviews,
  earning a license, photographing projects).
- **Problem** — one sentence on what's broken right now.
- **Impact** — one sentence on what it costs the business in leads /
  calls / customers won.
- **Fix** — one or two sentences, max, on the concrete action — what
  to install, what to write, what to update. Plain words.

Voice rules for sections 2 and 3:
- No repeated phrasing across items. Each Problem/Impact/Fix line
  must point at a DIFFERENT specific finding.
- Preserve factual audit findings. Do not invent claims about
  traffic, rankings, or lead volume.
- Every line passes the kitchen-table test.

## 4. Business Impact
Write 2–3 short sentences. NO long paragraphs. Frame the outcome:
when AI search systems can read the site clearly, the business
wins more inbound calls and fewer customers go to competitors.

Required wording rules:
- NO arithmetic, NO score math, NO "= N/100".
- NO dramatic phrasing like "your 70-year reputation is invisible".
- Keep it grounded. Target tone: "When your website clearly
  explains who you are, where you work, and why customers trust
  you, AI tools have more reasons to recommend your business
  instead of skipping over it."

**If — AND ONLY IF — the audit found strong real-world trust
signals (decades in business, large review counts, licenses,
warranty, named service area) but weak technical signals (no
schema, no llms.txt, thin content), include this exact sentence:**

  "Your real-world reputation is stronger than your website signals.
  The fix is making that trust easier for Google and AI tools to
  understand."

Do NOT include that sentence when the evidence does not support it.

End the section with this verbatim note on its own line:

> Scores may vary slightly as pages, crawlability, and available
> signals change.

---

## 5. GEO Foundation Fix

Paste this section EXACTLY as written below. Do not paraphrase. Do
not modify pricing. Do not drop bullets:

### Want GeoViz to fix this for you?

We&rsquo;ll handle the technical updates found in this report so AI
tools can better understand and recommend your business.

**Investment:** $497 one-time
**Timeline:** 3–5 business days

Reply to this email or click the link below to request your fix.

---

End immediately after the closing horizontal rule. No closing summary.`;
  }

  return `You are a senior digital visibility consultant — not an SEO technician.
You are writing for a local business owner who paid for this audit.
They want to know what is broken, why it costs them leads, and what to
fix first. They are NOT a developer.

**Target URL**: ${websiteUrl}${competitorClause}
**AI visibility** = whether AI tools (ChatGPT, Claude, Perplexity,
Gemini, Google AI Overviews) can confidently understand, trust,
and recommend the business when a local customer asks "who
should I hire near me?" This phrase — *AI visibility* — is the
front-of-house framing throughout the customer-facing report
(sections 1–5). Avoid "GEO", "Generative Engine Optimization",
"machine readability" in customer-facing prose; those terms can
appear in section 6 (Technical Details) only.

**Web access — use sparingly.** Fetch ONLY:
  1. The target homepage
  2. /robots.txt
  3. /llms.txt (note if 404)
  4. The competitor homepage if provided
Do NOT crawl. Do NOT fabricate findings — every claim must trace to
one of those fetches.

**Output budget: 600–900 words total** (sections 1–5 budgeted ~500
words; section 6 Technical Appendix budgeted ~300 words). Markdown
only. No preamble, no closing remarks. The customer-facing report
is an executive audit — terse, scannable, no novel-length
explanations.

**Language rules — STRICT.** You are writing for a roofer, an HVAC
owner, a contractor, a dentist. They have NEVER heard of "schema",
"crawlers", "entity signals", or "structured data". Talk to them
like their smart friend, not their developer.
- Plain English only. Short sentences. No SEO jargon.
- BAD: "AI crawler readiness is low because GPTBot is disallowed."
  GOOD: "ChatGPT can't read your site, so it has nothing to recommend
  when customers ask."
- BAD: "Schema markup is missing."
  GOOD: "AI tools can't tell what your business does or where you
  serve, so you get skipped."
- Every issue must answer three things, in plain words: WHAT'S
  WRONG · WHY IT MATTERS (lost jobs / missed calls) · WHAT HAPPENS
  IF FIXED.
- **No repeat explanations.** Each per-category "why" line in the
  score breakdown must point at a DIFFERENT specific finding (e.g.
  "no LocalBusiness JSON-LD on the homepage" for Schema vs "no FAQ
  section, no pricing ranges" for Content Depth). Vague boilerplate
  like "this could be improved" is unacceptable — name the evidence.
- **Vary the consequence framing across sections.** When the same
  root issue (e.g. no schema) shows up in Sections 1, 2, and 3,
  frame the consequence DIFFERENTLY each time — visibility →
  trust → revenue → fix path. Recurring phrases like "this could
  cost you customers", "AI tools can't find you", "missing schema
  markup" should appear ONCE across the whole report, not in
  every paragraph.
- **Kitchen-table test.** Every customer-facing sentence must
  pass this self-check: would a roofer, dentist, or contractor
  reading this across the kitchen table understand it on the
  first read, without a developer? If not, rewrite it. If you
  must use a technical term in sections 1–5, define it once in
  plain English on the same line.
- No long paragraphs. Punchy and actionable.
- No repeating the same issue across sections.
- No fabricated traffic numbers. No score promises.
- **Never omit the "GEO Foundation Fix" section.** It is mandatory.
  Paste it verbatim from the template below as section 5 — do not
  paraphrase, do not change wording, do not change pricing, do not
  drop bullets.

Technical terms ("schema", "robots.txt", "llms.txt") may appear in
the collapsed Section 6 (Technical Details), where the audience is
the developer. Keep sections 1–5 jargon-free.

**Scoring rubric — REQUIRED.** Score each category from the evidence
you actually fetched. The overall score MUST equal the sum of the
six category scores (no rounding, no fudging). Do NOT default to a
preset score (e.g. 28/100) — every score must be tied to specific
findings on this site. Score conservatively when evidence is
missing and explain why in the relevant report section.

**Evidence rule.** Every sub-check below must be tied to something
you actually saw on the homepage / robots.txt / llms.txt fetches.
If you can't point to evidence, the sub-check fails — score it
conservatively and say "no evidence found" in the report.

**Calibration v2 — explicit ladder anchors with partial credit.**
Each category uses a 0-to-max ladder of named rungs. Find the rung
the site genuinely sits on and award the rung's points. Partial
credit BETWEEN rungs is allowed (e.g. 11/25 if the site is between
"basic readable HTML" and "decent JSON-LD"). The intent is to use
the FULL range — do NOT cluster at the bottom because no schema
markup exists. A small business with clear HTML identity, working
site, and visible reviews is mid-tier, not "At Risk."

Floors / ceilings remain only for fatal gaps: noindex on a
customer-facing page, citation bots blocked, marketing-only
homepage with no real content.

  - Structured Data / Schema (a.k.a. "Business Info AI Can Read"): 0–25
    This category was over-suppressing every small-business site by
    requiring schema markup to clear mid-tier. v2.1 rebalance: a
    site that's clearly understandable to a human reader IS
    understandable to AI — schema unlocks the upper bands but is NOT
    required for mid-tier credit.

    Ladder (use partial credit between rungs; do NOT clamp to 0):

      0–3  : Broken, inaccessible, OR no clear business identity at
             all (page won't render, completely empty, parked domain,
             obvious spam).
      4–7  : Minimal — only a business name is visible, no clear
             services / no contact / no location info anywhere on
             the page.
      8–12 : **Default rung for any working small-business site.**
             The page makes the business reasonably clear to a
             reader: business name AND at least one of {what they
             do (clear service name) / phone / city or service
             area / address}. Clean HTML is enough — JSON-LD NOT
             required to earn this band. Most local operators
             without dev resources should land HERE, not at 4.
      13–17: Strong human-readable structure. The page has a clear
             service/location hierarchy: multiple service pages
             AND/OR named service-area pages, crawlable nav between
             them, consistent brand name across pages, an /about or
             /contact page reachable from the homepage. Still no
             JSON-LD required. **A site with 3+ distinct service
             pages, an about page, AND a clear contact section
             belongs at 15–17, not at 12.** When the entity comes
             through clearly across multiple pages — even without
             markup — that IS strong structure.
      18–22: Machine-readable structure. Earned by EITHER path:
             (a) JSON-LD schema is present — Organization,
                 LocalBusiness, or Service, even partial. Treat
                 LocalBusiness with at least name + telephone +
                 address as 19; full LocalBusiness + areaServed +
                 hours as 21.
             (b) Strong semantic HTML5 layout WITHOUT JSON-LD —
                 the page uses <address> for NAP, ContactPoint
                 markup, rich Open Graph (og:title / og:type /
                 og:locale + og:image), well-structured headings
                 naming the entity, AND the site shows entity
                 coherence (LocalBusiness + about-page + service
                 hierarchy + FAQ section all reinforcing the same
                 business). This path matters — many genuinely
                 strong local operators have polished semantic HTML
                 but no schema. They belong at 18–20, not capped at
                 17.
      23–25: Elite — full LocalBusiness or Service JSON-LD
             (industry subtype like Plumber/Dentist/Roofer/
             HVACBusiness preferred) WITH AggregateRating + FAQPage
             schema AND sameAs links to GBP/BBB/Yelp/Facebook AND
             the human-readable structure already at 17. Genuinely
             rare and stays hard to earn — but when all five
             signals line up, do not under-award.

    Reward partial credit for each of: clear business name, visible
    services, visible phone/contact, clear city or service area,
    crawlable navigation, service/location page structure, consistent
    brand/entity naming. Each adds confidence — accumulating five or
    six of those signals on a clean HTML site is exactly what 8–12
    is for.

    **Structural Synergy Bonus (NEW — only fires when the site is
    genuinely structured).** When ALL of the following are true,
    add up to +3 to the Schema score (capped at 25 still):
      • Content score ≥ 12 (multiple deep service pages + FAQ)
      • Brand score ≥ 8 (consistent entity naming, clear identity)
      • Tech score ≥ 7 (clean meta + sitemap + reachable)
      • Crawler score ≥ 15 (citation bots reachable + sitemap)
      • At least ONE of: LocalBusiness JSON-LD (any), strong
        semantic HTML5 layout (<address>, ContactPoint), sameAs
        links to authoritative profiles
    This bonus rewards entity coherence — the site, the schema,
    the about page, the service hierarchy, and the FAQ all point to
    the same business. It will NEVER fire for a weak site because
    Content + Brand + Tech + Crawler must already be strong before
    the bonus engages. Genuinely elite sites can clear 80+; weak
    sites cannot.

  - AI Crawler Readiness: 0–20
    Ladder:
      0  : everything blocked OR fatal "User-agent: * / Disallow: /"
      4  : most citation bots blocked / unclear robots.txt
      8  : 2–3 citation bots reachable, no sitemap, no llms.txt
      12 : all 5 citation bots reachable (OAI-SearchBot, ClaudeBot,
           PerplexityBot, Bingbot, Google-Extended)
      15 : above + sitemap.xml referenced from robots.txt + key
           pages reachable from homepage (no JS-only nav)
      18 : above + structured /llms.txt (H1 + blockquote + H2 sections)
      20 : elite — full llms.txt suite + AI Discovery hints
    Note: training-only bots (GPTBot, anthropic-ai, CCBot,
    Bytespider) may be blocked — does NOT lower this score.
    Note: missing llms.txt is NOT a ceiling. A site with citation
    bots reachable + sitemap + crawlable can reach 15/20 — that's
    "well-prepared without bleeding-edge."

  - Local Trust Signals: 0–20  (stricter — no inflation)
    Ladder. Each "signal" must be visible on the homepage or a
    one-click-away page; mention without supporting evidence does
    NOT count. Be evidence-based, not generous.
      0  : zero visible trust signals
      4  : ONE clear signal (e.g. "4.8 stars" alone, OR years in
           business stated, OR a license number)
      8  : TWO signals (reviews + years, or license + warranty)
      12 : THREE signals (reviews + years + license, etc.)
      16 : FOUR or more signals AND NAP consistency across pages
      20 : elite — five+ signals INCLUDING verifiable third-party
           proof (BBB rating page, Google reviews count visible)
    Demote 2 pts for NAP mismatches (different phone numbers,
    inconsistent business name). A bare "5 stars" claim with no
    count or third-party source is worth +2, not +5.

  - Content Depth + FAQ Quality: 0–15
    Ladder:
      0  : no real content — error / parked / spam
      3  : marketing-only homepage, no separate service content
      6  : 1–2 thin service pages, no FAQ
      9  : 2+ service pages with real depth (>250 words each,
           sub-headings) — OR — clear FAQ with answers (one or
           the other)
      12 : 2+ deep service pages AND FAQ section AND pricing /
           service-expectation clarity ("starts at $X", "free
           estimate", "typical 1–3 days")
      15 : elite — all of the above + concrete numbers (turnaround,
           warranty years, projects completed) + before/after proof
           or case studies + location-specific landing pages
    Bonus: real FAQPage schema markup that machines can extract
    cleanly → +2 (already partially captured in Schema, but
    double-rewarded here for content depth).

  - Brand / Entity Clarity: 0–10
    Ladder:
      0  : confusing — multiple businesses, no clear identity
      2  : bare business name visible, nothing else
      4  : name + phone visible
      6  : name + phone + service area + one-sentence what-we-do
      8  : above + consistent across header/footer/title/schema
      10 : elite — all above + clear /about + no conflicting claims
           (no "30 years" alongside "Established 2018")
    Demote 2 pts for any conflicting claim (years, founder, location).

  - Technical Accessibility: 0–10
    Ladder:
      0  : home page broken (5xx) OR noindex on customer-facing pages
      2  : loads but missing title/meta description, no h1
      4  : basic — title + meta description + single h1 + reachable
      6  : above + sitemap referenced from robots.txt
      8  : above + mobile viewport tag + no broken homepage links +
           reasonable page weight
      10 : elite — all hygiene + structured headings + accessible
           markup + fast (<2s LCP)

  **Bonus multipliers — push strong implementations into the
  upper bands.** Award after summing the six categories. Cap at 100.
    +2  : entire site has consistent semantic heading hierarchy
          (single h1 per page, ordered h2/h3, no skipped levels)
    +2  : visible internal linking between service / location /
          about / contact pages — a clear site graph
    +2  : evidence the site renders without JavaScript (server-
          rendered HTML, content visible in initial response)
    +2  : multi-language signals (lang attribute, hreflang) — only
          when relevant for the business's audience
    +2  : real visible expertise (named professionals with bios,
          dated case studies, recent project photos with locations)
  These bonuses can lift a strong site from 70 → 78 — exactly the
  spread the rubric should produce when implementation is genuinely
  excellent.

**Score bands — MANDATORY.** After summing the six category
scores, classify the overall and explain WHY in the report:

  • 0–25  → "Invisible"   — essentially absent from AI search.
  • 26–45 → "At Risk"     — foundational signals missing.
  • 46–65 → "Needs Work"  — partial visibility, real gaps.
  • 66–80 → "Competitive" — solid foundation, room for polish.
  • 81–100 → "AI-Ready"   — fully optimized for AI citation.

**Calibration v1 targets — natural distribution across bands:**
  • SPAMMY / abandoned (broken site, no real content,
    blocked crawlers, no contact info)                   → **0–25 Invisible**.
  • WEAK (basic site, almost no trust signals,
    blocked or unclear crawler access)                   → **20–40 At Risk**.
  • AVERAGE small biz (some reviews, basic content,
    no schema or llms.txt, citation bots OK)             → **40–60 Needs Work**.
  • STRONG local operator (LocalBusiness schema,
    several trust pillars, FAQ, multiple service pages)  → **60–75 Competitive**.
  • ELITE (full schema with reviews + FAQ + sameAs,
    llms.txt, deep content, all signals present)         → **80+ AI-Ready**.

  Real-world separation rules:
  • A legitimate small business with visible contact info, some
    reviews, and a working site should NOT score below 40 just
    because they lack schema/llms.txt. Trust + clarity + tech
    contribute meaningfully.
  • A site with strong real-world fundamentals (reviews, license,
    warranty, named service area, working site) should land at
    50+ even with zero AI-specific signals.
  • An 81+ AI-Ready score still must be earned across ALL six
    categories — don't inflate.
  • Anti-clustering: do NOT default to a familiar number. If two
    different sites land within 3 points of each other, recheck
    each sub-check independently — variance is a feature.

# GEO Visibility Report

**Site:** ${websiteUrl}  ·  **Generated:** <today, plain English>

## 1. AI Visibility Score
**Overall Score: <N>/100 — <Band>** (Band ∈ Invisible / At Risk /
Needs Work / Competitive / AI-Ready, picked from the band rules above)

Breakdown (every line MUST end with a one-sentence plain-English
WHY tied to a specific finding from the page — name the actual
evidence, not the rubric anchor; no jargon; do NOT repeat the same
explanation across two lines):

- Structured Data / Schema: <n>/25 — <why, plain English, evidence-based>
- AI Crawler Readiness: <n>/20 — <why>
- Local Trust Signals: <n>/20 — <why>
- Content Depth + FAQ Quality: <n>/15 — <why>
- Brand / Entity Clarity: <n>/10 — <why>
- Technical Accessibility: <n>/10 — <why>

**Why this band:** 2–3 plain-English sentences naming the specific
findings that pushed the score into this band — what's working,
what's missing, what the customer outcome is. NO jargon. Tie at
least one sentence to lost calls / missed jobs / customers picking
competitors.

**Score reasoning (internal — keep brief):**
- *Biggest positive contributors:* 2–3 short bullets naming the
  sub-checks that earned the most points (e.g. "Strong reviews
  visible (+5 trust)", "Citation bots reachable (+10 crawler)").
- *Biggest negative contributors:* 2–3 short bullets naming the
  sub-checks that cost the most points (e.g. "No LocalBusiness
  JSON-LD (–10 schema)", "Thin service pages (–4 content)").

This reasoning block is intentionally short and concrete — it's how
the audit explains the scoring math to the customer (and to us
during calibration) without listing every single sub-check.

## 2. Top 3 Issues
Top 3 issues only. Numbered. For each, render the **EXACT** three
labeled fields below — Problem / Impact / Fix — each on its own
line. NO long paragraphs. NO additional fields. The renderer
parses these labels into a clean grid.

### {N}. {Plain-English headline — one short line, no jargon}
- **Problem** — one sentence on what's wrong, anyone can understand.
- **Impact** — one sentence in lost jobs / missed calls / customers
  picking a competitor instead.
- **Fix** — one sentence preview of the corrective action (the
  detailed fix lives in section 3).

## 3. Top 3 Fixes
Top 3 fixes only. Numbered. Render each as a tight implementation
checklist — short, scannable, NO dense paragraphs. Use **EXACTLY**
these six labeled fields per fix, in this order, each on its own
line. The renderer parses these labels into a clean grid + chips;
do not collapse fields, do not invent extra labels.

### {N}. {Fix name — one short, plain-English imperative line}
- **Priority** — one of: Critical / High / Medium / Quick Win
- **Difficulty** — one of: Easy / Moderate / Technical
- **Can GeoViz Foundation Fix handle this?** — Yes or No (one
  word). Yes when the fix involves schema, llms.txt, robots.txt,
  metadata, FAQ structure, or service-page setup. No when it
  requires creative work the customer must own (writing reviews,
  earning a license, photographing projects).
- **Problem** — one sentence on what's broken right now.
- **Impact** — one sentence on what it costs the business in leads /
  calls / customers won.
- **Fix** — one or two sentences, max, on the concrete action — what
  to install, what to write, what to update. Plain words.

Voice rules for sections 2 and 3:
- No repeated phrasing across items. Each Problem/Impact/Fix line
  must point at a DIFFERENT specific finding.
- Preserve factual audit findings. Do not invent claims about
  traffic, rankings, or lead volume.
- Every line passes the kitchen-table test.

## 4. Business Impact
Write 2–3 short sentences. NO long paragraphs. Frame the outcome:
when AI search systems can read the site clearly, the business
wins more inbound calls and fewer customers go to competitors.

Required wording rules:
- NO arithmetic, NO score math, NO "= N/100".
- NO dramatic phrasing like "your 70-year reputation is invisible".
- Keep it grounded. Target tone: "When your website clearly
  explains who you are, where you work, and why customers trust
  you, AI tools have more reasons to recommend your business
  instead of skipping over it."

**If — AND ONLY IF — the audit found strong real-world trust
signals (decades in business, large review counts, licenses,
warranty, named service area) but weak technical signals (no
schema, no llms.txt, thin content), include this exact sentence:**

  "Your real-world reputation is stronger than your website signals.
  The fix is making that trust easier for Google and AI tools to
  understand."

Do NOT include that sentence when the evidence does not support it.

End the section with this verbatim note on its own line:

> Scores may vary slightly as pages, crawlability, and available
> signals change.

---

## 5. GEO Foundation Fix

Paste this section EXACTLY as written below. Do not paraphrase. Do
not modify pricing. Do not drop bullets:

### Want GeoViz to fix this for you?

We&rsquo;ll handle the technical updates found in this report so AI
tools can better understand and recommend your business.

**Investment:** $497 one-time
**Timeline:** 3–5 business days

Reply to this email or click the link below to request your fix.

---

## 6. Technical Appendix
<details>
<summary>Crawler details, robots.txt findings, sitemap, raw schema analysis — implementation notes for your developer</summary>

**Schema (JSON-LD)** — one paste-ready code block for the single most
impactful missing schema (LocalBusiness preferred). Skip anything you
can't substantiate from the page. No commentary outside the code block.

**robots.txt findings** — short bullet list. One line per AI crawler
that's blocked or partially allowed. Group into TWO buckets so the
developer can apply the right strategy:

  Citation bots (must be allowed — these decide who gets cited):
  OAI-SearchBot, ChatGPT-User, ClaudeBot, claude-web, PerplexityBot,
  Perplexity-User, Bingbot, Google-Extended, Googlebot, Applebot.

  Training-only bots (acceptable to block if the site doesn't want
  to train AI models — does NOT affect citations): GPTBot,
  anthropic-ai, CCBot, Bytespider.

Skip the ones that are fully allowed. If a citation bot is blocked,
flag it as a high-priority robots.txt fix.

**llms.txt** — one sentence on whether it exists. If missing, ONE
paste-ready block (≤25 lines) tailored to this business.

**Metadata + crawlability** — one or two short bullets on title, meta
description, H1 structure, and any obvious crawlability blockers.

</details>

End immediately. No closing summary.`;
}

async function runViaApi(
  websiteUrl: string,
  competitorUrl: string | null,
  options: { fast?: boolean } = {},
): Promise<WrapperResult> {
  const startedAt = Date.now();
  const profile = options.fast ? "fast" : "full";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "spawn-failed",
      error:
        "ANTHROPIC_API_KEY not set. Set it in Railway → Service → Variables and redeploy.",
      stderr: "",
      exitCode: null,
      elapsedMs: Date.now() - startedAt,
    };
  }

  log(
    `[geo-worker] starting audit (api mode · profile=${profile}) model=${ANTHROPIC_MODEL} maxTokens=${ANTHROPIC_MAX_TOKENS} timeoutMs=${TIMEOUT_MS}`,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // Soft warning if a single audit runs past SLOW_WARN_MS (default 90s).
  // Doesn't abort — just logs so trends are visible before they hit the
  // hard timeout.
  const slowWarn = setTimeout(() => {
    logErr(
      `[geo-worker] slow_generation_warning · audit running >${Math.round(
        SLOW_WARN_MS / 1000,
      )}s · model=${ANTHROPIC_MODEL} maxTokens=${ANTHROPIC_MAX_TOKENS} profile=${profile}`,
    );
  }, SLOW_WARN_MS);

  try {
    const client = new Anthropic({ apiKey });
    const prompt = buildAuditPrompt(websiteUrl, competitorUrl, options);

    const response = await client.messages.create(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        // Server-hosted web_search tool — lets the model fetch the live
        // page + robots.txt + sitemap.xml during the audit.
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          } as unknown as Anthropic.Messages.Tool,
        ],
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal },
    );
    clearTimeout(timer);
    clearTimeout(slowWarn);

    const elapsedMs = Date.now() - startedAt;
    const markdown = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    log(
      `[geo-worker] api response received model=${ANTHROPIC_MODEL} maxTokens=${ANTHROPIC_MAX_TOKENS} timeoutMs=${TIMEOUT_MS} elapsedMs=${elapsedMs} stopReason=${response.stop_reason} bytes=${markdown.length}`,
    );

    if (!markdown) {
      return {
        ok: false,
        reason: "empty-output",
        error: `Anthropic API returned no text content (stop_reason=${response.stop_reason}).`,
        stderr: JSON.stringify(response.content).slice(0, 4000),
        exitCode: 0,
        elapsedMs,
      };
    }

    return {
      ok: true,
      markdown,
      exitCode: 0,
      stderr: "",
      elapsedMs,
    };
  } catch (err) {
    clearTimeout(timer);
    clearTimeout(slowWarn);
    const elapsedMs = Date.now() - startedAt;
    if (controller.signal.aborted) {
      return {
        ok: false,
        reason: "timeout",
        error: `Anthropic API call timed out after ${Math.round(TIMEOUT_MS / 1000)}s`,
        stderr: "",
        exitCode: null,
        elapsedMs,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "non-zero-exit",
      error: `Anthropic API error: ${message}`,
      stderr: "",
      exitCode: null,
      elapsedMs,
    };
  }
}

// ---- CLI mode (dev fallback only) ----
//
// Spawns scripts/run-geo-audit.sh. Requires `claude` CLI on PATH. Kept
// for local-dev convenience only — production must use API mode.
function runWrapperCli(
  websiteUrl: string,
  competitorUrl: string | null,
): Promise<WrapperResult> {
  const args = competitorUrl ? [websiteUrl, competitorUrl] : [websiteUrl];
  const startedAt = Date.now();

  log(`[geo-worker] starting audit script=${SCRIPT_PATH} args=${JSON.stringify(args)}`);

  return new Promise<WrapperResult>((resolve) => {
    let child;
    try {
      child = spawn(SCRIPT_PATH, args, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      resolve({
        ok: false,
        reason: "spawn-failed",
        error: `Failed to spawn ${SCRIPT_PATH}: ${message}`,
        stderr: "",
        exitCode: null,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const settle = (r: WrapperResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };

    child.stdout?.on("data", (c: Buffer) => {
      stdoutChunks.push(c);
      log(`[geo-worker] stdout chunk size=${c.length}`);
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderrChunks.push(c);
      const preview = c
        .toString("utf8")
        .replace(/\s+/g, " ")
        .slice(0, 160);
      log(`[geo-worker] stderr chunk size=${c.length} preview="${preview}"`);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      const elapsedMs = Date.now() - startedAt;
      if (err.code === "ENOENT") {
        settle({
          ok: false,
          reason: "spawn-failed",
          error: `Wrapper script not found at ${SCRIPT_PATH}.`,
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          exitCode: null,
          elapsedMs,
        });
        return;
      }
      settle({
        ok: false,
        reason: "spawn-failed",
        error: err.message,
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: null,
        elapsedMs,
      });
    });

    child.on("close", (code) => {
      const elapsedMs = Date.now() - startedAt;
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      log(`[geo-worker] exit code ${code ?? "null"} elapsedMs=${elapsedMs} stdoutBytes=${stdout.length} stderrBytes=${stderr.length}`);

      if (timedOut) {
        settle({
          ok: false,
          reason: "timeout",
          error: `Audit timed out after ${Math.round(TIMEOUT_MS / 1000)}s — wrapper killed.`,
          stderr,
          exitCode: code,
          elapsedMs,
        });
        return;
      }

      if (code === 0 && stdout.trim().length > 0) {
        settle({ ok: true, markdown: stdout, exitCode: 0, stderr, elapsedMs });
        return;
      }

      if (code === 0) {
        settle({
          ok: false,
          reason: "empty-output",
          error: "Wrapper exited 0 but produced no output.",
          stderr,
          exitCode: 0,
          elapsedMs,
        });
        return;
      }

      settle({
        ok: false,
        reason: "non-zero-exit",
        error: `Wrapper exited with code ${code}.`,
        stderr,
        exitCode: code,
        elapsedMs,
      });
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, TIMEOUT_MS);
  });
}

// ---- DB diagnostics (safe — no credentials ever logged) ----
async function fetchStatusCounts(
  prisma: PrismaClient,
): Promise<{ counts: Record<string, number>; sentCount: number; total: number }> {
  const total = await prisma.auditOrder.count();
  const grouped = await prisma.auditOrder.groupBy({
    by: ["reportStatus"],
    _count: { _all: true },
  });
  const counts: Record<string, number> = {
    pending: 0,
    queued: 0,
    running: 0,
    generated: 0,
    failed: 0,
  };
  for (const row of grouped) {
    counts[row.reportStatus] =
      (counts[row.reportStatus] ?? 0) + row._count._all;
  }
  const sentCount = await prisma.auditOrder.count({
    where: { reportSentToCustomerAt: { not: null } },
  });
  return { counts, sentCount, total };
}

async function logDbDiagnostics(prisma: PrismaClient): Promise<void> {
  const fp = getDbFingerprint();
  if (fp) {
    log(
      `[geo-worker] db host=${fp.host}${fp.port ? `:${fp.port}` : ""} name=${fp.database} fingerprint=${fp.fingerprint}`,
    );
  } else {
    log("[geo-worker] db fingerprint unavailable (DATABASE_URL not parseable)");
  }

  try {
    const { counts, sentCount, total } = await fetchStatusCounts(prisma);
    log(
      `[geo-worker] AuditOrder count=${total} byReportStatus={pending:${counts.pending} queued:${counts.queued} running:${counts.running} generated:${counts.generated} failed:${counts.failed}} sent=${sentCount}`,
    );

    const latest = await prisma.auditOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        businessName: true,
        websiteUrl: true,
        paymentStatus: true,
        reportStatus: true,
        createdAt: true,
      },
    });
    log(`[geo-worker] latest ${latest.length} order(s):`);
    for (const o of latest) {
      log(
        `  - id=${o.id} pay=${o.paymentStatus} report=${o.reportStatus} biz="${o.businessName ?? "(no name)"}" url=${o.websiteUrl} created=${o.createdAt.toISOString()}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logErr(`[geo-worker] db diagnostics query failed — ${message}`);
  }
}

// ---- last-N-lines helper ----
function tail(text: string, lineCount: number): string {
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - lineCount)).join("\n");
}

/**
 * Pull the six category scores out of the rendered markdown so Railway
 * logs show exactly how each audit was scored. Returns a single
 * compact line like "schema=12/25 crawler=5/20 trust=10/20 content=7/15
 * brand=6/10 tech=4/10 total=44/100" — easy to grep and easy to spot
 * if the model drifts back to a default score.
 */
function formatScoreBreakdownForLog(markdown: string): string | null {
  if (!markdown) return null;
  const pull = (label: RegExp, max: number): number | null => {
    const re = new RegExp(
      `${label.source}\\s*[:\\-—]?\\s*\\*?\\*?(\\d{1,3})\\s*/\\s*${max}\\b`,
      "i",
    );
    const m = re.exec(markdown);
    return m ? Number(m[1]) : null;
  };
  const schema = pull(/Structured\s*Data(?:\s*\/\s*Schema)?/, 25);
  const crawler = pull(/AI\s*Crawler\s*Readiness/, 20);
  const trust = pull(/Local\s*Trust\s*Signals/, 20);
  const content = pull(/Content\s*Depth(?:\s*\+\s*FAQ\s*Quality)?/, 15);
  const brand = pull(/Brand(?:\s*\/\s*Entity)?\s*Clarity/, 10);
  const tech = pull(/Technical\s*Accessibility/, 10);
  const overallMatch =
    /Overall\s*Score\s*[:\-—]?\s*\*?\*?(\d{1,3})\s*\/\s*100/i.exec(
      markdown,
    ) ?? /\b(\d{1,3})\s*\/\s*100\b/.exec(markdown);
  const overall = overallMatch ? Number(overallMatch[1]) : null;

  const allNull =
    schema === null &&
    crawler === null &&
    trust === null &&
    content === null &&
    brand === null &&
    tech === null &&
    overall === null;
  if (allNull) return null;

  const cell = (n: number | null, max: number) =>
    n === null ? `?/${max}` : `${n}/${max}`;
  return [
    `schema=${cell(schema, 25)}`,
    `crawler=${cell(crawler, 20)}`,
    `trust=${cell(trust, 20)}`,
    `content=${cell(content, 15)}`,
    `brand=${cell(brand, 10)}`,
    `tech=${cell(tech, 10)}`,
    `total=${overall ?? "?"}/100`,
  ].join(" ");
}

// ---- per-job pipeline ----
type PollResult = "processed" | "claimed-by-other" | "no-jobs";

async function processOneJob(prisma: PrismaClient): Promise<PollResult> {
  // Newest-first: when an admin clicks "Run GEO Audit" we want the audit
  // they JUST queued to be the next one processed, not whatever stale row
  // happens to be oldest in the queue. reportQueuedAt is set to now()
  // every time the API route flips a row to "queued", so descending order
  // on that column always puts the most recent click at the head.
  const candidate = await prisma.auditOrder.findFirst({
    where: { reportStatus: "queued" },
    orderBy: { reportQueuedAt: "desc" },
  });

  if (!candidate) {
    // The function just returns "no-jobs" — the caller decides whether to
    // exit (single-shot) or wait and poll again (loop). We DO NOT log
    // "exiting" here; that decision belongs to main().
    return "no-jobs";
  }

  // Atomic claim — only succeed if still queued. The
  // `WHERE reportStatus = "queued"` guard makes this race-safe even if
  // two workers fetched the same candidate. We also stamp
  // reportStartedAt so we can tell from the DB how long the worker has
  // been on the job.
  const claim = await prisma.auditOrder.updateMany({
    where: { id: candidate.id, reportStatus: "queued" },
    data: {
      reportStatus: "running",
      reportStartedAt: new Date(),
    },
  });
  if (claim.count === 0) {
    log(
      `[geo-worker] orderId=${candidate.id} was claimed by another worker — skipping`,
    );
    return "claimed-by-other";
  }

  log(
    `[geo-worker] picked job orderId=${candidate.id} url=${candidate.websiteUrl}${
      candidate.competitorUrl ? ` (vs ${candidate.competitorUrl})` : ""
    } reportQueuedAt=${candidate.reportQueuedAt?.toISOString() ?? "null"}`,
  );
  log(`[geo-worker] audit started orderId=${candidate.id}`);

  // Try/finally guarantees we always write a terminal status — never leave
  // a row stuck in "running".
  let wroteTerminal = false;
  try {
    const result = await runAudit(
      candidate.websiteUrl,
      candidate.competitorUrl,
    );

    if (result.ok) {
      log(
        `[geo-worker] markdown length orderId=${candidate.id} bytes=${result.markdown.length}`,
      );
      log(
        `[geo-worker] saving report orderId=${candidate.id} bytes=${result.markdown.length}`,
      );

      // Wrap the success-path DB write in its own try/catch so a save
      // failure is loudly visible instead of being swallowed by the outer
      // catch (which would mark the row "failed" with a vaguer message).
      try {
        const saved = await prisma.auditOrder.update({
          where: { id: candidate.id },
          data: {
            reportStatus: "generated",
            reportMarkdown: result.markdown,
            reportError: null,
            reportGeneratedAt: new Date(),
          },
        });
        wroteTerminal = true;
        log(
          `[geo-worker] report saved orderId=${candidate.id} dbReportStatus=${saved.reportStatus} reportGeneratedAt=${saved.reportGeneratedAt?.toISOString() ?? "null"} bytes=${result.markdown.length}`,
        );
        const breakdownLog = formatScoreBreakdownForLog(result.markdown);
        if (breakdownLog) {
          log(
            `[geo-worker] score breakdown orderId=${candidate.id} ${breakdownLog}`,
          );
        }
        log(
          `[geo-worker] audit completed orderId=${candidate.id} elapsedMs=${result.elapsedMs}`,
        );
        return "processed";
      } catch (saveErr) {
        const message =
          saveErr instanceof Error ? saveErr.message : String(saveErr);
        logErr(
          `[geo-worker] DB SAVE FAILED orderId=${candidate.id} after successful Anthropic response (${result.markdown.length} bytes): ${message}`,
        );
        // Recovery: mark the row failed so the UI doesn't stick at
        // "running" forever. We still couldn't preserve the markdown,
        // but at least the dashboard flips to a terminal state.
        try {
          await prisma.auditOrder.update({
            where: { id: candidate.id },
            data: {
              reportStatus: "failed",
              reportError: `Anthropic returned ${result.markdown.length} bytes but DB save failed: ${message}`,
            },
          });
          wroteTerminal = true;
          logErr(
            `[geo-worker] recovered orderId=${candidate.id} to failed (markdown lost — re-queue to retry)`,
          );
        } catch (markErr) {
          const markMessage =
            markErr instanceof Error ? markErr.message : String(markErr);
          logErr(
            `[geo-worker] CRITICAL — could not mark failed after save error orderId=${candidate.id}: ${markMessage}`,
          );
        }
        return "processed";
      }
    }

    // Failure — preserve the last 20 lines of stderr in reportError.
    const stderrTail = tail(result.stderr, 20);
    const reasonLabel =
      result.reason === "timeout"
        ? "timeout"
        : result.reason === "spawn-failed"
          ? "spawn failed"
          : result.reason === "empty-output"
            ? "empty output"
            : `exit ${result.exitCode}`;
    const reportError =
      `${result.error}\n` +
      `--- reason: ${reasonLabel} · elapsedMs=${result.elapsedMs} ---\n` +
      `--- last 20 lines of stderr ---\n${stderrTail}`;

    await prisma.auditOrder.update({
      where: { id: candidate.id },
      data: {
        reportStatus: "failed",
        reportError,
      },
    });
    wroteTerminal = true;

    logErr(
      `[geo-worker] audit failed orderId=${candidate.id} reason=${result.reason} exit=${result.exitCode ?? "null"} elapsedMs=${result.elapsedMs}: ${result.error}`,
    );
    return "processed";
  } catch (err) {
    // Catch-all for any unexpected exception inside the worker (DB blip,
    // promise rejection, etc.). Mark the row failed so it doesn't stick.
    const message = err instanceof Error ? err.message : String(err);
    logErr(
      `[geo-worker] worker exception during orderId=${candidate.id}: ${message}`,
    );
    try {
      await prisma.auditOrder.update({
        where: { id: candidate.id },
        data: {
          reportStatus: "failed",
          reportError: `Worker exception: ${message}`,
        },
      });
      wroteTerminal = true;
    } catch (writeErr) {
      const wm = writeErr instanceof Error ? writeErr.message : String(writeErr);
      logErr(
        `[geo-worker] CRITICAL — could not write failed status for orderId=${candidate.id}: ${wm}`,
      );
    }
  } finally {
    if (!wroteTerminal) {
      // Last-ditch — should be unreachable but defends against any future
      // path that returns without writing. Better to mark failed than to
      // leave the UI stuck.
      try {
        await prisma.auditOrder.update({
          where: { id: candidate.id },
          data: {
            reportStatus: "failed",
            reportError:
              "Worker exited without writing a terminal status. Re-run.",
          },
        });
        logErr(
          `[geo-worker] no terminal write detected — recovered orderId=${candidate.id} to failed`,
        );
      } catch {
        // already logged above
      }
    }
  }
  return "processed";
}

// ---- main ----
function sleep(ms: number, isShuttingDown: () => boolean): Promise<void> {
  // Sleep in 500ms chunks so SIGINT / SIGTERM doesn't have to wait the
  // full poll interval before the loop notices.
  return new Promise<void>((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (isShuttingDown()) return resolve();
      if (Date.now() - start >= ms) return resolve();
      setTimeout(tick, Math.min(500, ms));
    };
    tick();
  });
}

function preflightOrExit(): void {
  // Surface what mode we resolved to and what Railway actually delivered.
  // Critical for debugging cases where the env value has stray whitespace
  // or the deploy is running stale code.
  log(
    `[geo-worker] resolved AUDIT_MODE='${AUDIT_MODE}' (raw GEO_AUDIT_MODE=${JSON.stringify(process.env.GEO_AUDIT_MODE ?? null)})`,
  );

  // 1. DATABASE_URL must be set (the worker is useless without it).
  if (!process.env.DATABASE_URL) {
    logErr(
      "[geo-worker] PREFLIGHT FAILED — DATABASE_URL is not set. " +
        "Set it in Railway → Service → Variables (use the same Postgres URL Vercel reads).",
    );
    process.exit(1);
  }

  // 2. Audit-mode-specific checks.
  if (AUDIT_MODE !== "api" && AUDIT_MODE !== "fast" && AUDIT_MODE !== "cli") {
    logErr(
      `[geo-worker] PREFLIGHT FAILED — unknown GEO_AUDIT_MODE='${AUDIT_MODE}'. Use 'api' (full report), 'fast' (summary + quick wins + score), or 'cli' (dev fallback).`,
    );
    process.exit(1);
  }

  if (AUDIT_MODE === "api" || AUDIT_MODE === "fast") {
    log(
      `[geo-worker] ${AUDIT_MODE} mode — skipping Claude CLI / wrapper checks`,
    );
    if (!process.env.ANTHROPIC_API_KEY) {
      logErr(
        `[geo-worker] PREFLIGHT FAILED — ANTHROPIC_API_KEY not set (required for GEO_AUDIT_MODE=${AUDIT_MODE}).`,
      );
      logErr(
        "[geo-worker]   Set it in Railway → Service → Variables and redeploy.",
      );
      process.exit(1);
    }
    log(
      `[geo-worker] preflight ok · mode=${AUDIT_MODE} · model=${ANTHROPIC_MODEL} · maxTokens=${ANTHROPIC_MAX_TOKENS} · timeoutMs=${TIMEOUT_MS} · slowWarnMs=${SLOW_WARN_MS} · ANTHROPIC_API_KEY length=${process.env.ANTHROPIC_API_KEY.length}`,
    );
    return;
  }

  // ---- cli mode (dev fallback) ----
  if (!existsSync(SCRIPT_PATH)) {
    logErr(
      `[geo-worker] PREFLIGHT FAILED — wrapper script missing at ${SCRIPT_PATH} (required for GEO_AUDIT_MODE=cli).`,
    );
    process.exit(1);
  }
  try {
    accessSync(SCRIPT_PATH, fsConstants.X_OK);
  } catch {
    logErr(
      `[geo-worker] PREFLIGHT FAILED — wrapper script at ${SCRIPT_PATH} is not executable. Run: chmod +x scripts/run-geo-audit.sh`,
    );
    process.exit(1);
  }
  const probe = spawnSync("claude", ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    const reason =
      (probe.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT"
        ? "spawnSync claude ENOENT — binary not on PATH"
        : probe.error?.message ?? `exit code ${probe.status ?? "unknown"}`;
    logErr(
      `[geo-worker] PREFLIGHT FAILED — Claude CLI not callable on PATH (${reason}). ` +
        "GEO_AUDIT_MODE=cli requires the Claude CLI. " +
        "Switch to GEO_AUDIT_MODE=api (production default) or install Claude Code locally.",
    );
    process.exit(1);
  }
  log(`[geo-worker] preflight ok · mode=cli · claude ${probe.stdout.trim()}`);
}

async function main(): Promise<void> {
  preflightOrExit();

  const prisma = new PrismaClient();

  // ---- explicit connection test before any query ----
  // Surfaces PrismaClientInitializationError loud and early instead of
  // letting it crash inside the first findFirst(). Never echoes the URL.
  try {
    await prisma.$connect();
    log("[geo-worker] Prisma connected successfully");
    await logDbDiagnostics(prisma);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Strip any accidental URL leakage from the message before logging.
    const safe = message.replace(
      /postgres(ql)?:\/\/[^\s)]+/gi,
      "postgresql://[redacted]",
    );
    logErr(`[geo-worker] Prisma connection FAILED — ${safe}`);
    logErr(
      "[geo-worker] Verify DATABASE_URL is set and reachable. For Railway, ensure the URL ends with `?sslmode=require`.",
    );
    await prisma.$disconnect().catch(() => {
      /* ignore */
    });
    process.exit(1);
  }

  if (!LOOP_MODE) {
    log(
      `[geo-worker] starting (single-shot) · timeout=${TIMEOUT_MS}ms · script=${SCRIPT_PATH} · log=${LOG_FILE}`,
    );
    let result: PollResult = "no-jobs";
    try {
      result = await processOneJob(prisma);
    } finally {
      await prisma.$disconnect();
    }
    if (result === "no-jobs") {
      try {
        const { counts } = await fetchStatusCounts(prisma).catch(() => ({
          counts: { pending: 0, queued: 0, running: 0, generated: 0, failed: 0 },
        }));
        log(
          `[geo-worker] no queued jobs — exiting (single-shot · counts: pending=${counts.pending} queued=${counts.queued} running=${counts.running} generated=${counts.generated} failed=${counts.failed})`,
        );
      } catch {
        log("[geo-worker] no queued jobs — exiting (single-shot)");
      }
    }
    log("[geo-worker] done");
    return;
  }

  // ---- loop mode (runs forever, exits only on SIGINT/SIGTERM) ----
  log(
    `[geo-worker] starting (loop) · poll=${POLL_MS}ms · timeout=${TIMEOUT_MS}ms · script=${SCRIPT_PATH} · log=${LOG_FILE}`,
  );

  let shutdown = false;
  const onSignal = (sig: string) => {
    if (shutdown) return;
    shutdown = true;
    log(`[geo-worker] ${sig} received — finishing current poll then exiting`);
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  let pollCount = 0;
  try {
    while (!shutdown) {
      pollCount++;
      log(`[geo-worker] poll #${pollCount} starting`);
      let result: PollResult = "no-jobs";
      try {
        result = await processOneJob(prisma);
      } catch (err) {
        logErr("[geo-worker] poll-level error (loop continues):", err);
      }
      if (shutdown) break;

      if (result === "no-jobs") {
        log(
          `[geo-worker] poll #${pollCount} done · no queued jobs · waiting ${Math.round(POLL_MS / 1000)}s before next poll`,
        );
      } else if (result === "claimed-by-other") {
        log(
          `[geo-worker] poll #${pollCount} done · row claimed by another worker · waiting ${Math.round(POLL_MS / 1000)}s before next poll`,
        );
      } else {
        log(
          `[geo-worker] poll #${pollCount} done · job processed · waiting ${Math.round(POLL_MS / 1000)}s before next poll`,
        );
      }

      await sleep(POLL_MS, () => shutdown);
    }
  } finally {
    await prisma.$disconnect();
  }

  log(`[geo-worker] shut down cleanly · processed ${pollCount} poll(s)`);
}

main().catch((err) => {
  logErr("[geo-worker] fatal:", err);
  process.exit(1);
});
