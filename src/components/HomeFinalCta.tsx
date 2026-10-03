import Link from "next/link";

import { AUDIT_PRICE } from "@/lib/home/offers";

/** Closing call to action. */
export function HomeFinalCta() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10 bg-radial-orange opacity-70" />
      <div className="container-page py-20 text-center sm:py-28" data-reveal>
        <h2 className="mx-auto max-w-3xl font-display text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-[2.6rem]">
          Find out whether AI can recommend you — before your customers ask.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-white/65">
          One reviewed audit shows where you stand. Everything else is optional.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/order" className="btn-primary w-full whitespace-nowrap text-base sm:w-auto">
            Run your AI Visibility Audit — {AUDIT_PRICE} <span aria-hidden>→</span>
          </Link>
          <Link href="/check" className="btn-ghost w-full whitespace-nowrap text-base sm:w-auto">
            Start with the free check
          </Link>
        </div>
      </div>
    </section>
  );
}
