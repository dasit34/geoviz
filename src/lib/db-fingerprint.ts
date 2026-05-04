/**
 * Safe extraction of the DATABASE_URL identity (host / port / db name)
 * with credentials always stripped. Used by both the worker startup
 * diagnostics and the /admin/reports debug panel so an operator can
 * eyeball whether the two surfaces are pointing at the same database.
 *
 * NEVER logs the password. NEVER returns the raw URL.
 */
export type DbFingerprint = {
  host: string;
  port: string | null;
  database: string;
  /** "host:port/db" — short identity string, safe to log. */
  fingerprint: string;
  /** Connection URL with credentials redacted. */
  safeUrl: string;
};

export function getDbFingerprint(): DbFingerprint | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname;
    const port = u.port || null;
    const database = u.pathname.replace(/^\//, "").split("?")[0] || "(unknown)";
    const fingerprint = port ? `${host}:${port}/${database}` : `${host}/${database}`;
    const safeUrl = `postgresql://[redacted]@${fingerprint}`;
    return { host, port, database, fingerprint, safeUrl };
  } catch {
    return null;
  }
}
