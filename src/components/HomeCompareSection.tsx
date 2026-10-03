import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { HomeSection } from "@/components/HomeSection";
import { EXAMPLE_COMPETITOR_PRESENCE, EXAMPLE_SCORE_HISTORY } from "@/lib/home/example-data";

/** §03 Compare — score history (reviewed audits) + competitor presence. */
export function HomeCompareSection() {
  const maxScore = 100;
  return (
    <HomeSection
      id="compare"
      index="03"
      eyebrow="Compare"
      tone="light"
      title="See change, not noise."
      lede={
        <p>
          Your score history comes only from reviewed audits. Competitor tracking shows how often up to three
          competitors appear in answers to the same tracked questions — compared only when the questions and AI setup
          match. When they don’t, we say so instead of showing a misleading change.
        </p>
      }
    >
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <figure className="rounded-lg border border-graphite-400/25 bg-white/60 p-6">
          <div className="flex items-center justify-between gap-2">
            <figcaption className="font-mono text-[11px] uppercase tracking-[0.16em] text-graphite-500">Score history · reviewed audits</figcaption>
            <ExampleDataBadge tone="light" />
          </div>
          <ol className="mt-6 flex h-44 items-end gap-5" aria-label="Example score history">
            {EXAMPLE_SCORE_HISTORY.map((h) => (
              <li key={h.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-sm tabular-nums text-graphite-900">{h.score}</span>
                <span
                  className="w-full max-w-[64px] rounded-t-md bg-gradient-to-t from-accent to-accent-glow"
                  style={{ height: `${(h.score / maxScore) * 140}px` }}
                  aria-hidden
                />
                <span className="text-center text-[12px] text-graphite-500">{h.label}</span>
              </li>
            ))}
          </ol>
        </figure>

        <figure className="rounded-lg border border-graphite-400/25 bg-white/60 p-6">
          <div className="flex items-center justify-between gap-2">
            <figcaption className="font-mono text-[11px] uppercase tracking-[0.16em] text-graphite-500">Presence in the same questions</figcaption>
            <ExampleDataBadge tone="light" />
          </div>
          <ul className="mt-6 space-y-4" aria-label="Example competitor presence">
            {EXAMPLE_COMPETITOR_PRESENCE.map((c) => (
              <li key={c.name}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className={c.isCustomer ? "font-semibold text-graphite-900" : "text-graphite-700"}>{c.name}</span>
                  <span className="font-mono tabular-nums text-graphite-700">
                    {c.mentioned} of {c.measured}
                  </span>
                </div>
                <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-graphite-400/15">
                  <span
                    className={`block h-full rounded-full ${c.isCustomer ? "bg-accent" : "bg-graphite-500/60"}`}
                    style={{ width: `${(c.mentioned / c.measured) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[12.5px] leading-relaxed text-graphite-500">
            Counts are answers that named the business, out of answers measured for the same tracked questions.
          </p>
        </figure>
      </div>
    </HomeSection>
  );
}
