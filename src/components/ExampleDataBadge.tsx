/**
 * Persistent label for any homepage demonstration built from
 * src/lib/home/example-data.ts. Never omit it — example values must not be
 * mistaken for a real customer result.
 */
export function ExampleDataBadge({ className = "", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const toneClass =
    tone === "light"
      ? "border-graphite-400/40 bg-cream-100 text-graphite-700"
      : "border-white/15 bg-ink-900/80 text-white/70";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${toneClass} ${className}`}
      title="Illustrative values for a fictional business — not a real customer result."
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
      Example data
    </span>
  );
}
