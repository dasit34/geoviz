import { LoopProgress, type LoopStep } from "@/components/LoopProgress";

export const LOOP_STEPS: LoopStep[] = [
  { key: "audit", label: "Audit", line: "Find out how AI reads your business today.", href: "#how-it-works" },
  { key: "monitor", label: "Monitor", line: "Re-check the same customer questions every month.", href: "#monitor" },
  { key: "compare", label: "Compare", line: "See what changed — against yourself and your competitors.", href: "#compare" },
  { key: "improve", label: "Improve", line: "Fix what matters first, with drafts you approve.", href: "#improve" },
  { key: "prove", label: "Prove", line: "Verify each change independently, then measure again.", href: "#prove" },
];

/** The product loop with a scroll-linked progress rail. */
export function HomeLoopStrip() {
  return (
    <section className="border-b border-white/[0.06] bg-ink-900/40">
      <div className="container-page grid gap-12 py-16 sm:py-24 lg:grid-cols-[0.9fr,1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-32 lg:self-start" data-reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">How GeoViz works</p>
          <h2 className="mt-5 font-display text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-[2.6rem]">
            One audit tells you where you stand. The loop shows you what changes.
          </h2>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/65">
            Start with a single reviewed audit. Add monthly monitoring when you want to track progress, improve with
            evidence, and prove what worked.
          </p>
        </div>
        <LoopProgress steps={LOOP_STEPS} />
      </div>
    </section>
  );
}
