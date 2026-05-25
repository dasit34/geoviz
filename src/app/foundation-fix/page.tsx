import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FoundationFixForm } from "./FoundationFixForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Request the AI Visibility Foundation Fix · GeoViz",
  description:
    "Request the AI Visibility Foundation Fix — a scoped infrastructure engagement that addresses the underlying technical, trust, and discoverability gaps surfaced in your GeoViz audit.",
};

export default function FoundationFixPage({
  searchParams,
}: {
  searchParams?: {
    orderId?: string;
    websiteUrl?: string;
    businessName?: string;
    email?: string;
  };
}) {
  return (
    <main>
      <Header />

      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="absolute inset-0 -z-10 grid-bg opacity-50" />
        <div className="container-page grid gap-14 py-20 md:grid-cols-[1fr_1.05fr] md:py-28 lg:gap-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              The Foundation Fix
            </p>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Request your scoped Foundation Fix.
            </h1>
            <p className="mt-5 max-w-md font-serif text-xl italic leading-relaxed text-white/65">
              We install the AI-readable layer; you see the before and
              after.
            </p>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/65">
              Tell us about your business and we&rsquo;ll reply within one
              business day with a scoped setup plan that addresses the
              gaps your audit surfaced.
            </p>

            <ul className="mt-8 space-y-3 text-sm text-white/75">
              <Bullet>Machine-readability improvements for AI retrieval</Bullet>
              <Bullet>Trust and verification signal strengthening</Bullet>
              <Bullet>Cross-platform business identity alignment</Bullet>
              <Bullet>Customer-answer content gaps closed</Bullet>
              <Bullet>Before/after GeoViz re-check (verification audit)</Bullet>
            </ul>

            <div className="mt-10 rounded-lg border border-white/10 bg-ink-900/50 p-5 text-sm text-white/65">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Pricing
              </p>
              <p className="mt-2">
                $497 one-time · 3–5 business days · complex sites may
                require custom scoping.
              </p>
            </div>
          </div>

          <div>
            <FoundationFixForm
              defaults={{
                businessName: searchParams?.businessName,
                websiteUrl: searchParams?.websiteUrl,
                contactEmail: searchParams?.email,
                auditOrderId: searchParams?.orderId,
              }}
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
