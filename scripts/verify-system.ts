/* eslint-disable no-console */
/**
 * GeoViz end-to-end system verification.
 *
 * Run with: npm run verify
 *
 * Steps:
 *   A. Validate environment variables.
 *   B. Verify Prisma + Postgres connectivity and schema.
 *   C. Verify Resend email sending.
 *   D. Verify Anthropic API.
 *   E. Smoke-test the report generator.
 *
 * Exits with code 1 if any step fails.
 */
import "dotenv/config";

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

import { checkServerEnv } from "../src/lib/env";
import { generateVisibilityReport } from "../src/lib/reporting/generateVisibilityReport";
import { integrityHomeExteriorsAudit } from "../src/lib/reporting/sampleAudit";

type StepResult = { name: string; ok: boolean; detail: string };

const results: StepResult[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`${tag} ${name} — ${detail}`);
}

async function step(name: string, fn: () => Promise<string>): Promise<void> {
  process.stdout.write(`… ${name}\n`);
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record(name, false, message);
  }
}

async function checkEnv(): Promise<string> {
  const result = checkServerEnv();
  if (!result.ok) {
    throw new Error(`invalid env: ${result.errors.join("; ")}`);
  }
  return "all required variables present";
}

async function checkDatabase(): Promise<string> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    try {
      const count = await prisma.auditOrder.count();
      return `connected, AuditOrder rows: ${count}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `connected, but AuditOrder table not found (${msg.split("\n")[0]}). Run: npx prisma db push`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function checkResend(): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.EMAIL_TO;
  if (!apiKey || !from || !to) {
    throw new Error("RESEND_API_KEY / EMAIL_FROM / EMAIL_TO missing");
  }
  // Email sending is off by default. Only fire when explicitly opted in,
  // either via SEND_EMAILS=true or an explicit --email-test flag on the
  // verify command. Without one of these, we just confirm the credentials
  // are wired up and report skipped.
  const allowSend =
    process.env.SEND_EMAILS === "true" ||
    process.argv.includes("--email-test");
  if (!allowSend) {
    return `credentials present, send skipped (set SEND_EMAILS=true or pass --email-test to actually send)`;
  }
  const resend = new Resend(apiKey);
  const sent = await resend.emails.send({
    from,
    to,
    subject: "GeoViz system check",
    text: "This is the GeoViz verify-system test email. If you received this, Resend is wired up correctly.",
  });
  if (sent.error) {
    throw new Error(`${sent.error.name}: ${sent.error.message}`);
  }
  return `sent to ${to}, id=${sent.data?.id ?? "unknown"}`;
}

async function checkAnthropic(): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 64,
    messages: [{ role: "user", content: "Say hello from GeoViz" }],
  });
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) throw new Error("Anthropic returned no text");
  return `${response.model} responded: "${text}"`;
}

async function checkReportGenerator(): Promise<string> {
  const report = generateVisibilityReport(integrityHomeExteriorsAudit);
  if (typeof report.overallScore !== "number") {
    throw new Error("overallScore is not a number");
  }
  if (report.overallScore < 0 || report.overallScore > 100) {
    throw new Error(`overallScore out of range: ${report.overallScore}`);
  }
  if (report.coreProblems.length === 0) {
    throw new Error("coreProblems is empty for the Integrity sample");
  }
  if (report.actionPlan.length === 0) {
    throw new Error("actionPlan is empty for the Integrity sample");
  }
  if (!report.upsellSection.offer.includes("$497")) {
    throw new Error("upsell offer does not contain $497");
  }
  const cs = report.categoryScores;
  const expectedKeys = ["clarity", "structure", "content", "local", "media", "trust"] as const;
  for (const key of expectedKeys) {
    if (!cs[key] || typeof cs[key].score !== "number") {
      throw new Error(`categoryScores.${key} is missing or malformed`);
    }
  }
  if (!report.scoringDebug || typeof report.scoringDebug.totalImages !== "number") {
    throw new Error("scoringDebug missing");
  }
  const sumOfCategories =
    cs.clarity.score +
    cs.structure.score +
    cs.content.score +
    cs.local.score +
    cs.media.score +
    cs.trust.score;
  // overallScore is fully deterministic (no randomBuffer applied) — the
  // scoring pipeline applies a contribution penalty + soft/hard caps, so the
  // final must always be ≤ baseScore and never exceed 100.
  if (report.overallScore > sumOfCategories) {
    throw new Error(
      `overallScore (${report.overallScore}) exceeds sum of categories (${sumOfCategories}) — pipeline should never increase score`,
    );
  }
  if (!Array.isArray(report.scoreExplanation) || report.scoreExplanation.length === 0) {
    throw new Error("scoreExplanation is missing or empty");
  }
  if (report.scoreExplanation.length > 5) {
    throw new Error(`scoreExplanation has ${report.scoreExplanation.length} bullets (max 5)`);
  }
  for (const item of report.scoreExplanation) {
    if (!item || typeof item.label !== "string" || typeof item.impact !== "number") {
      throw new Error("scoreExplanation item missing label or impact");
    }
    if (item.label.length < 30) {
      throw new Error(
        `scoreExplanation label too short to be a consultant insight: "${item.label}"`,
      );
    }
  }
  if (typeof report.primaryDriver !== "string" || report.primaryDriver.length < 30) {
    throw new Error(
      `primaryDriver is missing or too short to be a sentence: "${report.primaryDriver}"`,
    );
  }
  if (
    report.realityCheck !== null &&
    (typeof report.realityCheck !== "string" || report.realityCheck.length === 0)
  ) {
    throw new Error("realityCheck must be either null or a non-empty string");
  }
  if (!Array.isArray(report.scoringWeights) || report.scoringWeights.length !== 6) {
    throw new Error("scoringWeights must list all 6 categories");
  }
  if (!Array.isArray(report.realWorldImpact) || report.realWorldImpact.length === 0) {
    throw new Error("realWorldImpact is missing or empty");
  }
  if (report.realWorldImpact.length > 3) {
    throw new Error(`realWorldImpact has ${report.realWorldImpact.length} bullets (max 3)`);
  }
  if (!Array.isArray(report.top3Reasons) || report.top3Reasons.length !== 3) {
    throw new Error(
      `top3Reasons must have exactly 3 entries (got ${report.top3Reasons?.length ?? 0})`,
    );
  }
  const allowedProblemIds = new Set(["identity", "location", "trust", "content"]);
  const allowedCategories = new Set(["Identity", "Location", "Trust", "Content"]);
  for (const p of report.coreProblems) {
    if (typeof p.businessImpact !== "string" || p.businessImpact.length < 20) {
      throw new Error(`coreProblem "${p.title}" missing or short businessImpact`);
    }
    if (typeof p.fixFirst !== "string" || p.fixFirst.length < 20) {
      throw new Error(`coreProblem "${p.title}" missing or short fixFirst`);
    }
    if (!allowedProblemIds.has(p.id)) {
      throw new Error(`coreProblem id "${p.id}" not in {identity, location, trust, content}`);
    }
    if (!allowedCategories.has(p.category)) {
      throw new Error(
        `coreProblem.category "${p.category}" must be one of Identity/Location/Trust/Content`,
      );
    }
  }
  return `score=${report.overallScore}/100 (${report.status}), top3Reasons=${report.top3Reasons.length}, realWorld=${report.realWorldImpact.length}, problems=[${report.coreProblems.map((p) => p.id).join(",")}], cap=${report.scoreCap?.capValue ?? "none"}, topFix=${report.topFixPreview ? `+${report.topFixPreview.projectedDelta}→${report.topFixPreview.projectedScore}` : "none"}`;
}

async function main(): Promise<void> {
  console.log("\nGeoViz system verification\n");
  await step("env", checkEnv);
  await step("database", checkDatabase);
  await step("resend", checkResend);
  await step("anthropic", checkAnthropic);
  await step("report-generator", checkReportGenerator);

  const failed = results.filter((r) => !r.ok);
  console.log("");
  if (failed.length === 0) {
    console.log(`\x1b[32mAll ${results.length} checks passed.\x1b[0m\n`);
    process.exit(0);
  }
  console.log(
    `\x1b[31m${failed.length} of ${results.length} checks failed.\x1b[0m`,
  );
  for (const r of failed) console.log(`  - ${r.name}: ${r.detail}`);
  console.log("");
  process.exit(1);
}

main().catch((err) => {
  console.error("[verify] unexpected fatal error:", err);
  process.exit(1);
});
