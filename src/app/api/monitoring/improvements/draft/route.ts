import { NextResponse } from "next/server";

import { draftForDownload } from "@/lib/monitoring/improvements/service";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";
import { requireOwnedSubscription } from "@/lib/monitoring/auth/session";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Download one draft — only if it belongs to a subscription the signed-in customer owns. Served as an attachment, never rendered. */
export async function GET(req: Request) {
  if (!isMonitoringEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const limited = applyApiRateLimit({ req, routeKey: "api:monitoring:improvements:draft", limit: 60, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const params = new URL(req.url).searchParams;
  const owned = await requireOwnedSubscription(params.get("subscriptionId"));
  if (owned.status !== "ok") return NextResponse.json({ error: "Not found." }, { status: owned.status === "signed_out" ? 401 : 404 });
  const draft = await draftForDownload(owned.sub.id, params.get("draftId") ?? "");
  if (!draft) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const ext = draft.format === "jsonld" ? "html" : draft.format === "markdown" ? "md" : "txt";
  const name = `geoviz-${draft.kind}-v${draft.version}.${ext}`;
  return new NextResponse(draft.content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
