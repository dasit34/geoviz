/**
 * HeroVisualization — replaces the ScoreGauge in the hero right
 * column.
 *
 * "How AI sees your business" — a layered dossier:
 *
 *   - center: Business Profile card with 7 rows
 *       Name · Location · Services · Hours · Reviews · Schema · Authority
 *     Each row carries a status pip (✓ understood / ⚠ incomplete /
 *     ✕ missing) using the existing severity tokens.
 *
 *   - 4 AI layers surround the card:
 *       INTERPRET · TRUST · RETRIEVE · RECOMMEND
 *     Each layer is a small chip with its own status + one-line
 *     qualifier. Not logos. Not abstract.
 *
 *   - thin hairline connection lines link relevant profile rows
 *     to the layer chips. A subset of lines slowly fade-pulse
 *     (existing 12s pathPulse keyframe), one at a time.
 *
 * No new keyframes. Pure server component. All composition.
 * `prefers-reduced-motion` is already gated in globals.css for
 * the keyframes reused here.
 */

type Status = "ok" | "warn" | "miss";

type ProfileRow = { label: string; value: string; status: Status };
type Layer = {
  k: string;
  desc: string;
  status: Status;
  // Side controls connection line endpoint. left chips connect from
  // the card's left edge; right chips connect from the card's right.
  side: "left" | "right";
  // Vertical position of the chip (top / bottom on its side).
  pos: "top" | "bottom";
};

const PROFILE: ProfileRow[] = [
  { label: "Name",      value: "Resolved",           status: "ok" },
  { label: "Location",  value: "Single address",     status: "ok" },
  { label: "Services",  value: "Listed",             status: "ok" },
  { label: "Hours",     value: "Inconsistent",       status: "warn" },
  { label: "Reviews",   value: "Linked",             status: "ok" },
  { label: "Schema",    value: "Missing",            status: "miss" },
  { label: "Authority", value: "Limited",            status: "warn" },
];

const LAYERS: Layer[] = [
  { k: "INTERPRET", desc: "Reads as one entity",     status: "ok",   side: "left",  pos: "top" },
  { k: "RETRIEVE",  desc: "Some pages unreachable",  status: "warn", side: "left",  pos: "bottom" },
  { k: "TRUST",     desc: "NAP partially aligned",   status: "warn", side: "right", pos: "top" },
  { k: "RECOMMEND", desc: "Signal depth low",        status: "miss", side: "right", pos: "bottom" },
];

function StatusPip({ status }: { status: Status }) {
  // ✓ understood (info / cyan), ⚠ incomplete (warning / amber),
  // ✕ missing (critical / red). Inline SVG. No emoji.
  if (status === "ok") {
    return (
      <span className="hero-viz-pip hero-viz-pip--ok" aria-label="understood">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 5.4 L4.2 7.6 L8 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (status === "warn") {
    return (
      <span className="hero-viz-pip hero-viz-pip--warn" aria-label="incomplete">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M5 2 L5 6 M5 7.6 L5 8.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="hero-viz-pip hero-viz-pip--miss" aria-label="missing">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M3 3 L7 7 M7 3 L3 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function LayerChip({ layer }: { layer: Layer }) {
  return (
    <div className={`hero-viz-chip hero-viz-chip--${layer.side}`} data-status={layer.status}>
      <div className="hero-viz-chip-head">
        <StatusPip status={layer.status} />
        <span className="hero-viz-chip-label">{layer.k}</span>
      </div>
      <div className="hero-viz-chip-desc">{layer.desc}</div>
    </div>
  );
}

function BusinessCard() {
  return (
    <div className="hero-viz-card">
      <div className="hero-viz-card-head">
        <span>Business Profile</span>
        <span className="hero-viz-card-head-sample">Sample</span>
      </div>
      <div className="hero-viz-card-body">
        {PROFILE.map((row) => (
          <div key={row.label} className="hero-viz-row" data-status={row.status}>
            <span className="hero-viz-row-label">{row.label}</span>
            <span className="hero-viz-row-value">{row.value}</span>
            <StatusPip status={row.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// SVG underlay with hairline connection lines from layer chips to
// the business card. Coordinates are tuned to the lg layout where
// the visualization is ~520x540. On mobile the lines are hidden by
// the CSS (display:none on `.hero-viz-lines` at < lg breakpoint).
//
// Two of the five lines pulse slowly via the existing `pathPulse`
// keyframe (12s, staggered). Reduced-motion users see all lines
// at the static base opacity.
function ConnectionLines() {
  return (
    <svg
      className="hero-viz-lines"
      viewBox="0 0 520 540"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Static base layer */}
      <g
        stroke="oklch(0.45 0.020 230 / 0.35)"
        strokeWidth="0.7"
        fill="none"
        strokeLinecap="round"
      >
        {/* INTERPRET (top-left) → card top-left */}
        <path d="M 130 110 C 160 110, 175 150, 200 150" />
        {/* RETRIEVE (bottom-left) → card bottom-left */}
        <path d="M 130 410 C 160 410, 175 380, 200 380" />
        {/* TRUST (top-right) → card top-right */}
        <path d="M 390 110 C 360 110, 345 150, 320 150" />
        {/* RECOMMEND (bottom-right) → card bottom-right */}
        <path d="M 390 410 C 360 410, 345 380, 320 380" />
      </g>

      {/* Pulse layer — only two of the four pulse, staggered.
          Reuses existing pathPulse keyframe (12s) defined in
          globals.css. Already has reduced-motion override. */}
      <g
        stroke="oklch(0.82 0.12 70 / 0.65)"
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
        opacity="0"
      >
        <path
          d="M 130 410 C 160 410, 175 380, 200 380"
          className="hero-path-pulse"
          style={{ animationDelay: "0s" }}
        />
        <path
          d="M 390 410 C 360 410, 345 380, 320 380"
          className="hero-path-pulse"
          style={{ animationDelay: "6s" }}
        />
      </g>
    </svg>
  );
}

export function HeroVisualization() {
  const leftLayers = LAYERS.filter((l) => l.side === "left");
  const rightLayers = LAYERS.filter((l) => l.side === "right");

  return (
    <div className="hero-viz" role="img" aria-label="How AI sees your business — sample diagram">
      <div className="hero-viz-title">HOW AI SEES YOUR BUSINESS</div>

      <div className="hero-viz-frame">
        {/* Corner frame ticks — measurement-instrument feel */}
        <span className="hero-viz-corner hero-viz-corner--tl" aria-hidden />
        <span className="hero-viz-corner hero-viz-corner--tr" aria-hidden />
        <span className="hero-viz-corner hero-viz-corner--bl" aria-hidden />
        <span className="hero-viz-corner hero-viz-corner--br" aria-hidden />

        <ConnectionLines />

        <div className="hero-viz-grid">
          <div className="hero-viz-side">
            {leftLayers.map((l) => (
              <LayerChip key={l.k} layer={l} />
            ))}
          </div>

          <BusinessCard />

          <div className="hero-viz-side">
            {rightLayers.map((l) => (
              <LayerChip key={l.k} layer={l} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
