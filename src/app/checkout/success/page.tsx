import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

export const metadata = {
  title: "Order received · GeoViz",
  robots: { index: false, follow: false },
};

// Verifies a real Stripe session server-side on every load — must never
// be statically cached, since the same URL shape is reused for every
// customer and the answer depends entirely on `session_id`.
export const dynamic = "force-dynamic";

type VerificationState = "confirmed" | "pending" | "unverifiable";

/**
 * The success URL alone is never proof of payment — anyone can navigate
 * to this route directly. Verify against our own order record first
 * (fast path, populated by the Stripe webhook), then fall back to a
 * live Stripe lookup to cover the brief race where the webhook hasn't
 * landed yet even though Stripe already confirmed the charge.
 */
async function verifySession(
  sessionId: string | undefined,
): Promise<VerificationState> {
  if (!sessionId) return "unverifiable";

  const order = await prisma.auditOrder.findUnique({
    where: { stripeSessionId: sessionId },
    select: { paymentStatus: true },
  });
  if (order?.paymentStatus === "paid") return "confirmed";

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required"
    ) {
      // Stripe confirms the charge but our webhook-populated record
      // hasn't caught up yet — this is a race, not a failure.
      return "pending";
    }
    return "unverifiable";
  } catch {
    // Unknown/invalid/expired session ID, or Stripe isn't configured —
    // never treat this as a confirmed payment.
    return "unverifiable";
  }
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const state = await verifySession(searchParams.session_id);

  if (state === "pending") return <ConfirmingPayment />;
  if (state === "unverifiable") return <UnableToVerify />;

  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="container-page py-24">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 shadow-glow">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="h-7 w-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m4 12 5 5L20 6" />
              </svg>
            </div>
            <h1 className="h2 mt-6">You’re booked. We’re on it.</h1>
            <p className="muted mx-auto mt-4 max-w-xl">
              Your AI Visibility Audit is in our queue. We’ll email your
              report — most reports are delivered within minutes. Keep an
              eye on your inbox (and your spam folder, just in case).
            </p>

            <div className="card mx-auto mt-10 max-w-xl text-left">
              <p className="pill">What happens next</p>
              <ol className="mt-4 space-y-3 text-sm text-white/80">
                <Step n={1}>
                  Our team runs the full audit across ChatGPT, Claude,
                  Gemini, and Perplexity.
                </Step>
                <Step n={2}>
                  We compile your AI Visibility Score, issues, and ranked fixes
                  into a clean PDF.
                </Step>
                <Step n={3}>
                  You get the report by email. If you want us to fix the issues
                  for you, just reply.
                </Step>
              </ol>
            </div>

            <div className="mt-10 flex justify-center gap-3">
              <Link href="/sample-report" className="btn-ghost">
                See sample report
              </Link>
              <Link href="/" className="btn-primary">
                Back to homepage
              </Link>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

/**
 * Stripe confirmed the charge but our record hasn't caught up yet.
 * Server-rendered auto-refresh (no JS dependency) — same pattern as
 * the audit-in-progress state at report/[id]/print's `ReportInFlight`.
 */
function ConfirmingPayment() {
  return (
    <>
      <meta httpEquiv="refresh" content="4" />
      <main>
        <Header />
        <section className="relative">
          <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
          <div className="container-page py-24">
            <div className="mx-auto max-w-2xl text-center">
              <span className="pill animate-pulseSoft">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Confirming payment
              </span>
              <h1 className="h2 mt-6">Just a moment — confirming your payment.</h1>
              <p className="muted mx-auto mt-4 max-w-xl">
                Stripe has your payment. We&rsquo;re finishing setting up
                your order now — this page will refresh automatically in a
                few seconds.
              </p>
              <p className="mt-5 text-sm text-white/55">
                If this doesn&rsquo;t resolve after a minute, reach us at{" "}
                <a
                  href="mailto:support@geoviz.ai"
                  className="text-accent hover:text-accent-glow underline-offset-4 hover:underline"
                >
                  support@geoviz.ai
                </a>
                .
              </p>
            </div>
          </div>
        </section>
        <Footer />
      </main>
    </>
  );
}

/**
 * Never shown for a real payment — only when there's no session_id, an
 * unknown/invalid/expired one, or Stripe reports it as unpaid. Deliberately
 * neutral copy: it does not claim the payment failed (it may simply be an
 * unrelated visit to this URL), it just declines to confirm success.
 */
function UnableToVerify() {
  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="container-page py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="h2 mt-6">We couldn&rsquo;t verify this checkout.</h1>
            <p className="muted mx-auto mt-4 max-w-xl">
              If you just completed a purchase, check your email for a
              receipt and confirmation from us — it may still be on its
              way. If you haven&rsquo;t completed checkout yet, no charge
              has been made.
            </p>
            <p className="mt-5 text-sm text-white/55">
              Questions? Reach us at{" "}
              <a
                href="mailto:support@geoviz.ai"
                className="text-accent hover:text-accent-glow underline-offset-4 hover:underline"
              >
                support@geoviz.ai
              </a>
              .
            </p>
            <div className="mt-10 flex justify-center gap-3">
              <Link href="/order" className="btn-ghost">
                Back to order
              </Link>
              <Link href="/" className="btn-primary">
                Back to homepage
              </Link>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
