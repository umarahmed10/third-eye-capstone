/** Wald 95% interval for a proportion.
 *
 * Every headline on this page is a rate estimated from a finite sample, and the
 * whole argument of the paper is that this field reports such rates without
 * saying how sure it is. Printing a bare point estimate here would repeat the
 * mistake we are documenting, so nothing is shown without its interval.
 *
 * Wald is adequate at these n (>150 per tier, p away from 0 and 1) and is what
 * the backend reports, so the two agree. It is clamped to [0,1] because Wald
 * can stray outside the unit interval for small n or extreme p.
 */
export function ci95(k: number, n: number): { p: number; lo: number; hi: number; halfWidth: number } | null {
  if (!n || n <= 0) return null;
  const p = k / n;
  const se = Math.sqrt((p * (1 - p)) / n);
  const lo = Math.max(0, p - 1.96 * se);
  const hi = Math.min(1, p + 1.96 * se);
  return { p, lo, hi, halfWidth: 1.96 * se };
}

/** "29.4% [25.7, 33.2]" — the form every rate on the page takes. */
export function fmtCI(k: number, n: number): string {
  const c = ci95(k, n);
  if (!c) return "—";
  return `${(c.p * 100).toFixed(1)}% [${(c.lo * 100).toFixed(1)}, ${(c.hi * 100).toFixed(1)}]`;
}

/** Do two proportions' 95% intervals fail to overlap?
 *  Used to say plainly whether a claimed gap is supported or merely suggested. */
export function separated(k1: number, n1: number, k2: number, n2: number): boolean {
  const a = ci95(k1, n1), b = ci95(k2, n2);
  if (!a || !b) return false;
  return a.hi < b.lo || b.hi < a.lo;
}
