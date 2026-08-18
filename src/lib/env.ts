import { z } from "zod";

/**
 * GeoViz server-environment schema.
 *
 * Two important pieces of context:
 *
 *   1. `getServerEnv()` is called from two places: script entry points
 *      (e.g. `verify-system`) that want to fail loudly on bad config,
 *      and `scripts/check-required-env.ts`, which is wired into the
 *      `build` npm script to hard-block a deploy with a genuinely
 *      missing/invalid required var. The Next.js app's *runtime* boot
 *      hook (`src/instrumentation.ts`) intentionally calls the softer
 *      `checkServerEnv()` instead — see that file's comment for why a
 *      runtime hard-throw was tried and reverted. So this file is the
 *      canonical "what does the runtime actually need to run"
 *      reference; drifting from reality here is a documentation bug at
 *      runtime, and a build-blocking bug at build time.
 *
 *   2. The schema mirrors what the running code paths actually read at
 *      request time (verified by grep). Keys that older drafts of this
 *      file required but the runtime doesn't need (`ADMIN_PASSWORD`,
 *      `EMAIL_FROM`, `EMAIL_TO`) have been demoted to optional or
 *      removed so the validator stays believable.
 *
 * If this list ever needs to grow, double-check it against the running
 * code paths first — the goal is to fail the build only on env that
 * would actually break a customer request.
 */

const REQUIRED_SERVER_VARS = [
  "DATABASE_URL",
  "ADMIN_SECRET",
  "RESEND_API_KEY",
] as const;

const serverEnvSchema = z.object({
  // Hard requirements — every customer request path touches one of these.
  DATABASE_URL: z.string().min(1, "missing"),
  ADMIN_SECRET: z
    .string()
    .min(16, "must be at least 16 chars (high-entropy random)"),
  RESEND_API_KEY: z.string().min(1, "missing"),

  // Recommended — has a code-level fallback but production should set it.
  // NOT a build-time hard requirement: the Vercel-deployed Next.js app
  // (the thing this schema gates) has no unconditional runtime dependency
  // on Anthropic. The only code paths that actually call the API already
  // guard themselves at the point of use — the Railway audit worker
  // (scripts/geo-worker.ts, throws its own clear error before starting an
  // audit), and the in-app consensus/validator layer
  // (src/lib/validators/providers/claude.ts,
  // src/lib/consensus/polishConsensusBullets.ts, both fail soft when it's
  // missing). Hard-blocking the entire production build on this one var
  // was redundant with those guards and meant any deploy — including one
  // for a feature with zero Anthropic dependency — failed if this var
  // wasn't visible to that particular build. Format is still validated
  // when the value is present.
  ANTHROPIC_API_KEY: z
    .string()
    .startsWith("sk-ant-", "must start with sk-ant-")
    .optional(),
  RESEND_EMAIL_FROM: z.string().optional(),
  AUDIT_NOTIFICATION_EMAIL: z.string().email("must be a valid email").optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Stripe — optional at the env layer because the `/api/checkout` route
  // returns 503 when these are unset, so the rest of the app still boots.
  // Set all three to enable live checkout.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // $59 Re-Audit price — optional at the env layer for the same reason as
  // STRIPE_PRICE_ID above; `/api/checkout/re-audit` returns 503 when unset.
  STRIPE_REAUDIT_PRICE_ID: z.string().optional(),

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
  if (parsed.success) {
    if (!parsed.data.ANTHROPIC_API_KEY) {
      console.warn(
        "[env] ANTHROPIC_API_KEY is not set. This does not block the build " +
          "or boot, but paid AI-visibility audits (Railway worker) and the " +
          "consensus/validator layer will be unavailable until it's " +
          "configured — see .env.example.",
      );
    }
    return { ok: true, env: parsed.data };
  }

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
 * points (e.g. `verify-system`, `check-required-env`) that should fail
 * loudly on bad config. The Next.js app's runtime boot (`instrumentation.ts`)
 * intentionally calls `checkServerEnv()` instead of this — a runtime hard
 * throw only turns every dynamic route's first request into a 500 (Vercel
 * cold-starts run instrumentation per-invocation, not once at deploy time),
 * it doesn't actually block the deploy. `check-required-env.ts` calling
 * this function from the `build` script is the layer that does.
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
