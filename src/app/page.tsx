import { FaqAccordion, type FaqItem } from "@/components/FaqAccordion";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { HomeAuditSection } from "@/components/HomeAuditSection";
import { HomeCompareSection } from "@/components/HomeCompareSection";
import { HomeCustomerBlock } from "@/components/HomeCustomerBlock";
import { HomeFinalCta } from "@/components/HomeFinalCta";
import { HomeHero } from "@/components/HomeHero";
import { HomeImproveSection } from "@/components/HomeImproveSection";
import { HomeLimits } from "@/components/HomeLimits";
import { HomeLoopStrip } from "@/components/HomeLoopStrip";
import { HomeMonitorSection } from "@/components/HomeMonitorSection";
import { HomePricing } from "@/components/HomePricing";
import { HomeProveSection } from "@/components/HomeProveSection";
import { MotionRoot } from "@/components/MotionRoot";
import { RevealOnView } from "@/components/RevealOnView";
import { getMonitoringOffer } from "@/lib/home/offers";

/**
 * Homepage — Audit → Monitor → Compare → Improve → Prove.
 *
 * Every section maps to functionality that exists today. Product
 * demonstrations use src/lib/home/example-data.ts and are always badged
 * "Example data". Monitoring is sold only when GEO_MODULE_MONITORING_ENABLED
 * is "true"; otherwise it is shown as launching soon with no purchase path.
 *
 * Binding copy contracts (scripts/test-report-copy-defensibility.ts reads
 * this file): the Foundation Fix copy below must keep "underlying technical,
 * trust, and discoverability gaps", "$497", "3–5 business days", and
 * "complex sites may require custom scoping" verbatim, and must not list
 * the implementation recipe. Section ids how-it-works / pricing / faq are
 * Header anchors — keep them.
 */

// Monitoring price comes from Stripe when monitoring is open; refresh hourly.
export const revalidate = 3600;

const FOUNDATION_FIX = {
  eyebrow: "Optional · Foundation Fix",
  title: "Want it done for you?",
  body: (
    <p>
      The GEO Foundation Fix repairs the underlying technical, trust, and discoverability gaps surfaced in your audit,
      then re-checks how AI reads your business. Scoped work — not a website rebuild.
    </p>
  ),
  terms: <p>Starting at $497 · one-time · 3–5 business days</p>,
  scoping: <p>Complex sites may require custom scoping — we’ll quote upfront.</p>,
};

function faqs(monitoringOpen: boolean): FaqItem[] {
  return [
    {
      q: "What is AI visibility?",
      a: "Whether AI assistants like ChatGPT, Claude, Gemini, and Perplexity can find, understand, and confidently recommend your business when a customer asks them for help. It depends on how clearly your website and public signals describe who you are, what you do, and why you’re trustworthy.",
    },
    {
      q: "How is the GeoViz score calculated?",
      a: "From deterministic website evidence — crawl access, structured data, business identity, content depth, trust signals, and technical accessibility. The same site produces the same score. The AI systems explain and cross-check; they never change your score. We don’t publish the exact weighting, but every report shows the categories behind the score and the issues lowering it.",
    },
    {
      q: "Which AI systems do you check?",
      a: "The audit asks Anthropic Claude, OpenAI GPT, Google Gemini, and Perplexity through their APIs. API answers can differ from what the consumer apps show. Google AI Overviews has no public way to test, so the report includes a readiness estimate derived from your website’s signals instead — it is not a test of Google’s results.",
    },
    {
      q: "What’s the difference between the free check and the audit?",
      a: "The free check is a quick technical read of how machine-readable your website is; it doesn’t ask any AI system. The $97 audit adds the full score, how four AI systems read your business, prioritized fixes, and a brief reviewed by a person.",
    },
    {
      q: "What does monitoring add?",
      a: monitoringOpen
        ? "A reviewed re-audit every month, up to 10 customer questions asked to four AI systems twice each, up to 3 competitors tracked in the same questions, website change tracking, and improvement tasks with independent verification. Your first monitoring audit is queued when your subscription starts. Cancel any time; access continues to the end of your paid month."
        : "Monitoring is launching soon. It will add a reviewed re-audit every month, tracked customer questions across four AI systems, competitor presence in the same questions, website change tracking, and verified improvement tasks.",
    },
    {
      q: "Is this just an SEO score?",
      a: "No. GeoViz isn’t a keyword ranking report. It measures whether AI systems can read your business, understand what you do, verify who you are, and find enough evidence to recommend you.",
    },
    {
      q: "Can you fix the issues for me?",
      a: "Yes, optionally. The audit shows what to fix first. The Foundation Fix is a scoped engagement where we address those issues and re-check the result. Complex sites are quoted upfront.",
    },
    {
      q: "How long does an audit take?",
      a: "The analysis runs in minutes. Every report is then reviewed by a person before it’s sent — most audits are delivered by email the same business day.",
    },
    {
      q: "Do you guarantee I’ll be recommended?",
      a: "No. Nobody can guarantee what an AI system will say. GeoViz measures how clearly AI can understand and trust your business, shows the evidence, and tracks change over time.",
    },
  ];
}

export default async function Page() {
  const monitoring = await getMonitoringOffer();
  const monitoringOpen = monitoring.state === "open";

  return (
    <main>
      <Header />
      <RevealOnView />
      <MotionRoot>
        <HomeHero />
        <HomeLoopStrip />
        <HomeAuditSection />
        <HomeMonitorSection open={monitoringOpen} />
        <HomeCompareSection />
        <HomeImproveSection fix={FOUNDATION_FIX} />
        <HomeProveSection />
        <HomePricing monitoring={monitoring} />
        <HomeCustomerBlock monitoringOpen={monitoringOpen} />
        <HomeLimits />
        <section id="faq" className="scroll-mt-24 border-b border-white/[0.06] bg-ink-950">
          <div className="container-page grid gap-10 py-16 sm:py-24 lg:grid-cols-[0.7fr,1.3fr]" data-reveal>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">FAQ</p>
              <h2 className="mt-5 font-display text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-[2.6rem]">
                Straight answers.
              </h2>
            </div>
            <FaqAccordion items={faqs(monitoringOpen)} />
          </div>
        </section>
        <HomeFinalCta />
      </MotionRoot>
      <Footer />
    </main>
  );
}
