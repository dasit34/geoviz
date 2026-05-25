/**
 * HowItWorksPipeline — 3-step intelligence pipeline.
 *
 * Desktop (lg+): hairline horizontal rail with 3 nodes (Intake /
 * Analyze / Deliver) and step cards aligned beneath each node.
 * Mobile: vertical stacked steps with a left-side node marker.
 *
 * Pure server component. All animation handled by CSS classes
 * in globals.css (.pipeline-rail / .pipeline-node).
 */

type Step = { n: string; t: string; sub?: string; body: string };

const STAGE_LABELS = ["01 SUBMIT", "02 ANALYZE", "03 SCORE", "04 FIX"];
const NODE_POSITIONS = ["12%", "38%", "62%", "88%"];

export function HowItWorksPipeline({ steps }: { steps: Step[] }) {
  return (
    <div>
      {/* Desktop horizontal rail with 3 labelled nodes */}
      <div className="pipeline-rail" aria-hidden>
        {NODE_POSITIONS.map((pos, i) => (
          <div key={pos} className="pipeline-node" style={{ left: pos }}>
            <span className="pipeline-node-label">{STAGE_LABELS[i]}</span>
          </div>
        ))}
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 1,
          background: "var(--rule-soft)",
          border: "1px solid var(--rule-soft)",
        }}
      >
        {steps.map((s, i) => (
          <div
            key={s.n}
            style={{
              padding: "40px 28px 36px",
              minHeight: 240,
              background: "oklch(0.085 0.014 245 / 0.50)",
              border: "1px solid var(--rule-soft)",
              position: "relative",
            }}
          >
            <div
              className="lg:hidden"
              aria-hidden
              style={{
                position: "absolute",
                left: 16,
                top: 28,
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--d-accent)",
                boxShadow: "0 0 0 3px oklch(0.10 0.018 248), 0 0 8px var(--d-accent)",
              }}
            />
            <div
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: "10.5px",
                letterSpacing: "0.22em",
                color: "var(--d-accent-warm)",
                opacity: 0.85,
                textTransform: "uppercase",
                marginBottom: 14,
                paddingLeft: undefined,
              }}
            >
              {STAGE_LABELS[i]}
            </div>
            <h3
              style={{
                fontFamily: "var(--font-instrument), serif",
                fontSize: 26,
                lineHeight: 1.08,
                letterSpacing: "-0.01em",
                margin: "4px 0 12px",
                color: "var(--ink)",
              }}
            >
              {s.t}
            </h3>
            <p
              style={{
                fontFamily: "var(--font-geist), system-ui, sans-serif",
                fontSize: "14.5px",
                lineHeight: 1.55,
                color: "var(--ink-dim)",
                maxWidth: "36ch",
              }}
            >
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
