import { NextResponse } from "next/server";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecheckLogBody = {
  batchId?: string | null;
  total?: number;
  htmlPass?: number;
  htmlFail?: number;
  pdfPass?: number;
  pdfFail?: number;
  durationMs?: number;
};

export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:report-qa:recheck-log",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RecheckLogBody = {};
  try {
    body = (await req.json()) as RecheckLogBody;
  } catch {
    // Malformed body — log what we have.
  }

  const {
    batchId = "unknown",
    total = 0,
    htmlPass = 0,
    htmlFail = 0,
    pdfPass = 0,
    pdfFail = 0,
    durationMs = 0,
  } = body;

  // Structured log line — greppable from Railway or Vercel logs.
  console.log(
    `[report-qa-recheck] batchId=${batchId} total=${total} ` +
      `htmlPass=${htmlPass} htmlFail=${htmlFail} ` +
      `pdfPass=${pdfPass} pdfFail=${pdfFail} ` +
      `llmCalls=0 newAuditRecords=0 durationMs=${durationMs}`,
  );

  return NextResponse.json({ logged: true });
}
