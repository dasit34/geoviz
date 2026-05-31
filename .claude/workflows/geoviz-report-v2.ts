export const meta = {
  name: 'geoviz-report-v2',
  description: 'Verify multi-model audit pipeline, then ship report v2 enhancements: AI Inputs Analyzed, four-model breakdown, evidence-based findings, admin telemetry, PDF fixes. Scoring untouched (frozen).',
  whenToUse: 'Multi-part GeoViz report v2 + multi-model validation work. Skips Part 7 (scoring stays frozen at Calibration v2.2).',
  phases: [
    { title: 'Discover', detail: 'Survey validator pipeline, report rendering, admin UI, PDF generator' },
    { title: 'Verify', detail: 'Run test-live-validators.ts and capture provider statuses' },
    { title: 'Implement', detail: 'Admin telemetry, report sections, PDF/copy fixes (parallel, distinct file domains)' },
    { title: 'Validate', detail: 'Typecheck + sample report render dry-run' },
  ],
}

const DISCOVERY_SCHEMA = {
  type: 'object',
  required: ['summary', 'key_files', 'data_contracts', 'gaps'],
  properties: {
    summary: { type: 'string', description: 'One-paragraph overview' },
    key_files: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'role'],
        properties: {
          path: { type: 'string' },
          role: { type: 'string' },
          critical_lines: { type: 'string', description: 'Line ranges of load-bearing code, e.g. "120-180, 340-400"' },
        },
      },
    },
    data_contracts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'shape'],
        properties: {
          name: { type: 'string' },
          shape: { type: 'string', description: 'Brief TS-like shape description' },
          source: { type: 'string', description: 'File:line where it is defined' },
        },
      },
    },
    gaps: {
      type: 'array',
      items: { type: 'string', description: 'Concrete gap relevant to the v2 spec, e.g. "no per-provider status breakdown in admin"' },
    },
    notes: { type: 'string' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['providers', 'overall_pass'],
  properties: {
    overall_pass: { type: 'boolean' },
    providers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'status'],
        properties: {
          name: { type: 'string', enum: ['openai', 'anthropic', 'gemini', 'perplexity'] },
          status: { type: 'string', enum: ['success', 'failed', 'skipped'] },
          latency_ms: { type: 'number' },
          tokens_used: { type: 'number' },
          failure_reason: { type: 'string' },
        },
      },
    },
    raw_excerpt: { type: 'string', description: 'Last ~40 lines of stdout/stderr' },
  },
}

const IMPL_SCHEMA = {
  type: 'object',
  required: ['files_changed', 'summary'],
  properties: {
    summary: { type: 'string' },
    files_changed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'change'],
        properties: {
          path: { type: 'string' },
          change: { type: 'string', description: 'One-sentence description of what changed' },
        },
      },
    },
    db_changes: { type: 'string', description: '"none" if no schema/migration changes' },
    follow_ups: {
      type: 'array',
      items: { type: 'string' },
    },
    blockers: {
      type: 'array',
      items: { type: 'string', description: 'Anything that prevented finishing the assigned scope' },
    },
  },
}

const VALIDATE_SCHEMA = {
  type: 'object',
  required: ['typecheck_pass', 'sample_render_pass'],
  properties: {
    typecheck_pass: { type: 'boolean' },
    typecheck_errors: { type: 'string', description: 'Tail of tsc output if failed; empty if passed' },
    sample_render_pass: { type: 'boolean' },
    sample_render_notes: { type: 'string' },
    blockers: { type: 'array', items: { type: 'string' } },
  },
}

phase('Discover')

const [validatorSurvey, reportSurvey, adminSurvey, pdfSurvey] = await parallel([
  () => agent(`Survey the GeoViz multi-model validator + consensus pipeline. Return structured JSON.

Focus areas:
- src/lib/validators/providers/{openai,claude,gemini,perplexity}.ts — entry signatures, what each returns, error handling
- src/lib/observations/consensus/runAiValidationLayer.ts — orchestration, parallelism, fail-soft behavior
- src/lib/consensus/{index,index_compute,agreement,dimensions,findings,types}.ts — how aiValidations + consensusIndex are computed
- prisma/schema.prisma — AuditIntelligence.aiValidations and consensusIndex columns (lines 370-400 approx)
- scripts/geo-worker.ts — where validators are invoked in the pipeline, how their output is stored, what env keys gate them
- scripts/test-live-validators.ts and scripts/test-ai-validators.ts — existing test entry points
- env.ts and .env.example — env key names per provider

Identify for each provider:
- The env key required
- Where the call is made
- What the success result shape looks like (TS-ish)
- What happens on failure (fallback / null / throw)
- Whether the worker currently logs per-provider status

Identify the in-DB data contracts:
- aiValidations JSON shape (point to src/lib/validators/types.ts)
- consensusIndex JSON shape (point to src/lib/consensus/types.ts)

Surface gaps relevant to the v2 spec:
- Is there a per-provider status log line emitted on every audit?
- Is per-audit latency captured?
- Is failure reason captured?
- Is there any place we currently fabricate provider participation when a provider failed?

Be specific with file:line citations. Read the actual files, do not guess.`, { phase: 'Discover', label: 'survey:validators', schema: DISCOVERY_SCHEMA }),

  () => agent(`Survey the GeoViz report rendering pipeline. Return structured JSON.

Focus areas:
- src/components/AuditReportContent.tsx — top-down structure: what sections exist today, where the Cross-Model section already reads aiValidations/consensusIndex (around line 340 and 990-1130)
- src/components/ReportView.tsx, src/components/CategoryScoreCard.tsx, src/components/StrengthCard.tsx, src/components/ReportScoreCard.tsx — supporting components
- src/lib/parse-report.ts — score parsing, band labels (bandLabelForOverall around line 325 — FROZEN), section extraction helpers
- src/lib/report-sections.ts — section model
- src/app/report/[id]/page.tsx and src/app/report/[id]/print/page.tsx — entry points and SSR data load
- src/app/sample-report/[slug]/page.tsx — sample/preview path

For each, list:
- Existing top-level sections in the report (extract heading order — there should be sections 01-06 currently)
- Where validator data already flows in (file:line)
- Where new sections would naturally insert (between which existing sections)
- What customer-language gaps exist (technical terms still surfacing — "schema", "JSON-LD", "crawler readiness", etc.)
- How the props/context object is shaped between the parsed report and the rendered components

Surface gaps relevant to the v2 spec:
- Is there an "AI Inputs Analyzed" section?
- Is there a per-model (ChatGPT/Claude/Gemini/Perplexity) breakdown grid?
- Is there a "Why You Received This Score" customer-facing breakdown?
- Are findings formatted as What We Found / Why It Matters / Business Impact / Recommended Fix today?
- Where would each new section be inserted in component order?

Be specific with file:line citations. Read the actual files.`, { phase: 'Discover', label: 'survey:report', schema: DISCOVERY_SCHEMA }),

  () => agent(`Survey the GeoViz admin surface. Return structured JSON.

Focus areas:
- src/app/admin/page.tsx — main admin index, what columns/data shown per order
- src/app/admin/orders/page.tsx — orders detail
- src/app/admin/reports/page.tsx — report admin
- src/app/admin/calibration/page.tsx — calibration page (already has model probe UI)
- src/app/admin/actions.ts — server actions
- src/app/api/admin/orders/[id]/* (find existing endpoints with: find src/app/api/admin -type f)
- src/lib/admin-auth.ts, admin-secret.ts — auth model

For each, list:
- Current admin order list columns
- Whether per-audit model execution status (OpenAI/Claude/Gemini/Perplexity SUCCESS/FAILED/SKIPPED) is visible anywhere today
- Whether there is an existing "internal trace mode" / diagnostics drawer for an audit
- What data already exists in DB that could power per-provider telemetry (look at aiValidations shape — it already contains per-provider records, so this is largely a UI/read problem, not a data problem)

Surface gaps relevant to the v2 spec:
- No per-provider chip on the orders list?
- No detail view that shows raw validator outputs + latency + tokens?
- No internal-only audit trace mode (raw signals, model outputs, category scores, penalties, bonuses, confidence calculations, weighting)?

Be specific with file:line citations. Read the actual files.`, { phase: 'Discover', label: 'survey:admin', schema: DISCOVERY_SCHEMA }),

  () => agent(`Survey the GeoViz PDF + customer-language pipeline. Return structured JSON.

Focus areas:
- src/lib/generate-pdf.ts — Puppeteer entry, page settings, margins, viewport, wait conditions
- src/app/report/[id]/print/page.tsx — what the printed page renders
- src/app/report/[id]/print/print.css — print stylesheet (the operative file for ALL PDF visual fixes)
- src/app/globals.css — global tokens that bleed into print
- scripts/geo-worker.ts — the prompt block(s) that generate customer-facing copy. Identify the load-bearing prompt sections that define section headings (Schema / Crawler Readiness / Brand Entity Clarity / Trust Signals / Technical Accessibility). DO NOT propose scoring rule changes — scoring is frozen.

For each, list:
- Where customer-facing technical jargon enters the report (worker prompt section names, headings, body language)
- Known PDF rendering issues today: URLs splitting (https:// → "ttps://"), word breaks, overlapping sections, heading collisions, text truncation
- Whether print.css currently has rules for word-break, overflow-wrap, page-break-inside, orphan/widow control on URLs
- The exact CSS rules and locations where fixes would land

Identify the natural place to do the customer-language rewrite:
- Heading-only rewrite at the parse/render boundary (preserve raw worker output for telemetry, swap headings for customer-facing labels at render time)?
- Or rewrite the worker prompt directly?
- The first option preserves frozen surfaces. Recommend that.

Surface gaps with file:line citations.`, { phase: 'Discover', label: 'survey:pdf-copy', schema: DISCOVERY_SCHEMA }),
])

log(`Discovery complete: validators(${validatorSurvey?.key_files?.length || 0} files), report(${reportSurvey?.key_files?.length || 0}), admin(${adminSurvey?.key_files?.length || 0}), pdf(${pdfSurvey?.key_files?.length || 0})`)

phase('Verify')

const liveVerify = await agent(`Run the live multi-model validator smoke test and report results.

Steps:
1. Run: cd /Users/davidshinavar/geoviz && npx tsx scripts/test-live-validators.ts 2>&1 | tail -200
2. Parse the output for per-provider status (openai / anthropic / gemini / perplexity)
3. Capture latency and tokens where the script logs them
4. If any provider failed, capture the failure reason from the output
5. Return structured JSON per the schema

Constraints:
- Do not invent provider statuses. If the script does not print latency or tokens for a provider, omit those fields for that provider.
- If the script exits non-zero, that does NOT mean overall_pass=false unless ALL providers failed — set overall_pass=true if at least 2 providers returned successfully (matches the consensus N>=2 requirement in CLAUDE.md scoring constitution).
- raw_excerpt: include the last ~40 lines of stdout so the operator can audit.
- If ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / PERPLEXITY_API_KEY are missing, the test will fail with an env error — capture that as the failure_reason for the affected providers and mark them skipped.

This is a real network call. Spend conservatively — one run only.`, { phase: 'Verify', label: 'verify:live-validators', schema: VERIFY_SCHEMA })

if (!liveVerify || !liveVerify.overall_pass) {
  log(`WARNING: live validator verification did not pass. Continuing with implementation anyway — the structural work (admin telemetry, report sections) is still valuable even if a provider is currently offline. Failure detail: ${JSON.stringify(liveVerify?.providers || 'no result')}`)
}

phase('Implement')

const validatorContext = JSON.stringify(validatorSurvey, null, 2)
const reportContext = JSON.stringify(reportSurvey, null, 2)
const adminContext = JSON.stringify(adminSurvey, null, 2)
const pdfContext = JSON.stringify(pdfSurvey, null, 2)
const verifyContext = JSON.stringify(liveVerify, null, 2)

const [adminImpl, reportImpl, pdfImpl] = await parallel([
  () => agent(`You are implementing the ADMIN TELEMETRY + INTERNAL TRACE MODE track of GeoViz report v2.

Scope of YOUR track (you own these files exclusively — no other agent will touch them in this run):
- src/app/admin/page.tsx
- src/app/admin/orders/page.tsx
- src/app/admin/actions.ts
- Any NEW files under src/app/admin/orders/[id]/ if a detail route does not already exist
- A new internal-only trace view: e.g. src/app/admin/trace/[id]/page.tsx OR a drawer inside an existing admin order detail

DO NOT touch:
- src/components/AuditReportContent.tsx (report sections track owns this)
- src/lib/parse-report.ts (report sections track)
- src/lib/generate-pdf.ts or print.css (pdf/copy track)
- scripts/geo-worker.ts (pdf/copy track may touch headings only)
- prisma/schema.prisma (no schema changes this run — aiValidations and consensusIndex already exist)

Implementation requirements:

1. **Per-audit model execution panel** (visible in admin order detail or admin index):
   - Show OpenAI / Anthropic / Gemini / Perplexity each with: SUCCESS / FAILED / SKIPPED chip, latency (ms if available), tokens (if available), timestamp.
   - Read directly from AuditIntelligence.aiValidations (Json column on AuditOrder via the relation already in prisma/schema.prisma).
   - On null (validator step didn't run for this audit), show "Not run" — do NOT fabricate participation.
   - On per-provider null (provider failed within a run that did run), show FAILED with reason if captured.

2. **Internal-only audit trace mode**:
   - Behind admin auth (password gate using ADMIN_PASSWORD via existing admin-auth.ts).
   - Displays raw signals, full model outputs (aiValidations JSON pretty-printed), category scores, penalties, bonuses, confidence calculations, weighting, final score calculations, audit diagnostics. Pull from existing DB: AuditOrder + AuditIntelligence (aiValidations, consensusIndex, preflightSignals, plus any score-provenance columns).
   - Customers must NEVER see this — it is a separate admin route, not embedded in the customer report.
   - Make it copy-friendly (raw JSON in <pre>, monospace, with copy buttons if cheap).

3. **Status pills** must reuse existing Tailwind utility classes from src/app/globals.css (.pill, .card, .muted, .mono-data). Do NOT add new style files. Status colors: use existing severity.{critical,warning,info} tokens from tailwind.config.ts (critical for FAILED, warning for partial, info for SKIPPED, accent.DEFAULT or a green-leaning hue from existing tokens for SUCCESS — if no green token exists, use a neutral .pill with a check icon).

4. Components must use the existing named-export pattern (export function X()). No default exports.

5. Server data fetching: use the existing patterns in src/app/admin/page.tsx (Prisma direct, server component). Do not add tRPC, React Query, etc.

Context from the discovery phase:

ADMIN SURVEY:
${adminContext}

VALIDATOR SURVEY (so you understand the shape of aiValidations):
${validatorContext}

LIVE VERIFY RESULT (so you can shape statuses correctly):
${verifyContext}

DELIVERABLE: edit/create the files, then return the IMPL_SCHEMA JSON.

Working directory: /Users/davidshinavar/geoviz`, { phase: 'Implement', label: 'impl:admin-telemetry', schema: IMPL_SCHEMA }),

  () => agent(`You are implementing the REPORT SECTIONS + EVIDENCE-BASED FINDINGS track of GeoViz report v2.

Scope of YOUR track (you own these files exclusively):
- src/components/AuditReportContent.tsx (add new sections; the Cross-Model section around line 340 + 990-1130 already exists — DO NOT duplicate it; instead add the new sections AROUND it)
- src/components/ReportView.tsx if it composes sections
- src/lib/parse-report.ts (additive helpers only — DO NOT touch bandLabelForOverall at line 325 or any other frozen scoring function)
- src/lib/report-sections.ts (additive section enum/types)
- Any NEW component files for new sections, e.g. src/components/AiInputsAnalyzed.tsx, src/components/FourModelGrid.tsx, src/components/ConsensusSummary.tsx, src/components/EvidenceFinding.tsx, src/components/WhyYouReceivedThisScore.tsx

DO NOT touch:
- Anything under src/app/admin/ (admin track owns those)
- src/lib/generate-pdf.ts, src/app/report/[id]/print/print.css (pdf track)
- scripts/geo-worker.ts (pdf track may touch prompt headings only)
- prisma/schema.prisma (no schema changes)
- bandLabelForOverall, scoreToneFromOverall, parseReportScoreBreakdown — all FROZEN per CLAUDE.md scoring freeze.

Implementation requirements:

1. **AI INPUTS ANALYZED section** (insert near the beginning, before Section 01):
   - Heading: "AI Inputs Analyzed" (intelligence-grade tone per CLAUDE.md).
   - List: Homepage Content, Service Pages, Contact Information, Business Details, robots.txt, sitemap.xml, Structured Business Data, FAQ Content, Reviews and Testimonials, Internal Links, Metadata, Entity Signals.
   - Each marked FOUND / PARTIAL / NOT FOUND.
   - Source: read from AuditIntelligence.preflightSignals (Json) where available — fields like robotsTxt, sitemap, jsonLd, entityFields, canonicalChain. If preflightSignals is null for this audit (older audits), show "Not analyzed" rather than fabricate.
   - Customer-language only. No "JSON-LD", no "structured data" — say "Structured Business Data".

2. **HOW AI CURRENTLY UNDERSTANDS YOUR BUSINESS** — four-model grid:
   - One card per model: ChatGPT, Claude, Gemini, Perplexity.
   - Each card: Business Identity (Strong/Moderate/Weak), Service Understanding, Location Understanding, Trust Confidence, Knowledge Gaps (short prose).
   - Source: derive from aiValidations[].response per provider. The validator output already contains dimension scores — look at src/lib/validators/types.ts for the exact shape, and consensus/dimensions.ts for the mapping. Do NOT invent fields the validators don't return.
   - If a provider failed: show "Analysis unavailable" for that card. NEVER fabricate.
   - DO NOT expose prompts, chain of thought, internal reasoning, model weighting, scoring formulas, or proprietary methodology. Show only the per-dimension verdict and the knowledge gaps text.

3. **AI CONSENSUS SUMMARY**:
   - Insert AFTER the four-model grid and BEFORE the existing Cross-Model Intelligence section (the existing one is the technical reading from consensusIndex; the new Summary is the plain-English distillation).
   - Lines: "All N AI systems identified the company as [X]." "N of M systems understood the services offered." "All N systems had difficulty verifying [Y]." Build these from consensusIndex.agreementByDimension where possible. Fail-soft when consensusIndex is null (skip the section).
   - End with "Overall AI Recommendation Confidence: LOW / MODERATE / HIGH" derived from consensusIndex.overallAgreement OR aiValidations.length (>=3 high agreement = HIGH; >=2 medium = MODERATE; otherwise LOW). Do NOT derive a new score — this is a confidence label, not a score.

4. **EVIDENCE-BASED FINDINGS format**:
   - Within existing finding lists (the "What To Fix First" / category breakdown sections), each finding renders with four sub-blocks: WHAT WE FOUND / WHY IT MATTERS / BUSINESS IMPACT / RECOMMENDED FIX.
   - If the parsed finding from parse-report.ts doesn't currently split into those four blocks, add a helper in parse-report.ts (additive — new export, do not modify existing exports) that splits a finding's markdown into those four labeled blocks. Fall back to "What We Found" only when the structure isn't present.
   - DO NOT touch scoring — this is rendering only.

5. **WHY YOU RECEIVED THIS SCORE**:
   - New section near the top (after AI Inputs Analyzed, before Section 01).
   - Two columns: "Top Positive Contributors" (checkmarks) and "Top Negative Contributors" (X marks).
   - Derive from the parsed category breakdown: top 3 categories with highest sub-score = positive; top 3 with lowest = negative. Use customer language ("Testimonials detected" not "Trust Signals scored 12/20").
   - This is descriptive, not a score recalculation.

6. **Customer-language pass on existing section headings** (RENDER-LAYER ONLY):
   - In the report component, map technical headings to customer-facing ones at render time:
     - "Schema / Structured Data" → "AI systems cannot easily verify your business" / "How AI Verifies Your Business"
     - "Crawler Readiness" / "AI Crawler Readiness" → "Can AI Read Your Website?"
     - "Brand Entity Clarity" → "How Clearly AI Understands Your Business"
     - "Trust Signals" / "Local Trust Signals" → "Reasons AI Would Trust Your Business"
     - "Technical Accessibility" → "Can AI Access Your Information?"
     - "Content Depth + FAQ Quality" → "How Well Your Content Answers Customer Questions"
   - DO NOT change worker prompt or scoring labels. Keep the canonical category names in DB/telemetry exactly as today. ONLY swap the display label at the render boundary.

7. Reuse existing components (CategoryScoreCard, StrengthCard, ReportScoreCard, Prose). Use tokens from tailwind.config.ts (ink, accent, severity, cyan-only-for-radar). Restrained motion per CLAUDE_DESIGN.md.

Context from discovery:

REPORT SURVEY:
${reportContext}

VALIDATOR SURVEY (for aiValidations + consensusIndex shape):
${validatorContext}

LIVE VERIFY (so you see realistic provider data flow):
${verifyContext}

DELIVERABLE: edit/create the files, return IMPL_SCHEMA JSON. The customer-facing report shape is a frozen surface — additions are fine, redesigns of Sections 01-06 are NOT (per CLAUDE.md scoring constitution).

Working directory: /Users/davidshinavar/geoviz`, { phase: 'Implement', label: 'impl:report-sections', schema: IMPL_SCHEMA }),

  () => agent(`You are implementing the PDF QUALITY FIXES + WORKER PROMPT CUSTOMER-LANGUAGE track of GeoViz report v2.

Scope of YOUR track (you own these files exclusively):
- src/app/report/[id]/print/print.css (PDF visual layer — operative file for all PDF fixes per .claude/rules/figma-design-system.md)
- src/lib/generate-pdf.ts (Puppeteer config — margins, wait conditions, viewport)
- scripts/geo-worker.ts (worker prompt — narration only; you may adjust section heading instructions to be more business-friendly BUT must not touch scoring rules, ladder anchors, calibration bands, band thresholds, structural synergy bonus, or any rubric block — all frozen per CLAUDE.md "Scoring Freeze")

DO NOT touch:
- src/components/AuditReportContent.tsx, ReportView.tsx (report sections track)
- src/app/admin/* (admin track)
- src/lib/parse-report.ts (report sections track)
- prisma/schema.prisma

Implementation requirements:

1. **PDF: URL break fix** ("https://" → "ttps://" loss):
   - Add to print.css: long-URL handling. Recommended rule:
     a, .url-text, .mono-data {
       word-break: break-word;
       overflow-wrap: anywhere;
       hyphens: none;
     }
   - Audit existing print.css for any rule that sets word-break:break-all on the body or shared containers — that's the most likely culprit for the "ttps://" loss because break-all will shatter the "h" off.
   - Add validation check inside generate-pdf.ts: after Puppeteer renders, take page.content() and grep for known truncation patterns ('ttps://', 'ttp://'). If present, log a warning and let the operator know via the existing logging surface (do NOT fail the PDF — soft warning so audit delivery isn't blocked).

2. **PDF: word/heading splitting**:
   - print.css additions: orphans: 3; widows: 3; on .report-prose. page-break-inside: avoid on .card, .cta-card, finding blocks, .section-eyebrow + h2 pair. h2/h3 page-break-after: avoid.
   - hyphens: manual on prose; hyphens: none on headings, URLs, mono-data.

3. **PDF: overlapping sections / heading collisions**:
   - Audit @page margins in print.css. If the current setup is < 14mm top/bottom, bump to 18mm. Verify against existing CTA card hanging off page.
   - Add break-before: page; on section-level dividers if not present.

4. **PDF: spacing / layout consistency**:
   - Ensure consistent margin-top/bottom on h2 and h3 across all surfaces.
   - Ensure .pill and status chips don't wrap mid-pill (white-space: nowrap on chip text).

5. **Customer-language pass on worker prompt** (geo-worker.ts):
   - The worker prompt currently emits technical category headings (Schema / Structured Data, AI Crawler Readiness, etc.). The frozen scoring rubric uses these as canonical category names — DO NOT rename them in the rubric or scoring blocks.
   - You MAY add an instruction to the worker prompt's "Customer-facing narration" section (or equivalent — find it before editing) that tells the model to use plain business language in the prose body and finding descriptions: avoid "JSON-LD" / "schema.org" / "robots.txt" / "crawler" as customer-visible terms; instead use "AI cannot easily verify your business", "AI cannot read your website", etc.
   - If no such "Customer-facing narration" section exists in the prompt, add it as a NEW instruction block clearly labeled, placed AFTER the rubric blocks (not inside them). Frozen rubric blocks remain unmodified.
   - Keep the section heading mapping in sync with what the report-sections track does at render layer — coordinate by adopting the same target labels:
     - "Can AI Read Your Website?"
     - "How Clearly AI Understands Your Business"
     - "Reasons AI Would Trust Your Business"
     - "Can AI Access Your Information?"
     - "How Well Your Content Answers Customer Questions"
     - "How AI Verifies Your Business" (for the schema/structured-data category)

6. **No fabricated provider participation**: in any prompt instruction asking the model to summarize cross-model behavior, explicitly state that if a provider returned null in aiValidations[], the prose must say "Analysis unavailable" for that provider — never invent findings.

Context from discovery:

PDF SURVEY:
${pdfContext}

REPORT SURVEY (for heading-label coordination):
${reportContext}

DELIVERABLE: edit the files, return IMPL_SCHEMA JSON. Verify print.css changes are syntactically valid CSS.

Working directory: /Users/davidshinavar/geoviz`, { phase: 'Implement', label: 'impl:pdf-copy', schema: IMPL_SCHEMA }),
])

const implResults = [adminImpl, reportImpl, pdfImpl].filter(Boolean)
const totalFilesChanged = implResults.reduce((s, r) => s + (r.files_changed?.length || 0), 0)
const totalBlockers = implResults.flatMap(r => r.blockers || [])
log(`Implementation: ${implResults.length}/3 tracks reported, ${totalFilesChanged} files touched, ${totalBlockers.length} blockers`)

phase('Validate')

const validation = await agent(`Validate the GeoViz report v2 implementation before declaring success. Be honest — if something is broken, report it.

Steps:
1. Run TypeScript check: cd /Users/davidshinavar/geoviz && npx tsc --noEmit 2>&1 | tail -50
   - Report typecheck_pass true only if exit is 0.
   - If failures, include the tail of errors.

2. Sample report render dry-run:
   - Find a recent audit ID with non-null aiValidations from the DB. Quick path: cd /Users/davidshinavar/geoviz && npx tsx -e "import {prisma} from './src/lib/db'; (async () => { const o = await prisma.auditOrder.findFirst({where: {intelligence: {aiValidations: {not: null}}}, include: {intelligence: true}, orderBy: {createdAt: 'desc'}}); console.log(JSON.stringify({id: o?.id, hasIntel: !!o?.intelligence, hasValidations: !!o?.intelligence?.aiValidations, hasConsensus: !!o?.intelligence?.consensusIndex}, null, 2)); await prisma.\$disconnect(); })()"
   - Verify the new sections (AI Inputs Analyzed, four-model grid, AI Consensus Summary, Why You Received This Score) appear in the parsed component tree when the sample input includes preflightSignals + aiValidations + consensusIndex.
   - You can verify by reading the modified component files and confirming the new sections are conditionally rendered when those props exist, and gracefully hidden / "not analyzed" when they are null.
   - sample_render_pass = true if: (a) typecheck passed, (b) the new components exist as exported named functions, (c) they conditionally render on data presence without throwing on null.

3. Spot-check that frozen surfaces are untouched:
   - git diff src/lib/parse-report.ts | grep -E "bandLabelForOverall|scoreToneFromOverall|parseReportScoreBreakdown" — should produce NO matches inside the function bodies (only context lines). If the frozen functions were modified, add a blocker.
   - git diff scripts/geo-worker.ts | grep -E "Calibration v2|ladder anchors|Structural Synergy|score-bands mandate" — must show no scoring-rule changes, only narration additions.
   - git diff prisma/schema.prisma — must be empty (no schema changes this run).

4. Spot-check fabrication-safety:
   - Read the new four-model grid component. Confirm it shows "Analysis unavailable" when a provider entry is null, rather than rendering fabricated values.
   - Read the new consensus summary. Confirm it returns null / hides itself when consensusIndex is null, rather than rendering empty bullets.

5. Return VALIDATE_SCHEMA JSON. blockers should list anything that needs a follow-up human review.

Working directory: /Users/davidshinavar/geoviz`, { phase: 'Validate', label: 'validate:final', schema: VALIDATE_SCHEMA })

return {
  validator_verify: liveVerify,
  admin_track: adminImpl,
  report_track: reportImpl,
  pdf_track: pdfImpl,
  validation,
  total_files_changed: totalFilesChanged,
  total_blockers: totalBlockers,
}
