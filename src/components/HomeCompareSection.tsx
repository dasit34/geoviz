import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { HomeSection } from "@/components/HomeSection";
import { PresenceBars, ScoreHistoryChart } from "@/components/CompareCharts";

/** §03 Compare — score history (reviewed audits) + competitor presence. */
export function HomeCompareSection() {
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
          <ScoreHistoryChart />
        </figure>

        <figure className="rounded-lg border border-graphite-400/25 bg-white/60 p-6">
          <div className="flex items-center justify-between gap-2">
            <figcaption className="font-mono text-[11px] uppercase tracking-[0.16em] text-graphite-500">Presence in the same questions</figcaption>
            <ExampleDataBadge tone="light" />
          </div>
          <PresenceBars />
          <p className="mt-5 text-[12.5px] leading-relaxed text-graphite-500">
            Counts are answers that named the business, out of answers measured for the same tracked questions.
          </p>
        </figure>
      </div>
    </HomeSection>
  );
}
