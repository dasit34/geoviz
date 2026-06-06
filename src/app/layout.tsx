import type { Metadata } from "next";
import {
  Inter,
  Newsreader,
  Instrument_Serif,
  JetBrains_Mono,
  Poppins,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";

/**
 * Typography system.
 *
 * Five fonts are loaded for different surfaces of the product:
 *
 * Original (admin / report / older pages):
 * - Inter — primary infrastructure grotesk (`--font-inter`)
 * - Newsreader — editorial serif (`--font-newsreader`)
 *
 * Phase I — landing-page design (Claude Design handoff):
 * - Instrument Serif — oversized editorial headlines on the landing
 *   page (`--font-instrument`). Italic emphasis for "understand".
 *
 * The design also names Geist + Geist Mono as the body sans + mono.
 * Those aren't in Next.js 14.2's `next/font/google` catalog; we
 * alias them in globals.css to existing fonts (`--font-geist` →
 * `--font-inter`, `--font-geist-mono` → system mono stack). Visual
 * difference is minor — Inter is the same humanist-grotesk family
 * as Geist.
 *
 * All fonts are self-hosted by next/font (zero runtime dependency);
 * each is loaded once and cached. The two old fonts stay loaded for
 * backward compatibility with admin/report surfaces that already
 * style against `--font-inter` and `--font-newsreader`.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  display: "swap",
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument",
});

// JetBrains Mono — the data typeface for the redesigned report
// (scores, %, IDs, meters, timestamps). Embedded by next/font so the
// Puppeteer PDF renders it. Exposed as `--font-jetbrains`.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains",
});

// Poppins — the GeoViz brand display face (wordmark + report section
// titles). Embedded by next/font so the Puppeteer PDF renders it.
const poppins = Poppins({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700", "800"],
  variable: "--font-poppins",
});

// Space Grotesk — Brand System v2 display face (wordmark + headlines).
// Technical-but-modern grotesk; embedded by next/font so the Puppeteer
// PDF renders it. Exposed as `--font-space-grotesk`. Rolls out across
// surfaces in v2 Phases 2–3; loaded here so the v2 brand preview + the
// eventual header/report can consume it.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "GeoViz — AI Visibility Intelligence for Businesses",
  description:
    "GeoViz audits whether AI systems like ChatGPT, Claude, Gemini, and Perplexity can understand and recommend your business — clear, reviewed reports delivered fast.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  openGraph: {
    title: "GeoViz — AI Visibility Intelligence for Businesses",
    description:
      "GeoViz audits whether AI systems like ChatGPT, Claude, Gemini, and Perplexity can understand and recommend your business — clear, reviewed reports delivered fast.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GeoViz — AI Visibility Intelligence for Businesses",
    description:
      "GeoViz audits whether AI systems like ChatGPT, Claude, Gemini, and Perplexity can understand and recommend your business — clear, reviewed reports delivered fast.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${instrument.variable} ${jetbrainsMono.variable} ${poppins.variable} ${spaceGrotesk.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        <div className="amber-spine" aria-hidden />
        {children}
      </body>
    </html>
  );
}
