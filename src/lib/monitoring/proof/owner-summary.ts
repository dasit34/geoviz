/**
 * Proof Engine v1 — the monthly owner summary.
 *
 * A short, plain-English summary built ONLY from stored measurements,
 * improvement tasks and experiments. It never adds rankings, percentiles,
 * industry averages or any number that isn't counted from stored rows.
 * Rendered as text for the dashboard and admin view; nothing is emailed.
 */
import { compareMeasurements, type CycleSnapshot } from "./compare";
import { OUTCOME_LABELS, type ExperimentOutcome } from "./experiment";
import { PROVIDER_LABELS } from "./evidence";
import type { QuestionIntent } from "./question-set";

export const OWNER_SUMMARY_VERSION = "owner-summary@1.0.0";

export type SummaryQuestion = { trackedPromptId: string; text: string; intent: QuestionIntent | null };

export type OwnerSummary = {
  version: string;
  businessName: string;
  period: { from: Date; to: Date };
  measuredAnswers: number;
  improved: string[];
  declined: string[];
  comparisonNote: string | null;
  topCompetitors: Array<{ name: string; answers: number }>;
  accuracyIssues: string[];
  sources: { customerSiteCited: number; topDomains: Array<{ domain: string; answers: number }>; gaps: string[] };
  priorityActions: Array<{ title: string; action: string }>;
  previousActions: Array<{ title: string; status: string; outcome: string | null }>;
  limitations: string[];
};

const STATUS_LABELS: Record<string, string> = {
  suggested: "Suggested",
  approved: "Approved",
  in_progress: "In progress",
  implemented: "Implemented — being checked",
  verified: "Verified on the website",
  dismissed: "Dismissed",
};

export function buildOwnerSummary(args: {
  businessName: string;
  customerDomain: string | null;
  period: { from: Date; to: Date };
  current: CycleSnapshot | null;
  previous: CycleSnapshot | null;
  questions: SummaryQuestion[];
  competitorNames: Record<string, string>;
  recommendations: Array<{ title: string; action: string }>;
  tasks: Array<{ id: string; title: string; status: string }>;
  experiments: Array<{ improvementTaskId: string; outcome: ExperimentOutcome | null }>;
}): OwnerSummary {
  const qText = new Map(args.questions.map((q) => [q.trackedPromptId, q]));
  const label = (p: string) => PROVIDER_LABELS[p] ?? p;
  const measured = (args.current?.results ?? []).filter((r) => r.status === "measured");
  const limitations: string[] = [
    "Results come from the AI providers' APIs (web search on where supported). API answers are not identical to the consumer ChatGPT, Claude, Gemini or Perplexity apps, and they vary from run to run.",
    "Changes listed here were observed between measurements; they don't show what caused them.",
  ];

  if (!args.current) {
    return {
      version: OWNER_SUMMARY_VERSION, businessName: args.businessName, period: args.period, measuredAnswers: 0,
      improved: [], declined: [], comparisonNote: "No measurement has been taken yet.", topCompetitors: [], accuracyIssues: [],
      sources: { customerSiteCited: 0, topDomains: [], gaps: [] },
      priorityActions: args.recommendations.slice(0, 3), previousActions: previous(args), limitations,
    };
  }

  // Improved / declined: comparable pairs only.
  const improved: string[] = [];
  const declined: string[] = [];
  let comparisonNote: string | null = null;
  if (args.previous) {
    const cmp = compareMeasurements(args.previous, args.current, args.customerDomain);
    if (cmp.comparable) {
      for (const g of cmp.pairs.gainedMentions) improved.push(`Now named by ${label(g.provider)} for "${qText.get(g.trackedPromptId)?.text ?? "a tracked question"}".`);
      for (const l of cmp.pairs.lostMentions) declined.push(`No longer named by ${label(l.provider)} for "${qText.get(l.trackedPromptId)?.text ?? "a tracked question"}".`);
    } else {
      comparisonNote = `Not compared with the previous measurement: ${cmp.reasons.join("; ")}.`;
    }
  } else {
    comparisonNote = "This is the first measurement, so there's nothing earlier to compare with.";
  }

  // Competitors that appeared most often (counted answers).
  const counts = new Map<string, number>();
  for (const r of measured) for (const id of new Set(r.competitorIdsMentioned)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const topCompetitors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, answers]) => ({ name: args.competitorNames[id] ?? id, answers }));

  // Branded-accuracy answers that didn't identify the business.
  const accuracyIssues: string[] = [];
  for (const r of measured) {
    const q = qText.get(r.trackedPromptId);
    if (q?.intent === "branded_accuracy" && r.mentioned === false) {
      accuracyIssues.push(`${label(r.provider)} answered "${q.text}" without identifying the business${r.namedBusinesses[0] ? ` (it named ${r.namedBusinesses[0]})` : ""}.`);
    }
  }
  if (accuracyIssues.length === 0 && !args.questions.some((q) => q.intent === "branded_accuracy")) {
    limitations.push("No branded-accuracy questions are tracked, so incorrect descriptions of the business can't be checked yet.");
  }
  limitations.push("Factual details in answers (address, services, prices) aren't yet checked against your confirmed business facts.");

  // Sources the providers returned.
  const domainCounts = new Map<string, number>();
  let customerSiteCited = 0;
  for (const r of measured) {
    const ds = new Set(r.nativeCitationDomains);
    for (const d of ds) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    if (args.customerDomain && [...ds].some((d) => d === args.customerDomain || d.endsWith(`.${args.customerDomain}`))) customerSiteCited += 1;
  }
  const topDomains = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([domain, answers]) => ({ domain, answers }));
  const gaps: string[] = [];
  if (measured.length > 0 && customerSiteCited === 0) gaps.push("Your own website wasn't returned as a source in any measured answer.");
  const withSources = measured.filter((r) => r.nativeCitationDomains.length > 0).length;
  if (measured.length > 0 && withSources < measured.length) gaps.push(`${measured.length - withSources} of ${measured.length} measured answers came with no source from the provider.`);

  // Provider failures.
  const notMeasured = (args.current.results ?? []).filter((r) => r.status !== "measured");
  if (notMeasured.length > 0) {
    const byProvider = new Map<string, number>();
    for (const r of notMeasured) byProvider.set(r.provider, (byProvider.get(r.provider) ?? 0) + 1);
    limitations.push(`${notMeasured.length} answer(s) couldn't be measured (${[...byProvider.entries()].map(([p, n]) => `${label(p)}: ${n}`).join(", ")}). They're excluded from every rate above — never counted as "not named".`);
  }

  return {
    version: OWNER_SUMMARY_VERSION,
    businessName: args.businessName,
    period: args.period,
    measuredAnswers: measured.length,
    improved,
    declined,
    comparisonNote,
    topCompetitors,
    accuracyIssues: accuracyIssues.slice(0, 6),
    sources: { customerSiteCited, topDomains, gaps },
    priorityActions: args.recommendations.slice(0, 3),
    previousActions: previous(args),
    limitations,
  };
}

function previous(args: { tasks: Array<{ id: string; title: string; status: string }>; experiments: Array<{ improvementTaskId: string; outcome: ExperimentOutcome | null }> }) {
  const outcomeByTask = new Map(args.experiments.map((e) => [e.improvementTaskId, e.outcome]));
  return args.tasks
    .filter((t) => t.status !== "suggested")
    .slice(0, 8)
    .map((t) => {
      const o = outcomeByTask.get(t.id) ?? null;
      return { title: t.title, status: STATUS_LABELS[t.status] ?? t.status, outcome: o ? OUTCOME_LABELS[o] : null };
    });
}

/** Plain-text rendering (dashboard / admin copy). */
export function ownerSummaryText(s: OwnerSummary): string {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const list = (items: string[], empty: string) => (items.length ? items.map((i) => `- ${i}`).join("\n") : `- ${empty}`);
  return [
    `AI visibility summary — ${s.businessName} (${d(s.period.from)} to ${d(s.period.to)})`,
    `Measured answers: ${s.measuredAnswers}`,
    "",
    "What improved",
    list(s.improved, s.comparisonNote ?? "Nothing measurably improved."),
    "",
    "What declined",
    list(s.declined, s.comparisonNote ?? "Nothing measurably declined."),
    "",
    "Competitors that appeared most often",
    list(s.topCompetitors.map((c) => `${c.name} — named in ${c.answers} answer(s)`), "No tracked competitor was named."),
    "",
    "What AI said incorrectly or couldn't verify",
    list(s.accuracyIssues, "No branded answer failed to identify the business."),
    "",
    "Sources and citation gaps",
    list([
      `Your website was returned as a source in ${s.sources.customerSiteCited} answer(s).`,
      ...s.sources.topDomains.map((t) => `${t.domain} — returned as a source in ${t.answers} answer(s)`),
      ...s.sources.gaps,
    ], "No sources were returned."),
    "",
    "Top three actions",
    list(s.priorityActions.map((a) => `${a.title}: ${a.action}`), "No new actions this month."),
    "",
    "Status of earlier actions",
    list(s.previousActions.map((a) => `${a.title} — ${a.status}${a.outcome ? ` (${a.outcome})` : ""}`), "No earlier actions."),
    "",
    "Limitations",
    list(s.limitations, ""),
  ].join("\n");
}
