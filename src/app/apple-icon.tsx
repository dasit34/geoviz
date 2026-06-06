import { ImageResponse } from "next/og";

/**
 * Apple touch icon — Brand System v2. The App Router apple-icon convention
 * does NOT support .svg (only raster), so this generates a 180×180 PNG via
 * next/og: the compact constellation mark (bold C + orange G-bar + hub) on
 * the near-navy brand tile. iOS applies its own corner mask.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="120" height="120" fill="none">
<path d="M 35.15 34.04 A 15 15 0 1 1 35.15 13.96" stroke="#E2E8F0" stroke-width="3.4" stroke-linecap="round"/>
<line x1="24" y1="24" x2="36" y2="24" stroke="#FF6A1A" stroke-width="3.4" stroke-linecap="round"/>
<circle cx="24" cy="24" r="4.1" fill="#FF6A1A"/>
</svg>`;

const markUri = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B1120",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markUri} width={120} height={120} alt="" />
      </div>
    ),
    { ...size },
  );
}
