/**
 * Benchmark Engine — static presentational skeleton. SCAFFOLD ONLY.
 *
 * No data fetching, no real logic. Rendered only behind
 * GEO_MODULE_BENCHMARK_ENGINE_ENABLED via
 * src/app/(future)/benchmark-engine/page.tsx.
 */

function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="card">
      <p className="section-eyebrow">{title}</p>
      <p className="muted">{note}</p>
    </div>
  );
}

export function BenchmarkEnginePageSkeleton() {
  return (
    <div className="container-page space-y-6">
      <h1 className="h2">Benchmark Engine</h1>
      <p className="muted">
        Scaffold placeholder — not a real product surface yet. See
        docs/benchmarking/BENCHMARK_ENGINE_SPEC.md.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard
          title="Benchmark Summary"
          note="Published industry/geo benchmark summary will render here."
        />
        <PlaceholderCard
          title="Industry Average"
          note="Category-level average AI Visibility score will render here."
        />
        <PlaceholderCard
          title="Geo Average"
          note="City/state/national average AI Visibility score will render here."
        />
        <PlaceholderCard
          title="Top Performers"
          note="Aggregate, anonymized top-performer list will render here."
        />
        <PlaceholderCard
          title="Bottom Performers"
          note="Aggregate, anonymized bottom-performer list will render here."
        />
      </div>
    </div>
  );
}
