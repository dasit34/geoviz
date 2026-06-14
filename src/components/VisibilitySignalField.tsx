"use client";

/**
 * VisibilitySignalField — the homepage hero artifact ("AI Recommendation
 * Test Field").
 *
 * A left→right intelligence composition: a tested customer question feeds a
 * "Your Business" entity, which emits signals across animated connection lines
 * toward the five AI systems (ChatGPT / Claude / Perplexity / Gemini / AI
 * Overviews). Each system reacts (Partial / Checking / Needs proof / Weak
 * signal / Readiness scan), some signals read partial or blocked, and a
 * readiness module rolls up the directional score — visually carrying the
 * product story (real questions → AI needs signals → the audit finds the
 * breaks) without extra copy.
 *
 * Presentation only. Pure SVG so it scales uniformly on mobile; the single
 * client concern is a reduced-motion-safe score count-up. Colors mirror the
 * Tailwind tokens inline (same precedent as ProviderMark / ScoreGauge — SVG
 * data-viz). Motion is `motion-safe:`-gated; reduced-motion users get the full
 * static composition with the score pinned to its final value.
 */

import { useEffect, useRef, useState } from "react";
import { ProviderMark } from "@/components/report/BrandMarks";

const TARGET_SCORE = 52;

// Token-mirroring hexes (same values as tailwind.config tokens).
const C = {
  accent: "#ff6a1a",
  cyan: "#67e8f9",
  ok: "#6ce39a",
  warn: "#ff9a3c",
  bad: "#ff6b6b",
  muted: "rgba(255,255,255,0.42)",
  line: "rgba(255,255,255,0.10)",
};

type Tone = "ok" | "warn" | "bad" | "cyan" | "muted";
const toneHex: Record<Tone, string> = {
  ok: C.ok,
  warn: C.warn,
  bad: C.bad,
  cyan: C.cyan,
  muted: C.muted,
};

// Business-side signal checks — partial/blocked on purpose (this is an audit).
const CHECKS: { label: string; tone: Tone }[] = [
  { label: "Found", tone: "ok" },
  { label: "Understood", tone: "warn" },
  { label: "Trusted", tone: "bad" },
  { label: "Recommended", tone: "muted" },
];

// AI platform nodes + their reaction to the tested question. `strength` drives
// connection-line brightness (lower = fainter / weaker signal).
type Node = {
  provider: string;
  name: string;
  reaction: string;
  tone: Tone;
  strength: number;
};
const NODES: Node[] = [
  { provider: "openai", name: "ChatGPT", reaction: "Partial", tone: "warn", strength: 0.62 },
  { provider: "claude", name: "Claude", reaction: "Checking", tone: "cyan", strength: 0.82 },
  { provider: "perplexity", name: "Perplexity", reaction: "Needs proof", tone: "warn", strength: 0.44 },
  { provider: "gemini", name: "Gemini", reaction: "Weak signal", tone: "bad", strength: 0.24 },
  { provider: "ai-overviews", name: "AI Overviews", reaction: "Readiness scan", tone: "cyan", strength: 0.34 },
];

const EMIT_X = 180;
const EMIT_Y = 134;
const NODE_X = 360;
const NODE_W = 176;
const NODE_H = 44;
const NODE_TOP = [70, 126, 182, 238, 294]; // top-left y of each node card
const nodeCenterY = (i: number) => NODE_TOP[i] + NODE_H / 2;

/** Distinct inline glyph for AI Overviews (an "answer block" + accent spark). */
function AiOverviewsGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="none">
      <g stroke={C.cyan} strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 8h16" />
        <path d="M4 13h11" />
        <path d="M4 18h7" />
      </g>
      <circle cx="20" cy="17.5" r="2" fill={C.accent} />
    </svg>
  );
}

export function VisibilitySignalField({
  className = "",
}: {
  className?: string;
}) {
  const [score, setScore] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setScore(TARGET_SCORE);
      return;
    }
    const start = performance.now();
    const dur = 1200;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setScore(Math.round(eased * TARGET_SCORE));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <figure
      className={`relative w-full overflow-hidden rounded-lg border border-white/10 bg-ink-900/50 shadow-card ${className}`}
    >
      <figcaption className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <span className="section-eyebrow">AI Recommendation Test Field</span>
        <span className="mono-data text-[11px] uppercase tracking-[0.16em] text-white/35">
          Sample · directional
        </span>
      </figcaption>

      <svg
        viewBox="0 0 560 470"
        aria-hidden
        focusable="false"
        className="block h-auto w-full"
        fill="none"
      >
        {/* ── Tested customer question strip ─────────────────────── */}
        <g>
          <rect x="24" y="16" width="512" height="46" rx="10" fill="rgba(255,255,255,0.03)" stroke={C.line} />
          <circle cx="42" cy="39" r="3.5" fill={C.cyan} className="motion-safe:animate-pulseSoft" />
          <text x="58" y="34" fontSize="8.5" letterSpacing="1.6" fill={C.muted} fontFamily="var(--rd-mono, ui-monospace), monospace">
            CUSTOMER QUESTION TESTED
          </text>
          <text x="58" y="51" fontSize="14" fontWeight="600" fill="#eef2fb">
            “Who should I hire near me?”
          </text>
        </g>

        {/* ── Business entity (left) — the lone accent focal ─────── */}
        {/* emit glow (pulses as signals leave) */}
        <circle cx={EMIT_X} cy={EMIT_Y} r="13" fill={C.accent} opacity="0.16" className="motion-safe:animate-pulseSoft" />
        <g>
          <rect x="24" y="92" width="156" height="84" rx="10" fill="rgba(255,106,26,0.06)" stroke={C.accent} strokeWidth="1.25" />
          <text x="40" y="118" fontSize="13" fontWeight="700" fill="#ffffff">
            Your Business
          </text>
          <rect x="40" y="130" width="98" height="5" rx="2.5" fill="rgba(255,255,255,0.16)" />
          <rect x="40" y="142" width="66" height="5" rx="2.5" fill="rgba(255,255,255,0.10)" />
          <text x="40" y="166" fontSize="9.5" letterSpacing="0.6" fill={C.muted} fontFamily="var(--rd-mono, ui-monospace), monospace">
            LOCAL SERVICE · 1 LOCATION
          </text>
          <circle cx={EMIT_X} cy={EMIT_Y} r="4" fill={C.accent} className="motion-safe:animate-pulseSoft" />
        </g>

        {/* ── Signal status chips (business side) ────────────────── */}
        {CHECKS.map((c, i) => {
          const y = 192 + i * 30;
          const blocked = c.tone === "muted";
          return (
            <g
              key={c.label}
              className="motion-safe:animate-chipIn"
              style={{ animationDelay: `${0.25 + i * 0.12}s` }}
            >
              <rect x="24" y={y} width="156" height="24" rx="7" fill="rgba(255,255,255,0.03)" stroke={C.line} />
              <circle cx="39" cy={y + 12} r="3.5" fill={toneHex[c.tone]} />
              <text x="52" y={y + 16} fontSize="11.5" fontWeight="500" fill="rgba(255,255,255,0.85)">
                {c.label}
              </text>
              {blocked ? (
                <text x="168" y={y + 16} fontSize="11" fontWeight="700" textAnchor="end" fill={C.muted}>
                  ✕
                </text>
              ) : null}
            </g>
          );
        })}

        {/* ── Connection lines (business → each AI system) ───────── */}
        <g strokeWidth="1.6" strokeLinecap="round" fill="none">
          {NODES.map((n, i) => {
            const cy = nodeCenterY(i);
            const op = 0.18 + n.strength * 0.6;
            return (
              <path
                key={n.provider}
                d={`M${EMIT_X} ${EMIT_Y} C 250 ${EMIT_Y}, 286 ${cy}, ${NODE_X - 4} ${cy}`}
                stroke={C.cyan}
                opacity={op}
                strokeDasharray="5 9"
                className="motion-safe:animate-signalDash"
                style={{ animationDelay: `${i * 0.18}s` }}
              />
            );
          })}
        </g>

        {/* ── AI platform nodes (right) + reactions ──────────────── */}
        {NODES.map((n, i) => {
          const top = NODE_TOP[i];
          const cy = nodeCenterY(i);
          const tone = toneHex[n.tone];
          return (
            <g key={n.provider}>
              <rect x={NODE_X} y={top} width={NODE_W} height={NODE_H} rx="9" fill="rgba(255,255,255,0.035)" stroke={C.line} />
              {/* tone stripe */}
              <rect x={NODE_X} y={top} width="3" height={NODE_H} rx="1.5" fill={tone} opacity="0.8" />
              {/* logo */}
              <g transform={`translate(${NODE_X + 13}, ${cy - 9})`}>
                {n.provider === "ai-overviews" ? (
                  <AiOverviewsGlyph />
                ) : (
                  <ProviderMark provider={n.provider} size={18} />
                )}
              </g>
              <text x={NODE_X + 40} y={cy - 2} fontSize="12.5" fontWeight="700" fill="#ffffff">
                {n.name}
              </text>
              <text x={NODE_X + 40} y={cy + 13} fontSize="10.5" fontWeight="600" fill={tone}>
                {n.reaction}
              </text>
              <circle
                cx={NODE_X + NODE_W - 14}
                cy={cy}
                r="3.2"
                fill={tone}
                className="motion-safe:animate-pulseSoft"
                style={{ animationDelay: `${i * 0.5}s` }}
              />
            </g>
          );
        })}

        {/* ── AI Recommendation Readiness module ─────────────────── */}
        <g>
          <rect x="24" y="356" width="512" height="92" rx="12" fill="rgba(255,255,255,0.025)" stroke={C.line} />
          <text x="44" y="386" fontSize="9.5" letterSpacing="1.4" fill={C.muted} fontFamily="var(--rd-mono, ui-monospace), monospace">
            AI RECOMMENDATION READINESS
          </text>
          <text x="44" y="428" fontSize="34" fontWeight="700" fill={C.accent} fontFamily="var(--font-space-grotesk), sans-serif">
            {score}
          </text>
          <text x="100" y="428" fontSize="15" fontWeight="500" fill="rgba(255,255,255,0.45)" fontFamily="var(--rd-mono, ui-monospace), monospace">
            / 100
          </text>
          {/* status pill */}
          <rect x="406" y="372" width="110" height="24" rx="12" fill="rgba(255,154,60,0.14)" stroke="rgba(255,154,60,0.4)" />
          <text x="461" y="388" fontSize="10.5" fontWeight="700" letterSpacing="0.8" textAnchor="middle" fill={C.warn} fontFamily="var(--rd-mono, ui-monospace), monospace">
            NEEDS WORK
          </text>
          {/* readiness bar */}
          <rect x="44" y="436" width="472" height="5" rx="2.5" fill="rgba(255,255,255,0.08)" />
          <rect x="44" y="436" width={Math.round((472 * score) / 100)} height="5" rx="2.5" fill={C.warn} />
        </g>
      </svg>
    </figure>
  );
}
