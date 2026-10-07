/**
 * Explosion, slash, dash and engineer-dust state. Everything here is launch conditions in fixed, capped ring buffers (the
 * oldest entry is overwritten), and a frame is drawn as a pure function of `now`, so redrawing never advances anything.
 * Drawing lives in blastdraw.ts.
 */
export const SMOKE_WIND = { x: 16, y: -11 } as const;

export const CAPS = { particles: 640, blasts: 24, scorches: 32, slashes: 16 } as const;

export type PKind = 'spark' | 'chip' | 'smoke' | 'ember';
export type Particle = {
  x: number; y: number; vx: number; vy: number; drag: number;
  born: number; life: number; size: number; grow: number;
  kind: PKind; tone: number; rot: number; spin: number;
};
export type Blast = { x: number; y: number; r: number; born: number; seed: number; pop: boolean };
export type Scorch = { x: number; y: number; r: number; born: number; seed: number };
export type Slash = { x: number; y: number; angle: number; born: number };

export const SCORCH_MS = 14000;
export const BLAST_MS = 560;
export const SLASH_MS = 240;

const blank = (): Particle => ({ x: 0, y: 0, vx: 0, vy: 0, drag: 0, born: -Infinity, life: 0, size: 0, grow: 0, kind: 'spark', tone: 0, rot: 0, spin: 0 });

type Ring<T> = { slots: T[]; next: number };
const ring = <T>(n: number, make: () => T): Ring<T> => ({ slots: Array.from({ length: n }, make), next: 0 });
function put<T extends object>(r: Ring<T>, v: T) {
  Object.assign(r.slots[r.next]!, v);
  r.next = (r.next + 1) % r.slots.length;
}

export type BlastFx = {
  particles: Ring<Particle>;
  blasts: Ring<Blast>;
  scorches: Ring<Scorch>;
  slashes: Ring<Slash>;
};

export function createBlastFx(caps: typeof CAPS = CAPS): BlastFx {
  return {
    particles: ring(caps.particles, blank),
    blasts: ring(caps.blasts, () => ({ x: 0, y: 0, r: 0, born: -Infinity, seed: 0, pop: false })),
    scorches: ring(caps.scorches, () => ({ x: 0, y: 0, r: 0, born: -Infinity, seed: 0 })),
    slashes: ring(caps.slashes, () => ({ x: 0, y: 0, angle: 0, born: -Infinity })),
  };
}

/** The one pool the client draws from; a new match simply lets the old entries expire. */
export const fx = createBlastFx();

/** A grenade-sized pop (a gas canister, a crate) rather than a real blast: no scorch and a small puff. */
export const isPop = (r: number) => r <= 48;
export const scaleOf = (r: number) => Math.min(1.8, Math.max(0.45, r / 100));
export const easeOut = (k: number) => 1 - (1 - k) * (1 - k) * (1 - k);
export const clamp01 = (k: number) => (k < 0 ? 0 : k > 1 ? 1 : k);

/** Where a particle is and how far through its life, velocity decaying at `drag` per second, smoke also riding the wind. */
export function at(p: Particle, now: number): { x: number; y: number; k: number } {
  const t = (now - p.born) / 1000;
  const travel = p.drag > 0 ? (1 - Math.exp(-p.drag * t)) / p.drag : t;
  const wind = p.kind === 'smoke' ? t : 0;
  return { x: p.x + p.vx * travel + SMOKE_WIND.x * wind, y: p.y + p.vy * travel + SMOKE_WIND.y * wind, k: (now - p.born) / p.life };
}

export const liveCount = (pool: Ring<Particle>, now: number) => pool.slots.reduce((n, p) => n + (now >= p.born && now - p.born < p.life ? 1 : 0), 0);

/** A tiny deterministic generator so a blast or scorch draws the same shape every frame. */
export function seeded(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const lerp = (lo: number, hi: number, r: number) => lo + (hi - lo) * r;

function spray(
  now: number, x: number, y: number, count: number, kind: PKind,
  speed: [number, number], life: [number, number], size: [number, number], grow: number, drag: number, tones: number,
  rand: () => number, delay = 0,
) {
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, v = lerp(speed[0], speed[1], rand());
    put(fx.particles, {
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag, born: now + delay * rand(), life: lerp(life[0], life[1], rand()),
      size: lerp(size[0], size[1], rand()), grow, kind, tone: Math.floor(rand() * tones), rot: rand() * 6.28, spin: (rand() - 0.5) * 14,
    });
  }
}

export function startBoom(x: number, y: number, r: number, now: number, rand: () => number = Math.random) {
  const pop = isPop(r), s = scaleOf(r);
  put(fx.blasts, { x, y, r, born: now, seed: Math.floor(rand() * 1e9), pop });
  if (!pop) put(fx.scorches, { x, y, r: r * (0.5 + 0.12 * rand()), born: now, seed: Math.floor(rand() * 1e9) });
  spray(now, x, y, Math.round(pop ? 5 : 8 * s + 4), 'smoke', [20, pop ? 70 : 150], [pop ? 900 : 1500, pop ? 1400 : 2500], [r * 0.14, r * 0.26], 1.5, 2.2, 1, rand, pop ? 80 : 160);
  if (pop) return;
  spray(now, x, y, Math.round(16 * s + 6), 'spark', [320, 980], [220, 520], [1.4, 2.2], 0, 4.5, 2, rand);
  spray(now, x, y, Math.round(10 * s + 4), 'chip', [220, 760], [520, 1100], [3, 6.5], 0, 3.8, 3, rand);
  spray(now, x, y, Math.round(8 * s + 2), 'ember', [40, 220], [800, 1500], [1.4, 2.6], 0, 1.6, 1, rand, 120);
}

export function startSlash(x: number, y: number, angle: number, now: number) {
  put(fx.slashes, { x, y, angle, born: now });
}

/** An engineer's wall going up kicks dust from along its length. */
export function startDust(rect: { x: number; y: number; w: number; h: number }, now: number, rand: () => number = Math.random) {
  for (let i = 0; i < 9; i++) {
    const px = rect.x + rect.w * rand(), py = rect.y + rect.h * rand();
    const a = rand() * Math.PI * 2, v = lerp(20, 90, rand());
    put(fx.particles, { x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3, born: now, life: lerp(500, 900, rand()), size: lerp(7, 13, rand()), grow: 1.1, kind: 'smoke', tone: 1, rot: 0, spin: 0 });
  }
}

/** Dash afterimages: recent positions of each dashing player, keyed by player id. */
export type Ghost = { x: number; y: number; t: number };
export const GHOST_MS = 260;
const GHOST_GAP = 7;
const MAX_GHOSTS = 24;
const ghosts = new Map<number, Ghost[]>();

export function trackDash(players: readonly { id: number; x: number; y: number; dashing: boolean; alive: boolean }[], now: number) {
  const seen = new Set<number>();
  for (const p of players) {
    if (!p.dashing || !p.alive) continue;
    seen.add(p.id);
    const list = ghosts.get(p.id) ?? [];
    const last = list[list.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= GHOST_GAP) list.push({ x: p.x, y: p.y, t: now });
    if (list.length > MAX_GHOSTS) list.shift();
    ghosts.set(p.id, list);
  }
  for (const [id, list] of ghosts) {
    while (list.length && now - list[0]!.t > GHOST_MS) list.shift();
    if (!list.length && !seen.has(id)) ghosts.delete(id);
  }
}

export const ghostsOf = (id: number): readonly Ghost[] => ghosts.get(id) ?? [];
export const ghostPlayers = (): IterableIterator<number> => ghosts.keys();
