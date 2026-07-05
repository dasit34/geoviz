import { notFound } from "next/navigation";
import { AgencyPlatformPageSkeleton } from "@/modules/agency-platform/page.skeleton";

/**
 * Placeholder route for the future Agency Platform product. 404s in
 * production unless GEO_MODULE_AGENCY_PLATFORM_ENABLED="true" — see
 * src/modules/agency-platform/README.md.
 */
export default function AgencyPlatformFuturePage() {
  if (process.env.GEO_MODULE_AGENCY_PLATFORM_ENABLED !== "true") {
    notFound();
  }
  return <AgencyPlatformPageSkeleton />;
}
