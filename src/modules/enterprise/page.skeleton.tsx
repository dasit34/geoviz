/**
 * Enterprise — static presentational skeleton. SCAFFOLD ONLY.
 *
 * No data fetching, no real logic. Rendered only behind
 * GEO_MODULE_ENTERPRISE_ENABLED via
 * src/app/(future)/enterprise/page.tsx.
 */

function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="card">
      <p className="section-eyebrow">{title}</p>
      <p className="muted">{note}</p>
    </div>
  );
}

export function EnterprisePageSkeleton() {
  return (
    <div className="container-page space-y-6">
      <h1 className="h2">Enterprise</h1>
      <p className="muted">
        Scaffold placeholder — not a real product surface yet. See
        docs/enterprise/ENTERPRISE_SPEC.md.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard
          title="Portfolio Map"
          note="Multi-location visibility overview will render here."
        />
        <PlaceholderCard
          title="Location Table"
          note="Bulk-onboarded location list with per-location status will render here."
        />
        <PlaceholderCard
          title="RBAC Management"
          note="Account / regional-manager / location-level access grants will render here."
        />
        <PlaceholderCard
          title="Audit Trail"
          note="Traceable score/alert/change provenance for procurement review will render here."
        />
      </div>
    </div>
  );
}
