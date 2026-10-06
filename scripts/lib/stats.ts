const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);

export function median(xs: readonly number[]): number {
  const s = sorted(xs);
  const mid = s.length / 2;
  return s.length === 0 ? NaN : s.length % 2 ? s[Math.floor(mid)]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function quantile(xs: readonly number[], q: number): number {
  const s = sorted(xs);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : NaN;
}

export const pct = (n: number, total: number, digits = 1) => `${((100 * n) / Math.max(1, total)).toFixed(digits)}%`;

export const sec = (ms: number) => (Number.isFinite(ms) ? (ms / 1000).toFixed(1) : '-');
