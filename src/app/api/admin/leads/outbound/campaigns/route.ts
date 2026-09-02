import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { getOutboundProvider } from "@/lib/outbound/registry";
import { readApiKey } from "@/lib/validators/apiKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/leads/outbound/campaigns — list the configured
 * outbound provider's campaigns, for the "Send to Instantly" picker.
 * Read-only, no lead data touched.
 */
export async function GET(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:outbound:campaigns",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TEMPORARY DIAGNOSTIC (added 2026-09-03, remove once the
  // production-vs-local INSTANTLY_API_KEY mismatch investigation is
  // resolved). Fires on every authenticated call to this route,
  // which the "Send to Instantly" modal already triggers automatically
  // on open — no new admin action needed. Logs ONLY key
  // presence/length/a truncated SHA-256 fingerprint plus Vercel's own
  // auto-injected deployment identity. Never logs the raw key, the
  // Authorization header, ADMIN_SECRET, or any lead data (this route
  // never touches lead data).
  {
    const diagKey = readApiKey("INSTANTLY_API_KEY");
    console.log(
      `[outbound-diag] key-check present=${diagKey !== null} length=${diagKey?.length ?? 0} sha256First8=${diagKey ? createHash("sha256").update(diagKey).digest("hex").slice(0, 8) : "n/a"} vercelEnv=${process.env.VERCEL_ENV ?? "unknown"} commit=${process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown"}`,
    );
  }

  const provider = getOutboundProvider("instantly");
  if (!provider || !provider.enabled()) {
    return NextResponse.json(
      {
        error: provider
          ? "This outbound provider is not configured (missing API key)."
          : "Unknown outbound provider.",
      },
      { status: 409 },
    );
  }

  const result = await provider.listCampaigns();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ campaigns: result.campaigns });
}
