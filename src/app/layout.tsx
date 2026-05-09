import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeoViz — AI Visibility Audits for Businesses",
  description:
    "GeoViz shows how ChatGPT, Claude, Gemini, and AI search systems interpret, trust, and recommend your business online — with scored audits and clear fixes.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  openGraph: {
    title: "GeoViz — AI Visibility Audits for Businesses",
    description:
      "GeoViz shows how ChatGPT, Claude, Gemini, and AI search systems interpret, trust, and recommend your business online — with scored audits and clear fixes.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GeoViz — AI Visibility Audits for Businesses",
    description:
      "GeoViz shows how ChatGPT, Claude, Gemini, and AI search systems interpret, trust, and recommend your business online — with scored audits and clear fixes.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 antialiased">{children}</body>
    </html>
  );
}
