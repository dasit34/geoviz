/**
 * Competitor Intelligence — static presentational skeleton. SCAFFOLD ONLY.
 *
 * No data fetching, no real logic. Rendered only behind
 * GEO_MODULE_COMPETITOR_INTELLIGENCE_ENABLED via
 * src/app/(future)/competitor-intelligence/page.tsx.
 */

function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="card">
      <p className="section-eyebrow">{title}</p>
      <p className="muted">{note}</p>
    </div>
  );
}

export function CompetitorIntelligencePageSkeleton() {
  return (
    <div className="container-page space-y-6">
      <h1 className="h2">Competitor Intelligence</h1>
      <p className="muted">
        Scaffold placeholder — not a real product surface yet.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard
          title="Share of Citation"
          note="Category share-of-citation across the defined competitor set will render here."
        />
        <PlaceholderCard
          title="Competitor Comparison"
          note="Per-category deltas with human-readable reasons will render here."
        />
        <PlaceholderCard
          title="Cross-Platform Divergence"
          note="Visible on one AI platform, invisible on another — diagnostic view will render here."
        />
      </div>
    </div>
  );
}
