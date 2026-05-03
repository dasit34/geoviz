type ScoreState = "at-risk" | "healthy" | "strong";

const STATE_LABEL: Record<ScoreState, string> = {
  "at-risk": "At Risk",
  healthy: "Healthy",
  strong: "Strong",
};

const STATE_COLOR: Record<ScoreState, string> = {
  "at-risk": "text-accent",
  healthy: "text-amber-300",
  strong: "text-emerald-300",
};

export function ReportPreview({
  score = 42,
  state = "at-risk",
}: {
  score?: number;
  state?: ScoreState;
}) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  return (
    <div className="card relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-grid-fade opacity-70" />
      <div className="flex items-start justify-between">
        <div>
          <p className="pill">AI Visibility Report</p>
          <h3 className="mt-3 text-lg font-semibold text-white">
            yourbusiness.com
          </h3>
          <p className="text-xs text-white/50">
            Audit run · ChatGPT · Claude · Perplexity · Gemini
          </p>
        </div>
        <span className={`text-xs font-semibold ${STATE_COLOR[state]}`}>
          {STATE_LABEL[state]}
        </span>
      </div>

      <div className="mt-6 flex items-center gap-6">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
            <circle
              cx="70"
              cy="70"
              r={radius}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="10"
              fill="none"
            />
            <circle
              cx="70"
              cy="70"
              r={radius}
              stroke="url(#scoreGrad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              fill="none"
            />
            <defs>
              <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff7a18" />
                <stop offset="100%" stopColor="#ff9a3c" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-white">{score}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              of 100
            </span>
          </div>
        </div>

        <ul className="space-y-2 text-sm text-white/75">
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseSoft" />
            Missing structured data
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Weak service clarity
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            No FAQ structure
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Limited authority signals
          </li>
        </ul>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <Stat label="Crawlers" value="2 / 5" />
        <Stat label="Schema" value="Partial" />
        <Stat label="Citability" value="Low" />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
