import type { RawAuditJson } from "./types";

// Integrity Home Exteriors — illustrative raw audit data.
// Values approximate a real crawl: title and H1 found, no structured data,
// many images with empty alt text, partial security headers.
export const integrityHomeExteriorsAudit: RawAuditJson = {
  url: "https://integrityhomeexteriors.com/",
  businessName: "Integrity Home Exteriors",
  title: "Integrity Home Exteriors | Roofing, Siding & Windows",
  meta: {
    description:
      "Integrity Home Exteriors offers professional roofing, siding, and window installation services.",
    robots: "index,follow",
    viewport: "width=device-width, initial-scale=1",
  },
  h1: ["Premium Exterior Services for Your Home"],
  h2: [
    "Our Services",
    "Why Choose Integrity",
    "Recent Projects",
    "Get A Free Estimate",
  ],
  h3: ["Roofing", "Siding", "Windows", "Gutters"],
  word_count: 412,
  links: [
    { href: "/services", text: "Services", type: "internal" },
    { href: "/about", text: "About", type: "internal" },
    { href: "/contact", text: "Contact", type: "internal" },
    { href: "https://facebook.com/integrityhomeexteriors", text: "Facebook", type: "external" },
  ],
  images: [
    { src: "/images/hero-1.jpg", alt: "" },
    { src: "/images/project-roof-1.jpg", alt: "" },
    { src: "/images/project-roof-2.jpg", alt: "" },
    { src: "/images/project-siding-1.jpg", alt: "" },
    { src: "/images/project-siding-2.jpg", alt: "" },
    { src: "/images/project-windows-1.jpg", alt: "" },
    { src: "/images/project-windows-2.jpg", alt: "" },
    { src: "/images/team.jpg", alt: "Our team" },
    { src: "/images/logo.png", alt: "Integrity Home Exteriors" },
    { src: "/images/truck.jpg", alt: "" },
    { src: "/images/before-after-1.jpg", alt: "" },
    { src: "/images/before-after-2.jpg", alt: "" },
  ],
  structured_data: [],
  security_headers: {
    "strict-transport-security": "max-age=31536000",
    "x-frame-options": "SAMEORIGIN",
    "x-content-type-options": null,
    "referrer-policy": null,
    "content-security-policy": null,
  },
  text_content:
    "Premium Exterior Services for Your Home. Integrity Home Exteriors delivers high-quality roofing, siding, and window installation. Family-owned and operated. We pride ourselves on craftsmanship and customer satisfaction. Get a free estimate today. Our team has years of experience helping homeowners protect and beautify their homes.",
  has_ssr_content: true,
  errors: [],
};
