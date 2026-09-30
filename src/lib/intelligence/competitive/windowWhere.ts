/**
 * Shared time-window filter for competitive-metrics queries. Pure —
 * same `windowDays` (and, implicitly, the same wall-clock instant)
 * always produces the same cutoff.
 */
export function windowWhere(windowDays?: number): { observedAt?: { gte: Date } } {
  if (!windowDays || windowDays <= 0) return {};
  const gte = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return { observedAt: { gte } };
}
