import { NextResponse } from "next/server";

import { resolveAppBaseUrl } from "@/lib/app-url";
import { forbiddenOriginResponse, isSameOriginRequest, signedOutResponse } from "@/lib/monitoring/auth/http";
import { requireOwnedSubscription } from "@/lib/monitoring/auth/session";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";
import {
  addTrackedCompetitor,
  addTrackedPrompt,
  deactivateTrackedCompetitor,
  deactivateTrackedPrompt,
  type MutationResult,
} from "@/lib/monitoring/tracking/service";
import { setCompetitorWebsite } from "@/lib/monitoring/website/service";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Customer edits to tracked questions / competitors, posted from the
 * signed-in dashboard. Requires the customer's session and ownership of
 * the subscription (src/lib/monitoring/auth/session.ts); every limit
 * and access rule is enforced server-side (tracking/service.ts).
 */
export async function POST(req: Request) {
  if (!isMonitoringEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSameOriginRequest(req)) return forbiddenOriginResponse();
  const limited = applyApiRateLimit({ req, routeKey: "api:monitoring:tracking", limit: 30, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const field = (k: string) => (typeof form?.get(k) === "string" ? String(form?.get(k)).trim() : "");
  const owned = await requireOwnedSubscription(field("subscriptionId"));
  if (owned.status === "signed_out") return signedOutResponse(req);
  if (owned.status === "not_found") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { sub } = owned;

  const action = field("action");
  let tab = "prompts";
  let result: MutationResult;
  switch (action) {
    case "add_prompt":
      result = await addTrackedPrompt(sub, field("text"), "custom");
      break;
    case "add_suggested_prompt":
      result = await addTrackedPrompt(sub, field("text"), "suggested");
      break;
    case "remove_prompt":
      result = await deactivateTrackedPrompt(sub, field("id"));
      break;
    case "add_competitor":
      tab = "competitors";
      result = await addTrackedCompetitor(sub, field("name"), field("websiteUrl") || null, "customer");
      break;
    case "track_detected_competitor":
      tab = "competitors";
      result = await addTrackedCompetitor(sub, field("name"), null, "detected");
      break;
    case "set_competitor_website":
      tab = field("returnTab") === "website" ? "website" : "competitors";
      result = await setCompetitorWebsite(sub, field("id"), field("websiteUrl"));
      break;
    case "remove_competitor":
      tab = "competitors";
      result = await deactivateTrackedCompetitor(sub, field("id"));
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const url = new URL(`/monitoring/account/${sub.id}`, resolveAppBaseUrl(req));
  url.searchParams.set("tab", tab);
  if (!result.ok) url.searchParams.set("notice", result.message);
  return NextResponse.redirect(url, 303);
}
