import type { MetadataRoute } from "next";

/**
 * Web app manifest — Brand System v2. Next App Router serves this at
 * /manifest.webmanifest and auto-links it. Theme/background use the
 * canonical near-black base; the icon is the constellation mark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GeoViz — AI Visibility Intelligence",
    short_name: "GeoViz",
    description:
      "GeoViz measures whether AI systems like ChatGPT, Claude, Gemini, and Perplexity can understand, trust, and recommend your business.",
    start_url: "/",
    display: "standalone",
    background_color: "#06070a",
    theme_color: "#06070a",
    icons: [{ src: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
  };
}
