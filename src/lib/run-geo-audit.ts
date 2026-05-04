import { spawn } from "node:child_process";
import path from "node:path";

export type GeoAuditResult =
  | { ok: true; markdown: string; command: string }
  | { ok: false; error: string; command: string; stderr?: string };

export type RunGeoAuditOptions = {
  /** Optional competitor URL — appended to the prompt when provided. */
  competitorUrl?: string | null;
  /** Hard timeout in ms; default 5 minutes. */
  timeoutMs?: number;
  /** Wrapper script path; default "scripts/run-geo-audit.sh" relative to cwd. */
  wrapperPath?: string;
};

/**
 * Runs the geo-seo-claude audit by spawning the local wrapper script
 * `scripts/run-geo-audit.sh`. The wrapper is the canonical entry point —
 * it knows about the skill install path, the venv, and the exact `claude
 * -p` invocation with the right tool allowlist (WebFetch / WebSearch /
 * Read / Grep / Glob / Write / Bash). See that script for prerequisites.
 *
 * Returns markdown on success, structured error on failure. NEVER fakes
 * results — when the wrapper exits non-zero, the failure surfaces upstream
 * so the admin sees it instead of a fabricated audit.
 */
export async function runGeoAudit(
  url: string,
  options: RunGeoAuditOptions = {},
): Promise<GeoAuditResult> {
  const wrapper =
    options.wrapperPath ?? path.join(process.cwd(), "scripts", "run-geo-audit.sh");
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;

  const args: string[] = [url];
  if (options.competitorUrl) args.push(options.competitorUrl);

  const command = `${wrapper} ${args.join(" ")}`;

  console.log(`[run-geo-audit] spawning: ${command}`);

  return new Promise<GeoAuditResult>((resolve) => {
    let child;
    try {
      child = spawn(wrapper, args, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      resolve({
        ok: false,
        error: `Failed to spawn ${wrapper}: ${message}. Is the wrapper script present and executable?`,
        command,
      });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const settle = (result: GeoAuditResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout?.on("data", (c: Buffer) => stdoutChunks.push(c));
    child.stderr?.on("data", (c: Buffer) => stderrChunks.push(c));

    child.on("error", (err: Error) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        settle({
          ok: false,
          error:
            `Wrapper script not found at ${wrapper}. Ensure scripts/run-geo-audit.sh ` +
            `exists, is executable, and Claude Code CLI is installed.`,
          command,
        });
        return;
      }
      settle({ ok: false, error: err.message, command });
    });

    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code === 0) {
        settle({ ok: true, markdown: stdout, command });
      } else {
        settle({
          ok: false,
          error: `Audit command exited with code ${code}.`,
          command,
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
        error: `Audit timed out after ${Math.round(timeoutMs / 1000)}s.`,
        command,
      });
    }, timeoutMs);
  });
}
