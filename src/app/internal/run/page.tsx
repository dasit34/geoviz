import Link from "next/link";
import { isValidAdminKey } from "@/lib/admin-secret";
import { RunAuditForm } from "@/components/internal/RunAuditForm";
import {
  InternalShell,
  InternalUnauthorized,
} from "@/components/internal/InternalShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Run / Bulk · Internal · GeoViz",
  robots: { index: false, follow: false },
};

export default function InternalRunPage({
  searchParams,
}: {
  searchParams?: { key?: string | string[] };
}) {
  const rawKey = searchParams?.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!isValidAdminKey(key)) {
    return <InternalUnauthorized />;
  }
  const adminKey = key as string;
  const k = encodeURIComponent(adminKey);

  return (
    <InternalShell adminKey={adminKey}>
    <section className="container-page py-10">
      <header className="mb-8">
        <p className="section-eyebrow">Operator console · Run / Bulk</p>
        <h1 className="h2 mt-3">Queue a test audit</h1>
        <p className="muted mt-3 max-w-2xl">
          Queues one or many URLs through the same worker pipeline as paid
          customer audits — no Stripe required. New rows land tagged
          <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">
            [CAL]
          </code>
          so they stay out of customer triage. The worker claims them within
          ~12 seconds.
        </p>
      </header>

      <RunAuditForm adminKey={adminKey} />

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link
          href={`/internal?key=${k}`}
          className="text-accent hover:underline"
        >
          ← Back to dashboard
        </Link>
        <Link
          href={`/admin/calibration?key=${k}`}
          className="text-white/60 hover:text-white"
        >
          Open calibration table →
        </Link>
      </div>
    </section>
    </InternalShell>
  );
}
