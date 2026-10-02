import { NextResponse } from "next/server";

import {
  SIGN_IN_PATH,
  clientKey,
  forbiddenOriginResponse,
  isSameOriginRequest,
  monitoringAuthDeps,
  redirectTo,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/monitoring/auth/http";
import { verifySignInLink } from "@/lib/monitoring/auth/service";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";

export const runtime = "nodejs";

/**
 * The link page's "Continue" button (POST only — an email scanner that
 * merely opens the link can't consume it). Consumes the single-use link
 * and starts a 30-day session cookie.
 */
export async function POST(req: Request) {
  if (!isMonitoringEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSameOriginRequest(req)) return forbiddenOriginResponse();

  const form = await req.formData().catch(() => null);
  const secret = form?.get("t");

  try {
    const result = await verifySignInLink(
      { secret, clientKey: clientKey(req), userAgent: req.headers.get("user-agent") },
      monitoringAuthDeps(req),
    );
    if (!result.ok) {
      return redirectTo(req, `${SIGN_IN_PATH}?error=${result.reason === "rate_limited" ? "rate_limited" : "link"}`);
    }
    const res = redirectTo(req, "/monitoring/account");
    res.cookies.set(sessionCookieName(), result.sessionSecret, sessionCookieOptions(result.sessionExpiresAt));
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    console.error("[monitoring-auth] verify failed:", err instanceof Error ? err.message : err);
    return redirectTo(req, `${SIGN_IN_PATH}?error=unavailable`);
  }
}
