/** Where a body has been, sampled from where it was drawn. `d` is the distance walked up to the point, so dashes keep their place on the floor while the body moves on. */
export type TrailPoint = { x: number; y: number; at: number; d: number; dashing: boolean };

/** `step` is the least travel worth a new point; a jump past `jump` (a respawn) starts the trail over. Lengths are world units. */
export const TRAIL = { lifeMs: 900, step: 6, jump: 160, cap: 48, dash: 18, gap: 14 } as const;

/** One dash on the floor, `fade` 1 when fresh and 0 when gone; `dashing` marks a stretch covered by the dash ability. */
type TrailDash = { x0: number; y0: number; x1: number; y1: number; fade: number; dashing: boolean };

/** Adds where the body is now and drops what has faded, keeping at most `TRAIL.cap` points. */
export function recordTrail(trail: TrailPoint[], x: number, y: number, now: number, dashing: boolean) {
  while (trail.length && now - trail[0]!.at >= TRAIL.lifeMs) trail.shift();
  const last = trail.at(-1);
  if (!last) { trail.push({ x, y, at: now, d: 0, dashing }); return; }
  const moved = Math.hypot(x - last.x, y - last.y);
  if (moved > TRAIL.jump) { trail.length = 0; trail.push({ x, y, at: now, d: 0, dashing }); return; }
  if (moved < TRAIL.step) return;
  trail.push({ x, y, at: now, d: last.d + moved, dashing });
  if (trail.length > TRAIL.cap) trail.shift();
}

/** The dashes along the trail: on for `TRAIL.dash` of every `dash + gap` walked, each fading with the age of the ground it lies on. */
export function trailDashes(trail: readonly TrailPoint[], now: number): TrailDash[] {
  const out: TrailDash[] = [];
  const period = TRAIL.dash + TRAIL.gap;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!, b = trail[i]!;
    const fade = 1 - (now - a.at) / TRAIL.lifeMs;
    if (fade <= 0) continue;
    if (b.dashing) { out.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, fade, dashing: true }); continue; }
    const len = b.d - a.d;
    const at = (d: number) => ({ x: a.x + ((b.x - a.x) * (d - a.d)) / len, y: a.y + ((b.y - a.y) * (d - a.d)) / len });
    for (let start = Math.floor(a.d / period) * period; start < b.d; start += period) {
      const from = Math.max(a.d, start), to = Math.min(b.d, start + TRAIL.dash);
      if (to <= from) continue;
      const p = at(from), q = at(to);
      out.push({ x0: p.x, y0: p.y, x1: q.x, y1: q.y, fade, dashing: false });
    }
  }
  return out;
}
