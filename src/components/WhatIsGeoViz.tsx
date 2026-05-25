/**
 * WhatIsGeoViz — definition section between Hero and Why.
 *
 * Editorial block + 4-glyph definition strip
 * (Interpret / Trust / Retrieve / Recommend).
 *
 * Inline SVG glyphs, no external icon library.
 * Pure server component, no client JS.
 */

type Def = {
  k: string;
  body: string;
  icon: (className?: string) => React.ReactNode;
};

const InterpretIcon = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
    <circle cx="17" cy="17" r="11" stroke="currentColor" strokeWidth="1" opacity="0.55" />
    <path d="M9 17 L25 17 M17 9 L17 25" stroke="currentColor" strokeWidth="0.85" opacity="0.4" />
    <circle cx="17" cy="17" r="2.4" fill="currentColor" />
  </svg>
);

const TrustIcon = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
    <path
      d="M17 5 L27 9 L27 17 C27 23 22 27 17 29 C12 27 7 23 7 17 L7 9 Z"
      stroke="currentColor"
      strokeWidth="1"
      opacity="0.55"
      fill="none"
    />
    <path d="M12 17 L15.5 20.5 L22 13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RetrieveIcon = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
    <circle cx="14" cy="14" r="7" stroke="currentColor" strokeWidth="1" opacity="0.6" />
    <path d="M19 19 L26 26" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    <path d="M11 14 L17 14 M14 11 L14 17" stroke="currentColor" strokeWidth="0.7" opacity="0.5" />
  </svg>
);

const CiteIcon = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
    <path d="M9 9 L9 6 L25 6 L25 6.5" stroke="currentColor" strokeWidth="0.9" opacity="0.45" strokeLinecap="round" />
    <rect x="9" y="9" width="16" height="20" rx="1" stroke="currentColor" strokeWidth="1" opacity="0.6" fill="none" />
    <path d="M12 15 L22 15 M12 19 L22 19 M12 23 L18 23" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
  </svg>
);

const RecommendIcon = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
    <path d="M5 17 L29 17" stroke="currentColor" strokeWidth="0.85" opacity="0.4" />
    <path d="M22 11 L29 17 L22 23" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="9" cy="17" r="2.2" fill="currentColor" />
  </svg>
);

const DEFS: Def[] = [
  { k: "Interpret", body: "AI reads your business as one coherent entity.",         icon: () => <InterpretIcon /> },
  { k: "Trust",     body: "Your signals are consistent enough to be relied on.",     icon: () => <TrustIcon /> },
  { k: "Retrieve",  body: "AI can fetch your content when it matters.",              icon: () => <RetrieveIcon /> },
  { k: "Cite",      body: "AI references your business when answering customers.",   icon: () => <CiteIcon /> },
  { k: "Recommend", body: "Signal depth supports a confident recommendation.",       icon: () => <RecommendIcon /> },
];

export function WhatIsGeoViz() {
  return (
    <section className="section-plate relative" style={{ padding: "96px 0 112px" }}>
      <div className="container-shell">
        <div className="section-tag">
          <span className="section-tag-text">
            [02] · MAPPED · <span className="section-tag-name">What is GeoViz</span>
          </span>
          <span className="section-tag-rule" aria-hidden />
        </div>

        <h2 data-reveal className="h-section mb-14">
          What GeoViz
          <br />
          <em>measures.</em>
        </h2>

        <div
          data-reveal
          className="grid lg:grid-cols-5"
          style={{
            border: "1px solid var(--rule-soft)",
            borderRadius: 4,
            overflow: "hidden",
            background: "oklch(0.085 0.014 245 / 0.45)",
          }}
        >
          {DEFS.map((d) => (
            <div key={d.k} className="def-cell" style={{ borderTop: 0 }}>
              <div style={{ color: "var(--d-accent)" }}>{d.icon()}</div>
              <h3
                style={{
                  fontFamily: "var(--font-instrument), serif",
                  fontSize: 22,
                  letterSpacing: "-0.01em",
                  color: "var(--ink)",
                  margin: 0,
                }}
              >
                {d.k}
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-geist), system-ui, sans-serif",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: "var(--ink-dim)",
                  margin: 0,
                  maxWidth: "30ch",
                }}
              >
                {d.body}
              </p>
            </div>
          ))}
        </div>

        <p
          className="mx-auto mt-10 text-center"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "10.5px",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
          }}
        >
          Same framework every audit · Same surfaces measured
        </p>
      </div>
    </section>
  );
}
