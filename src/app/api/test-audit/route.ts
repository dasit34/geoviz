import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { orderInputSchema } from "@/lib/validation";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:test-audit",
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Test bypass is disabled in production." },
      { status: 403 },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "DATABASE_URL is not set. Configure Postgres before using the test bypass.",
      },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = orderInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { websiteUrl, email, businessName, competitorUrl } = parsed.data;
  const stripeSessionId = `test_${randomBytes(12).toString("hex")}`;

  try {
    const order = await prisma.auditOrder.create({
      data: {
        stripeSessionId,
        websiteUrl,
        email,
        businessName: businessName ?? null,
        competitorUrl: competitorUrl ?? null,
        amount: 0,
        currency: "usd",
        paymentStatus: "pending",
        auditStatus: "pending",
        notes: "TEST · created via /api/test-audit (Stripe bypass)",
      },
    });

    const params = new URLSearchParams({
      orderId: order.id,
      url: websiteUrl,
    });
    if (businessName) params.set("business", businessName);

    return NextResponse.json({
      orderId: order.id,
      redirect: `/report-preview?${params.toString()}`,
    });
  } catch (err) {
    console.error("[test-audit] Failed to create order", err);
    return NextResponse.json(
      { error: "Could not save the test order. See server logs." },
      { status: 500 },
    );
  }
}
