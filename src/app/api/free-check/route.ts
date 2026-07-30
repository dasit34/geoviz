import { NextResponse } from "next/server";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { freeCheckInputSchema } from "@/lib/validation";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { runFreeCheck } from "@/lib/free-check/runFreeCheck";
import type { CheckResult } from "@/lib/free-check/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public POST that runs the Free AI Visibility Check (/check). Fully
// separate from the paid audit pipeline — deterministic-only (reuses
// the V2 preflight analyzers via runFreeCheck), no LLM call, never
// triggers the Anthropic-backed worker. NEVER writes to AuditOrder.
//
//   1. Rate-limit (8 / 10 min per IP — slightly looser than checkout
//      since this has no cost/spend risk, but still bounded).
//   2. Validate via Zod. A filled honeypot field short-circuits to a
//      fake success without doing any real work.
//   3. Run the deterministic check pass (network fetch + 4 analyzers).
//   4. Persist a FreeCheckSubmission row (success or failure) for
//      admin visibility — never blocks the response on a DB failure.
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:free-check",
    limit: 8,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = freeCheckInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { websiteUrl, businessName, city, state, category, email, website2 } =
    parsed.data;

  // Honeypot tripped — respond as if it succeeded so the bot doesn't
  // learn anything, but skip the real fetch/analysis/DB write entirely.
  if (website2 && website2.trim().length > 0) {
    console.warn("[free-check] honeypot tripped — skipping");
    return NextResponse.json(
      {
        ok: true,
        overallScore: 0,
        checks: [],
        strengths: [],
        problems: [],
        fixes: [],
      },
      { status: 200 },
    );
  }

  console.log(`[free-check] submitted url=${websiteUrl}`);

  // Anything unexpected below (a bug in an analyzer, a dependency load
  // failure, etc.) must never fall through to Next's default HTML error
  // page — the frontend can't parse that and shows a blank generic
  // failure. Always resolve to a categorized JSON error instead.
  try {
    const result = await runFreeCheck({ websiteUrl, businessName, city, state, category });

    if (!result.ok) {
      console.log(`[free-check] failed url=${websiteUrl} reason=${result.error}`);
      await persistSubmission({
        websiteUrl,
        businessName,
        city,
        state,
        category,
        email,
        status: "failed",
        failureReason: result.error,
      });
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 502 },
      );
    }

    console.log(
      `[free-check] completed url=${websiteUrl} score=${result.overallScore}`,
    );

    await persistSubmission({
      websiteUrl,
      businessName,
      city,
      state,
      category,
      email,
      status: "completed",
      overallScore: result.overallScore,
      checks: result.checks,
      strengths: result.strengths,
      problems: result.problems,
      fixes: result.fixes,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error(`[free-check] unhandled error url=${websiteUrl}`, err);
    await persistSubmission({
      websiteUrl,
      businessName,
      city,
      state,
      category,
      email,
      status: "failed",
      failureReason: "unhandled_exception",
    });
    return NextResponse.json(
      { error: "Something went wrong on our end. Please try again in a moment." },
      { status: 500 },
    );
  }
}

async function persistSubmission(args: {
  websiteUrl: string;
  businessName: string;
  city: string;
  state: string;
  category: string;
  email: string;
  status: "completed" | "failed";
  failureReason?: string;
  overallScore?: number;
  checks?: CheckResult[];
  strengths?: string[];
  problems?: string[];
  fixes?: string[];
}): Promise<void> {
  if (!isDatabaseConfigured()) {
    console.warn("[free-check] DATABASE_URL not set — skipping persistence");
    return;
  }
  try {
    await prisma.freeCheckSubmission.create({
      data: {
        websiteUrl: args.websiteUrl,
        businessName: args.businessName,
        city: args.city,
        state: args.state,
        category: args.category,
        email: args.email,
        status: args.status,
        failureReason: args.failureReason,
        overallScore: args.overallScore,
        checks: args.checks,
        strengths: args.strengths,
        problems: args.problems,
        fixes: args.fixes,
      },
    });
  } catch (err) {
    console.error("[free-check] failed to persist submission", err);
  }
}
