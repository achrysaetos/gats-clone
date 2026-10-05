/** Hairline cracks that rounds leave on the tops of cover: a fixed ring of slots, so heavy fire reuses the oldest instead of growing. */

type Rect = { x: number; y: number; w: number; h: number };
/** `host` names the solid it lies on, so a crack on a crate that breaks goes with it. `lines` holds x0,y0,x1,y1 in world units. */
type Crack = { born: number; host: string; lines: readonly number[] };
export type CrackPool = { readonly slots: (Crack | null)[]; next: number };

export const CRACKS = { cap: 48, lifeMs: 10_000, fadeMs: 3000, reach: 18 } as const;

export const createCracks = (cap: number = CRACKS.cap): CrackPool => ({ slots: Array.from({ length: cap }, () => null), next: 0 });

export const hostKey = (r: Rect) => `${r.x},${r.y}`;

/** 1 while fresh, easing to 0 over the last `fadeMs` of its life. */
export const crackFade = (c: Crack, now: number) => Math.max(0, Math.min(1, (CRACKS.lifeMs - (now - c.born)) / CRACKS.fadeMs));

/** The solid whose edge (x, y) lies on or just inside, if any. */
export const hostOf = (solids: readonly Rect[], x: number, y: number): Rect | null =>
  solids.find((r) => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2) ?? null;

/** The way into `r` from the edge nearest (x, y). */
export function inward(r: Rect, x: number, y: number): number {
  const edges = [[x - r.x, 0], [r.x + r.w - x, Math.PI], [y - r.y, Math.PI / 2], [r.y + r.h - y, -Math.PI / 2]] as const;
  return edges.reduce((a, b) => (b[0] < a[0] ? b : a))[1];
}

/** Cracks `host`'s top where a round struck at (x, y): a jagged trunk running inward with a branch or two, every point kept inside the rect. */
export function addCrack(pool: CrackPool, host: Rect, x: number, y: number, now: number, rand: () => number = Math.random) {
  const clampX = (v: number) => Math.min(host.x + host.w - 1, Math.max(host.x + 1, v));
  const clampY = (v: number) => Math.min(host.y + host.h - 1, Math.max(host.y + 1, v));
  const lines: number[] = [];
  const into = inward(host, x, y);
  const walk = (x0: number, y0: number, heading: number, steps: number, len: number, spawn: boolean) => {
    let px = clampX(x0), py = clampY(y0), a = heading;
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 1.1;
      const step = len * (0.6 + rand() * 0.8);
      const nx = clampX(px + Math.cos(a) * step), ny = clampY(py + Math.sin(a) * step);
      lines.push(px, py, nx, ny);
      if (spawn && rand() < 0.45) walk(nx, ny, a + (rand() < 0.5 ? -1 : 1) * (0.6 + rand() * 0.6), 2, len * 0.7, false);
      px = nx;
      py = ny;
    }
  };
  walk(x, y, into, 4, CRACKS.reach / 4, true);
  pool.slots[pool.next] = { born: now, host: hostKey(host), lines };
  pool.next = (pool.next + 1) % pool.slots.length;
}

const FADE_BANDS = 3;

/** Draws every live crack whose host still stands, one stroke per fade band. */
export function drawCracks(ctx: CanvasRenderingContext2D, pool: CrackPool, now: number, standing: ReadonlySet<string>) {
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgb(34, 36, 42)';
  for (let band = 1; band <= FADE_BANDS; band++) {
    ctx.globalAlpha = (0.7 * band) / FADE_BANDS;
    ctx.beginPath();
    let any = false;
    for (const c of pool.slots) {
      if (!c || !standing.has(c.host) || Math.ceil(crackFade(c, now) * FADE_BANDS) !== band) continue;
      any = true;
      for (let i = 0; i < c.lines.length; i += 4) { ctx.moveTo(c.lines[i]!, c.lines[i + 1]!); ctx.lineTo(c.lines[i + 2]!, c.lines[i + 3]!); }
    }
    if (any) ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
