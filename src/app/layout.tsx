import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Visibility Audit for Local Businesses | GeoViz",
  description:
    "Find out if ChatGPT and other AI platforms can find and recommend your business — or if they’re sending customers to competitors.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  openGraph: {
    title: "AI Visibility Audit for Local Businesses | GeoViz",
    description:
      "Find out if ChatGPT and other AI platforms can find and recommend your business — or if they’re sending customers to competitors.",
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
