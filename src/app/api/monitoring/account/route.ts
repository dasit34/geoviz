import { NextResponse } from "next/server";

import { resolveAppBaseUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { forbiddenOriginResponse, isSameOriginRequest, redirectTo, signedOutResponse } from "@/lib/monitoring/auth/http";
import { requireOwnedSubscription } from "@/lib/monitoring/auth/session";
import { billingActionsFor, createReactivationCheckoutUrl, setCancelAtPeriodEnd } from "@/lib/monitoring/billing-actions";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";
import { canEditTracking } from "@/lib/monitoring/tracking/service";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BUSINESS_NAME = 120;

/**
 * Signed-in customer settings for ONE owned monitoring record: business
 * name, cancel at period end, keep monitoring, reactivate. Sign-in email
 * changes are admin-assisted during Early Access (not offered here).
 */
export async function POST(req: Request) {
  if (!isMonitoringEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSameOriginRequest(req)) return forbiddenOriginResponse();
  const limited = applyApiRateLimit({ req, routeKey: "api:monitoring:account", limit: 20, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const field = (k: string) => (typeof form?.get(k) === "string" ? String(form?.get(k)).trim() : "");
  const owned = await requireOwnedSubscription(field("subscriptionId"));
  if (owned.status === "signed_out") return signedOutResponse(req);
  if (owned.status === "not_found") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { sub } = owned;

  const back = (notice?: string) =>
    redirectTo(req, `/monitoring/account/${sub.id}?tab=settings${notice ? `&notice=${encodeURIComponent(notice)}` : ""}`);
  const actions = billingActionsFor(sub, new Date());

  try {
    switch (field("action")) {
      case "update_business_name": {
        if (!canEditTracking(sub)) return back("Your subscription isn't active, so settings are read-only.");
        const name = field("businessName").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_BUSINESS_NAME);
        if (name.length < 2) return back("Enter a business name.");
        await prisma.monitoringSubscription.update({ where: { id: sub.id }, data: { businessName: name } });
        return back("Business name saved.");
      }
      case "cancel_at_period_end":
        if (!actions.canCancel) return back("This subscription can't be canceled right now.");
        await setCancelAtPeriodEnd(sub, true);
        return back("Cancellation scheduled — monitoring stays active until the end of your paid period.");
      case "resume":
        if (!actions.canResume) return back("There's no pending cancellation to undo.");
        await setCancelAtPeriodEnd(sub, false);
        return back("Monitoring will continue — your cancellation was removed.");
      case "reactivate": {
        if (!actions.canReactivate) return back("This subscription is still active.");
        const url = await createReactivationCheckoutUrl(sub, resolveAppBaseUrl(req));
        if (!url) return back("Reactivation is temporarily unavailable. Please contact support@geoviz.ai.");
        return NextResponse.redirect(url, 303);
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    console.error(`[monitoring-account] ${field("action")} failed for ${sub.id}:`, err instanceof Error ? err.message : err);
    return back("That didn't go through. Please try again or contact support@geoviz.ai.");
  }
}
