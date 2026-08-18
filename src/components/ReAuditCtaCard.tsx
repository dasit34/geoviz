/**
 * Bottom-of-report upsell into the $59 Re-Audit purchase flow. Visually
 * mirrors `ReportCtaCard.tsx` (the Foundation Fix offer) — same
 * `cta-card` styling so both offers read as one product family in both
 * the screen view and the Puppeteer-rendered PDF, which share this
 * component tree. Routes to the static `/re-audit?orderId=...`
 * confirmation page (not a client fetch) — same link-not-fetch pattern
 * ReportCtaCard uses for /foundation-fix.
 */
export function ReAuditCtaCard({ orderId }: { orderId: string }) {
  const href = `/re-audit?orderId=${encodeURIComponent(orderId)}`;

  return (
    <section className="cta-card" aria-label="GeoViz Re-Audit offer">
      <div className="cta-card-body">
        <div className="cta-card-eyebrow">Re-Audit</div>
        <h2 className="cta-card-headline">
          Made changes since your audit?
        </h2>
        <p className="cta-card-lede">
          See whether your AI visibility has improved. Run a full current
          GeoViz audit and get a side-by-side comparison against this one —
          same scoring, same categories, showing exactly what changed.
        </p>

        <div className="cta-card-badges">
          <span className="cta-card-badge cta-card-badge-price">$59</span>
          <span className="cta-card-badge cta-card-badge-meta">Full audit + comparison</span>
        </div>

        <a className="cta-card-button" href={href}>
          Run a Re-Audit — $59
        </a>
      </div>
    </section>
  );
}
