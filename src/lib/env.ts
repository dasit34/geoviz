import { z } from "zod";

const REQUIRED_SERVER_VARS = [
  "DATABASE_URL",
  "ADMIN_PASSWORD",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_TO",
  "ANTHROPIC_API_KEY",
] as const;

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "missing"),
  ADMIN_PASSWORD: z.string().min(1, "missing"),
  RESEND_API_KEY: z.string().min(1, "missing"),
  EMAIL_FROM: z.string().min(1, "missing"),
  EMAIL_TO: z.string().email("must be a valid email"),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-", "must start with sk-ant-"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
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
 * environment variable is missing or invalid. Use from script entrypoints
 * and any server code that must not silently start with bad config.
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
