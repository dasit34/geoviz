"use client";

import { m, useReducedMotion } from "framer-motion";

import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { EXAMPLE_BUSINESS, EXAMPLE_TASKS } from "@/lib/home/example-data";

const EASE = [0.22, 1, 0.36, 1] as const;
const VIEW = { once: true, amount: 0.45 } as const;

const ADDED = [
  `"@type": "RoofingContractor",`,
  `"name": "${EXAMPLE_BUSINESS.name}",`,
  `"address": { …confirmed by you },`,
  `"areaServed": "${EXAMPLE_BUSINESS.location}"`,
];

function PageSkeleton() {
  return (
    <div aria-hidden className="space-y-1.5">
      <span className="block h-1.5 w-2/3 rounded-full bg-white/10" />
      <span className="block h-1.5 w-5/6 rounded-full bg-white/[0.07]" />
      <span className="block h-1.5 w-1/2 rounded-full bg-white/[0.07]" />
    </div>
  );
}

/**
 * Before/after page snapshots for one improvement task: the scanner re-reads
 * the page after "Implemented" and compares it with the earlier snapshot.
 * EXAMPLE DATA. Under reduced motion the scan line is skipped and the result
 * is shown immediately.
 */
export function ProveSnapshot() {
  const reduce = useReducedMotion() ?? false;
  const task = EXAMPLE_TASKS[0];
  return (
    <figure className="mt-12 rounded-lg border border-white/10 bg-ink-900/60 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <figcaption className="max-w-xl">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/55">Improvement task</span>
          <span className="mt-1 block text-[15px] leading-snug text-white/85">{task.title}</span>
        </figcaption>
        <ExampleDataBadge />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-white/10 bg-ink-950/70 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">Before · last scan before the change</p>
          <div className="mt-3">
            <PageSkeleton />
          </div>
          <p className="mt-4 rounded border border-severity-critical/30 bg-severity-critical/[0.06] px-3 py-2 font-mono text-[12px] text-severity-critical">
            No LocalBusiness structured data found
          </p>
        </div>

        <div className="relative overflow-hidden rounded-md border border-white/10 bg-ink-950/70 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">After · re-checked when marked Implemented</p>
          <div className="mt-3">
            <PageSkeleton />
          </div>
          <pre className="mt-4 overflow-x-auto whitespace-pre font-mono text-[11.5px] leading-relaxed text-white/55">
            <span className="block">{`<script type="application/ld+json">`}</span>
            {ADDED.map((l) => (
              <span key={l} className="block border-l-2 border-severity-info/70 bg-severity-info/[0.07] pl-2 text-white/85">
                <span aria-hidden className="mr-1 text-severity-info">+</span>
                {l}
              </span>
            ))}
            <span className="block">{`</script>`}</span>
          </pre>
          {reduce ? null : (
            <m.span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-cyan/70 shadow-[0_0_12px_2px_rgba(103,232,249,0.35)]"
              initial={{ top: "0%", opacity: 0 }}
              whileInView={{ top: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
              viewport={VIEW}
              transition={{ duration: 1.4, ease: "easeInOut" }}
            />
          )}
        </div>
      </div>

      <m.div
        className="mt-4 flex flex-wrap items-center gap-3"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={VIEW}
        transition={{ delay: reduce ? 0 : 1.35, duration: 0.45, ease: EASE }}
      >
        <span className="inline-flex items-center gap-1.5 rounded border border-severity-info/40 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-severity-info">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
            <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Verified · newly observed
        </span>
        <span className="text-[13px] text-white/60">Present on the page now, absent from the earlier snapshot.</span>
      </m.div>
    </figure>
  );
}
