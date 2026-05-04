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
    // Fast mode — summary + quick wins + score only. Target <60s.
    return `You are a senior GEO (Generative Engine Optimization) consultant. Produce
a compact AI-visibility report.

**Target URL**: ${websiteUrl}${competitorClause}
GEO = optimizing a site so ChatGPT, Claude, Perplexity, Gemini, and Google
AI Overviews can find, understand, cite, and recommend it.

**Web access — minimal.** Fetch ONLY:
  1. The target homepage
  2. /robots.txt
Do NOT crawl. Do NOT fetch sitemap.xml. Do NOT fetch llms.txt unless
robots.txt explicitly references it. Do NOT fabricate findings.

**Output budget: 800–1,200 words total.** Be direct. Markdown only, no
preamble, no closing remarks.

# GEO Audit Report

## 1. Summary (5–7 bullets)
- Biggest issues (3–4 bullets)
- Biggest opportunities (2–3 bullets)

## 5. Quick Wins (Top 5)
Numbered 1–5 by ROI. Each: one-line action + one-line "why".

## 6. Score (0–100)
Score + status (Poor / At Risk / Competitive / Strong / Elite). 2–3 line
reasoning.

End immediately after the score reasoning. No closing summary.`;
  }

  return `You are a senior GEO (Generative Engine Optimization) consultant. Produce
a concise, client-ready AI-visibility audit in markdown.

**Target URL**: ${websiteUrl}${competitorClause}
GEO = optimizing a site so ChatGPT, Claude, Perplexity, Gemini, and Google
AI Overviews can find, understand, cite, and recommend it.

**Web access — use sparingly.** Fetch ONLY:
  1. The target homepage
  2. /robots.txt
  3. /llms.txt (if present; if 404, note it)
  4. The competitor homepage if provided
Do NOT crawl every page on the site. Do NOT fetch sitemap.xml unless
robots.txt directly references it. Do NOT fabricate findings — every
claim must trace back to one of those fetches.

**Output budget: 1,500–2,500 words total.** Be direct. Cut filler. No
preamble, no closing remarks. Markdown only. No repeating the same
issue across sections.

# GEO Audit Report

## 1. Summary (5–7 bullets)
- Biggest issues (3–4 bullets)
- Biggest opportunities (2–3 bullets)

## 2. Technical Issues
Cover only what's actually visible on the homepage:
- SEO basics (title, meta description, h1/h2 structure)
- Performance issues (page weight, render-blocking, large unoptimized images)
- Mobile / responsiveness signals
- Broken or missing elements (404 assets, empty links, missing favicon)
3–6 bullets max. One sentence each. Skip anything you can't substantiate.

## 3. Content & Messaging
- Clarity of offer (what they sell, in plain words)
- Trust signals (reviews, testimonials, certifications, years in business)
- Conversion issues (above-the-fold clarity, friction)
- CTA quality (visible, specific, action-verb)
3–5 bullets. Each: one-line gap + one-line lost-lead consequence.

## 4. Local SEO (VERY IMPORTANT)
- Location signals (city/region named in title/H1/copy)
- Service area clarity (cities, zips, neighborhoods listed)
- NAP consistency (name / address / phone visible and consistent)
- Schema (LocalBusiness, Service, FAQPage — note what's present from
  the rendered HTML, what's missing)
3–5 bullets. If a critical schema is missing, include ONE paste-ready
JSON-LD block (LocalBusiness preferred).

## 5. Quick Wins (Top 5)
Numbered 1–5 by ROI. Each item: one-line action + one-line "why this
first". Must be fast to implement (<2 hours of work each).

## 6. Score (0–100)
Score + status label (Poor / At Risk / Competitive / Strong / Elite).
2–3 lines of reasoning — what drove the number.

End immediately after the score reasoning. No closing summary.`;
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

// ---- per-job pipeline ----
type PollResult = "processed" | "claimed-by-other" | "no-jobs";

async function processOneJob(prisma: PrismaClient): Promise<PollResult> {
  const candidate = await prisma.auditOrder.findFirst({
    where: { reportStatus: "queued" },
    orderBy: { reportQueuedAt: "asc" },
  });

  if (!candidate) {
    // The function just returns "no-jobs" — the caller decides whether to
    // exit (single-shot) or wait and poll again (loop). We DO NOT log
    // "exiting" here; that decision belongs to main().
    return "no-jobs";
  }

  // Atomic claim — only succeed if still queued.
  const claim = await prisma.auditOrder.updateMany({
    where: { id: candidate.id, reportStatus: "queued" },
    data: { reportStatus: "running" },
  });
  if (claim.count === 0) {
    log(
      `[geo-worker] orderId=${candidate.id} was claimed by another worker — skipping`,
    );
    return "claimed-by-other";
  }

  log(
    `[geo-worker] queued job found orderId=${candidate.id} url=${candidate.websiteUrl}${
      candidate.competitorUrl ? ` (vs ${candidate.competitorUrl})` : ""
    }`,
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
