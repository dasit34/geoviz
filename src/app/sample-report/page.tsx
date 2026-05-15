import { redirect } from "next/navigation";
import {
  SAMPLE_REGISTRY,
  findSampleEntryBySlug,
  getFeaturedSlug,
} from "@/lib/sample-registry";

/**
 * `/sample-report` — server-side redirect to the FEATURED sample
 * report (`/sample-report/<featured-slug>`).
 *
 * Why a redirect (and not a render): the prior implementation rendered
 * a teaser + "View Full Sample Report" button, forcing the user to
 * click twice to see the actual sample. Navbar "Sample report" now
 * lands the user directly on the full report after a single visible
 * click — the redirect is HTTP-level and invisible.
 *
 * The featured slug is still env-driven via `GEO_VIZ_FEATURED_SAMPLE`
 * (resolved by `getFeaturedSlug()`); the per-slug page at
 * `/sample-report/[slug]` does the full polished render via
 * `<AuditReportContent />`. The "Additional sample audits" grid that
 * used to live here has been moved into the per-slug page so the
 * cross-archetype affordance is preserved.
 *
 * Routing semantics preserved:
 *   - Direct navigation to `/sample-report` → redirected.
 *   - Direct links to `/sample-report/<slug>` → still work unchanged.
 *   - Mobile + desktop identical (route-level redirect).
 */
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sample AI Visibility Report · GeoViz",
  description:
    "A real GeoViz AI Visibility Report — same dashboard your audit will use.",
};

export default function SampleReportIndexPage(): never {
  // Belt-and-suspenders: if the env-supplied featured slug isn't in
  // the registry, fall back to the first registry entry so the
  // redirect always lands on a valid sample route.
  const featuredSlug = getFeaturedSlug();
  const target =
    findSampleEntryBySlug(featuredSlug) ?? SAMPLE_REGISTRY[0];
  redirect(`/sample-report/${target.slug}`);
}
