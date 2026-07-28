/* eslint-disable no-console */
/**
 * scripts/check-required-env.ts
 *
 * Build-time hard gate for required production environment variables.
 * Wired into the `build` npm script (see package.json) so a genuinely
 * missing/invalid required var (DATABASE_URL, ADMIN_SECRET,
 * RESEND_API_KEY — see src/lib/env.ts) fails the Vercel/Railway BUILD
 * and blocks the deploy. ANTHROPIC_API_KEY is deliberately NOT in this
 * hard-required list — see its own comment in src/lib/env.ts for why;
 * a missing value there only logs a warning, it never blocks the build.
 *
 * This is deliberately NOT wired into src/instrumentation.ts's runtime
 * hook. That hook already validates env at boot but soft-fails on
 * purpose (see its own inline comment): Vercel's `register()` runs per
 * serverless cold start, not once at deploy time, so a hard throw there
 * doesn't block a bad deploy — it just turns every dynamic route's first
 * request into a 500, including routes that don't even need the missing
 * var. The build step is the layer that can actually stop a bad deploy
 * before it ships, which is what "fail fast" should mean here.
 *
 * Local/dev is unaffected: `npm run dev` never invokes the `build`
 * script chain this is wired into.
 *
 * Loads .env / .env.local exactly the way `next build` itself does
 * (via `@next/env`, the same loader Next.js uses internally — already
 * an installed transitive dependency of `next`, not a new package).
 * Without this, a bare `tsx` invocation wouldn't see anything defined
 * only in a local .env file, and would report false failures that
 * `next build` itself would never hit.
 */
import { loadEnvConfig } from "@next/env";
import { getServerEnv } from "../src/lib/env";

loadEnvConfig(process.cwd());

try {
  getServerEnv();
  console.log("[check-required-env] required environment variables OK");
} catch {
  // getServerEnv() already printed the detailed per-var error list.
  console.error(
    "\n[check-required-env] build blocked — fix the env above and retry.\n",
  );
  process.exit(1);
}
