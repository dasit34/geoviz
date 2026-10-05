import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Support · GeoViz",
  description:
    "How to get help with GeoViz: AI Visibility Audits, the free website check, and GeoViz in ChatGPT.",
};

const SUPPORT_EMAIL = "support@geoviz.ai";

export default function SupportPage() {
  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-40" />
        <div className="container-page py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <p className="section-eyebrow">Support</p>
            <h1 className="h1 mt-3">Get help with GeoViz</h1>

            <p className="mt-8 text-base leading-relaxed text-white/85">
              Email us at <EmailLink /> and a person at GeoViz will reply by
              email. Include the details below that match your question so we
              can help on the first reply.
            </p>

            <Section title="AI Visibility Audits and orders">
              <ul className="ml-5 list-disc space-y-1">
                <li>The email address you ordered with and your order ID.</li>
                <li>The website the audit was for.</li>
                <li>What you expected and what happened instead.</li>
              </ul>
              <p>
                Refund questions are covered by our{" "}
                <Link href="/refund-policy" className="text-accent hover:underline">
                  Refund Policy
                </Link>
                .
              </p>
            </Section>

            <Section title="GeoViz in ChatGPT">
              <p>
                GeoViz in ChatGPT runs a website AI-readiness check of a
                business&rsquo;s public homepage and returns a 0&ndash;100
                score, six findings, prioritized improvements, and the
                evidence behind them. It does not ask ChatGPT, Claude,
                Gemini, or Perplexity about the business, and the result does
                not show whether any AI system recommends it.
              </p>
              <p>When you contact us about a ChatGPT result, include:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>The website address you asked GeoViz to check.</li>
                <li>
                  The message GeoViz returned (for example &ldquo;took too long
                  to respond&rdquo; or &ldquo;try again in a few
                  minutes&rdquo;), and roughly when it happened.
                </li>
              </ul>
              <p>
                GeoViz only checks public websites. Addresses on private
                networks, local machines, or cloud-metadata services are
                refused by design. To stop using GeoViz in ChatGPT, remove or
                disconnect it in ChatGPT&rsquo;s settings. What GeoViz receives
                and keeps when you use it in ChatGPT is described in our{" "}
                <Link href="/privacy#chatgpt" className="text-accent hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </Section>

            <Section title="Free website check">
              <p>
                For questions about a result from{" "}
                <Link href="/check" className="text-accent hover:underline">
                  the free check
                </Link>
                , include the website address and the email address you
                entered.
              </p>
            </Section>

            <Section title="Privacy and data requests">
              <p>
                To access, correct, or delete personal data, email <EmailLink />{" "}
                from the address associated with your order or check. See the{" "}
                <Link href="/privacy" className="text-accent hover:underline">
                  Privacy Policy
                </Link>{" "}
                and{" "}
                <Link href="/terms" className="text-accent hover:underline">
                  Terms of Service
                </Link>
                .
              </p>
            </Section>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function EmailLink() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">
      {SUPPORT_EMAIL}
    </a>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="h3 text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-white/75">
        {children}
      </div>
    </section>
  );
}
