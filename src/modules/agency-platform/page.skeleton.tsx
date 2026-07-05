/**
 * Agency Platform — static presentational skeleton. SCAFFOLD ONLY.
 *
 * No data fetching, no real logic. Rendered only behind
 * GEO_MODULE_AGENCY_PLATFORM_ENABLED via
 * src/app/(future)/agency-platform/page.tsx.
 */

function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="card">
      <p className="section-eyebrow">{title}</p>
      <p className="muted">{note}</p>
    </div>
  );
}

export function AgencyPlatformPageSkeleton() {
  return (
    <div className="container-page space-y-6">
      <h1 className="h2">Agency Platform</h1>
      <p className="muted">
        Scaffold placeholder — not a real product surface yet.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard
          title="Portfolio Summary"
          note="Aggregated view across every linked client will render here."
        />
        <PlaceholderCard
          title="Client List"
          note="Bulk-managed client list with per-client status will render here."
        />
        <PlaceholderCard
          title="Bulk Audit"
          note="Bulk audit submission across the agency's book will render here."
        />
        <PlaceholderCard
          title="White-Label Settings"
          note="Brand name / logo configuration for client-facing reports will render here."
        />
      </div>
    </div>
  );
}
