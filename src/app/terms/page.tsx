import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Terms of Service · GeoViz",
  description:
    "The terms that govern your use of GeoViz, an AI visibility audit platform.",
};

const LAST_UPDATED = "May 11, 2026";

export default function TermsPage() {
  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-40" />
        <div className="container-page py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <p className="section-eyebrow">Legal</p>
            <h1 className="h1 mt-3">Terms of Service</h1>
            <p className="muted mt-4 text-sm">Last updated: {LAST_UPDATED}</p>

            <p className="mt-8 text-base leading-relaxed text-white/85">
              Welcome to GeoViz. These Terms of Service (&ldquo;Terms&rdquo;)
              govern your use of the GeoViz website and the AI Visibility
              Audit service (the &ldquo;Service&rdquo;). By placing an order
              or using the Service, you agree to these Terms. Please read
              them carefully.
            </p>

            <Section title="1. What GeoViz does">
              <p>
                GeoViz is an AI Visibility Audit platform. We analyze
                publicly accessible signals on your website and generate
                a directional report describing how AI systems
                (such as ChatGPT, Claude, Gemini, Perplexity, and Google
                AI Overviews) are likely to read, interpret, and surface
                your business.
              </p>
              <p>
                Each audit returns a 0–100 AI Visibility Score, a written
                breakdown, a ranked list of issues and fixes, and a PDF.
                Reports are <strong className="text-white">
                informational and directional</strong> — they are research
                output, not a guarantee of any outcome.
              </p>
            </Section>

            <Section title="2. No guarantees">
              <p>
                GeoViz does not guarantee any specific result. In
                particular, we do not promise that you will:
              </p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Appear in a specific position in any AI tool or search engine.</li>
                <li>Be cited, recommended, or mentioned by any AI system.</li>
                <li>See increased traffic, leads, revenue, or rankings.</li>
                <li>Pass any third-party scoring system or audit framework.</li>
              </ul>
              <p>
                AI systems update their behavior continuously, and what
                they recommend depends on factors outside our control.
                We share our best read of the publicly available signals
                — nothing more.
              </p>
            </Section>

            <Section title="3. What you submit">
              <p>
                To run an audit, you provide your website URL, your email
                address, and (optionally) your business name and a
                competitor URL. You confirm that you have the right to
                request an audit of the website you submit.
              </p>
              <p>
                You agree not to submit URLs that you do not own or
                operate without permission, and not to use the Service
                to harass, defame, or scrape third parties.
              </p>
            </Section>

            <Section title="4. Pricing &amp; payment">
              <p>
                The AI Visibility Audit is offered at the price displayed
                at checkout. Payment is processed by Stripe; we never
                store your full card number on our servers. The optional
                AI Visibility Foundation Fix is quoted separately.
              </p>
              <p>
                Refund handling is covered by our{" "}
                <Link href="/refund-policy" className="text-accent hover:underline">
                  Refund Policy
                </Link>
                .
              </p>
            </Section>

            <Section title="5. Third-party services">
              <p>
                GeoViz relies on third-party services to deliver the
                Service, including:
              </p>
              <ul className="ml-5 list-disc space-y-1">
                <li>
                  <strong className="text-white">Stripe</strong> for payment
                  processing.
                </li>
                <li>
                  <strong className="text-white">Resend</strong> for
                  transactional email delivery.
                </li>
                <li>
                  <strong className="text-white">Hosting providers</strong>{" "}
                  (Vercel and Railway) for application hosting and the audit
                  worker.
                </li>
                <li>
                  <strong className="text-white">AI model providers</strong>{" "}
                  (such as Anthropic) for portions of the audit analysis.
                </li>
              </ul>
              <p>
                Your use of GeoViz is also subject to the terms of those
                providers where their services are involved.
              </p>
            </Section>

            <Section title="6. Acceptable use">
              <p>You agree not to:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Reverse-engineer or attempt to extract our scoring rubric.</li>
                <li>Resell or repackage GeoViz reports without permission.</li>
                <li>Use the Service to violate any law or any third party&rsquo;s rights.</li>
                <li>Submit deliberately false or misleading information.</li>
                <li>Probe, scan, or attempt to bypass rate limits or access controls.</li>
              </ul>
            </Section>

            <Section title="7. Intellectual property">
              <p>
                The GeoViz brand, audit template, scoring rubric, software,
                and documentation are owned by GeoViz. You retain ownership
                of the website you submit and of the report content
                describing your business; we grant you a perpetual license
                to use and share your audit report internally and with
                contractors working on your behalf.
              </p>
            </Section>

            <Section title="8. Disclaimer of warranties">
              <p>
                The Service is provided &ldquo;as is&rdquo; and &ldquo;as
                available.&rdquo; We make no warranties, express or
                implied, about merchantability, fitness for a particular
                purpose, accuracy, or uninterrupted availability.
              </p>
            </Section>

            <Section title="9. Limitation of liability">
              <p>
                To the maximum extent permitted by law, GeoViz&rsquo;s
                total liability arising out of or related to the Service
                is limited to the amount you paid us in the twelve months
                before the event giving rise to the claim. We are not
                liable for indirect, incidental, special, consequential,
                or punitive damages.
              </p>
            </Section>

            <Section title="10. Changes">
              <p>
                We may update these Terms from time to time. When we
                make material changes, we will update the &ldquo;Last
                updated&rdquo; date above and, where appropriate, notify
                you by email or on the site.
              </p>
            </Section>

            <Section title="11. Contact">
              <p>
                Questions about these Terms? Email us at{" "}
                <a
                  href="mailto:support@geoviz.ai"
                  className="text-accent hover:underline"
                >
                  support@geoviz.ai
                </a>
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
