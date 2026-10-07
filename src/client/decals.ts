type Rect = { x: number; y: number; w: number; h: number };
type Crack = { born: number; host: string; lines: readonly number[] };
export type CrackPool = { readonly slots: (Crack | null)[]; next: number };

export const CRACKS = { cap: 48, lifeMs: 10_000, fadeMs: 3000, reach: 18 } as const;

export const createCracks = (cap: number = CRACKS.cap): CrackPool => ({ slots: Array.from({ length: cap }, () => null), next: 0 });

export const hostKey = (r: Rect) => `${r.x},${r.y}`;

export const crackFade = (c: Crack, now: number) => Math.max(0, Math.min(1, (CRACKS.lifeMs - (now - c.born)) / CRACKS.fadeMs));

export const hostOf = (solids: readonly Rect[], x: number, y: number): Rect | null =>
  solids.find((r) => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2) ?? null;

export function inward(r: Rect, x: number, y: number): number {
  const edges = [[x - r.x, 0], [r.x + r.w - x, Math.PI], [y - r.y, Math.PI / 2], [r.y + r.h - y, -Math.PI / 2]] as const;
  return edges.reduce((a, b) => (b[0] < a[0] ? b : a))[1];
}

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
