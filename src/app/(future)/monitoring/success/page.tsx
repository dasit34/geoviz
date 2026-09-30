import { notFound, redirect } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { prisma } from "@/lib/db";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monitoring activated · GeoViz", robots: { index: false, follow: false } };

/**
 * Stripe subscription-checkout return page. Resolves the checkout
 * session → subscription → the customer's private status page. The
 * webhook may land a few seconds after the redirect, so until the row
 * exists this page refreshes itself.
 */
export default async function MonitoringSuccessPage({
  searchParams,
}: {
  searchParams?: { session_id?: string };
}) {
  if (!isMonitoringEnabled()) notFound();
  const sessionId = searchParams?.session_id ?? "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) notFound();

  let token: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (session.mode === "subscription" && subscriptionId) {
      const sub = await prisma.monitoringSubscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
        select: { accessToken: true },
      });
      token = sub?.accessToken ?? null;
    }
  } catch (err) {
    console.error("[monitoring-success] session lookup failed:", err);
  }
  if (token) redirect(`/monitoring/${token}`);

  return (
    <main>
      <meta httpEquiv="refresh" content="5" />
      <Header />
      <section className="container-page py-24 text-center">
        <h1 className="h2">Activating your monitoring…</h1>
        <p className="muted mx-auto mt-4 max-w-md">
          Payment received. We&apos;re setting up your monitoring page — this usually takes a few
          seconds and this page will refresh on its own. We&apos;ve also emailed you the link.
        </p>
      </section>
      <Footer />
    </main>
  );
}
