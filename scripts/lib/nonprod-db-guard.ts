/* eslint-disable no-console */
/**
 * Fail-closed production-database guard for scripts and dev commands.
 *
 * Loads env files the same way the scripts do (via @next/env — it never
 * overrides a variable already set in the shell), classifies the
 * effective DATABASE_URL with `classifyDatabaseTarget`, and exits the
 * process BEFORE any other module runs when the target is production or
 * unknown. Only the host/port/database name are ever printed — never
 * credentials.
 *
 * Use through one of the side-effect wrappers, as the FIRST import:
 *   import "./lib/require-nonprod-db";               // tests, dev commands — no override
 *   import "./lib/require-nonprod-db-or-break-glass"; // seeds, replay, backfill/repair ops
 *
 * Break-glass (ops wrappers only): set GEOVIZ_ALLOW_PRODUCTION_DB to the
 * exact script name (e.g. GEOVIZ_ALLOW_PRODUCTION_DB=replay-audits) to run
 * one deliberate operation against production. Tests can never override.
 */
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { classifyDatabaseTarget } from "../../src/lib/safety/database-target";

const GUARD_ENTRYPOINTS = new Set(["require-nonprod-db", "require-nonprod-db-or-break-glass"]);

function scriptName(): string {
  const entry = path.basename(process.argv[1] ?? "unknown").replace(/\.(ts|mts|js|mjs|cjs)$/, "");
  // Run directly as a CLI (npm pre-hooks) → the label is the next argument.
  if (GUARD_ENTRYPOINTS.has(entry)) return process.argv[2] ?? entry;
  return entry;
}

export function enforceNonProductionDatabase(opts: { allowBreakGlass: boolean }): void {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV === "development", {
    info: () => {},
    error: console.error,
  });
  const name = scriptName();
  const target = classifyDatabaseTarget(process.env.DATABASE_URL, process.env);
  if (target.allowed) return;

  const breakGlass = process.env.GEOVIZ_ALLOW_PRODUCTION_DB;
  if (opts.allowBreakGlass && breakGlass && breakGlass === name) {
    console.warn(
      `\n[nonprod-db-guard] BREAK-GLASS: "${name}" is running against a production/unknown database ` +
        `(${target.reason}). GEOVIZ_ALLOW_PRODUCTION_DB=${breakGlass}.\n`,
    );
    return;
  }

  console.error(
    [
      "",
      `[nonprod-db-guard] REFUSED: "${name}" will not run against this database.`,
      `  target: ${target.kind} — ${target.reason}`,
      "  Point DATABASE_URL at a non-production database and list its host in",
      "  GEOVIZ_NONPROD_DB_HOSTS (e.g. GEOVIZ_NONPROD_DB_HOSTS=my-dev-db.example.com:5432),",
      "  use a local Postgres (localhost), or — for tests that need no database —",
      "  run them with DATABASE_URL=postgresql://no-database@no-database.invalid:5432/none.",
      opts.allowBreakGlass
        ? `  Deliberate one-off production operation: GEOVIZ_ALLOW_PRODUCTION_DB=${name}`
        : "  This command has no production override.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

