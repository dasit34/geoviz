import { notFound } from "next/navigation";
import { MonitoringPageSkeleton } from "@/modules/monitoring/page.skeleton";

/**
 * Placeholder route for the future Monitoring product. 404s in
 * production unless GEO_MODULE_MONITORING_ENABLED="true" — see
 * src/modules/monitoring/README.md.
 */
export default function MonitoringFuturePage() {
  if (process.env.GEO_MODULE_MONITORING_ENABLED !== "true") {
    notFound();
  }
  return <MonitoringPageSkeleton />;
}
