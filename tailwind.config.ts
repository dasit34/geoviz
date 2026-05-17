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
        accent: {
          DEFAULT: "#ff7a18",
          glow: "#ff9a3c",
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
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Inter", "sans-serif"],
        display: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Inter", "sans-serif"],
        // Mono stack for data values — scores, IDs, percentages,
        // timestamps, technical inputs. Defined but not yet applied in
        // this PR — Phase C is where `font-mono` lands on actual
        // surfaces. Aligns with the ad-hoc `ui-monospace` declarations
        // already in print.css (lines 1301, 1502) so adoption is
        // stylistically continuous.
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 60px -10px rgba(255, 122, 24, 0.45)",
        "glow-blue": "0 0 60px -10px rgba(43, 139, 255, 0.45)",
        card: "0 30px 80px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at 50% 0%, rgba(255,122,24,0.18), transparent 55%), radial-gradient(circle at 80% 30%, rgba(43,139,255,0.12), transparent 50%)",
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
      },
      animation: {
        pulseSoft: "pulseSoft 3s ease-in-out infinite",
        floatY: "floatY 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
