import { InlineProse, Prose } from "@/components/Prose";
import type { EvidenceFinding as EvidenceFindingData } from "@/lib/parse-report";

/**
 * Evidence-based finding card content. Renders the four-block grid
 * (What We Found / Why It Matters / Business Impact / Recommended
 * Fix) when the underlying labeled fields mapped onto the canonical
 * blocks. The caller still wraps this in its own outer card with the
 * title + badges — this is the inner content section only.
 *
 * Pure presentation. Reads `EvidenceFinding` data already prepared
 * by `toEvidenceFinding()` in `src/lib/parse-report.ts`. Does not
 * touch scoring.
 */
export function EvidenceFinding({
  evidence,
}: {
  evidence: EvidenceFindingData;
}) {
  const populated = evidence.blocks.filter((b) => b.content.length > 0);
  if (populated.length === 0) return null;

  return (
    <div className="mt-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        {populated.map((b) => (
          <div
            key={b.key}
            className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-3"
          >
            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              {b.label}
            </dt>
            <dd className="mt-2 text-[13px] leading-relaxed text-white/80">
              <InlineProse>{b.content}</InlineProse>
            </dd>
          </div>
        ))}
      </dl>
      {evidence.rest.length > 0 ? (
        <div className="mt-3 rounded-md border border-white/[0.05] bg-white/[0.01] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Additional detail
          </p>
          <dl className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-white/70">
            {evidence.rest.map((f, i) => (
              <div key={`${f.label}-${i}`}>
                <dt className="inline text-white/55">{f.label}: </dt>
                <dd className="inline">
                  <InlineProse>{f.content}</InlineProse>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Fallback renderer for when a finding doesn't have any of the
 * canonical four blocks. Renders the raw body as a single
 * "What We Found" panel so the customer never sees an empty card.
 */
export function EvidenceFindingFallback({
  body,
}: {
  body: string;
}) {
  if (!body.trim()) return null;
  return (
    <div className="mt-4 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
        What We Found
      </p>
      <Prose className="mt-2 text-[13px] leading-relaxed text-white/80">
        {body}
      </Prose>
    </div>
  );
}
