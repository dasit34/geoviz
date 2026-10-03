import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MonitoringVerifyForm } from "@/components/MonitoringVerifyForm";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sign in · GeoViz Monitoring",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

/**
 * Landing page for emailed sign-in links. Opening it does NOT sign anyone
 * in: the secret stays in the URL fragment (never sent to the server) until
 * the person presses Continue, which POSTs it. Link-scanning bots that
 * merely fetch the page can't consume the single-use link.
 */
export default function MonitoringVerifyPage() {
  if (!isMonitoringEnabled()) notFound();
  return (
    <main>
      <Header />
      <section className="container-page max-w-lg py-20">
        <p className="section-eyebrow">AI Visibility Monitoring</p>
        <h1 className="h2 mt-4">Continue to GeoViz</h1>
        <MonitoringVerifyForm />
      </section>
      <Footer />
    </main>
  );
}
