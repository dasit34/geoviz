import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Refund Policy · GeoViz",
  description:
    "GeoViz refund policy for the AI Visibility Audit and the optional AI Visibility Foundation Fix.",
};

const LAST_UPDATED = "May 11, 2026";

export default function RefundPolicyPage() {
  return (
    <main>
      <Header />
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-40" />
        <div className="container-page py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <p className="section-eyebrow">Legal</p>
            <h1 className="h1 mt-3">Refund Policy</h1>
            <p className="muted mt-4 text-sm">Last updated: {LAST_UPDATED}</p>

            <p className="mt-8 text-base leading-relaxed text-white/85">
              We want you to feel good about ordering from GeoViz. This
              page explains how refunds work for the AI Visibility Audit
              ($97) and the AI Visibility Foundation Fix ($497).
            </p>

            <Section title="1. When audits start processing">
              <p>
                Audits begin processing immediately after Stripe confirms
                your payment. Most audits complete within a few minutes,
                which means the compute and AI provider costs that fund
                your report are incurred shortly after you check out.
              </p>
            </Section>

            <Section title="2. Refunds before processing begins">
              <p>
                If for any reason you change your mind and your audit
                has not yet started processing, you can request a full
                refund. Email us right away at{" "}
                <a
                  href="mailto:support@geoviz.ai"
                  className="text-accent hover:underline"
                >
                  support@geoviz.ai
                </a>{" "}
                with your order ID and we will cancel the run if it has
                not started.
              </p>
            </Section>

            <Section title="3. After processing begins">
              <p>
                Once an audit has started running, refunds may be limited
                or unavailable because the work that backs your report
                has already been performed. This is not a gotcha — it
                reflects the actual cost structure of running an audit
                through hosted AI providers.
              </p>
              <p>
                That said, we will always evaluate exceptions in good
                faith. Reach out and tell us what happened.
              </p>
            </Section>

            <Section title="4. Quality concerns">
              <p>
                If the report you receive has a clear factual error,
                analyzes the wrong site, or fails to generate due to a
                technical issue on our side, we will re-run the audit or
                issue a refund at our discretion. Send a short note to{" "}
                <a
                  href="mailto:support@geoviz.ai"
                  className="text-accent hover:underline"
                >
                  support@geoviz.ai
                </a>{" "}
                describing what looks off — the more specific, the faster
                we can sort it out.
              </p>
            </Section>

            <Section title="5. AI Visibility Foundation Fix ($497)">
              <p>
                The optional AI Visibility Foundation Fix is a multi-day
                implementation engagement, not a software product. Refunds
                are handled separately:
              </p>
              <ul className="ml-5 list-disc space-y-1">
                <li>
                  Full refund available if work has not started yet.
                </li>
                <li>
                  Partial refund possible if work is in progress, prorated
                  to the work completed.
                </li>
                <li>
                  No refund on completed AI Visibility Foundation Fix
                  engagements once the deliverables have been handed off.
                </li>
              </ul>
            </Section>

            <Section title="6. How to request a refund">
              <p>
                Email{" "}
                <a
                  href="mailto:support@geoviz.ai"
                  className="text-accent hover:underline"
                >
                  support@geoviz.ai
                </a>{" "}
                from the address you used at checkout and include your
                order ID. We aim to respond within one business day.
              </p>
            </Section>

            <Section title="7. Chargebacks">
              <p>
                If something feels wrong, we would much rather hear from
                you first than be surprised by a chargeback. Email us and
                we will work to resolve it directly. Filed chargebacks
                may delay future orders while the dispute is reviewed.
              </p>
            </Section>

            <Section title="8. Contact">
              <p>
                Questions about this policy? Email{" "}
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
                  href="/privacy"
                  className="text-accent hover:underline"
                >
                  Privacy Policy
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
