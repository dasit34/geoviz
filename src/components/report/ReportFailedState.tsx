import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

/**
 * Branded "we hit a problem" surface. Used for orders whose audit ended
 * in a terminal failure (report/[id]/print's `reportStatus === "failed"`
 * branch), and also rendered by `ReportSurface` when building/normalizing
 * the report model throws for any other reason — same safe, branded
 * fallback either way, never a raw framework error page.
 *
 * Does NOT auto-refresh — failure is a stable state until operator
 * intervention. Surfaces the order ID (so the customer can quote it in
 * support email) and routes them to support directly.
 */
export function ReportFailedState({ orderId }: { orderId: string }) {
  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="container-page py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <span className="pill">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              Audit needs attention
            </span>
            <h1 className="h1 mt-6">
              We hit a snag generating your audit.
            </h1>
            <p className="muted mt-5 text-base leading-relaxed">
              Our system flagged the audit for review and our team has
              been notified. We&rsquo;ll either regenerate it for you
              or refund your payment &mdash; whichever you prefer.
            </p>
            <p className="mt-5 text-sm text-white/55">
              Reach us at{" "}
              <a
                href="mailto:support@geoviz.ai"
                className="text-accent hover:text-accent-glow underline-offset-4 hover:underline"
              >
                support@geoviz.ai
              </a>{" "}
              and quote your report ID below so we can resolve this
              quickly.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/" className="btn-ghost text-sm">
                Back to homepage
              </Link>
              <a
                href="mailto:support@geoviz.ai?subject=AI%20Visibility%20Audit%20%E2%80%94%20report%20needs%20regeneration"
                className="btn-primary text-sm"
              >
                Contact support
              </a>
            </div>
            <p className="mt-8 text-xs uppercase tracking-[0.18em] text-white/40">
              Report ID: {orderId}
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
