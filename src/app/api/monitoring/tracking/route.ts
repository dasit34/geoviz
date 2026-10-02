import { NextResponse } from "next/server";

import { resolveAppBaseUrl } from "@/lib/app-url";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";
import { findSubscriptionByToken } from "@/lib/monitoring/prisma-store";
import {
  addTrackedCompetitor,
  addTrackedPrompt,
  deactivateTrackedCompetitor,
  deactivateTrackedPrompt,
  type MutationResult,
} from "@/lib/monitoring/tracking/service";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Customer edits to tracked questions / competitors, posted from the
 * status page. The status-page token is the only credential; every limit
 * and access rule is enforced server-side (tracking/service.ts).
 */
export async function POST(req: Request) {
  if (!isMonitoringEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const limited = applyApiRateLimit({ req, routeKey: "api:monitoring:tracking", limit: 30, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const field = (k: string) => (typeof form?.get(k) === "string" ? String(form?.get(k)).trim() : "");
  const sub = await findSubscriptionByToken(field("token"));
  if (!sub) return NextResponse.json({ error: "Not found." }, { status: 404 });

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
    case "remove_competitor":
      tab = "competitors";
      result = await deactivateTrackedCompetitor(sub, field("id"));
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const url = new URL(`/monitoring/${sub.accessToken}`, resolveAppBaseUrl(req));
  url.searchParams.set("tab", tab);
  if (!result.ok) url.searchParams.set("notice", result.message);
  return NextResponse.redirect(url, 303);
}
