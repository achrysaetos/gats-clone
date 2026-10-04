export type ParticleShape = 'chip' | 'spark' | 'smoke';

/** Launch conditions only: position at any time follows from them, so redrawing a frame never advances anything. */
export type Particle = {
  x: number; y: number; vx: number; vy: number;
  drag: number; born: number; life: number;
  size: number; grow: number; color: string; shape: ParticleShape;
};

export type ParticlePool = { readonly slots: readonly Particle[]; next: number };

const PARTICLE_CAP = 320;

const deadParticle = (): Particle => ({ x: 0, y: 0, vx: 0, vy: 0, drag: 0, born: -Infinity, life: 0, size: 0, grow: 0, color: '', shape: 'chip' });

export function createPool(capacity = PARTICLE_CAP): ParticlePool {
  return { slots: Array.from({ length: capacity }, deadParticle), next: 0 };
}

export function emit(pool: ParticlePool, p: Particle) {
  Object.assign(pool.slots[pool.next]!, p);
  pool.next = (pool.next + 1) % pool.slots.length;
}

export const isLive = (p: Particle, now: number) => now >= p.born && now - p.born < p.life;

export const liveCount = (pool: ParticlePool, now: number) => pool.slots.reduce((n, p) => n + (isLive(p, now) ? 1 : 0), 0);

/** Where a particle is at `now` and how far through its life, with velocity decaying exponentially at `drag` per second. */
export function particleAt(p: Particle, now: number): { x: number; y: number; k: number } {
  const t = (now - p.born) / 1000;
  const travel = p.drag > 0 ? (1 - Math.exp(-p.drag * t)) / p.drag : t;
  return { x: p.x + p.vx * travel, y: p.y + p.vy * travel, k: (now - p.born) / p.life };
}

export type BurstKind = 'spark' | 'splinter' | 'hit' | 'debris' | 'smoke' | 'puff';

type BurstSpec = {
  count: number; speed: [number, number]; life: [number, number]; size: [number, number];
  grow: number; drag: number; spread: number; colors: readonly string[]; shape: ParticleShape;
};

/** `spread` is the cone half-angle in radians around the burst direction; π sprays all round. */
export const BURSTS: Record<BurstKind, BurstSpec> = {
  spark: { count: 6, speed: [260, 520], life: [140, 260], size: [2.5, 4], grow: 0, drag: 7, spread: Math.PI, colors: ['#ffe9a8', '#ffc24a', '#ffffff'], shape: 'spark' },
  splinter: { count: 6, speed: [120, 300], life: [260, 460], size: [3, 6], grow: 0, drag: 6, spread: 1.4, colors: ['#b98247', '#8d5c2c', '#d9a868'], shape: 'chip' },
  hit: { count: 7, speed: [120, 320], life: [200, 360], size: [2.5, 5], grow: 0, drag: 8, spread: 0.9, colors: ['#b3152b', '#7d0d1d', '#e0435a'], shape: 'chip' },
  debris: { count: 22, speed: [240, 720], life: [380, 720], size: [4, 9], grow: 0, drag: 4.5, spread: Math.PI, colors: ['#3a3631', '#5a5249', '#ffb347', '#ff7a2f'], shape: 'chip' },
  smoke: { count: 10, speed: [40, 160], life: [700, 1200], size: [16, 30], grow: 1.6, drag: 2.5, spread: Math.PI, colors: ['#7d7a74', '#5f5c57', '#9a968e'], shape: 'smoke' },
  puff: { count: 9, speed: [60, 180], life: [420, 700], size: [8, 15], grow: 1.2, drag: 4, spread: Math.PI, colors: ['#d8d3c8', '#b9b3a6'], shape: 'smoke' },
};

const between = ([lo, hi]: [number, number], r: number) => lo + (hi - lo) * r;

export function burst(pool: ParticlePool, kind: BurstKind, x: number, y: number, angle: number, now: number, rand: () => number = Math.random, tint?: string) {
  const b = BURSTS[kind];
  for (let i = 0; i < b.count; i++) {
    const a = angle + (rand() * 2 - 1) * b.spread;
    const speed = between(b.speed, rand());
    emit(pool, {
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: b.drag, born: now, life: between(b.life, rand()),
      size: between(b.size, rand()), grow: b.grow, color: tint && i % 3 === 0 ? tint : b.colors[i % b.colors.length]!, shape: b.shape,
    });
  }
}
