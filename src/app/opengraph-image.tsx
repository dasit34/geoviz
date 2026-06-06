import { ImageResponse } from "next/og";

/**
 * Default Open Graph / Twitter card — Brand System v2. Next App Router
 * auto-wires this for OG + twitter. The constellation mark + "GeoViz.ai"
 * lockup on the near-black base with a faint mark watermark.
 *
 * Note: rendered with the @vercel/og default font (no custom face) to stay
 * dependency-free; a Space Grotesk upgrade is a fast-follow.
 */
export const alt = "GeoViz — AI Visibility Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none">
<path d="M 35.15 34.04 A 15 15 0 1 1 35.15 13.96" stroke="rgba(226,232,240,0.55)" stroke-width="2"/>
<circle cx="35.15" cy="34.04" r="2.4" fill="#E2E8F0"/>
<circle cx="22.2" cy="38.9" r="2.0" fill="#7C8598"/>
<circle cx="10.8" cy="31.0" r="2.4" fill="#E2E8F0"/>
<circle cx="10.6" cy="17.2" r="2.0" fill="#7C8598"/>
<circle cx="21.9" cy="9.2" r="2.4" fill="#E2E8F0"/>
<circle cx="35.0" cy="13.8" r="2.0" fill="#E2E8F0"/>
<line x1="24" y1="24" x2="35" y2="24" stroke="#FF6A1A" stroke-width="3" stroke-linecap="round"/>
<circle cx="35" cy="24" r="2.3" fill="#FF6A1A"/>
<circle cx="24" cy="24" r="3.4" fill="#FF6A1A"/>
</svg>`;

const markUri = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#06070A",
          padding: "72px",
          position: "relative",
        }}
      >
        <img
          src={markUri}
          width={560}
          height={560}
          style={{ position: "absolute", right: -90, top: 35, opacity: 0.1 }}
        />
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src={markUri} width={54} height={54} />
          <div style={{ display: "flex", marginLeft: 18, fontSize: 38, fontWeight: 700, color: "#ffffff" }}>
            <div style={{ display: "flex" }}>GeoViz</div>
            <div style={{ display: "flex", color: "#FF6A1A" }}>.ai</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 66,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-2px",
              lineHeight: 1.05,
              maxWidth: 840,
            }}
          >
            See your business across the AI network.
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 22, color: "rgba(226,232,240,0.6)" }}>
            AI Visibility Intelligence · geoviz.ai
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
