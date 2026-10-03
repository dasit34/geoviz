import Link from "next/link";
import type { ReactNode } from "react";

import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { HomeSection } from "@/components/HomeSection";
import { EXAMPLE_TASKS, type ExampleTask } from "@/lib/home/example-data";

const STATUS_TONE: Record<ExampleTask["status"], string> = {
  Suggested: "text-white/55 border-white/15",
  Approved: "text-white/75 border-white/25",
  "In progress": "text-accent-glow border-accent/40",
  Implemented: "text-severity-warning border-severity-warning/40",
  Verified: "text-severity-info border-severity-info/40",
};

/**
 * §04 Improve — supervised improvement tasks + the optional Foundation Fix.
 * The Fix copy is passed in from src/app/page.tsx (copy-contract test).
 */
export function HomeImproveSection({ fix }: { fix: { eyebrow: string; title: string; body: ReactNode; terms: ReactNode; scoping: ReactNode } }) {
  return (
    <HomeSection
      id="improve"
      index="04"
      eyebrow="Improve"
      title="Fix what matters first."
      lede={
        <p>
          Every finding becomes a task: the problem, the evidence, a proposed fix, and a draft built only from facts you
          confirm. GeoViz never edits or publishes anything on your website — you stay in control.
        </p>
      }
    >
      <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-lg border border-white/10 bg-ink-900/70 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">Improvement tasks</p>
            <ExampleDataBadge />
          </div>
          <ul className="mt-5 divide-y divide-white/[0.06]">
            {EXAMPLE_TASKS.map((t) => (
              <li key={t.title} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span className="text-[14.5px] leading-snug text-white/85">{t.title}</span>
                <span className={`w-fit shrink-0 rounded border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider ${STATUS_TONE[t.status]}`}>
                  {t.status}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12.5px] leading-relaxed text-white/55">
            Suggested → Approved → In progress → Implemented → Verified. “Implemented” is your claim; “Verified” only comes
            from an independent check.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-accent/30 bg-gradient-to-b from-accent/[0.08] to-transparent p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">{fix.eyebrow}</p>
          <h3 className="mt-3 font-display text-2xl font-semibold leading-tight text-white">{fix.title}</h3>
          <div className="mt-3 text-[15px] leading-relaxed text-white/70">{fix.body}</div>
          <div className="mt-5 font-mono text-[13px] text-white/80">{fix.terms}</div>
          <div className="mt-2 text-[13px] leading-relaxed text-white/50">{fix.scoping}</div>
          <Link href="/foundation-fix" className="btn-ghost mt-6 text-sm">
            Learn about the Foundation Fix <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </HomeSection>
  );
}
