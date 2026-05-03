# Report Generator — Usage

This is the layer that converts raw audit JSON (from the geo-seo-claude crawl engine) into a client-ready **AI Visibility Report**. It exists because raw JSON is not sellable — a local business owner does not want to read `structured_data: []`. They want to know whether ChatGPT recommends them, and what to fix.

## What's in this layer

```
src/lib/reporting/
  types.ts                       Shared types (RawAuditJson, VisibilityReport, Finding, ...)
  generateVisibilityReport.ts    Raw audit JSON  →  VisibilityReport object
  generateMarkdownReport.ts      VisibilityReport →  clean markdown for email / Docs / PDF
  sampleAudit.ts                 Hardcoded Integrity Home Exteriors sample audit

src/components/ReportView.tsx    Premium dark UI render of a VisibilityReport

src/app/sample-report/page.tsx   Public marketing sample (uses the generator)
src/app/report-preview/page.tsx  Internal preview (renders generator + markdown export)
```

## How a raw crawl becomes a report

1. The geo-seo-claude engine crawls a URL and produces raw JSON with fields like `title`, `meta`, `h1`, `word_count`, `links`, `images`, `structured_data`, `security_headers`, `text_content`, `errors`.
2. Paste that JSON into `generateVisibilityReport(audit)`.
3. The generator:
   - **Scores** the site out of 100 using deterministic deductions (see _Scoring rules_ below).
   - **Translates** technical findings into plain-English issue cards with a `What it means / Why it matters / Recommended fix` structure.
   - **Splits** findings into **AI visibility** (schema, service clarity, location clarity, FAQ, depth) vs **technical** (title, meta, H1, alt text, security headers, internal links).
   - **Sorts** the top 5 most severe issues into `topIssues`.
   - **Generates quick wins** (low-effort items the owner can do today).
   - **Builds a prioritized fix list** ranked by `Impact: Highest → Low`.
   - **Adds the upsell block** ("GEO Foundation Fix — starting at $497").
4. Render the result with `<ReportView report={report} />` or pass it to `generateMarkdownReport()` for an export.

### Scoring rules

Start at 100, subtract:

| Issue                                         | Penalty |
| --------------------------------------------- | ------: |
| Missing structured data                       |     −20 |
| Missing title                                 |     −10 |
| Missing meta description                      |     −10 |
| No H1 tags                                    |     −10 |
| Word count under 500                          |     −10 |
| Any image missing alt text                    |     −10 |
| Missing required security headers             |      −5 |
| No internal links                             |      −5 |
| Service or location clarity not detected      |     −15 |

Clamped to `[0, 100]`.

| Score   | Status      |
| ------- | ----------- |
| 75–100  | Strong      |
| 50–74   | Needs Work  |
| 0–49    | At Risk     |

## Manual fulfillment workflow

This is the workflow until automation is added.

1. Customer pays through Stripe Checkout (existing flow).
2. Order lands in `/admin` (existing).
3. **You** run the geo-seo-claude crawl engine against the customer's URL.
4. Save the raw JSON output.
5. Build the report — choose one option:

### Option A — Quick: drop into the preview page

   - Open `src/lib/reporting/sampleAudit.ts`.
   - Temporarily replace the export with the customer's raw JSON (typed as `RawAuditJson`).
   - Run `npm run dev` and visit `http://localhost:3000/report-preview`.
   - Visually verify, then either:
     - Print to PDF from the browser, or
     - Copy the **Markdown export** block at the bottom and paste into Google Docs.
   - Revert `sampleAudit.ts` back to the Integrity sample.

### Option B — Cleaner: write a one-off script

   ```ts
   // scripts/build-report.ts (you create this when needed)
   import fs from "node:fs";
   import { generateVisibilityReport } from "@/lib/reporting/generateVisibilityReport";
   import { generateMarkdownReport } from "@/lib/reporting/generateMarkdownReport";
   import type { RawAuditJson } from "@/lib/reporting/types";

   const raw = JSON.parse(fs.readFileSync(process.argv[2]!, "utf8")) as RawAuditJson;
   const report = generateVisibilityReport(raw);
   fs.writeFileSync("report.md", generateMarkdownReport(report));
   fs.writeFileSync("report.json", JSON.stringify(report, null, 2));
   ```

6. Send the markdown / PDF to the customer.
7. Mark the order **completed** in `/admin`.

## How this becomes automated later

The conversion layer is already pure: `RawAuditJson → VisibilityReport`. Future automation only needs to:

1. Trigger the geo-seo-claude crawl from the Stripe webhook (or an admin button) using the saved `websiteUrl`.
2. Pipe the resulting JSON straight into `generateVisibilityReport()`.
3. Render the result server-side as PDF (e.g. with a headless browser hitting `/report-preview?orderId=…`) and email it via Resend.
4. Update the `AuditOrder.auditStatus` to `completed`.

No changes to the conversion layer are needed — only an orchestration layer above it. **Do not build that yet.** Manual fulfillment first; automate after the first 5 paying customers.

## Out of scope (do not add here)

- Stripe changes
- Dashboards, auth, subscriptions, white-label
- The crawl engine itself — that lives in geo-seo-claude
- Per-platform AI testing (ChatGPT/Claude/Perplexity probes)
