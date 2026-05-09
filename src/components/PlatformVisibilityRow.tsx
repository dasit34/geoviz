import type { PlatformStatus } from "@/lib/parse-report";

/**
 * One row in the Platform Visibility section. Always renders for the
 * four canonical platforms (ChatGPT / Claude / Gemini / Perplexity).
 * The label comes from `derivePlatformVisibility` which composes a
 * meaningful tier-tagged phrase per platform — explicit-block override
 * from the audit prose, otherwise score-derived from each platform's
 * primary-lens rubric pair. Never placeholder copy; always a
 * 3–8-word executive-tone summary.
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
