import Link from "next/link";

import { HomeSection } from "@/components/HomeSection";
import { ProviderMark } from "@/components/report/BrandMarks";

const CATEGORIES = [
  "Structured data",
  "AI crawler access",
  "Local trust signals",
  "Content depth & FAQ",
  "Brand & entity clarity",
  "Technical accessibility",
];

const PROVIDERS = [
  { key: "claude", label: "Anthropic Claude" },
  { key: "openai", label: "OpenAI GPT" },
  { key: "gemini", label: "Google Gemini" },
  { key: "perplexity", label: "Perplexity" },
];

const BRIEF = [
  "Your AI Visibility Score (0–100) and what it means",
  "What each of the four AI systems understood about your business",
  "The issues holding you back, in plain English",
  "What to fix first — prioritized",
  "A printable PDF brief, delivered by email",
];

/** §01 Audit — what the $97 audit actually measures and delivers. */
export function HomeAuditSection() {
  return (
    <HomeSection
      id="how-it-works"
      index="01"
      eyebrow="Audit"
      tone="light"
      title="One reviewed audit. Four AI systems. A brief you can act on."
      lede={
        <p>
          We score six areas of AI readability, then ask Claude, OpenAI, Gemini, and Perplexity — through their APIs —
          how they read your business. A person reviews every report before it’s sent.
        </p>
      }
    >
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-graphite-400/25 bg-white/60 p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-graphite-500">Six scored areas</p>
          <ul className="mt-4 space-y-2.5">
            {CATEGORIES.map((c) => (
              <li key={c} className="flex items-center gap-3 text-[15px] text-graphite-900">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[13px] leading-relaxed text-graphite-500">
            The score comes from deterministic website evidence — the same site produces the same score.
          </p>
        </div>

        <div className="rounded-lg border border-graphite-400/25 bg-white/60 p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-graphite-500">Asked through their APIs</p>
          <ul className="mt-4 grid grid-cols-2 gap-3">
            {PROVIDERS.map((p) => (
              <li key={p.key} className="flex items-center gap-2 rounded-md border border-graphite-400/25 bg-cream-50 px-3 py-2.5 text-[14px] text-graphite-900">
                <ProviderMark provider={p.key} size={16} />
                {p.label}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[13px] leading-relaxed text-graphite-500">
            API answers can differ from the consumer ChatGPT, Claude, Gemini, and Perplexity apps. The AI systems explain
            and cross-check — they never change your score.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-graphite-500">
            Your report also includes a <span className="text-graphite-900">Google AI Overviews readiness</span> estimate —
            derived from your website’s signals, not a test of Google’s results.
          </p>
        </div>

        <div className="rounded-lg border border-graphite-400/25 bg-white/60 p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-graphite-500">What you receive</p>
          <ul className="mt-4 space-y-3">
            {BRIEF.map((b) => (
              <li key={b} className="flex gap-3 text-[15px] leading-snug text-graphite-900">
                <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden>
                  <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {b}
              </li>
            ))}
          </ul>
          <Link href="/sample-report" className="mt-6 inline-flex text-[14px] font-medium text-graphite-900 underline decoration-accent/60 underline-offset-4 hover:decoration-accent">
            See a sample report →
          </Link>
          <p className="mt-1 text-[12px] text-graphite-500">Sample shown from an earlier scoring version.</p>
        </div>
      </div>
    </HomeSection>
  );
}
