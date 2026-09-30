/* eslint-disable no-console */
/**
 * Build-time database guard — runs in `npm run build` immediately before
 * `prisma migrate deploy`, so a build can only migrate the database it
 * is meant to.
 *
 *   - Vercel PRODUCTION build (VERCEL_ENV=production): allowed — this is
 *     the one place production migrations are supposed to happen.
 *   - Everything else (Vercel Preview / Development builds, a local
 *     `npm run build`): allowed only when DATABASE_URL is positively
 *     non-production per `classifyDatabaseTarget` (loopback, or a host in
 *     GEOVIZ_NONPROD_DB_HOSTS). Production/unknown targets fail the build
 *     BEFORE migrations run.
 *
 * Prints host/port/db name only — never credentials.
 */
import { loadEnvConfig } from "@next/env";

import { classifyDatabaseTarget } from "../src/lib/safety/database-target";

loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

function describe(url: string | undefined): string {
  try {
    const u = new URL(url ?? "");
    return `${u.hostname}${u.port ? `:${u.port}` : ""}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unset or unparseable)";
  }
}

const vercelEnv = process.env.VERCEL_ENV ?? null;

if (vercelEnv === "production") {
  console.log(
    `[guard-build-database] Vercel production build — migrations allowed on ${describe(process.env.DATABASE_URL)}`,
  );
  process.exit(0);
}

// A non-production build must not inherit production context markers
// from the shell, so classify with only the URL-relevant variables.
const target = classifyDatabaseTarget(process.env.DATABASE_URL, {
  GEOVIZ_NONPROD_DB_HOSTS: process.env.GEOVIZ_NONPROD_DB_HOSTS,
  GEOVIZ_PRODUCTION_DB_HOSTS: process.env.GEOVIZ_PRODUCTION_DB_HOSTS,
  RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
});

const context = vercelEnv ? `Vercel ${vercelEnv} build` : "local/non-Vercel build";

if (target.allowed && target.kind !== "none") {
  console.log(
    `[guard-build-database] ${context} — migrations allowed on non-production target ${describe(process.env.DATABASE_URL)} (${target.reason})`,
  );
  process.exit(0);
}

console.error(
  [
    "",
    `[guard-build-database] BUILD BLOCKED (${context}): refusing to run \`prisma migrate deploy\`.`,
    `  target: ${target.kind} — ${target.reason}`,
    "  Only Vercel production builds may migrate the production database.",
    "  For previews/local builds, set DATABASE_URL to a non-production database and",
    "  list its host:port in GEOVIZ_NONPROD_DB_HOSTS for that environment.",
    "",
  ].join("\n"),
);
process.exit(1);
