/**
 * apiKey.ts — robust env-key reader for the AI validators.
 *
 * A stray trailing space / newline on a Railway secret (e.g. a key pasted with
 * a line break) must never reach a provider auth header — some providers reject
 * the malformed header (→ silent "failed"), and a whitespace-only value must
 * read as MISSING, not as a present-but-doomed key. Always read provider keys
 * through this so the value is trimmed at the source.
 */
export function readApiKey(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
