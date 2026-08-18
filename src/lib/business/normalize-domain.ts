/**
 * Canonical business-identity key derived from a raw website URL.
 *
 * Mirrors the URL-parsing approach already established in
 * `src/lib/intelligence/resolve-business-name.ts`'s `fromDomain()` —
 * prepend a protocol when absent, parse with the native `URL` class
 * (not regex), strip a leading `www.` only. This module exists
 * separately because that function's purpose is a display-name
 * fallback; this one is an identity key used for DB lookups/joins and
 * must stay a pure, deterministic string transform — no guessing.
 *
 * Deliberately conservative with subdomains: only `www.` is treated as
 * a non-meaningful alias. `shop.example.com` and `example.com` are
 * different businesses as far as this function is concerned, unless a
 * future caller decides otherwise explicitly.
 */
export function normalizeDomain(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const hasProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed);
    const parsed = new URL(hasProtocol ? trimmed : `https://${trimmed}`);

    let host = parsed.hostname.toLowerCase();
    host = host.replace(/\.$/, ""); // strip a trailing dot (FQDN edge case)
    host = host.replace(/^www\./, ""); // strip leading www only — not arbitrary subdomains

    // Reject bare tokens ("localhost", a stray word with no dot) —
    // deterministic rejection, never a guess at what domain was meant.
    if (!host.includes(".")) return null;

    return host;
  } catch {
    return null;
  }
}
