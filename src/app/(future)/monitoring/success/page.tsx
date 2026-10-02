import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getSignedInCustomerId } from "@/lib/monitoring/auth/session";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monitoring activated · GeoViz", robots: { index: false, follow: false } };

/**
 * Stripe subscription-checkout return page. The checkout session id in the
 * URL is NOT a credential: access comes only from the single-use sign-in
 * link emailed to the purchase address (the webhook sends it once the
 * subscription is recorded).
 */
export default async function MonitoringSuccessPage() {
  if (!isMonitoringEnabled()) notFound();
  const signedIn = Boolean(await getSignedInCustomerId());

  return (
    <main>
      <Header />
      <section className="container-page max-w-xl py-24 text-center">
        <p className="section-eyebrow">AI Visibility Monitoring</p>
        <h1 className="h2 mt-4">Payment received — monitoring is activating</h1>
        <p className="muted mx-auto mt-4 text-sm">
          We&apos;ve emailed a sign-in link to the address you used at checkout. Open it on this device and press Continue to
          see your monitoring dashboard. The link works once and is valid for 24 hours.
        </p>
        <p className="mt-8 text-sm">
          {signedIn ? (
            <a href="/monitoring/account" className="btn-primary inline-block">Go to your dashboard</a>
          ) : (
            <a href="/monitoring/sign-in" className="text-accent underline">Didn&apos;t get the email? Send a new sign-in link</a>
          )}
        </p>
      </section>
      <Footer />
    </main>
  );
}
