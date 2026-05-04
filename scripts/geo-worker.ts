/* eslint-disable no-console */
/**
 * GEO audit worker — processes ONE queued job per invocation.
 *
 * Flow:
 *   1. Connect to DATABASE_URL
 *   2. Find the oldest order where reportStatus = "queued"
 *   3. Claim it atomically (queued → running)
 *   4. Spawn `scripts/run-geo-audit.sh <websiteUrl> [competitorUrl]`
 *   5. Save stdout to reportMarkdown, mark reportStatus = "generated"
 *      (or "failed" with reportError on error)
 *
 * Run with:
 *   npm run geo-worker
 *
 * One job per process so you can wire it into cron, a Railway cron job,
 * `while true; do npm run geo-worker; sleep 30; done`, or whatever queue
 * runner you prefer later. We deliberately don't build a long-lived loop
 * yet.
 *
 * Exit codes:
 *   0  successfully processed one job, OR queue was empty (also fine)
 *   1  fatal error (DB connection failure, etc.)
 */
import "dotenv/config";

import { spawn } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const TIMEOUT_MS = Number(process.env.GEO_WORKER_TIMEOUT_MS ?? 5 * 60 * 1000);
const SCRIPT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "run-geo-audit.sh",
);

type WrapperResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string; stderr?: string };

function runWrapper(
  websiteUrl: string,
  competitorUrl: string | null,
): Promise<WrapperResult> {
  const args = competitorUrl ? [websiteUrl, competitorUrl] : [websiteUrl];

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
        error: `Failed to spawn ${SCRIPT_PATH}: ${message}`,
      });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const settle = (r: WrapperResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };

    child.stdout?.on("data", (c: Buffer) => stdoutChunks.push(c));
    child.stderr?.on("data", (c: Buffer) => stderrChunks.push(c));

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        settle({
          ok: false,
          error: `Wrapper script not found at ${SCRIPT_PATH}. Ensure scripts/run-geo-audit.sh is present and executable.`,
        });
        return;
      }
      settle({ ok: false, error: err.message });
    });

    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code === 0 && stdout.trim().length > 0) {
        settle({ ok: true, markdown: stdout });
      } else if (code === 0) {
        settle({
          ok: false,
          error:
            "Wrapper exited 0 but produced no output. Check tmp/geo-audit-last.err on the worker host.",
          stderr: stderr.slice(-4000),
        });
      } else {
        settle({
          ok: false,
          error: `Wrapper exited with code ${code}.`,
          stderr: stderr.slice(-4000),
        });
      }
    });

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      settle({
        ok: false,
        error: `Audit timed out after ${Math.round(TIMEOUT_MS / 1000)}s`,
      });
    }, TIMEOUT_MS);
  });
}

async function processOneJob(prisma: PrismaClient): Promise<void> {
  const candidate = await prisma.auditOrder.findFirst({
    where: { reportStatus: "queued" },
    orderBy: { reportQueuedAt: "asc" },
  });

  if (!candidate) {
    console.log("[geo-worker] no queued jobs — exiting");
    return;
  }

  // Atomic claim: only succeed if the row is still queued. If a peer worker
  // got there first the count is 0 and we treat it as "no job available".
  const claim = await prisma.auditOrder.updateMany({
    where: { id: candidate.id, reportStatus: "queued" },
    data: { reportStatus: "running" },
  });
  if (claim.count === 0) {
    console.log(
      `[geo-worker] orderId=${candidate.id} was claimed by another worker — exiting`,
    );
    return;
  }

  console.log(
    `[geo-worker] queued job found orderId=${candidate.id} url=${candidate.websiteUrl}${
      candidate.competitorUrl ? ` (vs ${candidate.competitorUrl})` : ""
    }`,
  );
  console.log(`[geo-worker] audit started orderId=${candidate.id}`);

  const startedAt = Date.now();
  const result = await runWrapper(
    candidate.websiteUrl,
    candidate.competitorUrl,
  );
  const elapsedMs = Date.now() - startedAt;

  if (result.ok) {
    console.log(
      `[geo-worker] audit completed orderId=${candidate.id} elapsedMs=${elapsedMs}`,
    );
    console.log(
      `[geo-worker] markdown length orderId=${candidate.id} bytes=${result.markdown.length}`,
    );
    await prisma.auditOrder.update({
      where: { id: candidate.id },
      data: {
        reportStatus: "generated",
        reportMarkdown: result.markdown,
        reportError: null,
        reportGeneratedAt: new Date(),
      },
    });
    console.log(`[geo-worker] report saved orderId=${candidate.id}`);
    return;
  }

  const errorMsg = result.stderr
    ? `${result.error}\n--- stderr ---\n${result.stderr}`
    : result.error;
  await prisma.auditOrder.update({
    where: { id: candidate.id },
    data: {
      reportStatus: "failed",
      reportError: errorMsg,
    },
  });
  console.error(
    `[geo-worker] audit failed orderId=${candidate.id} elapsedMs=${elapsedMs}: ${result.error}`,
  );
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("[geo-worker] DATABASE_URL is not set. Aborting.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  console.log(
    `[geo-worker] starting · timeout=${TIMEOUT_MS}ms · script=${SCRIPT_PATH}`,
  );

  try {
    await processOneJob(prisma);
  } finally {
    await prisma.$disconnect();
  }

  console.log("[geo-worker] done");
}

main().catch((err) => {
  console.error("[geo-worker] fatal:", err);
  process.exit(1);
});
