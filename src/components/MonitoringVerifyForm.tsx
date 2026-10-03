"use client";

import { useEffect, useState } from "react";

/**
 * Reads the sign-in secret from the URL fragment, removes it from the
 * address bar (so it isn't left in history or copied with the URL), and
 * submits it only when the person presses Continue.
 */
export function MonitoringVerifyForm() {
  const [secret, setSecret] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const match = /(?:^#|&)t=([A-Za-z0-9_-]{43})(?:&|$)/.exec(window.location.hash);
    setSecret(match ? match[1]! : null);
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setReady(true);
  }, []);

  if (!ready) return <p className="muted mt-3 text-sm">Checking your link…</p>;

  if (!secret) {
    return (
      <div className="mt-3">
        <p className="muted text-sm">This sign-in link is incomplete. Request a new one to continue.</p>
        <a href="/monitoring/sign-in" className="btn-primary mt-6 inline-block">Get a new sign-in link</a>
      </div>
    );
  }

  return (
    <form action="/api/monitoring/auth/verify" method="POST" className="mt-3">
      <p className="muted text-sm">Press Continue to sign in to your AI visibility monitoring.</p>
      <input type="hidden" name="t" value={secret} />
      <button type="submit" className="btn-primary mt-6 w-full">Continue</button>
    </form>
  );
}
