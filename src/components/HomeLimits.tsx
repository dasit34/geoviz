const DOES = [
  "Measures how clearly AI systems can read, trust, and describe your business",
  "Shows the evidence behind every score and finding",
  "Asks four AI systems through their APIs and reports what they said",
  "Has a person review every audit before it’s delivered",
];

const DOES_NOT = [
  "Guarantee rankings, citations, or AI recommendations",
  "Show what the consumer ChatGPT, Claude, Gemini, or Perplexity apps will say",
  "Test Google AI Overviews directly — readiness is an estimate from your website",
  "Change your website without you",
];

/** Honest limits — required disclosures, stated plainly. */
export function HomeLimits() {
  return (
    <section className="border-b border-white/[0.06] bg-ink-900/40">
      <div className="container-page grid gap-10 py-16 sm:py-20 lg:grid-cols-2" data-reveal>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">What GeoViz does</p>
          <ul className="mt-5 space-y-3">
            {DOES.map((d) => (
              <li key={d} className="flex gap-3 text-[15px] leading-snug text-white/80">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-severity-info" />
                {d}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">What GeoViz doesn’t claim</p>
          <ul className="mt-5 space-y-3">
            {DOES_NOT.map((d) => (
              <li key={d} className="flex gap-3 text-[15px] leading-snug text-white/65">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
                {d}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[13px] leading-relaxed text-white/55">
            Scores are directional measurements of AI readability and trust signals. AI answers vary from run to run, which
            is why monitoring asks each question more than once.
          </p>
        </div>
      </div>
    </section>
  );
}
