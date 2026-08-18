import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { isStripeConfigured } from "@/lib/stripe";
import { validateReAuditEligibility } from "@/lib/audit-orders/reaudit-eligibility";
import { ReAuditForm } from "./ReAuditForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Run a Re-Audit · GeoViz",
  robots: { index: false, follow: false },
};

/**
 * Confirmation step before the $59 Re-Audit Stripe checkout. Mirrors
 * `/order` → `OrderForm` → `/api/checkout`, simplified: the business
 * name / website are read-only and server-derived from the validated
 * previous order (never accepted as client input — see
 * `validateReAuditEligibility`), so the only thing the customer can
 * edit is the delivery email. `POST /api/checkout/re-audit`
 * independently re-validates eligibility before minting a session, so
 * this page's own check is a UX gate, not the security boundary.
 */
export default async function ReAuditPage({
  searchParams,
}: {
  searchParams?: { orderId?: string };
}) {
  const orderId = searchParams?.orderId?.trim() ?? "";
  const eligibility = orderId
    ? await validateReAuditEligibility(orderId)
    : { eligible: false as const, reason: "No prior audit specified." };

  const reAuditReady =
    isStripeConfigured() && Boolean(process.env.STRIPE_REAUDIT_PRICE_ID);

  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="container-page py-20 md:py-28">
          <div className="mx-auto max-w-md">
            <span className="pill">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Re-Audit
            </span>
            <h1 className="h1 mt-5">Run a Re-Audit</h1>
            <p className="muted mt-3 text-sm leading-relaxed">
              We&rsquo;ll run a full current GeoViz audit and compare it
              against your last one — same scoring, same categories, with
              a progress view showing what changed.
            </p>

            <div className="mt-8">
              {!eligibility.eligible ? (
                <div className="card space-y-2 text-sm text-white/75">
                  <p className="font-medium text-white">
                    This audit isn&rsquo;t eligible for a Re-Audit right now.
                  </p>
                  <p className="text-white/55">{eligibility.reason}</p>
                </div>
              ) : !reAuditReady ? (
                <div className="card space-y-2 text-sm text-white/75">
                  <p className="font-medium text-white">
                    Re-Audit checkout is not yet configured.
                  </p>
                  <p className="text-white/55">
                    Set STRIPE_REAUDIT_PRICE_ID on the server, then try again.
                  </p>
                </div>
              ) : (
                <ReAuditForm
                  previousOrderId={orderId}
                  businessLabel={
                    eligibility.previousOrder.businessName?.trim() ||
                    eligibility.previousOrder.websiteUrl
                  }
                  websiteUrl={eligibility.previousOrder.websiteUrl}
                  defaultEmail={eligibility.previousOrder.email}
                />
              )}
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
