import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="min-h-screen bg-ink-950 antialiased">{children}</body>
    </html>
  );
}
