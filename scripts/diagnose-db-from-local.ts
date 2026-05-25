/* eslint-disable no-console */
/**
 * Local Prisma connectivity probe.
 *
 * Runs from this machine against whatever DATABASE_URL is in `.env`.
 * Reports env presence (never values), attempts a SELECT 1 + AuditOrder
 * count, classifies the failure mode, and emits a single JSON blob to
 * stdout. Used to split the Vercel-500 universe into "DB layer broken"
 * vs "Vercel-side broken" without deploying anything.
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";

type Report = {
  ok: boolean;
  envPresent: {
    DATABASE_URL: boolean;
    DATABASE_URL_shape:
      | {
          length: number;
          startsWithPostgresql: boolean;
          hostClass: "railway-proxy" | "localhost" | "supabase" | "neon" | "other" | "unknown";
          sslmode: string | null;
        }
      | null;
    ADMIN_SECRET: boolean;
    ADMIN_SECRET_length_ok: boolean;
    NODE_ENV: string | undefined;
    VERCEL_ENV: string | undefined;
  };
  prismaConnected: boolean;
  auditOrderCount: number | null;
  errorName: string | null;
  errorCode: string | null;
  safeErrorMessage: string | null;
};

function redact(message: string): string {
  // Strip credentials: anything between `://` and the next `@`.
  return message
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1<REDACTED>@")
    .replace(/(password=)[^&\s]+/gi, "$1<REDACTED>");
}

function describeDatabaseUrl(raw: string | undefined) {
  if (!raw) return null;
  let host = "";
  let sslmode: string | null = null;
  try {
    const u = new URL(raw);
    host = u.hostname.toLowerCase();
    sslmode = u.searchParams.get("sslmode");
  } catch {
    /* malformed URL — host stays "" */
  }
  let hostClass: Report["envPresent"]["DATABASE_URL_shape"] extends infer T
    ? T extends { hostClass: infer H }
      ? H
      : never
    : never;
  if (host.endsWith(".rlwy.net") || host.includes("railway")) hostClass = "railway-proxy";
  else if (host === "localhost" || host === "127.0.0.1") hostClass = "localhost";
  else if (host.endsWith(".supabase.co")) hostClass = "supabase";
  else if (host.endsWith(".neon.tech")) hostClass = "neon";
  else if (host) hostClass = "other";
  else hostClass = "unknown";
  return {
    length: raw.length,
    startsWithPostgresql: raw.startsWith("postgresql://") || raw.startsWith("postgres://"),
    hostClass,
    sslmode,
  };
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms during ${label}`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const adminSecret = process.env.ADMIN_SECRET ?? "";

  const report: Report = {
    ok: false,
    envPresent: {
      DATABASE_URL: Boolean(dbUrl),
      DATABASE_URL_shape: describeDatabaseUrl(dbUrl),
      ADMIN_SECRET: Boolean(adminSecret),
      ADMIN_SECRET_length_ok: adminSecret.length >= 16,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
    prismaConnected: false,
    auditOrderCount: null,
    errorName: null,
    errorCode: null,
    safeErrorMessage: null,
  };

  if (!dbUrl) {
    report.errorName = "MissingEnv";
    report.errorCode = "ENV_MISSING";
    report.safeErrorMessage = "DATABASE_URL is not set in this process env.";
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const prisma = new PrismaClient({ log: ["error"] });
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1 as ok`, 8000, "$queryRaw SELECT 1");
    report.prismaConnected = true;
    try {
      report.auditOrderCount = await withTimeout(
        prisma.auditOrder.count(),
        8000,
        "auditOrder.count",
      );
      report.ok = true;
    } catch (countErr) {
      const e = countErr as Error & { code?: string };
      report.errorName = e.name || "UnknownError";
      report.errorCode =
        (e instanceof Prisma.PrismaClientKnownRequestError && e.code) ||
        (e as { code?: string }).code ||
        null;
      report.safeErrorMessage = redact(e.message || String(e));
    }
  } catch (queryErr) {
    const e = queryErr as Error & { code?: string; errorCode?: string };
    report.errorName = e.name || "UnknownError";
    report.errorCode =
      (e instanceof Prisma.PrismaClientInitializationError && (e.errorCode || null)) ||
      (e instanceof Prisma.PrismaClientKnownRequestError && e.code) ||
      e.code ||
      null;
    report.safeErrorMessage = redact(e.message || String(e));
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      /* swallow disconnect noise */
    }
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  const e = err as Error;
  console.log(
    JSON.stringify(
      {
        ok: false,
        envPresent: { DATABASE_URL: Boolean(process.env.DATABASE_URL) },
        prismaConnected: false,
        errorName: e.name || "FatalError",
        errorCode: null,
        safeErrorMessage: redact(e.message || String(e)),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
