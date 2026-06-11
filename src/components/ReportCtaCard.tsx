/**
 * Sales-focused CTA card that REPLACES the markdown rendering of the
 * "Done-For-You Fix" section. The styled component lives in the same
 * print page that customers view and that puppeteer renders to PDF,
 * so the offer reads identically in both surfaces.
 *
 * Uses light-theme colors with a heavy orange accent so it prints
 * cleanly on a white A4 page without looking like raw markdown.
 *
 * The CTA button used to mailto: a support address, which lost most
 * customers between the click and an actual composed email. It now
 * routes to the in-app /foundation-fix form which captures structured
 * data + emails the operator via Resend.
 */
export function ReportCtaCard({
  orderId,
  businessLabel,
}: {
  orderId: string;
  businessLabel: string;
}) {
  const params = new URLSearchParams({ orderId });
  if (businessLabel && businessLabel.length > 0) {
    params.set("businessName", businessLabel);
  }
  const href = `/foundation-fix?${params.toString()}`;

  return (
    <section className="cta-card" aria-label="AI Visibility Foundation Fix offer">
      <div className="cta-card-body">
        <div className="cta-card-eyebrow">AI Visibility Foundation Fix</div>
        <h2 className="cta-card-headline">
          Fix the foundation AI systems use to recommend you
        </h2>
        <p className="cta-card-lede">
          GeoViz can implement the fixes identified in this audit — a scoped
          engagement that closes the technical, trust, and discoverability gaps
          surfaced above, so AI systems can identify, verify, and reference your
          business with confidence.
        </p>

        <p className="cta-card-includes-label">What&rsquo;s included</p>
        <ul className="cta-card-includes">
          <li>Structured data installation</li>
          <li>Business identity cleanup</li>
          <li>NAP consistency cleanup</li>
          <li>Homepage &amp; service content guidance</li>
          <li>Citation &amp; readiness improvements</li>
          <li>Follow-up verification audit</li>
        </ul>

        <div className="cta-card-badges">
          <span className="cta-card-badge cta-card-badge-price">Starting at $497</span>
          <span className="cta-card-badge cta-card-badge-meta">3–5 business days</span>
        </div>

        <a className="cta-card-button" href={href}>
          Request My AI Visibility Foundation Fix
        </a>
        <p className="cta-card-fineprint">
          We&rsquo;ll send a scoped setup plan within one business day. Complex
          websites may require custom scoping.
        </p>
      </div>
    </section>
  );
}
