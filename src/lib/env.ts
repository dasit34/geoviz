import { z } from "zod";

/**
 * GeoViz server-environment schema.
 *
 * Two important pieces of context:
 *
 *   1. This validator is **opt-in** — `getServerEnv()` is called only
 *      by script entry points (e.g. `verify-system`) that want to fail
 *      loudly on bad config. The Next.js app boot does NOT call it. So
 *      this file is the canonical "what does the runtime actually need
 *      to run" reference; drifting from reality here is a documentation
 *      bug, not a runtime crash.
 *
 *   2. The schema mirrors what the running code paths actually read at
 *      request time (verified by grep). Keys that older drafts of this
 *      file required but the runtime doesn't need (`ADMIN_PASSWORD`,
 *      `EMAIL_FROM`, `EMAIL_TO`) have been demoted to optional or
 *      removed so the validator stays believable.
 *
 * If you wire `getServerEnv()` into the app boot in the future, double-
 * check this list against the running code paths first — the goal is to
 * fail boot only on env that would actually break a customer request.
 */

const REQUIRED_SERVER_VARS = [
  "DATABASE_URL",
  "ADMIN_SECRET",
  "RESEND_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

const serverEnvSchema = z.object({
  // Hard requirements — every customer request path touches one of these.
  DATABASE_URL: z.string().min(1, "missing"),
  ADMIN_SECRET: z
    .string()
    .min(16, "must be at least 16 chars (high-entropy random)"),
  RESEND_API_KEY: z.string().min(1, "missing"),
  ANTHROPIC_API_KEY: z
    .string()
    .startsWith("sk-ant-", "must start with sk-ant-"),

  // Recommended — has a code-level fallback but production should set it.
  RESEND_EMAIL_FROM: z.string().optional(),
  AUDIT_NOTIFICATION_EMAIL: z.string().email("must be a valid email").optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Stripe — optional at the env layer because the `/api/checkout` route
  // returns 503 when these are unset, so the rest of the app still boots.
  // Set all three to enable live checkout.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Legacy / verify-system script — kept optional so the script can run
  // when present and the app boots fine when it isn't. The audit
  // pipeline does NOT depend on these.
  ADMIN_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_TO: z.string().email("must be a valid email").optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export type EnvCheckResult =
  | { ok: true; env: ServerEnv }
  | { ok: false; errors: string[] };

export function checkServerEnv(): EnvCheckResult {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (parsed.success) return { ok: true, env: parsed.data };

  const errors: string[] = [];
  const flat = parsed.error.flatten().fieldErrors;
  for (const key of Object.keys(flat) as Array<keyof typeof flat>) {
    const messages = flat[key] ?? [];
    for (const m of messages) errors.push(`${String(key)}: ${m}`);
  }
  for (const key of REQUIRED_SERVER_VARS) {
    if (!process.env[key]) {
      const already = errors.some((e) => e.startsWith(`${key}:`));
      if (!already) errors.push(`${key}: missing`);
    }
  }
  return { ok: false, errors };
}

/**
 * Server-only. Throws and prints a clear console error if any required
 * environment variable is missing or invalid. Use from script entry
 * points (e.g. `verify-system`) that should fail loudly on bad config.
 * The Next.js app boot intentionally does NOT call this — Next routes
 * already fail-soft on missing env (Stripe 503, Resend skip, etc.) so
 * a hard boot-time crash would block legitimate partial-config dev
 * workflows.
 */
export function getServerEnv(): ServerEnv {
  const result = checkServerEnv();
  if (result.ok) return result.env;

  console.error("\n[env] GeoViz cannot start — environment is invalid:");
  for (const e of result.errors) console.error(`  - ${e}`);
  console.error(
    "\n  Fix .env (see .env.example for the full list), then retry.\n",
  );
  throw new Error("Invalid environment. See errors above.");
}
