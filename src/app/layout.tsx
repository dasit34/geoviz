import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeoViz — Does ChatGPT recommend your business?",
  description:
    "GeoViz audits your website and tells you whether AI tools like ChatGPT, Claude, Perplexity, and Gemini can find, understand, and recommend your business.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  openGraph: {
    title: "GeoViz — Does ChatGPT recommend your business?",
    description:
      "Find out if AI tools recommend your business. Get an AI Visibility Audit in 24 hours.",
    type: "website",
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
