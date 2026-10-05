export type TrailPoint = { x: number; y: number; at: number; walked: number; dashing: boolean };

export const TRAIL = { lifeMs: 900, step: 6, jump: 160, cap: 48, dash: 18, gap: 14 } as const;

type TrailDash = { x0: number; y0: number; x1: number; y1: number; fade: number; dashing: boolean };

export function recordTrail(trail: TrailPoint[], x: number, y: number, now: number, dashing: boolean) {
  while (trail.length && now - trail[0]!.at >= TRAIL.lifeMs) trail.shift();
  const last = trail.at(-1);
  if (!last) { trail.push({ x, y, at: now, walked: 0, dashing }); return; }
  const moved = Math.hypot(x - last.x, y - last.y);
  if (moved > TRAIL.jump) { trail.length = 0; trail.push({ x, y, at: now, walked: 0, dashing }); return; }
  if (moved < TRAIL.step) return;
  trail.push({ x, y, at: now, walked: last.walked + moved, dashing });
  if (trail.length > TRAIL.cap) trail.shift();
}

export function trailDashes(trail: readonly TrailPoint[], now: number): TrailDash[] {
  const out: TrailDash[] = [];
  const period = TRAIL.dash + TRAIL.gap;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!, b = trail[i]!;
    const fade = 1 - (now - a.at) / TRAIL.lifeMs;
    if (fade <= 0) continue;
    if (b.dashing) { out.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, fade, dashing: true }); continue; }
    const len = b.walked - a.walked;
    const at = (d: number) => ({ x: a.x + ((b.x - a.x) * (d - a.walked)) / len, y: a.y + ((b.y - a.y) * (d - a.walked)) / len });
    for (let start = Math.floor(a.walked / period) * period; start < b.walked; start += period) {
      const from = Math.max(a.walked, start), to = Math.min(b.walked, start + TRAIL.dash);
      if (to <= from) continue;
      const p = at(from), q = at(to);
      out.push({ x0: p.x, y0: p.y, x1: q.x, y1: q.y, fade, dashing: false });
    }
  }
  return out;
}
