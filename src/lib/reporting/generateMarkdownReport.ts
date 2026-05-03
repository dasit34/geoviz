import type {
  ActionItem,
  CategoryKey,
  CoreProblem,
  VisibilityReport,
} from "./types";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  clarity: "Clarity (what you do)",
  structure: "Structure (schema markup)",
  content: "Content (H1, headings, copy)",
  local: "Local relevance (geo signals)",
  media: "Media (alt text)",
  trust: "Trust / technical signals",
};

function problemBlock(p: CoreProblem): string {
  const lines: string[] = [];
  lines.push(`### [${p.category.toUpperCase()}] ${p.title}`);
  lines.push("");
  if (p.supportingIssues.length > 0) {
    lines.push("**What we found:**");
    for (const s of p.supportingIssues) {
      lines.push(`- ${s.title} — ${s.detail}`);
    }
    lines.push("");
  }
  lines.push(`**Business impact:** → ${p.businessImpact}`);
  lines.push("");
  lines.push(`**What to fix first:** ${p.fixFirst}`);
  lines.push("");
  return lines.join("\n");
}

function actionLine(item: ActionItem): string {
  return [
    `${item.rank}. **${item.title}** — _${item.tag}_`,
    `   ${item.body}`,
    "",
  ].join("\n");
}

export type MarkdownOptions = {
  /**
   * Include the internal `scoringDebug` JSON block at the bottom. Off by
   * default — customer-facing markdown should not surface raw math.
   */
  includeDebug?: boolean;
};

export function generateMarkdownReport(
  report: VisibilityReport,
  options: MarkdownOptions = {},
): string {
  const lines: string[] = [];

  // 1. Score
  lines.push(`# AI Visibility Report — ${report.businessName}`);
  if (report.websiteUrl) lines.push(`**Site:** ${report.websiteUrl}`);
  lines.push(
    `**Score:** ${report.overallScore} / 100  —  **Status:** ${report.status}`,
  );
  lines.push(`**Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push("");

  // 2. Primary diagnosis
  lines.push("## Primary Diagnosis");
  lines.push(report.primaryDriver);
  if (report.realityCheck) {
    lines.push("");
    lines.push(`> ${report.realityCheck}`);
  }
  if (report.costOfInaction) {
    lines.push("");
    lines.push(`**${report.costOfInaction}**`);
  }
  lines.push("");
  lines.push(report.executiveSummary);
  lines.push("");

  if (report.scoreCap) {
    lines.push(
      `Your score is currently **capped at ${report.scoreCap.capValue}** because ${report.scoreCap.reason}. Fixing this can increase your score by up to **+${report.scoreCap.recoveryPotential} points**.`,
    );
    lines.push("");
  }

  // 3. What this means in real terms
  if (report.realWorldImpact.length > 0) {
    lines.push("## What this means in real terms");
    lines.push("");
    for (const line of report.realWorldImpact) {
      lines.push(`- ${line}`);
    }
    lines.push("");
  }

  // 4. Top 3 reasons
  if (report.top3Reasons.length > 0) {
    lines.push(
      report.overallScore < 70
        ? "## Your score is low primarily because"
        : "## What’s holding your score back",
    );
    lines.push("");
    report.top3Reasons.forEach((reason, i) => {
      lines.push(`${i + 1}. ${reason}`);
    });
    lines.push("");
  }

  // 5. Core problems (Identity, Location, Trust, Content)
  if (report.coreProblems.length > 0) {
    lines.push("## Core Problems");
    lines.push("");
    for (const p of report.coreProblems) lines.push(problemBlock(p));
  }

  // 6. Top fix with projected score lift
  if (report.topFixPreview) {
    lines.push("## Top Fix");
    lines.push(`**${report.topFixPreview.issue}**`);
    lines.push("");
    lines.push(
      `If you fix this, your estimated score becomes: **${report.topFixPreview.projectedScore}** (+${report.topFixPreview.projectedDelta}).`,
    );
    lines.push("");
  }

  // 7. Action plan
  if (report.actionPlan.length > 0) {
    lines.push("## Action Plan");
    lines.push("");
    for (const item of report.actionPlan) lines.push(actionLine(item));
  }

  // 8. Done-for-you offer
  lines.push("---");
  lines.push(`_${report.preOfferLine}_`);
  lines.push("");
  lines.push(`## ${report.upsellSection.title}`);
  lines.push(report.upsellSection.copy);
  lines.push("");
  lines.push(`**${report.upsellSection.offer}**`);
  lines.push("");
  lines.push("Includes:");
  for (const item of report.upsellSection.includes) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  // Methodology footer (still customer-facing — explains the weights)
  lines.push("---");
  lines.push("## How your score is calculated");
  lines.push("");
  for (const w of report.scoringWeights) {
    lines.push(`- ${w.label} — ${w.percent}%`);
  }
  lines.push("");

  if (options.includeDebug) {
    lines.push("---");
    lines.push("## Scoring Debug (internal)");
    lines.push("");
    lines.push("| Category | Score |");
    lines.push("| --- | --- |");
    for (const key of Object.keys(report.categoryScores) as CategoryKey[]) {
      const c = report.categoryScores[key];
      lines.push(`| ${CATEGORY_LABELS[key]} | ${c.score} / ${c.max} |`);
    }
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(report.scoringDebug, null, 2));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}
