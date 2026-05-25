/**
 * BeforeAfterIntelligence — homepage section visual contrasting a
 * fragmented business (AI can't assemble a coherent, trustworthy
 * entity) with a resolved one (machine-readable, recommendation
 * ready). The copy arrays are owned by the page (single source of
 * truth); this component renders the structure + an illustrative
 * state motif. The motif is schematic/illustrative, not data.
 *
 * Tokens only: white/opacity for the fragmented state, the resolved
 * node is the lone accent focal of this section.
 */

function FragmentedMotif() {
  // scattered, unconnected fragments — no resolvable entity
  return (
    <svg viewBox="0 0 200 96" aria-hidden className="h-16 w-full" fill="none">
      <g className="text-white/20" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M22 26h26" />
        <path d="M150 22h28" />
        <path d="M30 70h22" />
        <path d="M120 74h34" />
        <path d="M70 48h18" />
      </g>
      <g className="fill-white/15">
        <circle cx="60" cy="26" r="2.5" />
        <circle cx="140" cy="22" r="2.5" />
        <circle cx="64" cy="70" r="2.5" />
        <circle cx="108" cy="74" r="2.5" />
        <circle cx="100" cy="48" r="2.5" />
      </g>
    </svg>
  );
}

function ResolvedMotif() {
  // fragments resolved into one entity node
  return (
    <svg viewBox="0 0 200 96" aria-hidden className="h-16 w-full" fill="none">
      <g className="text-accent/40" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
        <path d="M30 26 96 48" />
        <path d="M34 70 96 48" />
        <path d="M168 24 104 48" />
        <path d="M150 74 104 48" />
      </g>
      <g className="fill-white/25">
        <circle cx="28" cy="26" r="2.5" />
        <circle cx="32" cy="70" r="2.5" />
        <circle cx="170" cy="24" r="2.5" />
        <circle cx="152" cy="74" r="2.5" />
      </g>
      <circle cx="100" cy="48" r="6" className="fill-accent" />
    </svg>
  );
}

export function BeforeAfterIntelligence({
  before,
  after,
  className = "",
}: {
  before: string[];
  after: string[];
  className?: string;
}) {
  return (
    <div className={`grid gap-12 md:grid-cols-2 md:gap-0 ${className}`}>
      <div className="md:pr-14">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-white/40">
          Before — fragmented
        </p>
        <div className="mt-6">
          <FragmentedMotif />
        </div>
        <p className="mt-6 text-lg leading-relaxed text-white/55">
          AI sees scattered, unverifiable pieces. There isn't enough it
          can trust, so it recommends a competitor instead.
        </p>
        <ul className="mt-7 space-y-3 text-sm text-white/55">
          {before.map((p) => (
            <li key={p} className="flex gap-3">
              <span aria-hidden className="text-white/25">
                —
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="md:border-l md:border-white/10 md:pl-14">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          After — machine-readable
        </p>
        <div className="mt-6">
          <ResolvedMotif />
        </div>
        <p className="mt-6 text-lg leading-relaxed text-white/80">
          AI resolves one clear, trusted business it can confidently put
          in front of a customer.
        </p>
        <ul className="mt-7 space-y-3 text-sm text-white/80">
          {after.map((p) => (
            <li key={p} className="flex gap-3">
              <span aria-hidden className="text-accent">
                →
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
