import type { ReactNode } from "react";
import Link from "next/link";

export function InternalShell({
  adminKey,
  children,
}: {
  adminKey: string;
  children: ReactNode;
}) {
  const k = encodeURIComponent(adminKey);
  const nav: Array<{ href: string; label: string }> = [
    { href: `/internal?key=${k}`, label: "Dashboard" },
    { href: `/internal/launch?key=${k}`, label: "Launch QA" },
    { href: `/internal/run?key=${k}`, label: "Run / Bulk" },
    { href: `/admin/reports?key=${k}`, label: "Reports" },
    { href: `/admin/calibration?key=${k}`, label: "Calibration" },
  ];

  return (
    <main className="min-h-screen bg-ink-950 text-white">
      <header className="border-b border-white/10 bg-ink-900/60 backdrop-blur">
        <div className="container-page flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-block h-2 w-2 rounded-full bg-accent shadow-glow" />
            <span className="font-display text-lg tracking-tight">
              GeoViz <span className="text-white/60">Internal</span>
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-white/70 transition hover:bg-white/5 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="pill ml-auto bg-emerald-500/15 text-emerald-300">
            ADMIN_SECRET · ok
          </span>
        </div>
      </header>
      {children}
    </main>
  );
}

export function InternalUnauthorized() {
  return (
    <main className="min-h-screen bg-ink-950 text-white">
      <section className="container-page py-24">
        <p className="section-eyebrow">Internal</p>
        <h1 className="h2 mt-3">Unauthorized</h1>
        <p className="muted mt-3 max-w-xl">
          This console requires the operator key. Append{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm">
            ?key=&lt;ADMIN_SECRET&gt;
          </code>{" "}
          to the URL.
        </p>
      </section>
    </main>
  );
}
