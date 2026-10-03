import { HomeSection } from "@/components/HomeSection";
import { ProveSnapshot } from "@/components/ProveSnapshot";

const STATES = [
  {
    label: "Verified",
    tone: "border-severity-info/40 text-severity-info",
    body: "Our scanner found the proposed change on your page, and it wasn’t there before the task.",
  },
  {
    label: "Change not found yet",
    tone: "border-severity-warning/40 text-severity-warning",
    body: "We read the page, but the proposed change isn’t there yet. The task stays open.",
  },
  {
    label: "Already on your site",
    tone: "border-white/25 text-white/75",
    body: "The change was present before this task — so it isn’t counted as new progress.",
  },
  {
    label: "Could not verify",
    tone: "border-severity-critical/40 text-severity-critical",
    body: "The page blocked us, couldn’t be reached, or there was no earlier snapshot to compare with. We never guess.",
  },
];

/** §05 Prove — the four real verification outcomes. */
export function HomeProveSection() {
  return (
    <HomeSection
      id="prove"
      index="05"
      eyebrow="Prove"
      title="Verified means checked — not claimed."
      lede={
        <p>
          When a task is marked done, our scanner re-reads the page and compares it with a snapshot taken before the
          change. Then the next monthly measurement shows whether AI answers moved.
        </p>
      }
    >
      <ProveSnapshot />
      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">Every check ends in one of four outcomes</p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATES.map((s) => (
          <li key={s.label} className="rounded-lg border border-white/10 bg-ink-900/60 p-5 transition hover:border-white/20">
            <span className={`inline-block rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${s.tone}`}>{s.label}</span>
            <p className="mt-3 text-[14px] leading-relaxed text-white/65">{s.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-white/50">
        A change on your page doesn’t mean AI systems have picked it up yet, and a later improvement in AI answers doesn’t
        prove one change caused it. We show the evidence and leave the conclusions honest.
      </p>
    </HomeSection>
  );
}
