import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OrderForm } from "@/components/OrderForm";
import { isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Order your AI Visibility Audit · GeoViz",
  description:
    "Order your $97 AI Visibility Audit. We audit how ChatGPT, Claude, Perplexity, and Gemini see your business and deliver a full report by email within 24 hours.",
};

export default function OrderPage({
  searchParams,
}: {
  searchParams?: { websiteUrl?: string; email?: string };
}) {
  const stripeReady = isStripeConfigured();
  const testBypassEnabled = process.env.NODE_ENV !== "production";

  return (
    <main>
      <Header />

      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="container-page grid gap-12 py-16 md:grid-cols-[1fr_1.05fr] md:py-24">
          <div>
            <p className="section-eyebrow">Step 1 of 2</p>
            <h1 className="h2 mt-3">Tell us where to look.</h1>
            <p className="muted mt-4 max-w-md">
              Give us your website and email. Next step is a secure Stripe
              checkout — $97 one-time (normally $147).
            </p>
            <p className="mt-3 max-w-md text-sm text-white/70">
              Delivered by email within 24 hours. Each report is generated
              using AI-assisted analysis across ChatGPT, Claude, Perplexity,
              and Gemini, then reviewed for clarity before delivery.
            </p>
            <p className="mt-3 text-xs italic text-white/50">
              We run a limited number of audits per day to keep results accurate.
            </p>

            <ul className="mt-8 space-y-3 text-sm text-white/75">
              <Bullet>AI Visibility Score (0–100)</Bullet>
              <Bullet>Plain-English breakdown of every issue</Bullet>
              <Bullet>Top priority fixes, ranked</Bullet>
              <Bullet>Professional PDF report</Bullet>
            </ul>

            <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/70">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Platforms analyzed
              </p>
              <p className="mt-2">
                ChatGPT · Claude · Perplexity · Gemini · Google AI Overviews
              </p>
            </div>
          </div>

          <div>
            {stripeReady ? null : (
              <div
                role="status"
                className="mb-4 rounded-md border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"
              >
                <strong className="font-semibold">Checkout preview mode.</strong>{" "}
                Stripe is not configured yet, so the button below will not
                start a real checkout. Set <code>STRIPE_SECRET_KEY</code> and{" "}
                <code>STRIPE_PRICE_ID</code> to enable live orders.
              </div>
            )}
            <OrderForm
              defaults={{
                websiteUrl: searchParams?.websiteUrl,
                email: searchParams?.email,
              }}
              checkoutEnabled={stripeReady}
              testBypassEnabled={testBypassEnabled}
            />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3 8 3.5 3.5L13 5" />
        </svg>
      </span>
      <span>{children}</span>
    </li>
  );
}
