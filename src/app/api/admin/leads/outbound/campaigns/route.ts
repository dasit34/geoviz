import { NextResponse } from "next/server";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { getOutboundProvider } from "@/lib/outbound/registry";

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
