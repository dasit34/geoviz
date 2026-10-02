import { notFound, redirect } from "next/navigation";

import { isMonitoringEnabled } from "@/lib/monitoring/plans";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * Legacy private-link URL (`/monitoring/<accessToken>`). Bearer links no
 * longer grant access: every visit goes to the sign-in flow, and the token
 * is never looked up, so this page reveals nothing about whether it was
 * valid.
 */
export default function LegacyMonitoringLinkPage() {
  if (!isMonitoringEnabled()) notFound();
  redirect("/monitoring/sign-in?from=link");
}
