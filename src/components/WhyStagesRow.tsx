/**
 * WhyStagesRow — the 4-stage retrieval-flow row that replaces
 * the old 3-card Why grid. Story order: Retrieval →
 * Interpretation → Trust → Recommendation.
 *
 * Pure server component. No client JS. Inline-SVG glyphs (no
 * icon library). Cells separated by hairline rules on desktop;
 * stack to 2×2 on tablet; single column on mobile.
 *
 * Honest copy: each stage is an open question (`Can AI find
 * you?`) — never a claim.
 */

type Stage = {
  num: string;
  kicker: string;
  question: string;
  Icon: () => JSX.Element;
};

function MagnifierIcon() {
  // Retrieval — magnifier with arc
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="13" cy="13" r="7" stroke="currentColor" strokeWidth="1.1" />
      <line x1="18.2" y1="18.2" x2="25" y2="25" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M 8 11 A 5 5 0 0 1 13 8" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

function ForkIcon() {
  // Interpretation — branching fork
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M 8 22 L 16 16 L 24 22 M 16 16 L 16 8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="8" r="1.3" fill="currentColor" />
      <circle cx="8" cy="22" r="1.3" fill="currentColor" />
      <circle cx="24" cy="22" r="1.3" fill="currentColor" />
    </svg>
  );
}

function ShieldIcon() {
  // Trust — shield with check
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M 16 5 L 25 9 L 25 17 C 25 22, 21 25, 16 27 C 11 25, 7 22, 7 17 L 7 9 Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M 11 16 L 14.5 19.5 L 21 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowFanIcon() {
  // Recommendation — arrow fanning outward
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M 6 22 L 18 10 M 12 10 L 18 10 L 18 16" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 22 10 L 26 6 M 22 18 L 26 22" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

const STAGES: Stage[] = [
  { num: "01", kicker: "Retrieval", question: "Can AI find you?", Icon: MagnifierIcon },
  { num: "02", kicker: "Interpretation", question: "Can AI understand you?", Icon: ForkIcon },
  { num: "03", kicker: "Trust", question: "Can AI verify you?", Icon: ShieldIcon },
  { num: "04", kicker: "Recommendation", question: "Will AI suggest you?", Icon: ArrowFanIcon },
];

export function WhyStagesRow() {
  return (
    <div
      className="why-stage-row"
      role="list"
      aria-label="AI retrieval stages"
    >
      {STAGES.map((s, i) => (
        <div
          key={s.num}
          role="listitem"
          className="why-stage"
          style={{
            // Hairline divider on the right between cells (desktop)
            borderRight:
              i === STAGES.length - 1 ? "0" : "1px solid var(--rule-soft)",
          }}
        >
          <div className="why-stage-icon" style={{ color: "var(--ink-dim)" }}>
            <s.Icon />
          </div>
          <div
            className="why-stage-num"
            style={{
              fontFamily: "var(--font-instrument), serif",
              fontSize: 56,
              lineHeight: 1,
              letterSpacing: "-0.025em",
              color: "var(--ink)",
              marginTop: 20,
            }}
          >
            {s.num}
          </div>
          <div
            className="why-stage-kicker"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--ink-low)",
              marginTop: 14,
            }}
          >
            {s.kicker}
          </div>
          <div
            className="why-stage-question"
            style={{
              fontFamily: "var(--font-instrument), serif",
              fontStyle: "italic",
              fontSize: 22,
              lineHeight: 1.25,
              letterSpacing: "-0.01em",
              color: "var(--ink-dim)",
              marginTop: 10,
            }}
          >
            {s.question}
          </div>
        </div>
      ))}
    </div>
  );
}
