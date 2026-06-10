/* eslint-disable no-console */
/**
 * scripts/diagnose-provider-env.ts
 *
 * SAFE provider-environment diagnostic. Answers "are the AI validator API keys
 * actually present + valid in THIS runtime?" without ever printing a secret.
 *
 * For each provider it reports ONLY: expected env var name(s) (read straight
 * from the validator registry, so it can't drift from what the code reads),
 * whether each var exists, its length, first-4 + last-4 chars, and risk flags
 * (blank / quoted / surrounding-whitespace), plus whether a *_VALIDATOR_FIXTURE
 * mock flag is set, plus the runtime identity (NODE_ENV + RAILWAY_* if present).
 *
 *   npx tsx scripts/diagnose-provider-env.ts            # env-only (no API calls)
 *   npx tsx scripts/diagnose-provider-env.ts --live     # + tiny auth-check ping
 *
 * Run inside a Railway service with:
 *   npx @railway/cli run --service <name> npx tsx scripts/diagnose-provider-env.ts --live
 * (railway run injects that service's vars into THIS masked process — secrets
 * are never echoed. Do NOT use `railway variables`, which prints values.)
 *
 * NEVER prints a full key. NEVER changes scoring/report/worker/guard.
 */
import "dotenv/config";

import { VALIDATOR_REGISTRY } from "../src/lib/validators/registry";

const LIVE = process.argv.includes("--live");

const DISPLAY: Record<string, string> = {
  openai: "ChatGPT (OpenAI)",
  claude: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
  perplexity: "Perplexity",
  google_ai_overview: "Google AI Overview",
};

type ReasonCode =
  | "ok"
  | "key_missing"
  | "key_invalid"
  | "provider_disabled"
  | "call_skipped"
  | "timeout"
  | "api_error"
  | "no_response";

function maskInfo(raw: string | undefined) {
  if (typeof raw !== "string") {
    return { exists: false, length: 0, head: "", tail: "", flags: "—" };
  }
  const len = raw.length;
  const trimmed = raw.trim();
  const flags: string[] = [];
  if (trimmed.length === 0) flags.push("BLANK");
  if (trimmed.length !== len) flags.push("WHITESPACE");
  if (/^["'].*["']$/.test(trimmed)) flags.push("QUOTED");
  return {
    exists: len > 0,
    length: len,
    head: trimmed.slice(0, 4),
    tail: trimmed.length > 8 ? trimmed.slice(-4) : "",
    flags: flags.length ? flags.join(",") : "clean",
  };
}

function runtimeIdentity(): string {
  const parts = [
    `NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}`,
    process.env.RAILWAY_ENVIRONMENT_NAME
      ? `RAILWAY_ENV=${process.env.RAILWAY_ENVIRONMENT_NAME}`
      : null,
    process.env.RAILWAY_SERVICE_NAME
      ? `SERVICE=${process.env.RAILWAY_SERVICE_NAME}`
      : null,
    process.env.RAILWAY_PROJECT_NAME
      ? `PROJECT=${process.env.RAILWAY_PROJECT_NAME}`
      : null,
    process.env.RAILWAY_REPLICA_ID ? `replica=${process.env.RAILWAY_REPLICA_ID.slice(0, 8)}` : null,
  ].filter(Boolean);
  // No RAILWAY_* at all → almost certainly a LOCAL run.
  const onRailway = parts.some((p) => p!.startsWith("RAILWAY") || p!.startsWith("SERVICE"));
  return `${parts.join(" · ")}${onRailway ? "" : " · (local — no RAILWAY_*)"}`;
}

/** Tiny auth-check ping per provider. No response bodies read; short timeout. */
async function livePing(provider: string, key: string): Promise<{ attempted: boolean; reason: ReasonCode; detail: string }> {
  const ctrl = AbortSignal.timeout(10_000);
  try {
    let res: Response;
    if (provider === "openai") {
      res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: ctrl,
      });
    } else if (provider === "claude") {
      res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        signal: ctrl,
      });
    } else if (provider === "gemini") {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        { signal: ctrl },
      );
    } else if (provider === "perplexity") {
      res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "sonar", max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
        signal: ctrl,
      });
    } else {
      return { attempted: false, reason: "provider_disabled", detail: "no live check" };
    }
    if (res.status === 401 || res.status === 403) {
      return { attempted: true, reason: "key_invalid", detail: `HTTP ${res.status}` };
    }
    if (res.ok) return { attempted: true, reason: "ok", detail: `HTTP ${res.status}` };
    // 400/422 = the request reached the API PAST auth (bad ping body/model),
    // so the KEY authenticated — not a credential problem.
    if (res.status === 400 || res.status === 422) {
      return { attempted: true, reason: "ok", detail: `HTTP ${res.status} (auth passed; ping-shape only)` };
    }
    return { attempted: true, reason: "api_error", detail: `HTTP ${res.status}` };
  } catch (err) {
    const e = err as Error;
    if (e.name === "TimeoutError" || /timeout|abort/i.test(e.message)) {
      return { attempted: true, reason: "timeout", detail: "10s timeout" };
    }
    return { attempted: true, reason: "no_response", detail: e.message.slice(0, 60) };
  }
}

async function main() {
  console.log("\n=== GeoViz provider environment diagnostic (safe / masked) ===");
  console.log(`Runtime: ${runtimeIdentity()}`);
  console.log(`Mode: ${LIVE ? "--live (auth-check pings)" : "env-only (no API calls)"}\n`);

  const rows: string[][] = [];
  for (const v of VALIDATOR_REGISTRY) {
    const display = DISPLAY[v.name] ?? v.name;
    const vars = [...v.requiredEnvVars];
    const fixtureVar = `${v.name.toUpperCase()}_VALIDATOR_FIXTURE`;
    const fixtureOn = process.env[fixtureVar] === "true";

    if (vars.length === 0) {
      rows.push([
        display,
        "(none)",
        "n/a",
        "—",
        "—",
        "provider_disabled (no public API)",
      ]);
      continue;
    }

    for (const varName of vars) {
      const info = maskInfo(process.env[varName]);
      const masked = info.exists
        ? `${info.length} (${info.head}…${info.tail})`
        : "—";
      let result = info.exists ? "present" : "MISSING";
      let reason: string = info.exists ? "" : "key_missing";

      if (fixtureOn) {
        result = "FIXTURE";
        reason = "call_skipped (mock fixture set!)";
      } else if (info.exists && LIVE) {
        const ping = await livePing(v.name, (process.env[varName] ?? "").trim());
        result = ping.reason === "ok" ? "OK (call ok)" : ping.reason.toUpperCase();
        reason = `${ping.reason} · ${ping.detail}`;
      } else if (info.exists && !LIVE) {
        result = "present (not pinged)";
      }

      rows.push([
        display,
        varName,
        info.exists ? "yes" : "no",
        masked,
        info.flags,
        `${result}${reason ? ` — ${reason}` : ""}`,
      ]);
    }
  }

  const headers = ["Provider", "Expects env var", "Exists?", "Len (4…4)", "Flags", "Result / reason"];
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const fmt = (cells: string[]) =>
    cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  |  ");
  console.log(fmt(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("--+--"));
  for (const r of rows) console.log(fmt(r));

  // Fixture-flag alarm (production must never set these).
  const fixturesSet = ["OPENAI", "CLAUDE", "GEMINI", "PERPLEXITY"]
    .map((p) => `${p}_VALIDATOR_FIXTURE`)
    .filter((k) => process.env[k] === "true");
  if (fixturesSet.length) {
    console.log(`\n⚠  FIXTURE FLAGS SET (forces MOCK, no real calls): ${fixturesSet.join(", ")}`);
  }
  console.log("\n(No secrets printed — length + first/last 4 chars only.)\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
