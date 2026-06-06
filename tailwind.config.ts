import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#05070d",
          900: "#0a0d16",
          800: "#10141f",
          700: "#181d2b",
          600: "#232a3d",
        },
        // Brand System v2 — the ONE GeoViz signal orange (consolidated
        // from the four legacy oranges). Mirrors --gv-signal in globals.css.
        accent: {
          DEFAULT: "#ff6a1a",
          glow: "#ff8a3c",
          blue: "#2b8bff",
        },
        // Semantic status tokens (UI polish Phase A — UI_POLISH_PLAN.md
        // section 3.5). Defined but not yet applied in this PR — Phase E
        // is where they replace the ad-hoc `bg-amber-300`,
        // `border-red-400/30`, `bg-emerald-300/40` patterns sprinkled
        // across error/warning/in-flight surfaces. Restrained palette
        // that fits the dark data-terminal aesthetic without leaving the
        // ink/accent visual family.
        severity: {
          critical: "#ff6b6b", // muted red — hard-block failure states
          warning: "#ff9a3c",  // matches accent-glow — advisory states
          info: "#6ce39a",     // soft green — safe / informational
        },
        // Restrained terminal-cyan. Reserved for radar + telemetry
        // accents per CLAUDE_DESIGN.md ("Satellite visibility system
        // meets Bloomberg Terminal"). NOT used for body color, CTAs,
        // or score values — those stay in the ink/accent palette so
        // the cyan reads as "this is telemetry signal," not as a
        // second brand color.
        cyan: {
          DEFAULT: "#67e8f9",
          dim: "#0e7490",
        },
        // Hybrid-palette light surfaces — used by .section-light /
        // .card-light / .h2-light utilities in globals.css for the
        // homepage's editorial rhythm-break sections (§01 + §05).
        // Cream is intentionally warm (same hue family as the
        // orange accent at high luminance) so light sections stay
        // brand-coherent. Graphite-900 is soft near-black, not
        // pure black — matches the editorial intelligence voice.
        cream: {
          50:  "#f8f6f1",
          100: "#f1ede5",
          200: "#e6e0d5",
        },
        graphite: {
          900: "#1a1d24",
          700: "#2e333d",
          500: "#5b6271",
          400: "#8a92a3",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        // Brand System v2 display face — Space Grotesk (wordmark + headlines).
        display: ["var(--font-space-grotesk)", "var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Mono stack for data values — scores, IDs, percentages,
        // timestamps, technical inputs. Defined but not yet applied in
        // this PR — Phase C is where `font-mono` lands on actual
        // surfaces. Aligns with the ad-hoc `ui-monospace` declarations
        // already in print.css (lines 1301, 1502) so adoption is
        // stylistically continuous.
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 60px -10px rgba(255, 106, 26, 0.45)",
        "glow-blue": "0 0 60px -10px rgba(43, 139, 255, 0.45)",
        card: "0 30px 80px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at 50% 0%, rgba(255,106,26,0.18), transparent 55%), radial-gradient(circle at 80% 30%, rgba(43,139,255,0.12), transparent 50%)",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        floatY: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        // Slow rotation for the hero radar's scanning sweep. 12s is
        // intentionally on the slow side — operational, not flashy.
        // The sweep tells the viewer "something is scanning" without
        // screaming sci-fi.
        radarSweep: {
          "0%":   { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        pulseSoft: "pulseSoft 3s ease-in-out infinite",
        floatY: "floatY 6s ease-in-out infinite",
        radarSweep: "radarSweep 12s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
