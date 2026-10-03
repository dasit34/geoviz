import { notFound, redirect } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getSignedInCustomerId } from "@/lib/monitoring/auth/session";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · GeoViz Monitoring", robots: { index: false, follow: false } };

const MESSAGES: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one below.",
  session: "Please sign in to continue.",
  rate_limited: "Too many sign-in requests. Please wait a few minutes and try again.",
  email: "Enter a valid email address.",
  unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
};

/** Returning monitoring customers: enter the purchase email, get a link. */
export default async function MonitoringSignInPage({
  searchParams,
}: {
  searchParams?: { error?: string; signed_out?: string; from?: string };
}) {
  if (!isMonitoringEnabled()) notFound();
  if (await getSignedInCustomerId()) redirect("/monitoring/account");

  const error = searchParams?.error ? MESSAGES[searchParams.error] : null;
  return (
    <main>
      <Header />
      <section className="container-page max-w-lg py-20">
        <p className="section-eyebrow">AI Visibility Monitoring</p>
        <h1 className="h2 mt-4">Sign in</h1>
        <p className="muted mt-3 text-sm">
          Enter the email you used to buy monitoring. We&apos;ll email you a sign-in link — no password needed.
        </p>
        {searchParams?.signed_out ? <p role="status" className="mt-4 text-sm text-white/70">You&apos;ve been signed out.</p> : null}
        {searchParams?.from === "link" ? (
          <p role="status" className="mt-4 text-sm text-white/70">
            Monitoring pages now use secure sign-in. Enter your email to get a sign-in link.
          </p>
        ) : null}
        {error ? <p role="alert" className="mt-4 text-sm text-severity-warning">{error}</p> : null}
        <form action="/api/monitoring/auth/request-link" method="POST" className="mt-8">
          <label htmlFor="email" className="block text-xs text-white/55">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" maxLength={254} className="input-field mt-1" />
          <button type="submit" className="btn-primary mt-4 w-full">Email me a sign-in link</button>
        </form>
      </section>
      <Footer />
    </main>
  );
}
