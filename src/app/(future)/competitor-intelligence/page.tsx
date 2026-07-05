import { notFound } from "next/navigation";
import { CompetitorIntelligencePageSkeleton } from "@/modules/competitor-intelligence/page.skeleton";

/**
 * Placeholder route for the future Competitor Intelligence product.
 * 404s in production unless
 * GEO_MODULE_COMPETITOR_INTELLIGENCE_ENABLED="true" — see
 * src/modules/competitor-intelligence/README.md.
 */
export default function CompetitorIntelligenceFuturePage() {
  if (process.env.GEO_MODULE_COMPETITOR_INTELLIGENCE_ENABLED !== "true") {
    notFound();
  }
  return <CompetitorIntelligencePageSkeleton />;
}
