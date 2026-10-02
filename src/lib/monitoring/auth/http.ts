/**
 * Monitoring customer login — HTTP helpers shared by the sign-in routes
 * and pages: session cookie, same-origin (CSRF) check, client key, and the
 * production wiring of the auth deps.
 */
import { NextResponse } from "next/server";

import { resolveAppBaseUrl } from "@/lib/app-url";
import { clientIpHashFromHeaders } from "@/lib/rate-limit";

import { sendMonitoringSignInEmail } from "../emails";
import { prismaMonitoringAuthStore } from "./prisma-auth-store";
import type { AuthDeps } from "./service";

const isHttps = () => process.env.NODE_ENV === "production";

/**
 * `__Host-` prefix (HTTPS deployments): the browser refuses the cookie
 * unless it is Secure, host-only, and Path=/ — it can't be set or
 * overridden by a sibling subdomain.
 */
export function sessionCookieName(): string {
  return isHttps() ? "__Host-geoviz_monitoring" : "geoviz_monitoring_dev";
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isHttps(),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

/** Expired, empty cookie — used by sign-out. */
export function clearedSessionCookieOptions() {
  return { ...sessionCookieOptions(new Date(0)), maxAge: 0 };
}

/**
 * CSRF guard for state-changing POSTs. The session cookie is SameSite=Lax
 * already; this additionally requires the request to come from our own
 * origin (Origin header, or Sec-Fetch-Site when a browser omits Origin).
 */
export function isSameOriginRequest(req: Request): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") {
    try {
      return host !== null && new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return req.headers.get("sec-fetch-site") === "same-origin";
}

/** Hashed client IP — the only per-client value the limiter ever sees. */
export function clientKey(req: Request): string {
  return clientIpHashFromHeaders(req.headers);
}

/** 303 redirect to a path on this deployment (form POST → page). */
export function redirectTo(req: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, resolveAppBaseUrl(req)), 303);
}

/** Uniform responses for customer form posts. */
export const SIGN_IN_PATH = "/monitoring/sign-in";
export function signedOutResponse(req: Request): NextResponse {
  return redirectTo(req, `${SIGN_IN_PATH}?error=session`);
}
export function forbiddenOriginResponse(): NextResponse {
  return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
}

/** Production auth deps for a request (links point at this deployment). */
export function monitoringAuthDeps(req?: Request): AuthDeps {
  return {
    store: prismaMonitoringAuthStore,
    now: () => new Date(),
    baseUrl: resolveAppBaseUrl(req),
    sendLink: sendMonitoringSignInEmail,
  };
}
