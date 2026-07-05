/**
 * Monitoring — static presentational skeleton. SCAFFOLD ONLY.
 *
 * No data fetching, no real logic, no import of live Prisma/report
 * code. Rendered only behind GEO_MODULE_MONITORING_ENABLED via
 * src/app/(future)/monitoring/page.tsx. See README.md "Component Tree".
 */

function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="card">
      <p className="section-eyebrow">{title}</p>
      <p className="muted">{note}</p>
    </div>
  );
}

export function MonitoringPageSkeleton() {
  return (
    <div className="container-page space-y-6">
      <h1 className="h2">Monitoring</h1>
      <p className="muted">
        Scaffold placeholder — not a real product surface yet. See
        docs/monitoring/MONITORING_SPEC.md.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard
          title="Score Trend"
          note="Weekly/daily score-trend timeline will render here."
        />
        <PlaceholderCard
          title="Evidence Timeline"
          note="Verbatim sampled AI-answer snapshots will render here — the retention-critical surface."
        />
        <PlaceholderCard
          title="Alert Feed"
          note="Active alerts from the alerts module will render here."
        />
        <PlaceholderCard
          title="Competitor Glance"
          note="Summary card from competitor-intelligence will render here once built."
        />
      </div>
    </div>
  );
}
