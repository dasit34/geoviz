import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FreeCheckForm } from "@/components/FreeCheckForm";

export const dynamic = "force-dynamic";

const TITLE = "Free AI Visibility Check for Local Businesses | GeoViz";
const DESCRIPTION =
  "Check whether ChatGPT, Claude, Gemini, Perplexity, and Google AI can clearly understand and recommend your business.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function FreeCheckPage() {
  // Funnel telemetry — free check page viewed. Matches the existing
  // console.log convention used on /order (no analytics platform is
  // configured in this codebase).
  console.log("[free-check-page] viewed");

  return (
    <main>
      <Header />

      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="absolute inset-0 -z-10 grid-bg opacity-50" />
        <div className="container-page grid gap-14 py-20 md:grid-cols-[1fr_1.05fr] md:py-28 lg:gap-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              Free AI Visibility Check
            </p>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Will AI recommend your business?
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/65">
              See how clearly your business can be understood by ChatGPT,
              Claude, Gemini, Perplexity, and Google AI.
            </p>
            <p className="mt-3 max-w-md text-sm text-white/55">
              Enter your website and a few details below. Get your free
              preview in about 10 seconds — no account or credit card
              required.
            </p>

            <div className="mt-10 rounded-lg border border-white/10 bg-ink-900/50 p-5 text-sm text-white/65">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                This is a quick preview
              </p>
              <p className="mt-2">
                Six simplified checks and an overall score — not the full
                AI Visibility Audit. Want the complete picture? Run the
                free check first, then upgrade to the $97 audit.
              </p>
            </div>
          </div>

          <div>
            <FreeCheckForm />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
