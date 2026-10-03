import { DashboardPreview } from "@/components/DashboardPreview";
import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { HomeSection } from "@/components/HomeSection";
import { ProviderMark } from "@/components/report/BrandMarks";
import { EXAMPLE_BUSINESS, EXAMPLE_TRACKED_QUESTIONS, type ExampleModelResult } from "@/lib/home/example-data";

const PROVIDERS: { key: ExampleModelResult["provider"]; label: string }[] = [
  { key: "claude", label: "Claude" },
  { key: "openai", label: "OpenAI" },
  { key: "gemini", label: "Gemini" },
  { key: "perplexity", label: "Perplexity" },
];

const INCLUDED = [
  "A reviewed GeoViz re-audit every month, compared with your last one",
  "Up to 10 customer questions, asked to four AI systems, twice each",
  "Up to 3 competitors, tracked in answers to the same questions",
  "Website change tracking for your site and confirmed competitor sites",
  "Recommended actions and improvement tasks with independent verification",
];

function Cell({ mentioned, measured }: { mentioned: number; measured: number }) {
  const tone = mentioned === 0 ? "text-white/55" : mentioned === measured ? "text-severity-info" : "text-severity-warning";
  return (
    <span className={`font-mono text-[13px] tabular-nums ${tone}`}>
      {mentioned}/{measured}
    </span>
  );
}

/** §02 Monitor — monthly tracked questions (example dashboard preview). */
export function HomeMonitorSection({ open }: { open: boolean }) {
  const totals = EXAMPLE_TRACKED_QUESTIONS.reduce(
    (acc, q) => {
      for (const p of PROVIDERS) {
        acc.mentioned += q.results[p.key].mentioned;
        acc.measured += q.results[p.key].measured;
      }
      return acc;
    },
    { mentioned: 0, measured: 0 },
  );
  const possible = EXAMPLE_TRACKED_QUESTIONS.length * PROVIDERS.length * 2;

  return (
    <HomeSection
      id="monitor"
      index="02"
      eyebrow={open ? "Monitor" : "Monitor · launching soon"}
      title="Find out whether AI recommends you this month — not just once."
      lede={
        <>
          <p>
            Each month we ask up to 10 questions your customers ask — the way they’d type them — to four AI systems,
            twice each, because answers vary. You see how often you’re mentioned, out of the answers we actually
            measured.
          </p>
          <p className="mt-3 text-white/55">
            Your first monitoring audit is queued when your subscription starts, then every month after.
          </p>
        </>
      }
    >
      <div className="mt-12 grid gap-10 lg:grid-cols-[1.15fr,0.85fr] lg:items-start">
        <DashboardPreview label="Example monitoring dashboard: tracked questions across four AI systems">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] px-4 py-3 sm:px-5">
            <p className="text-[13px] text-white/80">
              {EXAMPLE_BUSINESS.name} · <span className="text-white/50">Tracked questions</span>
            </p>
            <ExampleDataBadge />
          </div>
          <div className="overflow-x-auto px-4 py-4 sm:px-5">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <caption className="sr-only">Mentions out of measured answers, per question and AI system (example data)</caption>
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.14em] text-white/55">
                  <th scope="col" className="pb-3 pr-4 font-normal">Question</th>
                  {PROVIDERS.map((p) => (
                    <th key={p.key} scope="col" className="pb-3 pr-2 font-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <ProviderMark provider={p.key} size={13} />
                        {p.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EXAMPLE_TRACKED_QUESTIONS.map((q) => (
                  <tr key={q.text} className="border-t border-white/[0.06]">
                    <th scope="row" className="py-3 pr-4 text-[13.5px] font-normal leading-snug text-white/80">{q.text}</th>
                    {PROVIDERS.map((p) => (
                      <td key={p.key} className="py-3 pr-2">
                        <Cell {...q.results[p.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-px border-t border-white/[0.08] bg-white/[0.06] sm:grid-cols-2">
            <div className="bg-ink-900 px-4 py-4 sm:px-5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Mentioned</p>
              <p className="mt-1 font-mono text-2xl tabular-nums text-white">
                {totals.mentioned} <span className="text-base text-white/55">of {totals.measured} measured answers</span>
              </p>
              <p className="mt-1 text-[12px] text-white/55">
                {possible - totals.measured} answer not measured (provider unavailable) — never counted as a miss.
              </p>
            </div>
            <div className="bg-ink-900 px-4 py-4 sm:px-5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Next reviewed re-audit</p>
              <p className="mt-1 font-mono text-2xl text-white">In 12 days</p>
              <p className="mt-1 text-[12px] text-white/55">Compared with your previous reviewed audit.</p>
            </div>
          </div>
        </DashboardPreview>

        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">Included every month</p>
          <ul className="mt-4 space-y-3.5">
            {INCLUDED.map((i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-snug text-white/80">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {i}
              </li>
            ))}
          </ul>
          <p className="mt-6 rounded-md border border-white/10 bg-white/[0.02] p-4 text-[13px] leading-relaxed text-white/55">
            Answers come from each provider’s API, not the consumer ChatGPT, Claude, Gemini, or Perplexity apps, and can
            vary from run to run. Monitoring doesn’t send alerts or change your website.
          </p>
        </div>
      </div>
    </HomeSection>
  );
}
