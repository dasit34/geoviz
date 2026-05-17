import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

/**
 * Branded 429-style notice rendered by any page server component
 * that has been rate-limited. HTTP status stays 200 (Next.js page
 * components don't have an ergonomic way to set 429 from a server
 * component), but the visual surface clearly tells the user what
 * happened and how long to wait. No report data, no business name,
 * no score, no markdown is ever rendered alongside this notice — the
 * caller short-circuits BEFORE any DB lookup.
 */
export function RateLimitedNotice({
  retryAfterSec,
}: {
  retryAfterSec: number;
}) {
  const waitLabel = formatWait(retryAfterSec);
  return (
    <main>
      <Header />
      <section className="container-page py-24">
        <div className="mx-auto max-w-md rounded-lg border border-amber-300/30 bg-amber-300/[0.06] p-8 text-center">
          <p className="pill border-amber-300/30 bg-amber-300/10 text-amber-200">
            429
          </p>
          <h1 className="h2 mt-4">Too many requests.</h1>
          <p className="muted mt-3 text-sm">
            Please wait a moment and try again.
          </p>
          <p className="mt-4 text-xs text-white/55">
            You can retry in about <strong>{waitLabel}</strong>.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function formatWait(sec: number): string {
  const safe = Math.max(1, Math.ceil(sec));
  if (safe < 60) return `${safe} seconds`;
  const mins = Math.ceil(safe / 60);
  return mins === 1 ? "1 minute" : `${mins} minutes`;
}
