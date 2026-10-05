import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Privacy Policy · GeoViz",
  description:
    "How GeoViz collects, uses, and protects the information you share when ordering an AI Visibility Audit or using GeoViz in ChatGPT.",
};

const LAST_UPDATED = "October 4, 2026";

export default function PrivacyPage() {
  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-40" />
        <div className="container-page py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <p className="section-eyebrow">Legal</p>
            <h1 className="h1 mt-3">Privacy Policy</h1>
            <p className="muted mt-4 text-sm">Last updated: {LAST_UPDATED}</p>

            <p className="mt-8 text-base leading-relaxed text-white/85">
              This Privacy Policy explains what information GeoViz
              collects, how we use it, and how we protect it. We aim to
              keep this short and plain. If anything here is unclear,
              email us at{" "}
              <a
                href="mailto:support@geoviz.ai"
                className="text-accent hover:underline"
              >
                support@geoviz.ai
              </a>
              .
            </p>

            <Section title="1. What we collect">
              <p>
                When you order an AI Visibility Audit, you give us:
              </p>
              <ul className="ml-5 list-disc space-y-1">
                <li>The website URL you want audited.</li>
                <li>Your email address.</li>
                <li>Your business name (optional).</li>
                <li>A competitor URL (optional).</li>
              </ul>
              <p>
                We also receive payment metadata from Stripe (a
                confirmation that payment succeeded, your billing email,
                and a session ID). We never store full card numbers on
                our servers. To run the service safely, we also log
                basic request metadata — a hashed client IP for rate
                limiting and user-agent strings for diagnostics. The raw
                IP is hashed before it lands in our logs.
              </p>
            </Section>

            <Section title="2. How we use it">
              <p>We use this information to:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Run your audit and deliver your report.</li>
                <li>Email you the report and any follow-up about your order.</li>
                <li>Operate, troubleshoot, and improve the service.</li>
                <li>Prevent abuse and enforce our Terms.</li>
              </ul>
              <p>
                We do <strong className="text-white">not</strong> sell
                your information to third parties, and we do not use it
                for ad targeting.
              </p>
            </Section>

            <Section title="3. Third-party services">
              <p>
                Like most modern services, GeoViz relies on third parties
                to operate. The relevant ones are:
              </p>
              <ul className="ml-5 list-disc space-y-1">
                <li>
                  <strong className="text-white">Stripe</strong> processes
                  payment. They handle card details directly; we receive
                  only confirmation and metadata.
                </li>
                <li>
                  <strong className="text-white">Resend</strong> delivers
                  transactional email (order confirmation, report delivery,
                  internal operator notifications).
                </li>
                <li>
                  <strong className="text-white">Vercel</strong> hosts the
                  GeoViz web application and stores transient logs.
                </li>
                <li>
                  <strong className="text-white">Railway</strong> runs the
                  audit worker process and stores our application database.
                </li>
                <li>
                  <strong className="text-white">AI model providers</strong>
                  {" "}(including Anthropic) generate portions of the audit
                  analysis. We pass the website URL and supporting context
                  to these providers; we do not pass your email address
                  to them as part of audit generation.
                </li>
              </ul>
              <p>
                Information shared with these providers is also governed
                by their own privacy terms.
              </p>
            </Section>

            <Section id="chatgpt" title="4. GeoViz in ChatGPT">
              <p>
                GeoViz is available as a plugin in ChatGPT. It runs a
                website AI-readiness check through our MCP server at{" "}
                <span className="font-mono text-white/85">www.geoviz.ai/mcp</span>.
                This section covers that integration.
              </p>
              <p>
                <strong className="text-white">What we receive.</strong> When
                you ask GeoViz to check a website, ChatGPT sends us the
                website address and, only if you include them, the business
                name, city, and state. We do not receive your ChatGPT
                conversation, your name, your email address, or your OpenAI
                account details, and GeoViz does not create an account for
                you. ChatGPT may attach general request metadata (such as
                locale or an approximate location); we do not use, log, or
                store it.
              </p>
              <p>
                <strong className="text-white">How we use it.</strong> We
                fetch that website&rsquo;s public homepage,{" "}
                <span className="font-mono">robots.txt</span>, and{" "}
                <span className="font-mono">sitemap.xml</span>, analyze them,
                and return the result to ChatGPT. GeoViz does not ask any AI
                system about the business. We only fetch public websites;
                private-network, local, and cloud-metadata addresses are
                refused.
              </p>
              <p>
                <strong className="text-white">What we keep, and for how long.</strong>{" "}
                The check result and the details you entered are not saved
                to our database. The fetched public pages are held in server
                memory for up to 10 minutes so a repeat check of the same
                website can be answered without fetching it again, then
                discarded. Our application logs record only the website
                domain that was checked, whether the check succeeded, how
                long it took, and a one-way hash of the requesting IP
                address (for rate limiting and abuse prevention). Our
                hosting provider also keeps standard request metadata, which
                can include the requesting IP address. These logs are kept
                for no longer than 30 days and then deleted.
              </p>
              <p>
                <strong className="text-white">Sharing.</strong> We do not
                sell this information or use it for advertising. Vercel hosts
                the MCP server and its logs. The website you ask about
                receives an ordinary request from our scanner
                (<span className="font-mono">GeoVizSiteScanner/1.0</span>).
                The result we return is shown to you in ChatGPT, where
                OpenAI&rsquo;s own privacy policy applies.
              </p>
              <p>
                <strong className="text-white">Deletion and your choices.</strong>{" "}
                Because nothing you enter is stored, there is no plugin data
                to delete; logs expire automatically within 30 days. You can
                stop using GeoViz at any time by removing or disconnecting it
                in ChatGPT&rsquo;s settings. For questions or requests, see{" "}
                <Link href="/support" className="text-accent hover:underline">
                  Support
                </Link>{" "}
                or email{" "}
                <a
                  href="mailto:support@geoviz.ai"
                  className="text-accent hover:underline"
                >
                  support@geoviz.ai
                </a>
                .
              </p>
            </Section>

            <Section title="5. Cookies and tracking">
              <p>
                GeoViz uses only essential cookies — the ones required
                for checkout to work and for basic session state. We do
                not embed third-party advertising pixels or cross-site
                tracking.
              </p>
            </Section>

            <Section title="6. Data retention">
              <p>
                We retain orders and reports while your account is active
                and for a reasonable period afterwards for tax, support,
                and abuse-investigation purposes. You can request
                deletion at any time by emailing{" "}
                <a
                  href="mailto:support@geoviz.ai"
                  className="text-accent hover:underline"
                >
                  support@geoviz.ai
                </a>{" "}
                with the order ID. We may retain a minimal record of the
                transaction itself where required by law.
              </p>
            </Section>

            <Section title="7. Security">
              <p>
                We protect data in transit with TLS, gate administrative
                surfaces with a high-entropy secret using a length-stable
                compare, rate-limit sensitive endpoints, and follow
                least-privilege access on internal tooling. No system is
                perfectly secure, but we work to make GeoViz a hard
                target.
              </p>
            </Section>

            <Section title="8. Your rights">
              <p>
                You may ask us to access, correct, or delete the personal
                data we hold about you. Email{" "}
                <a
                  href="mailto:support@geoviz.ai"
                  className="text-accent hover:underline"
                >
                  support@geoviz.ai
                </a>{" "}
                from the address associated with your order. We will
                respond within a reasonable timeframe.
              </p>
            </Section>

            <Section title="9. Children">
              <p>
                GeoViz is not directed at children under 16 and we do
                not knowingly collect personal data from them.
              </p>
            </Section>

            <Section title="10. International transfers">
              <p>
                GeoViz operates from and stores data in the United States.
                If you order from outside the US, your information will be
                transferred to and processed in the US.
              </p>
            </Section>

            <Section title="11. Changes">
              <p>
                We may update this Privacy Policy from time to time. When
                we make material changes, we will update the &ldquo;Last
                updated&rdquo; date above and, where appropriate, notify
                you by email or on the site.
              </p>
            </Section>

            <Section title="12. Contact">
              <p>
                Questions about your data or this Policy? Visit{" "}
                <Link href="/support" className="text-accent hover:underline">
                  Support
                </Link>{" "}
                or email us at{" "}
                <a
                  href="mailto:support@geoviz.ai"
                  className="text-accent hover:underline"
                >
                  support@geoviz.ai
                </a>
                . See also our{" "}
                <Link
                  href="/terms"
                  className="text-accent hover:underline"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/refund-policy"
                  className="text-accent hover:underline"
                >
                  Refund Policy
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

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <h2 className="h3 text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-white/75">
        {children}
      </div>
    </section>
  );
}
