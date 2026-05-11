import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Order received · GeoViz",
  robots: { index: false, follow: false },
};

export default function CheckoutSuccessPage() {
  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
        <div className="container-page py-24">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 shadow-glow">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="h-7 w-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m4 12 5 5L20 6" />
              </svg>
            </div>
            <h1 className="h2 mt-6">You’re booked. We’re on it.</h1>
            <p className="muted mx-auto mt-4 max-w-xl">
              Your AI Visibility Audit is in our queue. We’ll email your
              report — most reports are delivered within minutes. Keep an
              eye on your inbox (and your spam folder, just in case).
            </p>

            <div className="card mx-auto mt-10 max-w-xl text-left">
              <p className="pill">What happens next</p>
              <ol className="mt-4 space-y-3 text-sm text-white/80">
                <Step n={1}>
                  Our team runs the full audit across ChatGPT, Claude,
                  Perplexity, Gemini, and Google AI Overviews.
                </Step>
                <Step n={2}>
                  We compile your AI Visibility Score, issues, and ranked fixes
                  into a clean PDF.
                </Step>
                <Step n={3}>
                  You get the report by email. If you want us to fix the issues
                  for you, just reply.
                </Step>
              </ol>
            </div>

            <div className="mt-10 flex justify-center gap-3">
              <Link href="/sample-report" className="btn-ghost">
                See sample report
              </Link>
              <Link href="/" className="btn-primary">
                Back to homepage
              </Link>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
