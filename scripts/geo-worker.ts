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
import { notifyOperatorReportReady } from "../src/lib/notify-operator-report-ready";
import { persistAuditIntelligence } from "../src/lib/audit-intelligence";
import { parseCalibrationNotes } from "../src/lib/calibration";
import { sanitizeReportMarkdown } from "../src/lib/sanitize-report-markdown";
import {
  deriveCustomerStatus,
  isCalibrationOrder,
  isLaunchRiskFailure,
} from "../src/lib/customer-failure-mapping";
import { sendCustomerFailureEmail } from "../src/lib/customer-emails";
import {
  classifyWorkerException,
  classifyWrapperFailure,
  failureReasonDescription,
  shouldRetry,
  type FailureReason,
} from "../src/lib/processing-status";
import {
  estimateAuditCostUsd,
  formatUsageLog,
  type TokenUsage,
} from "../src/lib/pricing";

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
  | {
      ok: true;
      markdown: string;
      exitCode: number;
      stderr: string;
      elapsedMs: number;
      /** Anthropic `response.usage` block. Null for CLI mode (no usage available). */
      usage?: TokenUsage | null;
      /** Model ID at time of call. Null for CLI mode. */
      modelUsed?: string | null;
    }
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

__AUTHORITATIVE_SCORE_BLOCK__

**You are an analyst, not a scorer.** The audit score has already
been computed deterministically by GeoViz's scoring engine
(scoring@1.0.0) from structured evidence (preflight schema +
crawlability + entity-consistency analysis, optional render
probe). Your role is to **narrate** the score for the customer —
not to compute it.

You MUST NOT:
  - Compute, recompute, alter, reconcile, or contradict any number
  - Suggest alternative scores or "what the score should be"
  - Assign or mention confidence values yourself
  - Invent categories or weights
  - Echo any rubric ladder, point math, or scoring rules in your prose

You MAY ONLY:
  - Explain the existing findings in plain English
  - Expand each recommended fix into a paragraph
  - Tie the score to the business's specific situation
  - Quote the deterministic numbers verbatim where helpful

**Evidence rule.** Every claim in the report must be tied to a
specific signal you actually fetched (homepage / robots.txt /
llms.txt / preflight) or to an item from the authoritative score
block above. Do not fabricate findings.

**Calibration ladder removed.** The numeric ladder and band rules
previously specified here were the LLM-side rubric. Scores are now
computed deterministically (scoring@1.0.0) from preflight evidence.
DO NOT reason about ladder positions or compute partial credit —
that math has already been done. Treat the authoritative score
block as ground truth.

OUTPUT DISCIPLINE (mandatory — this is a paid customer report):
  • Output ONLY the final report markdown. NOTHING ELSE.
  • Begin the response with the literal line "# GEO Visibility Report"
    on the very first line. NO text before that heading.
  • Do NOT include any preamble, chain-of-thought, tool-use
    narration, planning text, or "thinking aloud" — none of:
    - "Now I have…" / "I have enough evidence…"
    - "The search results returned…" / "The fetches show…"
    - "I need to fetch…" / "Let me fetch…" / "I'll start by…"
    - "Based on my analysis…" / "Looking at the evidence…"
    - "Let me compile the findings…" / "First, I will…"
    - Any other meta-narration about the audit process.
  • Do NOT echo the rubric, the scoring math, or the prompt back
    to the user outside the Technical Appendix.
  • Do NOT speculate about what the model is doing. Just produce
    the report.
  • For the Generated date: write exactly the literal string
    "<GENERATED_DATE>" (with the angle brackets). The system will
    replace this placeholder server-side with the correct date.
    Do NOT write a real date — the placeholder is required.

DEFENSIBLE LANGUAGE (mandatory — every customer-visible sentence
must remain defensible if challenged by a skeptical operator or
legal review):

  Banned absolutes — NEVER use any of these phrasings (they
  overclaim what an audit of public web signals can know):
    - "your website has nothing to offer" / "nothing to offer
      as an answer"
    - "showing up nowhere" / "showing up nowhere online"
    - "AI tools found nothing" / "we found nothing"
    - "every AI system will skip you" / "every AI tool"
    - "your business will never appear" / "guaranteed to be
      skipped" / "guaranteed to rank"
    - "no AI tool will recommend you" / "AI tools won't read
      your site"
    - "you are invisible to AI" / "completely invisible"
    - any "always" / "never" / "every" / "all" claim about a
      specific platform's behavior toward this site.

  Preferred replacements (use phrasings of this shape):
    - "AI systems found very limited usable visibility signals"
    - "Your site contributes very little machine-readable
      information to AI-driven recommendations"
    - "The audit found minimal verified signals connected to
      this domain"
    - "AI systems may have low confidence recommending this
      business"
    - "Based on available site and visibility signals, AI
      systems may struggle to…"
    - "AI tools are likely to skip over this business when…"
    - "Confidence is low because no machine-readable identity
      was found in the page source."

  Tone: keep urgency, but make every claim precise. Pair every
  weakness statement with the SIGNAL that's missing (no JSON-LD
  / no FAQ schema / no llms.txt / inconsistent NAP / no review
  widget / etc.) so the customer can see why the audit reached
  that read.

DISTINCT SECTION ROLES (mandatory — keep each section's job
sharp; do NOT repeat the same finding across sections):

  • Section 1 (AI Visibility Score) — the number + the six-
    category breakdown + 3–5 score-driver bullets (mix of ✅
    positives and ❌ gaps). Cite specific found-or-missing
    signals.
  • Section 2 (What's Holding You Back) — WHAT IS WRONG. Top
    3 issues only. Each issue = one specific gap + a one-sentence
    "why it hurts visibility." Do NOT list fixes here.
  • Section 3 (What To Fix First) — WHAT TO FIX. Top 3 fixes
    only, 1:1 mapped to the 3 issues above. Each fix = the
    concrete change + difficulty + "Can GeoViz Foundation Fix
    handle this?" Yes/No. Do NOT re-explain the issue itself.
  • Section 4 (Business Impact) — WHY IT MATTERS to revenue
    /customers. Plain English, two short paragraphs maximum.
    Do NOT restate issues or fixes here.
  • Platform Visibility (when present) — HOW AI SYSTEMS MAY
    INTERPRET this site. Frame as inference from observed
    signals, never as direct platform queries. Do NOT claim
    we queried ChatGPT/Claude/Gemini/Perplexity directly.
    Preferred opener: "Based on available site and visibility
    signals, AI systems may struggle to…" Identify what
    AI systems CAN likely understand, what they CANNOT confidently
    verify, what SIGNAL is missing, and WHY confidence is low.

SCORE FRAMING (mandatory — one short clarifying line near the
top of Section 1 OR in Business Impact):
  These scores estimate how clearly AI systems can understand
  and recommend the business. Lower = AI has less usable signal
  to verify and recommend. NOT a ranking guarantee. Write this
  framing in plain business-owner language; avoid jargon like
  "directional intelligence", "machine-readable confidence",
  "relative readiness".

POSITIONING (mandatory — this report is one of:
  AI Visibility Audit / AI Discoverability Audit / Machine Readability
  Audit / Recommendation Readiness Audit
  It is NOT "AI SEO". It is NOT a marketing ranking service. It is
  NOT a magic-fix product. The audit evaluates whether your site
  contains the technical, structural, and trust signals commonly
  required for AI retrieval and recommendation systems — based
  ENTIRELY on publicly accessible signals, never on direct platform
  queries.

  The canonical framing line to use when the report needs to
  explain what was evaluated:
    "We evaluated whether modern AI systems can confidently
     identify, retrieve, interpret, and recommend this business
     based on publicly accessible signals."

  Lean INTO:
    - Trust: contradictions, inconsistencies, conflicting NAP,
      mismatched founding dates, unverified claims.
    - Verification: machine-readable business identity, structured
      data, consistent entity signals across the web.
    - Recommendation confidence: whether the site gives AI enough
      signal to confidently name this business when a customer asks.
    - Discoverability: whether the site is reachable by AI crawlers
      and whether content depth supports being quoted in an answer.
    - Customer-answer content: does the site answer the actual
      questions customers ask AI tools? (pricing, hours, service
      area, what's included, response time, etc.)
    - Cross-platform consistency: same business name, address,
      phone, founding date, services across the site + third-party
      surfaces (Google, BBB, Yelp, social).
    - Publicly accessible signals: ONLY evaluate what an AI crawler
      could reach on the open web — no behind-login content, no
      assumed-but-unverified claims.

  Lean AWAY FROM (banned phrasing — never use these):
    - "AI SEO" / "search optimization" / "rank in AI" / "rank
      higher in AI" / "AI ranking"
    - "ChatGPT visibility" / "Claude ranking" / "Perplexity score"
      / "Gemini ranking" (any phrasing that implies we measured a
      specific platform's behavior directly)
    - "querying GPT directly" / "we asked ChatGPT" / "we tested
      Claude" / "we evaluated Perplexity's response" (we did NOT
      query any platform live)
    - "dominate AI search" / "beat competitors instantly" / "AI
      hack" / "AI growth hack" / "guaranteed recommendations" /
      "guaranteed ranking"
    - "magic" / "instant fix" (the offer is a multi-day engagement,
      not a button)
    - Abstract methodology talk ("directional intelligence
      signals", "machine-readable confidence", "relative readiness").
    - Schema-tag jargon for its own sake.
    - Promising AI placement, recommendation, or ranking outcomes.
    - Generic "best practices" prose unanchored to specific found-
      or-missing signals on THIS site.

  Platform-visibility framing (when the prose discusses what
  individual AI systems may interpret):
    NEVER say or imply:
      "We tested ChatGPT/Claude/Gemini live."
      "We queried <platform> directly."
      "<platform> sees your business as…"
    INSTEAD say:
      "Based on available site and visibility signals, AI systems
       may struggle to…"
      "The signals AI retrieval systems commonly use to verify a
       business are missing here."
      "AI systems would need the following to confidently
       recommend…"

  Each weakness statement MUST name the specific missing signal +
  the specific business consequence. Examples (target this tone):
    - "AI systems struggle to verify this business — no structured
       business identity in the page source."
    - "Conflicting location signals (Trenton, IL vs. St. Louis Metro
       East) weaken recommendation confidence."
    - "Competitors provide a single answer to 'how fast can a
       plumber come' — this site has none, so the AI cites them."
    - "Reviews exist on Google (4.8 stars) but are invisible on the
       site itself, so AI can't confirm what a customer would see."
    - "Without a verified business identity, AI tools default to
       whoever they can confirm faster."
    - "Cross-platform NAP consistency is incomplete — the homepage
       shows one address, the contact page another."

  Style discipline:
    - Short sentences. Lead with the consequence.
    - Plain English. No filler ("it's important to note that…",
      "in essence", "fundamentally").
    - Each finding is one specific gap + the consequence — no
      back-to-back paragraphs that say the same thing twice.

# GEO Visibility Report

**Site:** ${websiteUrl}  ·  **Generated:** <GENERATED_DATE>

## 1. AI Visibility Score

**Use the EXACT numbers from the authoritative score block above.**
Copy the overall score, band, and each per-category score verbatim
into the lines below. Do NOT compute, round, or alter any value.

**Overall Score: {overall_score}/100 — {band}**

Breakdown (use the deterministic numbers from the authoritative
score block; for each category, add a one-sentence plain-English
WHY tied to a specific finding — name the actual evidence; no
jargon; do NOT repeat the same explanation across two lines; do
NOT echo the rubric anchors):

- Structured Data / Schema: {category_scores.schema.score}/25 — <why, plain English, evidence-based>
- AI Crawler Readiness: {category_scores.crawler.score}/20 — <why>
- Local Trust Signals: {category_scores.trust.score}/20 — <why>
- Content Depth + FAQ Quality: {category_scores.content.score}/15 — <why>
- Brand / Entity Clarity: {category_scores.brand.score}/10 — <why>
- Technical Accessibility: {category_scores.tech.score}/10 — <why>

**Score drivers:**
3–5 single-line bullets naming the specific findings that drove
the score. Mix POSITIVE drivers (what's earning points, e.g.
items the authoritative block lists as signals) and NEGATIVE
drivers (what's holding the score back, e.g. items from
top_findings). Each bullet is one short line tied to actual
evidence — no paragraphs, no jargon. Examples:

- Strong trust signals: 1,800+ reviews, BBB A+, licensed/insured
- Missing machine-readable identity: no LocalBusiness JSON-LD
- Weak AI navigation: no confirmed sitemap or llms.txt
- Conflicting business age claims reduce trust

Do NOT show point-by-point math or synergy-bonus details — those
have already been computed deterministically. The Score drivers
bullets are a glance for the customer.

## 2. What's Holding You Back
Top 3 issues only. Numbered. This section explains ONLY what's
wrong and why it matters. Do NOT include detailed fix steps here
— those live in section 3.

For each issue, use **EXACTLY** the two labeled fields below, each
on its own line. NO long paragraphs. NO additional fields.

### {N}. {Plain-English headline — one short line, no jargon}
- **Problem** — one sentence on what's wrong, anyone can understand.
- **Why it hurts visibility** — one sentence on the visibility,
  trust, or revenue cost (lost calls, customers picking a
  competitor, weak AI citations).

## 3. What To Fix First
Top 3 fixes only. Numbered. This section explains ONLY what to do.
Do NOT repeat the problem narrative from section 2.

For each fix, use **EXACTLY** the four labeled fields below, in
this order, each on its own line. The renderer parses Difficulty
and Foundation-Fix into chips; the body shows Fix + Expected
impact as a clean two-row grid.

### {N}. {Fix name — one short, plain-English imperative line}
- **Difficulty** — one of: Easy / Moderate / Technical
- **Can GeoViz Foundation Fix handle this?** — Yes or No (one
  word). Yes when the fix involves schema, llms.txt, robots.txt,
  metadata, FAQ structure, or service-page setup. No when it
  requires creative work the customer must own (writing reviews,
  earning a license, photographing projects).
- **Fix** — one or two sentences, max, on the concrete action —
  what to install, what to write, what to update. Plain words.
- **Expected impact** — one short sentence on what visibly changes
  when this fix lands.

Voice rules for sections 2 and 3:
- No repeated phrasing across items.
- Each fix in section 3 must MAP to a different issue from
  section 2 (1-to-1, in the same order). Don't invent new
  problems in section 3 — focus on the action.
- Preserve factual audit findings. No fabricated traffic,
  rankings, or lead volume.
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
  The fix is making that trust easier for AI tools to
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

__AUTHORITATIVE_SCORE_BLOCK__

**You are an analyst, not a scorer.** The audit score has already
been computed deterministically by GeoViz's scoring engine
(scoring@1.0.0) from structured evidence (preflight schema +
crawlability + entity-consistency analysis, optional render
probe). Your role is to **narrate** the score for the customer —
not to compute it.

You MUST NOT:
  - Compute, recompute, alter, reconcile, or contradict any number
  - Suggest alternative scores or "what the score should be"
  - Assign or mention confidence values yourself
  - Invent categories or weights
  - Echo any rubric ladder, point math, or scoring rules in your prose

You MAY ONLY:
  - Explain the existing findings in plain English
  - Expand each recommended fix into a paragraph
  - Tie the score to the business's specific situation
  - Quote the deterministic numbers verbatim where helpful

**Evidence rule.** Every claim in the report must be tied to a
specific signal you actually fetched (homepage / robots.txt /
llms.txt / preflight) or to an item from the authoritative score
block above. Do not fabricate findings.

**Calibration ladder removed.** The numeric ladder and band rules
previously specified here were the LLM-side rubric. Scores are now
computed deterministically (scoring@1.0.0) from preflight evidence.
DO NOT reason about ladder positions or compute partial credit —
that math has already been done. Treat the authoritative score
block as ground truth.

OUTPUT DISCIPLINE (mandatory — this is a paid customer report):
  • Output ONLY the final report markdown. NOTHING ELSE.
  • Begin the response with the literal line "# GEO Visibility Report"
    on the very first line. NO text before that heading.
  • Do NOT include any preamble, chain-of-thought, tool-use
    narration, planning text, or "thinking aloud" — none of:
    - "Now I have…" / "I have enough evidence…"
    - "The search results returned…" / "The fetches show…"
    - "I need to fetch…" / "Let me fetch…" / "I'll start by…"
    - "Based on my analysis…" / "Looking at the evidence…"
    - "Let me compile the findings…" / "First, I will…"
    - Any other meta-narration about the audit process.
  • Do NOT echo the rubric, the scoring math, or the prompt back
    to the user outside the Technical Appendix.
  • Do NOT speculate about what the model is doing. Just produce
    the report.
  • For the Generated date: write exactly the literal string
    "<GENERATED_DATE>" (with the angle brackets). The system will
    replace this placeholder server-side with the correct date.
    Do NOT write a real date — the placeholder is required.

DEFENSIBLE LANGUAGE (mandatory — every customer-visible sentence
must remain defensible if challenged by a skeptical operator or
legal review):

  Banned absolutes — NEVER use any of these phrasings (they
  overclaim what an audit of public web signals can know):
    - "your website has nothing to offer" / "nothing to offer
      as an answer"
    - "showing up nowhere" / "showing up nowhere online"
    - "AI tools found nothing" / "we found nothing"
    - "every AI system will skip you" / "every AI tool"
    - "your business will never appear" / "guaranteed to be
      skipped" / "guaranteed to rank"
    - "no AI tool will recommend you" / "AI tools won't read
      your site"
    - "you are invisible to AI" / "completely invisible"
    - any "always" / "never" / "every" / "all" claim about a
      specific platform's behavior toward this site.

  Preferred replacements (use phrasings of this shape):
    - "AI systems found very limited usable visibility signals"
    - "Your site contributes very little machine-readable
      information to AI-driven recommendations"
    - "The audit found minimal verified signals connected to
      this domain"
    - "AI systems may have low confidence recommending this
      business"
    - "Based on available site and visibility signals, AI
      systems may struggle to…"
    - "AI tools are likely to skip over this business when…"
    - "Confidence is low because no machine-readable identity
      was found in the page source."

  Tone: keep urgency, but make every claim precise. Pair every
  weakness statement with the SIGNAL that's missing (no JSON-LD
  / no FAQ schema / no llms.txt / inconsistent NAP / no review
  widget / etc.) so the customer can see why the audit reached
  that read.

DISTINCT SECTION ROLES (mandatory — keep each section's job
sharp; do NOT repeat the same finding across sections):

  • Section 1 (AI Visibility Score) — the number + the six-
    category breakdown + 3–5 score-driver bullets (mix of ✅
    positives and ❌ gaps). Cite specific found-or-missing
    signals.
  • Section 2 (What's Holding You Back) — WHAT IS WRONG. Top
    3 issues only. Each issue = one specific gap + a one-sentence
    "why it hurts visibility." Do NOT list fixes here.
  • Section 3 (What To Fix First) — WHAT TO FIX. Top 3 fixes
    only, 1:1 mapped to the 3 issues above. Each fix = the
    concrete change + difficulty + "Can GeoViz Foundation Fix
    handle this?" Yes/No. Do NOT re-explain the issue itself.
  • Section 4 (Business Impact) — WHY IT MATTERS to revenue
    /customers. Plain English, two short paragraphs maximum.
    Do NOT restate issues or fixes here.
  • Platform Visibility (when present) — HOW AI SYSTEMS MAY
    INTERPRET this site. Frame as inference from observed
    signals, never as direct platform queries. Do NOT claim
    we queried ChatGPT/Claude/Gemini/Perplexity directly.
    Preferred opener: "Based on available site and visibility
    signals, AI systems may struggle to…" Identify what
    AI systems CAN likely understand, what they CANNOT confidently
    verify, what SIGNAL is missing, and WHY confidence is low.

SCORE FRAMING (mandatory — one short clarifying line near the
top of Section 1 OR in Business Impact):
  These scores estimate how clearly AI systems can understand
  and recommend the business. Lower = AI has less usable signal
  to verify and recommend. NOT a ranking guarantee. Write this
  framing in plain business-owner language; avoid jargon like
  "directional intelligence", "machine-readable confidence",
  "relative readiness".

POSITIONING (mandatory — this report is one of:
  AI Visibility Audit / AI Discoverability Audit / Machine Readability
  Audit / Recommendation Readiness Audit
  It is NOT "AI SEO". It is NOT a marketing ranking service. It is
  NOT a magic-fix product. The audit evaluates whether your site
  contains the technical, structural, and trust signals commonly
  required for AI retrieval and recommendation systems — based
  ENTIRELY on publicly accessible signals, never on direct platform
  queries.

  The canonical framing line to use when the report needs to
  explain what was evaluated:
    "We evaluated whether modern AI systems can confidently
     identify, retrieve, interpret, and recommend this business
     based on publicly accessible signals."

  Lean INTO:
    - Trust: contradictions, inconsistencies, conflicting NAP,
      mismatched founding dates, unverified claims.
    - Verification: machine-readable business identity, structured
      data, consistent entity signals across the web.
    - Recommendation confidence: whether the site gives AI enough
      signal to confidently name this business when a customer asks.
    - Discoverability: whether the site is reachable by AI crawlers
      and whether content depth supports being quoted in an answer.
    - Customer-answer content: does the site answer the actual
      questions customers ask AI tools? (pricing, hours, service
      area, what's included, response time, etc.)
    - Cross-platform consistency: same business name, address,
      phone, founding date, services across the site + third-party
      surfaces (Google, BBB, Yelp, social).
    - Publicly accessible signals: ONLY evaluate what an AI crawler
      could reach on the open web — no behind-login content, no
      assumed-but-unverified claims.

  Lean AWAY FROM (banned phrasing — never use these):
    - "AI SEO" / "search optimization" / "rank in AI" / "rank
      higher in AI" / "AI ranking"
    - "ChatGPT visibility" / "Claude ranking" / "Perplexity score"
      / "Gemini ranking" (any phrasing that implies we measured a
      specific platform's behavior directly)
    - "querying GPT directly" / "we asked ChatGPT" / "we tested
      Claude" / "we evaluated Perplexity's response" (we did NOT
      query any platform live)
    - "dominate AI search" / "beat competitors instantly" / "AI
      hack" / "AI growth hack" / "guaranteed recommendations" /
      "guaranteed ranking"
    - "magic" / "instant fix" (the offer is a multi-day engagement,
      not a button)
    - Abstract methodology talk ("directional intelligence
      signals", "machine-readable confidence", "relative readiness").
    - Schema-tag jargon for its own sake.
    - Promising AI placement, recommendation, or ranking outcomes.
    - Generic "best practices" prose unanchored to specific found-
      or-missing signals on THIS site.

  Platform-visibility framing (when the prose discusses what
  individual AI systems may interpret):
    NEVER say or imply:
      "We tested ChatGPT/Claude/Gemini live."
      "We queried <platform> directly."
      "<platform> sees your business as…"
    INSTEAD say:
      "Based on available site and visibility signals, AI systems
       may struggle to…"
      "The signals AI retrieval systems commonly use to verify a
       business are missing here."
      "AI systems would need the following to confidently
       recommend…"

  Each weakness statement MUST name the specific missing signal +
  the specific business consequence. Examples (target this tone):
    - "AI systems struggle to verify this business — no structured
       business identity in the page source."
    - "Conflicting location signals (Trenton, IL vs. St. Louis Metro
       East) weaken recommendation confidence."
    - "Competitors provide a single answer to 'how fast can a
       plumber come' — this site has none, so the AI cites them."
    - "Reviews exist on Google (4.8 stars) but are invisible on the
       site itself, so AI can't confirm what a customer would see."
    - "Without a verified business identity, AI tools default to
       whoever they can confirm faster."
    - "Cross-platform NAP consistency is incomplete — the homepage
       shows one address, the contact page another."

  Style discipline:
    - Short sentences. Lead with the consequence.
    - Plain English. No filler ("it's important to note that…",
      "in essence", "fundamentally").
    - Each finding is one specific gap + the consequence — no
      back-to-back paragraphs that say the same thing twice.

# GEO Visibility Report

**Site:** ${websiteUrl}  ·  **Generated:** <GENERATED_DATE>

## 1. AI Visibility Score

**Use the EXACT numbers from the authoritative score block above.**
Copy the overall score, band, and each per-category score verbatim
into the lines below. Do NOT compute, round, or alter any value.

**Overall Score: {overall_score}/100 — {band}**

Breakdown (use the deterministic numbers from the authoritative
score block; for each category, add a one-sentence plain-English
WHY tied to a specific finding — name the actual evidence; no
jargon; do NOT repeat the same explanation across two lines; do
NOT echo the rubric anchors):

- Structured Data / Schema: {category_scores.schema.score}/25 — <why, plain English, evidence-based>
- AI Crawler Readiness: {category_scores.crawler.score}/20 — <why>
- Local Trust Signals: {category_scores.trust.score}/20 — <why>
- Content Depth + FAQ Quality: {category_scores.content.score}/15 — <why>
- Brand / Entity Clarity: {category_scores.brand.score}/10 — <why>
- Technical Accessibility: {category_scores.tech.score}/10 — <why>

**Score drivers:**
3–5 single-line bullets naming the specific findings that drove
the score. Mix POSITIVE drivers (what's earning points, e.g.
items the authoritative block lists as signals) and NEGATIVE
drivers (what's holding the score back, e.g. items from
top_findings). Each bullet is one short line tied to actual
evidence — no paragraphs, no jargon. Examples:

- Strong trust signals: 1,800+ reviews, BBB A+, licensed/insured
- Missing machine-readable identity: no LocalBusiness JSON-LD
- Weak AI navigation: no confirmed sitemap or llms.txt
- Conflicting business age claims reduce trust

Do NOT show point-by-point math or synergy-bonus details — those
have already been computed deterministically. The Score drivers
bullets are a glance for the customer.

## 2. What's Holding You Back
Top 3 issues only. Numbered. This section explains ONLY what's
wrong and why it matters. Do NOT include detailed fix steps here
— those live in section 3.

For each issue, use **EXACTLY** the two labeled fields below, each
on its own line. NO long paragraphs. NO additional fields.

### {N}. {Plain-English headline — one short line, no jargon}
- **Problem** — one sentence on what's wrong, anyone can understand.
- **Why it hurts visibility** — one sentence on the visibility,
  trust, or revenue cost (lost calls, customers picking a
  competitor, weak AI citations).

## 3. What To Fix First
Top 3 fixes only. Numbered. This section explains ONLY what to do.
Do NOT repeat the problem narrative from section 2.

For each fix, use **EXACTLY** the four labeled fields below, in
this order, each on its own line. The renderer parses Difficulty
and Foundation-Fix into chips; the body shows Fix + Expected
impact as a clean two-row grid.

### {N}. {Fix name — one short, plain-English imperative line}
- **Difficulty** — one of: Easy / Moderate / Technical
- **Can GeoViz Foundation Fix handle this?** — Yes or No (one
  word). Yes when the fix involves schema, llms.txt, robots.txt,
  metadata, FAQ structure, or service-page setup. No when it
  requires creative work the customer must own (writing reviews,
  earning a license, photographing projects).
- **Fix** — one or two sentences, max, on the concrete action —
  what to install, what to write, what to update. Plain words.
- **Expected impact** — one short sentence on what visibly changes
  when this fix lands.

Voice rules for sections 2 and 3:
- No repeated phrasing across items.
- Each fix in section 3 must MAP to a different issue from
  section 2 (1-to-1, in the same order). Don't invent new
  problems in section 3 — focus on the action.
- Preserve factual audit findings. No fabricated traffic,
  rankings, or lead volume.
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
  The fix is making that trust easier for AI tools to
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
    let prompt = buildAuditPrompt(websiteUrl, competitorUrl, options);

    // ─── Deterministic scoring — authoritative context for the LLM ──
    // Pre-LLM evidence pass: run preflight + render, compute the
    // deterministic score (scoring@1.0.0), and inject the result as
    // an authoritative context block. The prompt's
    // `__AUTHORITATIVE_SCORE_BLOCK__` placeholder is replaced with
    // the deterministic JSON + top findings + recommended fixes +
    // public bucket scores. The LLM is instructed (in buildAuditPrompt)
    // to treat these numbers as ground truth — it no longer
    // generates, reconciles, or alters any score.
    //
    // Fail-soft: if preflight throws or the scorer chokes on
    // partial evidence, we fall back to a placeholder that tells
    // the LLM "no authoritative score available — narrate the
    // findings you observe, do NOT invent numbers". This case is
    // rare and is logged for operator review.
    try {
      const { runPreflight } = await import(
        "../src/lib/intelligence/preflight/runPreflight"
      );
      const { scoreAudit } = await import("../src/lib/scoring");
      const preflight = await runPreflight(websiteUrl);
      // Render is OFF here on purpose — keeps the pre-LLM path
      // cheap. persistAuditIntelligence runs the full pipeline
      // (preflight + ingest + render) and re-scores idempotently
      // for the canonical persisted value.
      const deterministic = scoreAudit({
        preflightSignals: preflight,
        intelligenceIngest: null,
        renderResult: null,
      });
      const block = formatAuthoritativeScoreBlock(deterministic);
      prompt = prompt.replace("__AUTHORITATIVE_SCORE_BLOCK__", block);
      console.log(
        `[authoritative-score] injected url=${preflight.fetchedUrl ?? websiteUrl} overall=${deterministic.overall_score} band=${deterministic.band} confidence=${deterministic.confidence_level}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[authoritative-score] failed url=${websiteUrl} (non-fatal): ${msg}`,
      );
      const fallback =
        "**Authoritative score block — UNAVAILABLE.** The deterministic " +
        "scoring engine could not run for this site (preflight or scorer " +
        "errored). DO NOT invent numbers. Narrate only the findings you " +
        "can verify from your own fetches. Use placeholder `--/100 — Pending` " +
        "for the Overall Score line; persistAuditIntelligence will overwrite " +
        "the persisted value once the scorer recovers.";
      prompt = prompt.replace("__AUTHORITATIVE_SCORE_BLOCK__", fallback);
    }

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

    // ---- [geo-cost-debug] runApi sdk-response ----
    // Capture the raw response shape BEFORE any field extraction.
    // Answers: does `response.usage` actually contain the four token
    // fields the SDK type promises? If `usageJson=null` here, the
    // SDK isn't returning usage on this account/model/tool combo and
    // the issue is upstream of our code.
    log(
      `[geo-cost-debug] runApi sdk-response stopReason=${response.stop_reason} contentBlocks=${response.content.length} hasUsage=${response.usage !== null && response.usage !== undefined} usageJson=${JSON.stringify(response.usage ?? null)}`,
    );

    // Capture token usage for cost tracking. The Anthropic SDK
    // returns `response.usage` with input/output and (when prompt
    // caching is active) cache_creation/cache_read counts. All fields
    // are optional in the type — defensive ?? null guards keep this
    // from breaking if the SDK shape changes.
    const rawUsage = response.usage as
      | {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        }
      | undefined
      | null;
    const usage: TokenUsage = {
      inputTokens: rawUsage?.input_tokens ?? null,
      outputTokens: rawUsage?.output_tokens ?? null,
      cacheCreationTokens: rawUsage?.cache_creation_input_tokens ?? null,
      cacheReadTokens: rawUsage?.cache_read_input_tokens ?? null,
    };

    // ---- [geo-cost-debug] runApi extracted-usage ----
    // The post-cast object. If `usageJson` above had a value but
    // `extracted-usage` has all-null fields here, the SDK's actual
    // key names differ from our type-assertion (e.g. `prompt_tokens`
    // vs `input_tokens`). Inspect `usageJson` to find the real keys.
    log(
      `[geo-cost-debug] runApi extracted-usage ${JSON.stringify(usage)} modelUsed=${ANTHROPIC_MODEL}`,
    );

    log(
      `[geo-worker] api response received model=${ANTHROPIC_MODEL} maxTokens=${ANTHROPIC_MAX_TOKENS} timeoutMs=${TIMEOUT_MS} elapsedMs=${elapsedMs} stopReason=${response.stop_reason} bytes=${markdown.length}`,
    );
    log(`[geo-worker] api usage ${formatUsageLog(ANTHROPIC_MODEL, usage)}`);

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
      usage,
      modelUsed: ANTHROPIC_MODEL,
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
        // ---- [geo-cost-debug] runWrapperCli success ----
        // CLI mode never carries SDK usage — the Claude CLI wrapper
        // doesn't surface token counts. If this line ever appears in
        // Railway logs, the worker is routing through CLI mode
        // unexpectedly, which would explain why cost columns stay
        // NULL even on successful audits. Production GEO_AUDIT_MODE
        // must be "api".
        log(
          `[geo-cost-debug] runWrapperCli success — CLI mode never carries SDK usage; cost columns will stay null for this audit. Switch GEO_AUDIT_MODE to 'api' for cost telemetry.`,
        );
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

/**
 * Single source of truth for "this audit just failed — what do we
 * write to the DB?" — consulted by every failure path in the worker
 * (wrapper failure, post-success DB-save failure, catch-all worker
 * exception). Combines:
 *
 *   1. Classification — `reason` is the stable FailureReason code
 *      assigned by the caller via `classifyWrapperFailure` or
 *      `classifyWorkerException`. The `reportError` text stays in
 *      its existing column for operator debugging.
 *
 *   2. Retry decision — transient reasons (timeout / fetch_failed /
 *      queue_interruption / render_failed) are flipped back to
 *      `reportStatus = "queued"` so the next poll picks them up,
 *      provided `retryCount < MAX_AUTO_RETRIES`. `retryCount` is
 *      incremented and `lastRetryAt` stamped so the operator can
 *      see retry pressure on the row.
 *
 *   3. Terminal write — non-transient or out-of-retries reasons go
 *      to `reportStatus = "failed"` with `failureReason` set. The
 *      admin UI derives the operator-facing label (TIMEOUT /
 *      FETCH_FAILED / etc.) from that field.
 *
 * Returns `"retried"` or `"failed"` so the caller can log the
 * outcome distinctly. Never throws — DB errors on the failure-
 * write are caught and logged but never propagated.
 */
/**
 * Customer-facing failure notification helper. Idempotent: skips the
 * send if the order has already been notified (`customerFailureNotifiedAt`
 * is set). Skips calibration orders entirely. Never throws — the
 * inner sendCustomerFailureEmail is fail-soft and the DB write is
 * wrapped in try/catch.
 *
 * Launch-risk failures (spending cap, provider outage on a paid order,
 * generation_failed, db_save_failed, worker_exception) get a separate
 * `[geo-launch-risk]` log line so the operator can grep for these in
 * Railway and react before customer-trust events accumulate.
 */
async function maybeNotifyCustomerOfFailure(
  prisma: PrismaClient,
  args: {
    orderId: string;
    businessName: string | null;
    customerEmail: string;
    websiteUrl: string;
    reason: FailureReason;
    retryCount: number;
    alreadyNotifiedAt: Date | null;
  },
): Promise<void> {
  const isCalibration = isCalibrationOrder(args.customerEmail);

  // Operator launch-risk alarm — fires regardless of calibration
  // status because the operator needs to know about these patterns
  // even when triggered by calibration runs.
  if (isLaunchRiskFailure({ reason: args.reason, isCalibration })) {
    logErr(
      `[geo-launch-risk] orderId=${args.orderId} reason=${args.reason} retryCount=${args.retryCount} customerEmail=${args.customerEmail} websiteUrl=${args.websiteUrl} — paid-customer-impact risk if this pattern continues`,
    );
  }

  if (isCalibration) {
    log(
      `[customer-email] skipped (calibration) orderId=${args.orderId} reason=${args.reason}`,
    );
    return;
  }
  if (args.alreadyNotifiedAt) {
    log(
      `[customer-email] skipped (already notified at ${args.alreadyNotifiedAt.toISOString()}) orderId=${args.orderId}`,
    );
    return;
  }

  const customerStatus = deriveCustomerStatus({
    reportStatus: "failed",
    failureReason: args.reason,
    retryCount: args.retryCount,
  });
  if (customerStatus !== "delayed" && customerStatus !== "failed") {
    log(
      `[customer-email] skipped (unexpected status ${customerStatus}) orderId=${args.orderId}`,
    );
    return;
  }

  const ok = await sendCustomerFailureEmail({
    orderId: args.orderId,
    businessName: args.businessName,
    customerEmail: args.customerEmail,
    websiteUrl: args.websiteUrl,
    customerStatus,
  });
  if (ok) {
    try {
      await prisma.auditOrder.update({
        where: { id: args.orderId },
        data: { customerFailureNotifiedAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logErr(
        `[customer-email] DB stamp failed orderId=${args.orderId}: ${message} (email already sent; rerun-safe via Resend idempotency on retry)`,
      );
    }
  }
}

async function markFailureWithRetry(
  prisma: PrismaClient,
  args: {
    orderId: string;
    retryCount: number;
    reason: FailureReason;
    reportError: string;
  },
): Promise<"retried" | "failed"> {
  const { orderId, retryCount, reason, reportError } = args;

  if (shouldRetry(reason, retryCount)) {
    try {
      await prisma.auditOrder.update({
        where: { id: orderId },
        data: {
          reportStatus: "queued",
          reportQueuedAt: new Date(),
          reportError: null,
          failureReason: reason, // preserved as breadcrumb
          retryCount: retryCount + 1,
          lastRetryAt: new Date(),
        },
      });
      log(
        `[geo-worker] retry scheduled orderId=${orderId} reason=${reason} attempt=${retryCount + 1}/${2}`,
      );
      return "retried";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logErr(
        `[geo-worker] retry-write failed orderId=${orderId}: ${message} (falling through to terminal failure)`,
      );
      // fall through to terminal write below
    }
  }

  try {
    await prisma.auditOrder.update({
      where: { id: orderId },
      data: {
        reportStatus: "failed",
        failureReason: reason,
        reportError,
      },
    });
    logErr(
      `[geo-worker] terminal failure orderId=${orderId} reason=${reason} (${failureReasonDescription(reason)}) retryCount=${retryCount}`,
    );
    return "failed";
  } catch (markErr) {
    const message = markErr instanceof Error ? markErr.message : String(markErr);
    logErr(
      `[geo-worker] CRITICAL — could not mark failed orderId=${orderId}: ${message}`,
    );
    return "failed";
  }
}

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

    // ---- [geo-cost-debug] processOneJob result-received ----
    // Captures the runtime shape of the WrapperResult BEFORE the
    // success-path conditional. Answers: does `"usage" in result`
    // pick up the key? Is `result.usage` truthy? Is `modelUsed`
    // present? These four boolean flags pinpoint exactly which
    // condition fails on the path to the DB write.
    log(
      `[geo-cost-debug] processOneJob result.ok=${result.ok} elapsedMs=${result.elapsedMs} hasUsageKey=${"usage" in result} usageTruthy=${"usage" in result && Boolean(result.usage)} hasModelKey=${"modelUsed" in result} modelUsedVal=${"modelUsed" in result ? String(result.modelUsed) : "absent"}`,
    );

    if (result.ok) {
      // Sanitize raw model output before any downstream use. This
      // strips chain-of-thought / preamble leakage (e.g. "Now I have
      // sufficient evidence...", "The search results returned...")
      // and replaces the model-supplied date placeholder with the
      // actual server timestamp. The DB write, intelligence ingest,
      // operator email, and PDF render all use this single
      // sanitized string — one pass at the worker covers every
      // customer-facing surface. See src/lib/sanitize-report-markdown.ts.
      const reportGeneratedAt = new Date();
      const sanitizedMarkdown = sanitizeReportMarkdown(
        result.markdown,
        reportGeneratedAt,
      );
      const sanitizerStrippedBytes =
        result.markdown.length - sanitizedMarkdown.length;
      if (sanitizerStrippedBytes > 0) {
        log(
          `[geo-worker] sanitizer stripped orderId=${candidate.id} rawBytes=${result.markdown.length} cleanBytes=${sanitizedMarkdown.length} stripped=${sanitizerStrippedBytes}`,
        );
      }
      log(
        `[geo-worker] markdown length orderId=${candidate.id} bytes=${sanitizedMarkdown.length}`,
      );
      log(
        `[geo-worker] saving report orderId=${candidate.id} bytes=${sanitizedMarkdown.length}`,
      );

      // Wrap the success-path DB write in its own try/catch so a save
      // failure is loudly visible instead of being swallowed by the outer
      // catch (which would mark the row "failed" with a vaguer message).
      // Per-audit cost data — only populated when the wrapper returns
      // usage (API mode). CLI mode leaves these null because the
      // wrapper has no visibility into the underlying Claude CLI's
      // token accounting.
      const usageData =
        "usage" in result && result.usage
          ? {
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              cacheCreationTokens: result.usage.cacheCreationTokens,
              cacheReadTokens: result.usage.cacheReadTokens,
              modelUsed: result.modelUsed ?? ANTHROPIC_MODEL,
              estimatedCostUsd: estimateAuditCostUsd(
                result.modelUsed ?? ANTHROPIC_MODEL,
                result.usage,
              ),
              workerRuntimeMs: result.elapsedMs,
            }
          : { workerRuntimeMs: result.elapsedMs };

      // ---- [geo-cost-debug] DB write payload (pre-write) ----
      // The exact object the Prisma layer is about to receive. If
      // `keys` is missing the token/cost fields here, the conditional
      // above fell into the runtime-only branch — investigation
      // belongs upstream in `result.usage`.
      log(
        `[geo-cost-debug] DB write payload orderId=${candidate.id} keys=${Object.keys(usageData).join(",")} payloadJson=${JSON.stringify(usageData)}`,
      );

      try {
        const saved = await prisma.auditOrder.update({
          where: { id: candidate.id },
          data: {
            reportStatus: "generated",
            reportMarkdown: sanitizedMarkdown,
            reportError: null,
            reportGeneratedAt,
            ...usageData,
          },
        });
        wroteTerminal = true;
        // ---- [geo-cost-debug] DB write success (smoking-gun line) ----
        // Echoes the post-write row state back. If the pre-write
        // `payloadJson` contained populated token/cost fields but the
        // post-write values here are null, Prisma either silently
        // dropped the keys (column not in the client's generated
        // model — regenerate) or the columns don't exist on the DB
        // (migration not applied). Run `npx prisma migrate status`
        // and `npx prisma generate` on the Railway side to fix.
        log(
          `[geo-cost-debug] DB write success orderId=${candidate.id} dbInputTokens=${saved.inputTokens ?? "null"} dbOutputTokens=${saved.outputTokens ?? "null"} dbModelUsed=${saved.modelUsed ?? "null"} dbEstimatedCostUsd=${saved.estimatedCostUsd?.toString() ?? "null"} dbWorkerRuntimeMs=${saved.workerRuntimeMs ?? "null"}`,
        );
        log(
          `[geo-worker] report saved orderId=${candidate.id} dbReportStatus=${saved.reportStatus} reportGeneratedAt=${saved.reportGeneratedAt?.toISOString() ?? "null"} bytes=${result.markdown.length}`,
        );
        // Single-line operator cost-summary log — distinct prefix so
        // an operator can `grep '\[geo-cost\]'` and get one line per
        // completed audit with everything they need to map dollars
        // back to orders. See COST_AND_USAGE_TRACKING.md §1.5.
        {
          const usageForLog =
            "usage" in result && result.usage
              ? result.usage
              : {
                  inputTokens: null,
                  outputTokens: null,
                  cacheCreationTokens: null,
                  cacheReadTokens: null,
                };
          const modelForLog = result.modelUsed ?? ANTHROPIC_MODEL;
          const costForLog = estimateAuditCostUsd(modelForLog, usageForLog);
          log(
            `[geo-cost] auditId=${candidate.id} model=${modelForLog} input=${usageForLog.inputTokens ?? 0} output=${usageForLog.outputTokens ?? 0} cost=$${costForLog.toFixed(4)} runtime=${result.elapsedMs}ms url=${candidate.websiteUrl} status=generated retries=${candidate.retryCount}`,
          );
        }
        const breakdownLog = formatScoreBreakdownForLog(sanitizedMarkdown);
        if (breakdownLog) {
          log(
            `[geo-worker] score breakdown orderId=${candidate.id} ${breakdownLog}`,
          );
        }

        // V2 data foundation — write the normalized intelligence row.
        // Wrapped in try/catch so a failure here NEVER breaks the
        // customer report flow (which has already been durably saved
        // above) or the operator notification (which fires below).
        // `persistAuditIntelligence` itself never throws — this is
        // belt-and-suspenders. See `src/lib/audit-intelligence.ts`.
        // Lift operator-supplied benchmark tagging out of adminNotes
        // (if any). When the bulk-queue POST persisted operator
        // industry / benchmarkTag into the calibration JSON, pass
        // them through so the intelligence row records the operator's
        // choice instead of the inferred industry. Absent / null on
        // the parsed result leaves the existing inference path
        // unchanged — fully backwards compatible.
        const calOperatorTags = parseCalibrationNotes(candidate.adminNotes);
        const operatorIndustry = calOperatorTags?.industry ?? null;
        const operatorBenchmarkTag = calOperatorTags?.benchmarkTag ?? null;
        if (operatorIndustry || operatorBenchmarkTag) {
          log(
            `[geo-benchmark] operator tag applied orderId=${candidate.id} industry=${operatorIndustry ?? "(none)"} benchmarkTag=${operatorBenchmarkTag ?? "(none)"}`,
          );
        }

        try {
          const intel = await persistAuditIntelligence({
            orderId: candidate.id,
            businessName: candidate.businessName,
            websiteUrl: candidate.websiteUrl,
            competitorUrl: candidate.competitorUrl,
            reportMarkdown: sanitizedMarkdown,
            industryRaw: operatorIndustry,
            benchmarkTag: operatorBenchmarkTag,
          });
          if (intel.ok) {
            log(`[geo-worker] intelligence persisted orderId=${candidate.id}`);
          } else {
            logErr(
              `[geo-worker] intelligence persist failed orderId=${candidate.id} reason=${intel.reason} (non-fatal)`,
            );
          }
        } catch (err) {
          logErr(
            `[geo-worker] intelligence persist threw orderId=${candidate.id} (non-fatal):`,
            err,
          );
        }

        // Operator notification — internal "report ready for review"
        // ping. The function never throws; logs success/failure
        // internally and returns a boolean. Wrapped in catch as a
        // belt-and-suspenders so the worker never fails on email.
        await notifyOperatorReportReady({
          orderId: candidate.id,
          businessName: candidate.businessName,
          customerEmail: candidate.email,
          websiteUrl: candidate.websiteUrl,
          reportMarkdown: sanitizedMarkdown,
          reportGeneratedAt: saved.reportGeneratedAt ?? reportGeneratedAt,
        }).catch((err) => {
          logErr(
            `[geo-worker] notifyOperatorReportReady error orderId=${candidate.id} (non-fatal):`,
            err,
          );
        });
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
        // db_save_failed is NOT transient — almost always a schema
        // or permission issue, retrying would burn AI provider spend
        // without addressing the root cause. Mark failed terminally.
        await markFailureWithRetry(prisma, {
          orderId: candidate.id,
          retryCount: candidate.retryCount,
          reason: "db_save_failed",
          reportError: `Anthropic returned ${result.markdown.length} bytes but DB save failed: ${message}`,
        });
        wroteTerminal = true;
        return "processed";
      }
    }

    // Wrapper failure path — classify the WrapperResult, decide
    // retry vs terminal in markFailureWithRetry. Preserves the
    // existing rich reportError text (stderr tail + reason label)
    // for operator debugging.
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

    const classified = classifyWrapperFailure(result.reason, result.error);
    const outcome = await markFailureWithRetry(prisma, {
      orderId: candidate.id,
      retryCount: candidate.retryCount,
      reason: classified,
      reportError,
    });
    wroteTerminal = true;

    logErr(
      `[geo-worker] audit ${outcome} orderId=${candidate.id} classified=${classified} wrapperReason=${result.reason} exit=${result.exitCode ?? "null"} elapsedMs=${result.elapsedMs}: ${result.error}`,
    );
    // Cost-summary line for failed audits — tokens may have been
    // consumed before the failure (e.g. timeout mid-response), so
    // the operator should see this in the cost grep too.
    log(
      `[geo-cost] auditId=${candidate.id} model=${ANTHROPIC_MODEL} input=0 output=0 cost=$0.0000 runtime=${result.elapsedMs}ms url=${candidate.websiteUrl} status=${outcome} reason=${classified} retries=${candidate.retryCount}`,
    );

    // Customer-facing failure notification — only fires when the
    // outcome is terminal "failed" (not on retry). Calibration
    // orders skip the email (operator-only). See
    // `src/lib/customer-failure-mapping.ts` and
    // `src/lib/customer-emails.ts`. Wrapped to never throw.
    if (outcome === "failed") {
      await maybeNotifyCustomerOfFailure(prisma, {
        orderId: candidate.id,
        businessName: candidate.businessName,
        customerEmail: candidate.email,
        websiteUrl: candidate.websiteUrl,
        reason: classified,
        retryCount: candidate.retryCount,
        alreadyNotifiedAt: candidate.customerFailureNotifiedAt ?? null,
      });
    }
    return "processed";
  } catch (err) {
    // Catch-all for any unexpected exception inside the worker (DB blip,
    // promise rejection, etc.). Classify so transient errors retry and
    // non-transient ones surface as the right operator category.
    const message = err instanceof Error ? err.message : String(err);
    const classified = classifyWorkerException(err);
    logErr(
      `[geo-worker] worker exception orderId=${candidate.id} classified=${classified}: ${message}`,
    );
    try {
      const outcome = await markFailureWithRetry(prisma, {
        orderId: candidate.id,
        retryCount: candidate.retryCount,
        reason: classified,
        reportError: `Worker exception: ${message}`,
      });
      wroteTerminal = true;
      // Same customer-notification path as the wrapper-failure branch.
      if (outcome === "failed") {
        await maybeNotifyCustomerOfFailure(prisma, {
          orderId: candidate.id,
          businessName: candidate.businessName,
          customerEmail: candidate.email,
          websiteUrl: candidate.websiteUrl,
          reason: classified,
          retryCount: candidate.retryCount,
          alreadyNotifiedAt: candidate.customerFailureNotifiedAt ?? null,
        });
      }
    } catch (writeErr) {
      const wm = writeErr instanceof Error ? writeErr.message : String(writeErr);
      logErr(
        `[geo-worker] CRITICAL — could not write failed status for orderId=${candidate.id}: ${wm}`,
      );
    }
  } finally {
    if (!wroteTerminal) {
      // Last-ditch — should be unreachable but defends against any future
      // path that returns without writing. queue_interruption is a
      // transient reason; this row will auto-retry if retryCount < cap.
      await markFailureWithRetry(prisma, {
        orderId: candidate.id,
        retryCount: candidate.retryCount,
        reason: "queue_interruption",
        reportError:
          "Worker exited without writing a terminal status. Re-run.",
      });
      logErr(
        `[geo-worker] no terminal write detected — recovered orderId=${candidate.id}`,
      );
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

/**
 * Recovers rows stuck in `reportStatus = "running"` past the timeout
 * window. The normal happy path always writes a terminal status via
 * the per-job try/finally, but a process killed externally (SIGKILL,
 * Railway container restart, OOM, host crash) leaves its in-flight
 * row stranded. Without recovery, the queue is permanently blocked
 * because new workers won't pick up "running" rows.
 *
 * Threshold: TIMEOUT_MS + 2 min safety buffer. If a row has been
 * "running" longer than that, the worker that started it is gone.
 * Reset to "queued" so the next poll picks it up. Idempotent and
 * race-safe via updateMany. The previous reportError is replaced
 * with a recovery breadcrumb so the audit trail shows what happened.
 */
async function recoverStaleRunningJobs(prisma: PrismaClient): Promise<number> {
  const STALE_AFTER_MS = TIMEOUT_MS + 2 * 60_000;
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const recoveredAt = new Date();
  const result = await prisma.auditOrder.updateMany({
    where: {
      reportStatus: "running",
      OR: [
        { reportStartedAt: { lt: cutoff } },
        { reportStartedAt: null },
      ],
    },
    data: {
      reportStatus: "queued",
      reportQueuedAt: recoveredAt,
      reportError: `Recovered from stale "running" state at ${recoveredAt.toISOString()} — worker process likely killed mid-job.`,
    },
  });
  if (result.count > 0) {
    log(
      `[geo-worker] recovered ${result.count} stale running job(s) → queued (older than ${Math.round(STALE_AFTER_MS / 60_000)} min)`,
    );
  }
  return result.count;
}

async function main(): Promise<void> {
  preflightOrExit();

  // ---- [geo-worker-version] permanent deploy identity ----
  // Reads the deployed commit SHA from whichever env the host
  // injected — Railway sets RAILWAY_GIT_COMMIT_SHA, Vercel sets
  // VERCEL_GIT_COMMIT_SHA on every build. The fallback "unknown"
  // is what you'll see if the worker is running outside CI/CD
  // (e.g. local dev). This line is permanent — it's not part of
  // the [geo-cost-debug] suite that gets cleaned up later.
  //
  // After every Railway deploy, the operator should grep for
  // `[geo-worker-version]` to confirm which commit is actually
  // running before debugging anything else.
  const commitSha =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    "unknown";
  const commitShaShort = commitSha === "unknown" ? "unknown" : commitSha.slice(0, 7);
  log(
    `[geo-worker-version] commit=${commitShaShort} commitFull=${commitSha} telemetry=true worker=geo-worker auditMode=${AUDIT_MODE} model=${ANTHROPIC_MODEL} startedAt=${new Date().toISOString()}`,
  );

  // ---- [geo-cost-debug] worker boot — telemetry instrumentation ----
  // Fires once per worker start so the operator can confirm in Railway
  // logs that this instrumented build is the one actually running.
  // Pure additive logging; remove with a single grep when the cost-
  // telemetry root cause is identified.
  log(
    `[geo-cost-debug] worker boot — telemetry instrumentation v1 active · auditMode=${AUDIT_MODE} model=${ANTHROPIC_MODEL} maxTokens=${ANTHROPIC_MAX_TOKENS}`,
  );

  const prisma = new PrismaClient();

  // ---- explicit connection test before any query ----
  // Surfaces PrismaClientInitializationError loud and early instead of
  // letting it crash inside the first findFirst(). Never echoes the URL.
  try {
    await prisma.$connect();
    log("[geo-worker] Prisma connected successfully");
    await logDbDiagnostics(prisma);
    // Run stale-job recovery once at startup. Catches rows stranded
    // by a previous worker process that died before its try/finally
    // could write a terminal status.
    await recoverStaleRunningJobs(prisma).catch((err) => {
      logErr("[geo-worker] stale recovery on startup failed (continuing):", err);
    });
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
      // Every 10 polls (~2 min at default 12s cadence), re-run the
      // stale-job recovery. Cheap UPDATE; covers the rare case where
      // a sibling worker process died while this one stayed alive.
      if (pollCount > 1 && pollCount % 10 === 0) {
        await recoverStaleRunningJobs(prisma).catch((err) => {
          logErr(
            "[geo-worker] periodic stale recovery failed (continuing):",
            err,
          );
        });
      }
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

// ─── Authoritative score block formatter ──────────────────────────
// Renders the deterministic scoring result (scoring@1.0.0) into a
// markdown block the LLM sees as ground truth. Replaces the
// `__AUTHORITATIVE_SCORE_BLOCK__` placeholder in the audit prompt.
// The LLM is instructed (inside buildAuditPrompt) to copy the
// numeric values verbatim — never compute, alter, or reconcile.
type DeterministicLike = {
  scoring_version: string;
  overall_score: number;
  band: string;
  category_scores: Record<
    string,
    { score: number; max: number; reason: string }
  >;
  public_bucket_scores: Record<
    string,
    { score: number; max: number; percentage: number }
  >;
  confidence_level: string;
  confidence_score: number;
  top_3_findings: Array<{ id: string; severity: string; category: string; message: string }>;
  top_3_recommended_fixes: Array<{ id: string; action: string; impact: string }>;
  synergy_bonus_applied: number;
  synergy_bonus_tier: string;
  synergy_bonus_reason: string | null;
};

function formatAuthoritativeScoreBlock(d: DeterministicLike): string {
  const lines: string[] = [
    "### AUTHORITATIVE SCORE (deterministic — DO NOT alter)",
    "",
    `Engine version: ${d.scoring_version}`,
    `Overall score: ${d.overall_score}/100 — ${d.band}`,
    `Confidence: ${d.confidence_level} (${d.confidence_score}/100)`,
    "",
    "Category scores (use these EXACT numbers in section 1):",
    `  - Structured Data / Schema: ${d.category_scores.schema.score}/${d.category_scores.schema.max} — ${d.category_scores.schema.reason}`,
    `  - AI Crawler Readiness:     ${d.category_scores.crawler.score}/${d.category_scores.crawler.max} — ${d.category_scores.crawler.reason}`,
    `  - Local Trust Signals:      ${d.category_scores.trust.score}/${d.category_scores.trust.max} — ${d.category_scores.trust.reason}`,
    `  - Content Depth + FAQ:      ${d.category_scores.content.score}/${d.category_scores.content.max} — ${d.category_scores.content.reason}`,
    `  - Brand / Entity Clarity:   ${d.category_scores.brand.score}/${d.category_scores.brand.max} — ${d.category_scores.brand.reason}`,
    `  - Technical Accessibility:  ${d.category_scores.tech.score}/${d.category_scores.tech.max} — ${d.category_scores.tech.reason}`,
    "",
    "Public bucket scores (customer-facing 4-dimension view):",
    `  - Understanding:  ${d.public_bucket_scores.understanding.score}/${d.public_bucket_scores.understanding.max} (${d.public_bucket_scores.understanding.percentage}%)`,
    `  - Retrieval:      ${d.public_bucket_scores.retrieval.score}/${d.public_bucket_scores.retrieval.max} (${d.public_bucket_scores.retrieval.percentage}%)`,
    `  - Trust:          ${d.public_bucket_scores.trust.score}/${d.public_bucket_scores.trust.max} (${d.public_bucket_scores.trust.percentage}%)`,
    `  - Recommendation: ${d.public_bucket_scores.recommendation.score}/${d.public_bucket_scores.recommendation.max} (${d.public_bucket_scores.recommendation.percentage}%)`,
    "",
    `Synergy bonus: +${d.synergy_bonus_applied} (${d.synergy_bonus_tier})${d.synergy_bonus_reason ? ` — ${d.synergy_bonus_reason}` : ""}`,
    "",
    "Top findings (use VERBATIM as section 2 issue anchors):",
    ...d.top_3_findings.map(
      (f, i) =>
        `  ${i + 1}. [${f.severity}] [${f.category}] ${f.message}`,
    ),
    "",
    "Recommended fixes (use VERBATIM as section 3 fix anchors — 1:1 with findings):",
    ...d.top_3_recommended_fixes.map(
      (fx, i) => `  ${i + 1}. [${fx.impact}] ${fx.action}`,
    ),
    "",
    "Rules:",
    "  - Copy every number above into the report VERBATIM.",
    "  - Do NOT compute, alter, reconcile, or contradict any value.",
    "  - Do NOT mention confidence levels you assign yourself.",
    "  - Do NOT echo rubric ladders or scoring math anywhere in your prose.",
    "  - Section 2 (Top 3 Issues) MUST use the top_findings above, in order.",
    "  - Section 3 (Top 3 Fixes) MUST use the recommended_fixes above, in order, 1:1 with findings.",
  ];
  return lines.join("\n");
}

// ─── V2 Preflight prompt formatter ────────────────────────────────
// Renders the preflight orchestrator's structured signals into a
// terse markdown block that's prepended to the audit prompt when
// GEO_PREFLIGHT_PROMPT=on. The block sits ABOVE the rubric — Claude
// can use it as ground-truth context but the rubric itself is
// untouched (frozen per CLAUDE.md scoring freeze).
//
// Why a terse markdown table instead of JSON: Claude reads loose
// markdown more reliably than embedded JSON, and a small fixed-shape
// table keeps the additional token count minimal.
type PreflightLike = {
  fetchedUrl: string | null;
  readability: { wordCount: number; parsedByReadability: boolean; articleTitle: string | null } | null;
  schema: { score: number; presentFields: string[]; missingFields: string[]; detectedTypes: string[] } | null;
  crawlability: { score: number; passedChecks: string[]; failedChecks: string[] } | null;
  entityConsistency: { score: number; inconsistencies: string[] } | null;
};
function formatPreflightPromptBlock(p: PreflightLike): string {
  const lines: string[] = [
    "### Validated preflight signals (Node-side, ground truth)",
    "",
    `Source URL: ${p.fetchedUrl ?? "(none)"}`,
    "",
  ];
  if (p.readability) {
    lines.push(
      `- Readable content: ${p.readability.wordCount} words ` +
        `(${p.readability.parsedByReadability ? "Readability OK" : "fallback extraction"})`,
    );
    if (p.readability.articleTitle) {
      lines.push(`  - Title: ${p.readability.articleTitle}`);
    }
  }
  if (p.schema) {
    lines.push(
      `- Structured data: ${p.schema.score}/100 ` +
        `(present: ${p.schema.presentFields.join(", ") || "none"}; ` +
        `missing: ${p.schema.missingFields.join(", ") || "none"})`,
    );
    if (p.schema.detectedTypes.length > 0) {
      lines.push(`  - @type detected: ${p.schema.detectedTypes.join(", ")}`);
    }
  }
  if (p.crawlability) {
    lines.push(
      `- Crawlability: ${p.crawlability.score}/100 ` +
        `(passed: ${p.crawlability.passedChecks.length}; ` +
        `failed: ${p.crawlability.failedChecks.length})`,
    );
    if (p.crawlability.failedChecks.length > 0) {
      lines.push(
        `  - Failed: ${p.crawlability.failedChecks.join(", ")}`,
      );
    }
  }
  if (p.entityConsistency) {
    lines.push(
      `- Entity consistency: ${p.entityConsistency.score}/100`,
    );
    if (p.entityConsistency.inconsistencies.length > 0) {
      lines.push(
        `  - Issues: ${p.entityConsistency.inconsistencies.slice(0, 3).join("; ")}`,
      );
    }
  }
  lines.push(
    "",
    "Treat these as ground-truth context (not new categories). Score per the rubric below.",
  );
  return lines.join("\n");
}
