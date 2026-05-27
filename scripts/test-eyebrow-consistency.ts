/* eslint-disable no-console */
/**
 * Regression guard: section-eyebrow consistency between
 * `src/components/AuditReportContent.tsx` (customer-facing PDF/print)
 * and `src/components/ReportViewerClient.tsx` (admin preview).
 *
 * Background: prior to commit (this turn), the two renderers
 * hardcoded their own "Section NN · …" strings and disagreed —
 * customers saw "Section 04 · Diagnosis" while admins saw
 * "Section 02 · Diagnosis" for the SAME content. The fix centralized
 * the strings in `src/lib/report-sections.ts`. This script enforces
 * that no future contributor reintroduces hardcoded eyebrow
 * literals in either renderer.
 *
 * Run: `npx tsx scripts/test-eyebrow-consistency.ts`
 * Exit: 0 if both renderers reference only the shared constants;
 *       1 if any hardcoded `"Section <number>"` literal is found.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SECTION_EYEBROWS } from "../src/lib/report-sections";

type Violation = {
  file: string;
  line: number;
  text: string;
};

const RENDERERS = [
  "src/components/AuditReportContent.tsx",
  "src/components/ReportViewerClient.tsx",
];

/**
 * Match a quoted string that begins with "Section " followed by one
 * or more digits (e.g. "Section 02 · Diagnosis"). We intentionally
 * permit non-numeric eyebrows like "Section" (the bare fallback)
 * since those are the constant value itself, not a numbered literal.
 */
const HARDCODED_LITERAL = /["'`]Section\s+\d/;

function findViolations(file: string): Violation[] {
  const abs = resolve(process.cwd(), file);
  const source = readFileSync(abs, "utf8");
  const violations: Violation[] = [];
  source.split("\n").forEach((line, idx) => {
    if (HARDCODED_LITERAL.test(line)) {
      violations.push({ file, line: idx + 1, text: line.trim() });
    }
  });
  return violations;
}

function main() {
  console.log("[eyebrow-consistency] checking renderers…");
  console.log(
    `[eyebrow-consistency] canonical eyebrows: ${Object.keys(SECTION_EYEBROWS).length} entries`,
  );

  const allViolations: Violation[] = [];
  for (const file of RENDERERS) {
    const violations = findViolations(file);
    if (violations.length === 0) {
      console.log(`  ✓ ${file} — clean`);
    } else {
      for (const v of violations) {
        console.error(`  ✗ ${file}:${v.line} — hardcoded literal: ${v.text}`);
        allViolations.push(v);
      }
    }
  }

  if (allViolations.length > 0) {
    console.error(
      `\n[eyebrow-consistency] FAIL — ${allViolations.length} hardcoded "Section N" literal(s) found.`,
    );
    console.error(
      "  Fix: import { SECTION_EYEBROWS } from '@/lib/report-sections'",
    );
    console.error(
      "  and reference the canonical key (e.g. SECTION_EYEBROWS.diagnosis).",
    );
    process.exit(1);
  }

  console.log(
    "\n[eyebrow-consistency] PASS — both renderers source eyebrows from @/lib/report-sections.",
  );
  process.exit(0);
}

main();
