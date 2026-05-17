/**
 * Next.js instrumentation hook.
 *
 * Runs once when the Next.js server process boots — well before the
 * first request reaches a route handler. We use this hook for a
 * single purpose: in PRODUCTION, fail loud on missing / invalid
 * environment variables so the deploy halts at boot instead of
 * surfacing the misconfiguration as a customer-visible 500 on the
 * first paid order.
 *
 * Why production-only:
 *   `src/lib/env.ts` is intentionally opt-in (see its file-header
 *   comment) so local dev with partial env config still boots. We
 *   honor that — calling `checkServerEnv()` here only when
 *   `NODE_ENV === "production"`. Dev workflows are unaffected.
 *
 * Why nodejs-runtime guard:
 *   Next.js 14 invokes `register()` for BOTH the nodejs and edge
 *   runtimes when middleware exists. `checkServerEnv` reads
 *   server-only env values; running it in the edge runtime would
 *   double-validate and could surface misleading errors. Guard with
 *   `NEXT_RUNTIME === "nodejs"`.
 *
 * Activation requires `experimental.instrumentationHook: true` in
 * `next.config.mjs` (Next 14.2 still requires the opt-in; Next 15+
 * makes it default-on).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  // Lazy import — keeps the edge runtime bundle clean and avoids
  // pulling Zod into any non-nodejs context.
  const { checkServerEnv } = await import("./lib/env");
  const result = checkServerEnv();
  if (result.ok) {
    console.log("[instrumentation] env validation ok");
    return;
  }

  console.error(
    "\n[instrumentation] GeoViz cannot start — environment is invalid:",
  );
  for (const e of result.errors) console.error(`  - ${e}`);
  console.error(
    "\n  Fix the env (see .env.example), then retry the deploy.\n",
  );
  // Throw — Next.js surfaces this as a deploy / server boot failure
  // instead of letting the first customer request hit a half-configured
  // runtime.
  throw new Error(
    `Invalid environment at boot: ${result.errors.join("; ")}`,
  );
}
