/**
 * FIXTURE (demonstration data) — a fake HVAC site, `fixture-hvac.example`,
 * served from memory in two versions. v1 → v2 contains real changes (new
 * service page, title change, phone change, removed page, material content
 * change, a page that times out) plus noise-only edits (footer date, nav
 * label) that must not be reported. Used by test-website-diff and the
 * staging fixture demo; never fetched from the network.
 */
import { html, type FakeRoute } from "./website-fakes";

const lb = (phone: string) => ({ "@context": "https://schema.org", "@type": "HVACBusiness", name: "Fixture HVAC", telephone: phone, address: { streetAddress: "1 Main St", addressLocality: "Columbus", addressRegion: "OH" } });
export const longText = (topic: string) =>
  Array.from({ length: 6 }, (_, i) => `${topic} paragraph ${i + 1}: our licensed technicians handle ${topic.toLowerCase()} for homes and small businesses across central Ohio, with upfront pricing.`);

export const FIXTURE_V1: Record<string, FakeRoute> = {
  "/robots.txt": { status: 200, body: "User-agent: *\nDisallow:\n" },
  "/": { status: 200, body: html({ title: "Fixture HVAC | Columbus", description: "Heating and cooling in Columbus.", h1: "Columbus heating & cooling", nav: [["/about", "About"], ["/services/furnace-repair", "Furnace"], ["/services/duct-cleaning", "Ducts"], ["/services/boiler", "Boilers"]], paragraphs: longText("Furnace service"), footer: "© 2025", jsonLd: lb("(614) 555-0100") }) },
  "/about": { status: 200, body: html({ title: "About", h1: "About us", paragraphs: ["Family owned since 1998 and proud to serve Columbus neighborhoods every day."], jsonLd: lb("(614) 555-0100") }) },
  "/services/furnace-repair": { status: 200, body: html({ title: "Furnace Repair", h1: "Furnace Repair", paragraphs: longText("Furnace repair") }) },
  "/services/duct-cleaning": { status: 200, body: html({ title: "Duct Cleaning", h1: "Duct Cleaning", paragraphs: ["Whole-home duct cleaning with before and after photos for every customer."] }) },
  "/services/boiler": { status: 200, body: html({ title: "Boiler Service", h1: "Boiler Service", paragraphs: ["Boiler repair and annual service for older Columbus homes and duplexes."] }) },
};
export const FIXTURE_V2: Record<string, FakeRoute> = {
  ...FIXTURE_V1,
  "/": { status: 200, body: html({ title: "Fixture HVAC | Columbus & Dublin HVAC", description: "Heating and cooling in Columbus.", h1: "Columbus heating & cooling", nav: [["/about", "About Us"], ["/services/furnace-repair", "Furnace"], ["/services/duct-cleaning", "Ducts"], ["/services/boiler", "Boilers"], ["/services/heat-pumps", "Heat Pumps"]], paragraphs: longText("Furnace service"), footer: "© 2026 · updated Oct 2, 2026", jsonLd: lb("(614) 555-0199") }) },
  "/services/furnace-repair": { status: 200, body: html({ title: "Furnace Repair", h1: "Furnace Repair", paragraphs: longText("Heat pump installation") }) },
  // LocalBusiness markup removed from /about (content unchanged).
  "/about": { status: 200, body: html({ title: "About", h1: "About us", paragraphs: ["Family owned since 1998 and proud to serve Columbus neighborhoods every day."] }) },
  "/services/heat-pumps": { status: 200, body: html({ title: "Heat Pump Installation", h1: "Heat Pump Installation", paragraphs: ["Cold-climate heat pumps installed and serviced throughout Columbus."] }) },
  "/services/duct-cleaning": { status: 404 },
  "/services/boiler": "timeout",
};

