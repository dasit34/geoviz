"use client";

import { useEffect } from "react";

/**
 * RevealOnView — subtle on-enter section reveal.
 *
 * Pure side-effect, renders null. One IntersectionObserver watches
 * every [data-reveal] element and flips data-revealed="true" the
 * first time it enters the viewport. CSS rules in globals.css
 * fade + translateY the element from 12px → 0 over 600ms.
 *
 * Once revealed, the observer stops watching that element — the
 * reveal happens exactly once per element per page load.
 *
 * Reduced-motion users skip the animation entirely; the CSS
 * @media (prefers-reduced-motion: reduce) rule sets the revealed
 * state immediately with no transition.
 */
export function RevealOnView() {
  useEffect(() => {
    const els =
      document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.revealed = "true";
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );

    els.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return null;
}
