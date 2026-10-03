import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check your email · GeoViz Monitoring", robots: { index: false, follow: false } };

/** Shown after every link request — identical whether or not the email has an account. */
export default function MonitoringSignInSentPage() {
  if (!isMonitoringEnabled()) notFound();
  return (
    <main>
      <Header />
      <section className="container-page max-w-lg py-20">
        <p className="section-eyebrow">AI Visibility Monitoring</p>
        <h1 className="h2 mt-4">Check your email</h1>
        <p className="muted mt-3 text-sm">
          If that address has GeoViz monitoring, a sign-in link is on its way. It works once and expires in 15 minutes.
        </p>
        <p className="mt-6 text-sm">
          <a href="/monitoring/sign-in" className="text-accent underline">Send another link</a>
        </p>
      </section>
      <Footer />
    </main>
  );
}
