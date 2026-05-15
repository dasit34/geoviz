"use client";

/**
 * Sales-focused CTA card that REPLACES the markdown rendering of the
 * "Done-For-You Fix" section. The styled component lives in the same
 * print page that customers view and that puppeteer renders to PDF,
 * so the offer reads identically in both surfaces.
 *
 * Uses light-theme colors with a heavy orange accent so it prints
 * cleanly on a white A4 page without looking like raw markdown.
 */
export function ReportCtaCard({
  orderId,
  businessLabel,
}: {
  orderId: string;
  businessLabel: string;
}) {
  // Resolve at render-time, not module-load. Top-level `process.env`
  // access in a module that gets bundled into the client chunk has
  // been observed to break the webpack module factory after big
  // server/client refactors (Next 14, App Router). Moving the lookup
  // inside the function body keeps the module body side-effect-free.
  const fixRequestEmail =
    process.env.FIX_REQUEST_EMAIL ?? "fix@geoviz.app";
  const subject = `Fix request — ${businessLabel} (${orderId.slice(-6)})`;
  const mailto = `mailto:${fixRequestEmail}?subject=${encodeURIComponent(subject)}`;

  return (
    <section className="cta-card" aria-label="AI Visibility Profile Setup offer">
      <div className="cta-card-accent" />
      <div className="cta-card-body">
        <div className="cta-card-eyebrow">AI Visibility Profile Setup</div>
        <h2 className="cta-card-headline">
          Set up your AI Visibility Profile
        </h2>
        <p className="cta-card-lede">
          Turn this audit into an AI-readable business profile. We
          create and help install the machine-readable identity layer
          — schema, llms.txt, entity signals, AI-readable summary —
          so AI systems can better understand, crawl, and interpret
          your business.
        </p>

        <div className="cta-card-badges">
          <span className="cta-card-badge cta-card-badge-price">
            $497 one-time
          </span>
          <span className="cta-card-badge cta-card-badge-meta">
            3–5 business days
          </span>
        </div>

        <a className="cta-card-button" href={mailto}>
          Request My AI Visibility Profile Setup →
        </a>
        <p className="cta-card-fineprint">
          Or reply to your delivery email — we&rsquo;ll send a scoped
          setup plan within one business day. Complex websites may
          require custom scoping.
        </p>
      </div>
    </section>
  );
}

// `Check` icon was used by the bullet list that previously
// duplicated the report's section-2/3 content. The new sharper
// CTA copy drops the bullet list — Check is unreferenced.
function _UnusedCheck() {
  return (
    <svg
      className="cta-card-check"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="9" cy="9" r="9" fill="#ff7a18" />
      <path
        d="M5 9.4 L7.8 12 L13 6.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
