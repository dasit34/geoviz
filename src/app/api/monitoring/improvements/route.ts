import { NextResponse } from "next/server";

import { resolveAppBaseUrl } from "@/lib/app-url";
import {
  addTaskNote,
  createTaskFromRecommendation,
  regenerateDraft,
  saveFacts,
  transitionTask,
} from "@/lib/monitoring/improvements/service";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";
import { findSubscriptionByToken } from "@/lib/monitoring/prisma-store";
import type { MutationResult } from "@/lib/monitoring/tracking/service";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Customer actions on improvement tasks, posted from the status page. The
 * status-page token is the only credential; every rule (subscription
 * active, task belongs to this subscription, allowed status change) is
 * enforced server-side in improvements/service.ts. Customers can never mark
 * a task Verified.
 */
export async function POST(req: Request) {
  if (!isMonitoringEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const limited = applyApiRateLimit({ req, routeKey: "api:monitoring:improvements", limit: 40, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const field = (k: string) => (typeof form?.get(k) === "string" ? String(form?.get(k)).trim() : "");
  const sub = await findSubscriptionByToken(field("token"));
  if (!sub) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const taskId = field("taskId");
  let result: MutationResult;
  switch (field("action")) {
    case "create_from_recommendation":
      result = await createTaskFromRecommendation(sub, field("recommendationId"), "customer");
      break;
    case "approve":
      result = await transitionTask(sub, { taskId, to: "approved" }, "customer");
      break;
    case "start":
      result = await transitionTask(sub, { taskId, to: "in_progress" }, "customer");
      break;
    case "mark_implemented":
      result = await transitionTask(sub, { taskId, to: "implemented", notes: field("notes"), implementationUrl: field("implementationUrl") || undefined }, "customer");
      break;
    case "reopen":
      result = await transitionTask(sub, { taskId, to: "in_progress" }, "customer");
      break;
    case "dismiss":
      result = await transitionTask(sub, { taskId, to: "dismissed", reason: field("reason") }, "customer");
      break;
    case "restore":
      result = await transitionTask(sub, { taskId, to: "suggested" }, "customer");
      break;
    case "add_note":
      result = await addTaskNote(sub, taskId, field("note"), "customer");
      break;
    case "regenerate_draft":
      result = await regenerateDraft(sub, taskId, "customer");
      break;
    case "save_facts":
      result = await saveFacts(
        sub,
        Object.fromEntries(["name", "phone", "street", "city", "region", "postal", "hours", "services", "serviceAreas", "licenses"].map((k) => [k, field(k)])),
        "customer",
      );
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const url = new URL(`/monitoring/${sub.accessToken}`, resolveAppBaseUrl(req));
  url.searchParams.set("tab", "improvements");
  if (!result.ok) url.searchParams.set("notice", result.message);
  if (taskId) url.hash = `task-${taskId}`;
  return NextResponse.redirect(url, 303);
}
