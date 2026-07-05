import { notFound } from "next/navigation";
import { EnterprisePageSkeleton } from "@/modules/enterprise/page.skeleton";

/**
 * Placeholder route for the future Enterprise product. 404s in
 * production unless GEO_MODULE_ENTERPRISE_ENABLED="true" — see
 * src/modules/enterprise/README.md.
 */
export default function EnterpriseFuturePage() {
  if (process.env.GEO_MODULE_ENTERPRISE_ENABLED !== "true") {
    notFound();
  }
  return <EnterprisePageSkeleton />;
}
