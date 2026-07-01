/* eslint-disable no-console */
/**
 * scripts/launch-loop.ts
 *
 * GeoViz Launch Loop — validates all 25 QA reports against the full
 * production gate without running new audits, creating AuditOrders,
 * or making LLM calls.
 *
 * Usage: npm run launch:loop
 *
 * Requires:
 *   - ADMIN_SECRET env var
 *   - Running dev server at APP_URL (default: http://localhost:3000)
 *
 * Phases:
 *   1. REVIEW  — fetch [CAL] reports, validate HTML text + page count + fallbacks
 *   2. PDF     — check each report's PDF endpoint for a valid response
 *                Note: PDF generation requires a browser binary. On macOS dev
 *                without PUPPETEER_EXECUTABLE_PATH set, PDF checks are downgraded
 *                to a warning (PDFs work fine on Railway/Linux in production).
 *   3. JUDGE   — run report:validate + report:validate:live as subprocesses
 *   4. OUTPUT  — append cycle results to LAUNCH_LOOP_REPORT.md, exit 0/1
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";

// ── Configuration ──────────────────────────────────────────────────────────

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const APP_URL =
  process.env.APP_URL ??
  process.env.NEXTAUTH_URL ??
  "http://localhost:3000";
const REPORT_PATH = join(process.cwd(), "LAUNCH_LOOP_REPORT.md");
const MAX_HTML_CONCURRENCY = 5;
const MAX_PDF_CONCURRENCY = 2;
const EXPECTED_PAGE_COUNT = 8;

// ── Production gate patterns ───────────────────────────────────────────────
// Canonical list — mirrors PRODUCTION_GATE in scripts/validate-report-fixtures.ts
// Third element is a source hint for where to look when the pattern fires.

const PRODUCTION_GATE: Array<[RegExp, string, string]> = [
  [
    /json-?ld\s+block/i,
    "json-ld block jargon",
    "scripts/geo-worker.ts (audit prompt)",
  ],
  [
    /\blocalbusiness\b/i,
    "LocalBusiness jargon",
    "scripts/geo-worker.ts or src/lib/parse-report.ts",
  ],
  [
    /\bnap\s+consistency\b/i,
    "NAP consistency jargon",
    "scripts/geo-worker.ts (audit prompt)",
  ],
  [
    /no response captured/i,
    "internal error string",
    "scripts/geo-worker.ts (error handling)",
  ],
  [
    /fields?\s+missing:.*\bgeo\b/i,
    "raw field 'geo'",
    "src/lib/scoring/ or scripts/geo-worker.ts prompt",
  ],
  [
    /fields?\s+missing:.*\bopeninghours\b/i,
    "raw field 'openingHours'",
    "src/lib/scoring/ or scripts/geo-worker.ts prompt",
  ],
  [
    /\bundefined\b/,
    "literal 'undefined'",
    "src/app/report/[id]/print/page.tsx or src/lib/report/*.tsx (null-safe rendering)",
  ],
  [
    /\[object\s*Object\]/i,
    "[object Object]",
    "src/app/report/[id]/print/page.tsx (object rendered as string)",
  ],
  [
    /best and /i,
    "broken question template",
    "scripts/geo-worker.ts customer questions section",
  ],
  [
    /best or /i,
    "broken question template",
    "scripts/geo-worker.ts customer questions section",
  ],
  [
    /\[CAL\]/i,
    "[CAL] calibration label leak",
    "report template businessName display — [CAL] prefix should be stripped",
  ],
  [
    /\bNaN\b/,
    "NaN value leak",
    "src/lib/report/ score rendering components",
  ],
  [
    /\bTODO\b/,
    "TODO comment leak",
    "check recently modified template files",
  ],
  [
    /\bFIXME\b/,
    "FIXME comment leak",
    "check recently modified template files",
  ],
  [
    /\bnull\b/,
    "literal 'null' leak",
    "src/app/report/[id]/print/page.tsx or src/lib/report/*.tsx (null-safe rendering)",
  ],
  [
    /defaulting to low/i,
    "defaulting-to-low fallback leak",
    "src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer",
  ],
  [
    /\b0\s+homepage\s+words?\b/i,
    "0 homepage words",
    "src/lib/intelligence/preflight/ or report template",
  ],
  [
    /\b0\s+words?\s+(?:detected|found|extracted)\b/i,
    "0 words extracted",
    "src/lib/intelligence/preflight/ content extraction",
  ],
  [
    /Industry benchmark forming/i,
    "'benchmark forming' copy (should be replaced)",
    "scripts/geo-worker.ts benchmark copy section",
  ],
  [
    /nonprofit\s+audits?/i,
    "nonprofit benchmark on non-nonprofit report",
    "scripts/geo-worker.ts benchmark cohort logic",
  ],
  [
    /nonprofit\s+peers?/i,
    "nonprofit peer benchmark leak",
    "scripts/geo-worker.ts benchmark cohort logic",
  ],
];

// Category fallback patterns — checked against rendered HTML separately
// These appear in generic AI question templates when business context was missing.
const CATEGORY_FALLBACKS: Array<[RegExp, string]> = [
  [
    /who are the best businesses in this category/i,
    "generic category fallback question",
  ],
  [
    /can you recommend a reliable provider like/i,
    "generic provider recommendation fallback",
  ],
  [
    /what should I look for when choosing a business in this category/i,
    "generic business category fallback",
  ],
];

// ── Platform detection ─────────────────────────────────────────────────────

// On macOS dev without PUPPETEER_EXECUTABLE_PATH, the @sparticuz/chromium
// binary is Linux-only and PDF generation fails with 500. Downgrade PDF
// failures to warnings in that case — PDFs work correctly on Railway/Linux.
function isPdfCheckReliable(): boolean {
  if (platform() !== "darwin") return true;
  return !!process.env.PUPPETEER_EXECUTABLE_PATH;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countPageSections(html: string): number {
  return (html.match(/<section[^>]*class="[^"]*rd-page[^"]*"/g) ?? []).length;
}

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

function determineCycle(): number {
  if (!existsSync(REPORT_PATH)) return 1;
  const content = readFileSync(REPORT_PATH, "utf-8");
  const matches = content.match(/^## Cycle \d+/gm) ?? [];
  return matches.length + 1;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface BatchResult {
  orderId: string;
  url: string;
  status: string;
  businessName?: string | null;
}

interface PatternIssue {
  description: string;
  matched: string;
  sourceHint: string;
}

interface HtmlCheckResult {
  orderId: string;
  url: string;
  pass: boolean;
  issues: PatternIssue[];
  fallbackIssues: string[];
  pageCount: number;
  pageCountPass: boolean;
  httpStatus?: number;
  fetchError?: string;
}

interface PdfCheckResult {
  orderId: string;
  url: string;
  pass: boolean;
  httpStatus?: number;
  contentType?: string;
  sizeBytes?: number;
  error?: string;
}

interface SubValidatorResult {
  pass: boolean;
  output: string;
}

// ── Phase 1: HTML validation ───────────────────────────────────────────────

async function checkHtml(
  report: BatchResult,
  adminSecret: string,
): Promise<HtmlCheckResult> {
  const printUrl = `${APP_URL}/report/${report.orderId}/print`;
  let html = "";
  let httpStatus: number | undefined;

  try {
    const res = await fetch(printUrl, {
      headers: { "x-admin-secret": adminSecret },
    });
    httpStatus = res.status;
    if (!res.ok) {
      return {
        orderId: report.orderId,
        url: report.url,
        pass: false,
        issues: [
          {
            description: `HTTP ${res.status} fetching print page`,
            matched: printUrl,
            sourceHint: "Check dev server is running at " + APP_URL,
          },
        ],
        fallbackIssues: [],
        pageCount: 0,
        pageCountPass: false,
        httpStatus,
      };
    }
    html = await res.text();
  } catch (e) {
    return {
      orderId: report.orderId,
      url: report.url,
      pass: false,
      issues: [
        {
          description: "Fetch error",
          matched: String(e),
          sourceHint: "Check dev server is running at " + APP_URL,
        },
      ],
      fallbackIssues: [],
      pageCount: 0,
      pageCountPass: false,
      fetchError: String(e),
    };
  }

  const visibleText = stripHtml(html);
  const pageCount = countPageSections(html);
  const pageCountPass = pageCount === EXPECTED_PAGE_COUNT;

  const issues: PatternIssue[] = [];
  for (const [pattern, description, sourceHint] of PRODUCTION_GATE) {
    if (pattern.test(visibleText)) {
      const match = visibleText.match(pattern);
      issues.push({ description, matched: match?.[0] ?? "?", sourceHint });
    }
  }

  const fallbackIssues: string[] = [];
  for (const [pattern, description] of CATEGORY_FALLBACKS) {
    if (pattern.test(visibleText)) {
      fallbackIssues.push(description);
    }
  }

  const pass =
    issues.length === 0 && fallbackIssues.length === 0 && pageCountPass;

  return {
    orderId: report.orderId,
    url: report.url,
    pass,
    issues,
    fallbackIssues,
    pageCount,
    pageCountPass,
    httpStatus,
  };
}

// ── Phase 2: PDF validation ────────────────────────────────────────────────

async function checkPdf(
  report: BatchResult,
  adminSecret: string,
): Promise<PdfCheckResult> {
  const pdfUrl = `${APP_URL}/api/report/${encodeURIComponent(report.orderId)}/pdf?key=${adminSecret}`;

  try {
    const res = await fetch(pdfUrl, {
      headers: { "x-admin-secret": adminSecret },
    });
    const contentType = res.headers.get("content-type") ?? "";
    const buf = await res.arrayBuffer();
    const sizeBytes = buf.byteLength;

    const isPdf = contentType.includes("application/pdf");
    const hasContent = sizeBytes > 1000;

    let error: string | undefined;
    if (!res.ok) error = `HTTP ${res.status}`;
    else if (!isPdf) error = `Wrong Content-Type: ${contentType}`;
    else if (!hasContent) error = `PDF too small: ${sizeBytes} bytes`;

    return {
      orderId: report.orderId,
      url: report.url,
      pass: res.ok && isPdf && hasContent,
      httpStatus: res.status,
      contentType,
      sizeBytes,
      error,
    };
  } catch (e) {
    return {
      orderId: report.orderId,
      url: report.url,
      pass: false,
      error: `Fetch error: ${String(e)}`,
    };
  }
}

// ── Phase 3: Sub-validators ────────────────────────────────────────────────

function runSubValidator(args: string): SubValidatorResult {
  try {
    const output = execSync(
      `npx tsx scripts/validate-report-fixtures.ts ${args}`,
      {
        encoding: "utf-8",
        timeout: 120_000,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return { pass: true, output };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return { pass: false, output: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

// ── Phase 4: Report generation ─────────────────────────────────────────────

function buildCycleSection(
  cycle: number,
  timestamp: string,
  generated: BatchResult[],
  htmlResults: HtmlCheckResult[],
  pdfResults: PdfCheckResult[],
  fixtureValidation: SubValidatorResult,
  liveValidation: SubValidatorResult,
  pdfReliable: boolean,
): string {
  const htmlFail = htmlResults.filter((r) => !r.pass);
  const pdfFail = pdfResults.filter((r) => !r.pass);
  const totalPatternHits = htmlResults.reduce(
    (n, r) => n + r.issues.length,
    0,
  );
  const fallbackHits = htmlResults.reduce(
    (n, r) => n + r.fallbackIssues.length,
    0,
  );
  const pageCountIssues = htmlResults.filter((r) => !r.pageCountPass);

  // PDF failures on macOS dev (no browser binary) are downgraded to warnings.
  const pdfCountsForGate = pdfReliable;

  const allPass =
    htmlFail.length === 0 &&
    (!pdfCountsForGate || pdfFail.length === 0) &&
    totalPatternHits === 0 &&
    fallbackHits === 0 &&
    fixtureValidation.pass &&
    liveValidation.pass;

  const lines: string[] = [];

  lines.push(`## Cycle ${cycle} — ${timestamp}`);
  lines.push("");
  lines.push("### Summary");
  lines.push(
    `- Reports: ${generated.length} total | HTML pass: ${htmlResults.length - htmlFail.length} | HTML fail: **${htmlFail.length}**`,
  );
  lines.push(
    pdfReliable
      ? `- PDF pass: ${pdfResults.length - pdfFail.length} | PDF fail: **${pdfFail.length}**`
      : `- PDF checks: **SKIPPED** (macOS local dev — no browser binary; verify on Railway)`,
  );
  lines.push(`- Pattern hits: **${totalPatternHits}** | Fallback hits: **${fallbackHits}**`);
  lines.push(
    `- Page count issues: ${pageCountIssues.length} (expected ${EXPECTED_PAGE_COUNT} rd-page sections)`,
  );
  lines.push(
    `- report:validate (fixtures): ${fixtureValidation.pass ? "PASS ✓" : "FAIL ❌"}`,
  );
  lines.push(
    `- report:validate:live: ${liveValidation.pass ? "PASS ✓" : "FAIL ❌"}`,
  );
  lines.push("");

  const activePdfFail = pdfReliable ? pdfFail : [];
  if (htmlFail.length > 0 || activePdfFail.length > 0) {
    lines.push("### Failing Reports");
    lines.push("");

    const failingOrderIds = new Set([
      ...htmlFail.map((r) => r.orderId),
      ...activePdfFail.map((r) => r.orderId),
    ]);

    let n = 1;
    for (const orderId of failingOrderIds) {
      const html = htmlResults.find((r) => r.orderId === orderId);
      const pdf = pdfResults.find((r) => r.orderId === orderId);
      const displayUrl = html?.url ?? pdf?.url ?? orderId;

      lines.push(`${n++}. **${displayUrl}** (\`${orderId.slice(0, 8)}…\`)`);

      if (html && !html.pass) {
        for (const issue of html.issues) {
          lines.push(
            `   - ❌ HTML: matched **"${issue.description}"** — \`${issue.matched}\``,
          );
          lines.push(`     → Source: \`${issue.sourceHint}\``);
        }
        for (const fb of html.fallbackIssues) {
          lines.push(`   - ❌ HTML: category fallback — "${fb}"`);
          lines.push(
            `     → Source: \`scripts/geo-worker.ts\` customer questions template`,
          );
        }
        if (!html.pageCountPass) {
          lines.push(
            `   - ❌ HTML: page count = ${html.pageCount} (expected ${EXPECTED_PAGE_COUNT})`,
          );
          lines.push(
            `     → Source: \`src/app/report/[id]/print/page.tsx\` section structure`,
          );
        }
      }

      if (pdfReliable && pdf && !pdf.pass) {
        lines.push(
          `   - ❌ PDF: ${pdf.error ?? "unknown error"}${pdf.httpStatus ? ` (HTTP ${pdf.httpStatus})` : ""}`,
        );
        lines.push(
          `     → Source: \`src/app/api/report/[id]/pdf/route.ts\` — check Puppeteer/Chromium env`,
        );
      }

      lines.push("");
    }
  } else {
    lines.push("### Failing Reports");
    lines.push("");
    lines.push("None — all reports passed HTML and PDF checks. ✓");
    lines.push("");
  }

  lines.push("### Dashboard Targets");
  lines.push("");
  lines.push(
    `| Check | Actual | Target | Status |`,
  );
  lines.push(`|---|---|---|---|`);
  lines.push(
    `| HTML failures | ${htmlFail.length} | 0 | ${htmlFail.length === 0 ? "✓" : "❌"} |`,
  );
  lines.push(
    pdfReliable
      ? `| PDF failures | ${pdfFail.length} | 0 | ${pdfFail.length === 0 ? "✓" : "❌"} |`
      : `| PDF failures | skipped | 0 | ⚠ macOS dev — verify on Railway |`,
  );
  lines.push(
    `| Template pattern issues | ${totalPatternHits} | 0 | ${totalPatternHits === 0 ? "✓" : "❌"} |`,
  );
  lines.push(
    `| Category fallback hits | ${fallbackHits} | 0 | ${fallbackHits === 0 ? "✓" : "❌"} |`,
  );
  lines.push(
    `| Fixture validation | ${fixtureValidation.pass ? "pass" : "fail"} | pass | ${fixtureValidation.pass ? "✓" : "❌"} |`,
  );
  lines.push(
    `| Live validation | ${liveValidation.pass ? "pass" : "fail"} | pass | ${liveValidation.pass ? "✓" : "❌"} |`,
  );
  lines.push(
    `| Launch readiness | ${allPass ? "QA Ready" : "Not Ready"} | QA Ready | ${allPass ? "✓" : "❌"} |`,
  );
  lines.push("");
  lines.push("### Telemetry");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push("| LLM calls | 0 ✓ |");
  lines.push("| New AuditOrder records | 0 ✓ |");
  lines.push("| Worker jobs triggered | 0 ✓ |");
  lines.push("");

  if (allPass) {
    lines.push(
      "### Launch Recommendation",
    );
    lines.push("");
    lines.push(
      "✅ **All checks passed. Safe to commit and push to main.**",
    );
    lines.push(
      "```\ngit commit -m 'Launch loop: automated report QA regression pass'\n```",
    );
  } else {
    lines.push("### Launch Recommendation");
    lines.push("");
    lines.push(
      "❌ **Not ready for launch.** Resolve the issues listed above, then re-run `npm run launch:loop`.",
    );
    if (cycle >= 5) {
      lines.push(
        "\n⚠ **Cycle 5 reached — maximum cycles exhausted.** Manual review required before proceeding.",
      );
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const timestamp = new Date().toISOString();
  const cycle = determineCycle();

  console.log(
    "═══════════════════════════════════════════════════════",
  );
  console.log("GeoViz Launch Loop");
  console.log(`Cycle ${cycle} of 5  —  ${timestamp}`);
  console.log(`Target: ${APP_URL}`);
  console.log(
    "═══════════════════════════════════════════════════════\n",
  );

  if (!ADMIN_SECRET) {
    console.error(
      "✗ ADMIN_SECRET is not set.\n  Set it in .env and retry.\n",
    );
    process.exit(1);
  }

  // ── Fetch batch ──────────────────────────────────────────────────────────
  console.log("Phase 1: REVIEW — fetching QA batch...\n");

  let batchData: { results?: BatchResult[]; error?: string; total?: number };

  try {
    const batchRes = await fetch(
      `${APP_URL}/api/internal/recover-batch?key=${ADMIN_SECRET}`,
      { headers: { "x-admin-secret": ADMIN_SECRET } },
    );

    if (!batchRes.ok) {
      console.error(
        `✗ Failed to fetch batch: HTTP ${batchRes.status}\n` +
          "  Is the dev server running? Check APP_URL in .env\n",
      );
      process.exit(1);
    }

    batchData = (await batchRes.json()) as typeof batchData;
  } catch (e) {
    console.error(
      `✗ Could not reach ${APP_URL}: ${String(e)}\n` +
        "  Start the dev server with: npm run dev\n",
    );
    process.exit(1);
  }

  if (batchData.error) {
    console.error(`✗ Batch API error: ${batchData.error}\n`);
    process.exit(1);
  }

  const allOrders = batchData.results ?? [];
  const generated = allOrders.filter((r) => r.status === "generated");

  console.log(
    `Found ${allOrders.length} [CAL] orders, ${generated.length} generated.\n`,
  );

  if (generated.length === 0) {
    console.log(
      "⚠ No generated reports found. Run audits first via the admin calibration dashboard.\n",
    );
    process.exit(1);
  }

  // ── HTML validation ──────────────────────────────────────────────────────
  console.log(
    `Checking ${generated.length} HTML reports (max ${MAX_HTML_CONCURRENCY} parallel)...\n`,
  );

  const htmlResults = await withConcurrency(
    generated,
    MAX_HTML_CONCURRENCY,
    (r) => checkHtml(r, ADMIN_SECRET!),
  );

  const htmlFail = htmlResults.filter((r) => !r.pass);
  console.log(
    `HTML: ${htmlResults.length - htmlFail.length} pass, ${htmlFail.length} fail\n`,
  );

  for (const r of htmlFail) {
    console.log(`  ✗ ${r.url}  (${r.orderId.slice(0, 8)}…)`);
    for (const issue of r.issues) {
      console.log(
        `    [${issue.description}] "${issue.matched}"`,
      );
    }
    for (const fb of r.fallbackIssues) {
      console.log(`    [category fallback] ${fb}`);
    }
    if (!r.pageCountPass) {
      console.log(
        `    [page count] got ${r.pageCount}, expected ${EXPECTED_PAGE_COUNT}`,
      );
    }
  }

  // ── PDF validation ───────────────────────────────────────────────────────
  const pdfReliable = isPdfCheckReliable();
  console.log(
    `Phase 2: PDF CHECK — ${generated.length} reports (max ${MAX_PDF_CONCURRENCY} parallel)...\n`,
  );

  if (!pdfReliable) {
    console.log(
      "  ⚠ macOS detected without PUPPETEER_EXECUTABLE_PATH — PDF checks skipped.\n" +
        "    PDFs use @sparticuz/chromium (Linux-only). Verify on Railway/production.\n",
    );
  }

  const pdfResults = await withConcurrency(
    generated,
    MAX_PDF_CONCURRENCY,
    (r) => checkPdf(r, ADMIN_SECRET!),
  );

  const pdfFail = pdfResults.filter((r) => !r.pass);
  if (pdfReliable) {
    console.log(
      `PDF: ${pdfResults.length - pdfFail.length} pass, ${pdfFail.length} fail\n`,
    );
    for (const r of pdfFail) {
      console.log(`  ✗ ${r.url} — ${r.error}`);
    }
  } else {
    console.log("PDF: SKIPPED (macOS dev — no browser binary)\n");
  }

  // ── JUDGE ────────────────────────────────────────────────────────────────
  console.log("\nPhase 3: JUDGE — running existing validators...\n");

  process.stdout.write("  report:validate (fixtures)... ");
  const fixtureValidation = runSubValidator("");
  console.log(fixtureValidation.pass ? "PASS ✓" : "FAIL ❌");

  process.stdout.write("  report:validate:live...        ");
  const liveValidation = runSubValidator("--live");
  console.log(liveValidation.pass ? "PASS ✓" : "FAIL ❌");

  if (!liveValidation.pass) {
    // Surface the live validator output so the caller can see what failed
    console.log("\n  [live validator output]");
    const relevant = liveValidation.output
      .split("\n")
      .filter((l) => l.includes("✗") || l.includes("FAIL") || l.includes("["))
      .slice(0, 20)
      .map((l) => "  " + l)
      .join("\n");
    if (relevant) console.log(relevant);
  }

  // ── OUTPUT ────────────────────────────────────────────────────────────────
  console.log("\nPhase 4: OUTPUT — writing LAUNCH_LOOP_REPORT.md...\n");

  const cycleSection = buildCycleSection(
    cycle,
    timestamp,
    generated,
    htmlResults,
    pdfResults,
    fixtureValidation,
    liveValidation,
    pdfReliable,
  );

  const header = "# GeoViz Launch Loop Report\n\n";
  const existingBody = existsSync(REPORT_PATH)
    ? readFileSync(REPORT_PATH, "utf-8").replace(
        /^# GeoViz Launch Loop Report\n\n/,
        "",
      )
    : "";

  writeFileSync(REPORT_PATH, header + cycleSection + existingBody, "utf-8");
  console.log(`LAUNCH_LOOP_REPORT.md updated (cycle ${cycle}).\n`);

  // ── Final summary ─────────────────────────────────────────────────────────
  const totalPatternHits = htmlResults.reduce(
    (n, r) => n + r.issues.length,
    0,
  );
  const fallbackHits = htmlResults.reduce(
    (n, r) => n + r.fallbackIssues.length,
    0,
  );
  const allPass =
    htmlFail.length === 0 &&
    (!pdfReliable || pdfFail.length === 0) &&
    totalPatternHits === 0 &&
    fallbackHits === 0 &&
    fixtureValidation.pass &&
    liveValidation.pass;

  console.log(
    "═══════════════════════════════════════════════════════",
  );
  if (allPass) {
    console.log("✅  LAUNCH READY — all checks passed.");
    console.log(
      "    Safe to commit:\n" +
        "    git commit -m 'Launch loop: automated report QA regression pass'",
    );
  } else {
    console.log("❌  NOT READY — issues found (see LAUNCH_LOOP_REPORT.md).");
    if (cycle >= 5) {
      console.log(
        "    ⚠  Cycle 5 reached — max cycles exhausted. Manual review required.",
      );
    } else {
      console.log(
        `    Fix the issues above, then re-run: npm run launch:loop  (cycle ${cycle + 1})`,
      );
    }
  }
  console.log(
    "═══════════════════════════════════════════════════════\n",
  );

  process.exit(allPass ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("✗ launch-loop threw unexpectedly:", err);
  process.exit(1);
});
