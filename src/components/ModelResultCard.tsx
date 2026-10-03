import { ProviderMark } from "@/components/report/BrandMarks";
import type { ExampleModelResult } from "@/lib/home/example-data";

const VERDICT_TONE: Record<ExampleModelResult["verdict"], string> = {
  Clear: "text-severity-info border-severity-info/30 bg-severity-info/10",
  Partial: "text-severity-warning border-severity-warning/30 bg-severity-warning/10",
  Unclear: "text-severity-critical border-severity-critical/30 bg-severity-critical/10",
};

/** One AI system's read of a business (queried through its API). */
export function ModelResultCard({ result, className = "" }: { result: ExampleModelResult; className?: string }) {
  return (
    <div className={`rounded-md border border-white/10 bg-ink-900/70 p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] text-white/90">
          <ProviderMark provider={result.provider} size={16} />
          {result.label}
        </span>
        <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${VERDICT_TONE[result.verdict]}`}>
          {result.verdict}
        </span>
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-white/60">{result.note}</p>
    </div>
  );
}
