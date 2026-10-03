import { notFound, redirect } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { monitoringAccess } from "@/lib/monitoring/access";
import { getSignedInCustomerId, listCustomerSubscriptions } from "@/lib/monitoring/auth/session";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your businesses · GeoViz Monitoring", robots: { index: false, follow: false } };

/**
 * Signed-in landing page. One business → straight to its dashboard;
 * several → a simple chooser.
 */
export default async function MonitoringAccountPage({ searchParams }: { searchParams?: { choose?: string } }) {
  if (!isMonitoringEnabled()) notFound();
  const customerId = await getSignedInCustomerId();
  if (!customerId) redirect("/monitoring/sign-in?error=session");

  const subs = await listCustomerSubscriptions(customerId);
  if (subs.length === 1 && searchParams?.choose !== "1") redirect(`/monitoring/account/${subs[0]!.id}`);

  const now = new Date();
  return (
    <main>
      <Header />
      <section className="container-page py-14 md:py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="section-eyebrow">AI Visibility Monitoring</p>
          <form action="/api/monitoring/auth/sign-out" method="POST">
            <button type="submit" className="text-xs text-white/60 underline hover:text-white">Sign out</button>
          </form>
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">Choose a business</h1>
        {subs.length === 0 ? (
          <p className="muted mt-6 text-sm">No monitored businesses are connected to this account. Contact support@geoviz.ai.</p>
        ) : (
          <ul className="mt-8 grid gap-3 md:grid-cols-2">
            {subs.map((s) => (
              <li key={s.id}>
                <a href={`/monitoring/account/${s.id}`} className="card card-hover block p-5">
                  <p className="text-white">{s.businessName || s.websiteUrl}</p>
                  <p className="mono-data mt-1 text-xs text-white/55">{s.websiteUrl}</p>
                  <p className="mt-2 text-xs text-white/60">{monitoringAccess(s, now).label}</p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Footer />
    </main>
  );
}
