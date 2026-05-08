"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Admin error boundary — catches any uncaught render or server-component
 * exception across the /admin/* tree and renders a graceful fallback in
 * the GeoViz dark/orange style. The most common production trigger is
 * Prisma schema drift (a column declared in schema.prisma that hasn't
 * been migrated yet on the deployed database). When that happens we
 * still surface the error message so an operator can act on it, but we
 * do NOT leak the raw stack trace into the page.
 *
 * Convention: Next.js App Router renders this client component when any
 * descendant route segment throws during render. The `reset` callback
 * re-attempts the segment without a full page reload.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Mirror to the browser console (and through to Vercel function
    // logs in dev tools) so the operator can grab details fast.
    console.error("[admin-error-boundary]", {
      name: error.name,
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  const isPrismaSchemaDrift =
    typeof error.message === "string" &&
    /column .* does not exist|relation .* does not exist|prisma/i.test(
      error.message,
    );

  return (
    <main className="min-h-[70vh]">
      <section className="container-page py-24">
        <div className="mx-auto max-w-xl rounded-xl border border-red-400/30 bg-red-500/[0.06] p-8 text-center shadow-card">
          <p className="pill border-red-400/30 bg-red-400/10 text-red-200">
            Admin error
          </p>
          <h1 className="h2 mt-4">Something went wrong loading this page.</h1>
          <p className="muted mt-3 text-sm">
            The admin surface caught an error before it could render. The
            audit pipeline, customer site, and Stripe webhook are not
            affected.
          </p>

          {isPrismaSchemaDrift ? (
            <div className="mt-5 rounded-lg border border-amber-300/30 bg-amber-300/[0.08] p-4 text-left text-xs leading-relaxed text-amber-100">
              <p className="font-semibold uppercase tracking-[0.18em] text-amber-200">
                Likely cause: database schema drift
              </p>
              <p className="mt-2">
                A Prisma column or table referenced by this page is
                missing from the deployed database. Run{" "}
                <code className="rounded bg-black/30 px-1.5 py-0.5 text-amber-100">
                  npx prisma migrate deploy
                </code>{" "}
                against production, then redeploy. Pending migrations
                live in <code>prisma/migrations</code>.
              </p>
            </div>
          ) : null}

          <details className="mt-5 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-left text-[11px] leading-relaxed text-white/65">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
              Error message · expand
            </summary>
            <p className="mt-3 break-words font-mono text-white/80">
              {error.message || "(no message)"}
            </p>
            {error.digest ? (
              <p className="mt-2 text-white/45">digest: {error.digest}</p>
            ) : null}
          </details>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="btn-primary text-sm"
            >
              Try again
            </button>
            <Link href="/" className="btn-ghost text-sm">
              Back to homepage
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
