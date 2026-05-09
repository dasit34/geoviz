import type { PlatformStatus } from "@/lib/parse-report";

/**
 * One row in the Platform Visibility section. Always renders for the
 * four canonical platforms (ChatGPT / Claude / Gemini / Perplexity)
 * regardless of whether the audit surfaced a per-platform signal —
 * `derivePlatformVisibility` returns "Insufficient signal detected."
 * for any platform without a hit, so the section template stays
 * identical across reports.
 */
export function PlatformVisibilityRow({ status }: { status: PlatformStatus }) {
  return (
    <div className={`platform-row platform-tone-${status.tone}`}>
      <div className="platform-row-name">
        <span className="platform-row-marker" aria-hidden />
        <span>{status.platform}</span>
      </div>
      <span className={`platform-row-badge platform-row-badge-${status.tone}`}>
        {status.label}
      </span>
    </div>
  );
}
