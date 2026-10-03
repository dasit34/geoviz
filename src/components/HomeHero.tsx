import Link from "next/link";

import { HeroReadout } from "@/components/HeroReadout";
import { HeroSignalField } from "@/components/HeroSignalField";
import { AUDIT_PRICE, AUDIT_REGULAR_PRICE } from "@/lib/home/offers";

/**
 * Hero. The H1 + copy are server-rendered and visible immediately (they
 * are the LCP element); only the readout on the right animates.
 */
export function HomeHero() {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.06]">
      <div aria-hidden className="absolute inset-0 -z-10 bg-radial-orange" />
      <div aria-hidden className="absolute inset-0 -z-10 grid-bg opacity-50" />
      <div className="container-page grid items-center gap-12 pb-16 pt-12 sm:pb-24 sm:pt-16 lg:grid-cols-[1.05fr,1fr] lg:gap-16">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
            Visibility is no longer just ranking. It’s interpretation.
          </p>
          <h1 className="mt-6 font-display font-semibold tracking-tight text-white">
            <span className="block text-[2.1rem] leading-[1.06] sm:text-5xl lg:text-[3.2rem]">
              Search is shifting from links to answers.
            </span>
            <span className="mt-4 block text-xl leading-snug text-white/75 sm:text-2xl lg:text-[1.7rem]">
              See whether AI understands, mentions and can confidently recommend your business.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/70">
            Modern AI systems like ChatGPT, Claude, Gemini, and Perplexity increasingly shape how customers discover
            businesses. GeoViz measures how clearly your business can be understood, trusted, and surfaced inside
            AI-generated answers.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link href="/order" className="btn-primary w-full whitespace-nowrap text-base sm:w-auto">
              Run your AI Visibility Audit — {AUDIT_PRICE}
              <span aria-hidden>→</span>
            </Link>
            <Link href="/check" className="btn-ghost w-full whitespace-nowrap text-base sm:w-auto">
              Start with the free check
            </Link>
          </div>
          <p className="mt-4 text-sm text-white/50">
            <span className="text-white/75">{AUDIT_PRICE} Early Access</span> · normally {AUDIT_REGULAR_PRICE} · every
            report reviewed by a person before it’s sent
          </p>
        </div>
        <div className="relative">
          <HeroSignalField />
          <HeroReadout />
        </div>
      </div>
    </section>
  );
}
