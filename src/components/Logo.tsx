import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-white ${className}`}
    >
      <span className="relative flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-accent to-accent-glow shadow-glow">
        <span className="absolute inset-0 rounded-md bg-accent/30 blur-md" />
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="relative h-4 w-4 text-ink-950"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </svg>
      </span>
      <span>
        Geo<span className="text-accent">Viz</span>
      </span>
    </Link>
  );
}
