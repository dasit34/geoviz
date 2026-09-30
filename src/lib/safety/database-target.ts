/**
 * Database-target classifier — the single decision point for "is it safe
 * for a non-production process (test, seed, replay, dev server, local
 * build) to use this DATABASE_URL?"
 *
 * FAIL-CLOSED. A target is allowed only when it is positively known to be
 * non-production:
 *   - no DATABASE_URL at all, or the `.invalid` no-database sentinel
 *     (nothing can be written — any query fails to connect);
 *   - a loopback host (localhost / 127.0.0.1 / ::1 / host.docker.internal);
 *   - a host (or host:port) explicitly listed in GEOVIZ_NONPROD_DB_HOSTS.
 * Everything else — including every remote host nobody vouched for — is
 * refused. A host listed in GEOVIZ_PRODUCTION_DB_HOSTS is always refused,
 * even if it is also loopback or allowlisted. So is any process whose
 * environment says it is running in production context (a Railway
 * `railway run` shell, or VERCEL_ENV=production), regardless of host.
 *
 * Pure: no I/O, no env loading, no process.exit. Never returns or logs the
 * credentials portion of the URL — only host, port, and database name.
 *
 * This module is NOT imported by the running app or the worker; it only
 * gates scripts, dev commands, and non-production builds. See
 * `scripts/lib/require-nonprod-db.ts` and `scripts/guard-build-database.ts`.
 */

/** DATABASE_URL value for tests that must run with no database at all. */
export const NO_DATABASE_SENTINEL_URL =
  "postgresql://no-database@no-database.invalid:5432/none";

export type DatabaseTargetKind =
  | "none"
  | "local"
  | "allowlisted_nonprod"
  | "production"
  | "unknown";

export type DatabaseTarget = {
  kind: DatabaseTargetKind;
  /** True only for none / local / allowlisted_nonprod. */
  allowed: boolean;
  host: string | null;
  port: string | null;
  database: string | null;
  /** Human-readable, secret-free reason for the decision. */
  reason: string;
};

type Env = Record<string, string | undefined>;

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "host.docker.internal",
]);

function parseHostList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** "host" matches any port; "host:port" matches that port only. */
function hostListed(list: string[], host: string, port: string | null): boolean {
  return list.some((entry) => entry === host || (port !== null && entry === `${host}:${port}`));
}

/** Environment markers that mean "this process is production context". */
export function productionContextMarker(env: Env): string | null {
  if (env.RAILWAY_ENVIRONMENT_NAME === "production") {
    return "RAILWAY_ENVIRONMENT_NAME=production (e.g. a `railway run` shell)";
  }
  if (env.VERCEL_ENV === "production") return "VERCEL_ENV=production";
  return null;
}

export function classifyDatabaseTarget(
  databaseUrl: string | undefined,
  env: Env,
): DatabaseTarget {
  const blank = { host: null, port: null, database: null };
  const raw = (databaseUrl ?? "").trim();

  const context = productionContextMarker(env);
  if (context) {
    return {
      kind: "production",
      allowed: false,
      ...blank,
      reason: `process is running in production context (${context})`,
    };
  }

  if (raw.length === 0) {
    return { kind: "none", allowed: true, ...blank, reason: "DATABASE_URL is not set" };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      kind: "unknown",
      allowed: false,
      ...blank,
      reason: "DATABASE_URL is not a parseable URL",
    };
  }

  const host = url.hostname.toLowerCase();
  const port = url.port || null;
  const database = url.pathname.replace(/^\//, "") || null;
  const where = { host, port, database };
  const label = port ? `${host}:${port}` : host;

  if (hostListed(parseHostList(env.GEOVIZ_PRODUCTION_DB_HOSTS), host, port)) {
    return {
      kind: "production",
      allowed: false,
      ...where,
      reason: `${label} is listed in GEOVIZ_PRODUCTION_DB_HOSTS`,
    };
  }
  if (host.endsWith(".invalid")) {
    return {
      kind: "none",
      allowed: true,
      ...where,
      reason: "no-database sentinel (.invalid host — nothing can connect)",
    };
  }
  if (LOOPBACK_HOSTS.has(host)) {
    return { kind: "local", allowed: true, ...where, reason: `${label} is a loopback host` };
  }
  if (hostListed(parseHostList(env.GEOVIZ_NONPROD_DB_HOSTS), host, port)) {
    return {
      kind: "allowlisted_nonprod",
      allowed: true,
      ...where,
      reason: `${label} is listed in GEOVIZ_NONPROD_DB_HOSTS`,
    };
  }
  return {
    kind: "unknown",
    allowed: false,
    ...where,
    reason: `${label} is not a loopback host and is not listed in GEOVIZ_NONPROD_DB_HOSTS — treated as production (fail-closed)`,
  };
}
