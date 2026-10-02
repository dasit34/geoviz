import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MonitoringSignupForm, type MonitoringPlanOption } from "@/components/MonitoringSignupForm";
import { configuredPlans, formatPlanPrice, isMonitoringEnabled } from "@/lib/monitoring/plans";
import { retrievePlanPrice } from "@/lib/monitoring/stripe-gateway";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "AI Visibility Monitoring · GeoViz",
  description:
    "Recurring AI visibility audits with score change over time — reviewed before delivery.",
};

/**
 * Monitoring plan selection → Stripe subscription checkout. 404s unless
 * GEO_MODULE_MONITORING_ENABLED="true". Plan prices are read from the
 * Stripe price objects, never hardcoded (src/lib/monitoring/plans.ts).
 */
export default async function MonitoringPage() {
  if (!isMonitoringEnabled()) notFound();

  const plans: MonitoringPlanOption[] = [];
  if (process.env.STRIPE_SECRET_KEY) {
    for (const plan of configuredPlans()) {
      const price = await retrievePlanPrice(plan.priceId);
      const display = price ? formatPlanPrice(price) : null;
      if (display) {
        plans.push({ key: plan.key, name: plan.name, description: plan.description, ...display });
      }
    }
  }

  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="container-page grid gap-14 py-20 md:grid-cols-[1fr_1.05fr] md:py-28 lg:gap-20">
          <div>
            <p className="section-eyebrow">AI Visibility Monitoring</p>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Keep measuring whether AI can find, trust, and recommend you.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/65">
              Your site gets a fresh AI visibility audit on a fixed schedule. Each report is
              reviewed before delivery and compared with your previous audit, so you can see
              whether your fixes moved your AI readability and trust signals.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-white/75">
              <li>• Scheduled re-audits using the same GeoViz audit and scoring</li>
              <li>• Latest score, previous score, and score change</li>
              <li>• Every completed report, available from one private page</li>
              <li>• Manage or cancel billing any time through Stripe</li>
            </ul>
          </div>
          <div>
            {plans.length > 0 ? (
              <MonitoringSignupForm plans={plans} />
            ) : (
              <div className="card p-6 text-sm text-white/70">
                Monitoring plans are not available yet. Order a one-time{" "}
                <a href="/order" className="text-accent underline">AI Visibility Audit</a> in the meantime.
              </div>
            )}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
