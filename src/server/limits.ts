export const LIMITS = {
  humansPerRoom: 16,
  socketsPerIp: 8,
  joinTimeoutMs: 10_000,
  messagesPerSec: 60,
  messageBurst: 120,
  authPerMin: 10,
};
export type Limits = typeof LIMITS;

type Bucket = { tokens: number; at: number };

export function makeBucket(perSec: number, burst: number) {
  const b: Bucket = { tokens: burst, at: -Infinity };
  return (now: number): boolean => {
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSec);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  };
}

export function makeKeyedLimiter(perSec: number, burst: number) {
  const buckets = new Map<string, { take: (now: number) => boolean; fullAt: number }>();
  return (key: string, now: number): boolean => {
    for (const [k, v] of buckets) if (v.fullAt <= now) buckets.delete(k);
    const entry = buckets.get(key) ?? { take: makeBucket(perSec, burst), fullAt: 0 };
    buckets.set(key, entry);
    const ok = entry.take(now);
    entry.fullAt = now + (burst / perSec) * 1000;
    return ok;
  };
}
