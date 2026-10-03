import type { ReactNode } from "react";

/**
 * Shared section shell for the homepage: consistent rhythm, an indexed
 * eyebrow, and the dark-ink / cream editorial tones. Reveal-on-view uses
 * the existing CSS [data-reveal] system (no JS animation cost).
 */
export function HomeSection({
  id,
  index,
  eyebrow,
  title,
  lede,
  tone = "dark",
  children,
  className = "",
}: {
  id?: string;
  index?: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  tone?: "dark" | "light";
  children?: ReactNode;
  className?: string;
}) {
  const light = tone === "light";
  return (
    <section
      id={id}
      className={`scroll-mt-24 border-b ${light ? "border-graphite-400/20 bg-cream-50 text-graphite-900" : "border-white/[0.06] bg-ink-950"} ${className}`}
    >
      <div className="container-page py-16 sm:py-24" data-reveal>
        <p className={`flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] ${light ? "text-graphite-500" : "text-white/50"}`}>
          {index ? <span className={light ? "font-semibold text-graphite-900" : "text-accent"}>{index}</span> : null}
          <span aria-hidden className={`h-px w-6 ${light ? "bg-graphite-400/40" : "bg-white/20"}`} />
          {eyebrow}
        </p>
        <h2
          className={`mt-5 max-w-3xl font-display text-3xl font-semibold leading-[1.1] tracking-tight sm:text-[2.6rem] ${light ? "text-graphite-900" : "text-white"}`}
        >
          {title}
        </h2>
        {lede ? (
          <div className={`mt-5 max-w-2xl text-[17px] leading-relaxed ${light ? "text-graphite-700" : "text-white/70"}`}>{lede}</div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
