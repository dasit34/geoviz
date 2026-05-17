"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

/**
 * Global error boundary for the GeoViz app. Next.js's App Router
 * mounts this component whenever a server or client component below
 * the root throws and the error isn't caught locally.
 *
 * What this surface NEVER shows:
 *   • The error message or stack trace (a production build would
 *     redact most of it anyway, but we don't risk leaking even in
 *     preview).
 *   • Any business name, order ID, report markdown, or score that
 *     was being rendered.
 *
 * What this surface DOES:
 *   • Logs the error (digest only — no message body) via the standard
 *     console channel so Vercel / Railway log collectors pick it up.
 *   • Offers the customer a clean recovery: retry, go home, or jump
 *     to a sample report.
 *
 * This is a customer-facing safety net, not an admin dashboard.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      `[error-boundary] uncaught render error digest=${error.digest ?? "unknown"}`,
    );
  }, [error]);

  return (
    <main>
      <Header />
      <section className="container-page py-24">
        <div className="mx-auto max-w-md rounded-lg border border-red-400/30 bg-red-500/[0.06] p-8 text-center">
          <p className="pill border-red-400/30 bg-red-400/10 text-red-200">
            Something went wrong
          </p>
          <h1 className="h2 mt-4">We hit a snag rendering that page.</h1>
          <p className="muted mt-3 text-sm">
            Try again in a moment. If this keeps happening, email us at{" "}
            <a
              href="mailto:support@geoviz.ai"
              className="text-accent hover:underline"
            >
              support@geoviz.ai
            </a>
            {" "}— we&rsquo;ll fix it fast.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="btn-primary"
            >
              Try again
            </button>
            <Link href="/" className="btn-ghost">
              Homepage
            </Link>
            <Link href="/sample-report" className="btn-ghost">
              Sample report
            </Link>
          </div>
          {error.digest ? (
            <p className="mt-6 font-mono text-[10px] text-white/40">
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </section>
      <Footer />
    </main>
  );
}
