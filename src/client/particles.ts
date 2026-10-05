import { PALETTE } from './palette.ts';

type ParticleShape = 'chip' | 'spark' | 'smoke' | 'casing';

/** Launch conditions only: position at any time follows from them, so redrawing a frame never advances anything. */
type Particle = {
  x: number; y: number; vx: number; vy: number;
  drag: number; born: number; life: number;
  size: number; grow: number; color: string; shape: ParticleShape;
};

export type ParticlePool = { readonly slots: readonly Particle[]; next: number };

const PARTICLE_CAP = 500;

const deadParticle = (): Particle => ({ x: 0, y: 0, vx: 0, vy: 0, drag: 0, born: -Infinity, life: 0, size: 0, grow: 0, color: '', shape: 'chip' });

export function createPool(capacity = PARTICLE_CAP): ParticlePool {
  return { slots: Array.from({ length: capacity }, deadParticle), next: 0 };
}

function emit(pool: ParticlePool, p: Particle) {
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

type BurstKind = 'spark' | 'rubble' | 'debris' | 'smoke' | 'puff' | 'gore' | 'casing';

type BurstSpec = {
  count: number; speed: [number, number]; life: [number, number]; size: [number, number];
  grow: number; drag: number; spread: number; colors: readonly string[]; shape: ParticleShape;
};

/** `spread` is the cone half-angle in radians around the burst direction; π sprays all round. */
export const BURSTS: Record<BurstKind, BurstSpec> = {
  spark: { count: 3, speed: [200, 420], life: [90, 180], size: [1.4, 2.2], grow: 0, drag: 9, spread: 1.0, colors: ['#fff3c4', '#ffffff'], shape: 'spark' },
  rubble: { count: 5, speed: [70, 230], life: [2600, 4200], size: [1.6, 3.6], grow: 0, drag: 10, spread: 1.1, colors: ['#5f636c', '#7d818a', '#9a9ea6', '#4c5059'], shape: 'chip' },
  debris: { count: 22, speed: [240, 720], life: [380, 720], size: [4, 9], grow: 0, drag: 4.5, spread: Math.PI, colors: ['#3a3631', '#5a5249', '#ffb347', '#ff7a2f'], shape: 'chip' },
  smoke: { count: 7, speed: [40, 150], life: [600, 1000], size: [12, 22], grow: 1.4, drag: 2.5, spread: Math.PI, colors: ['#a3a09a', '#8c8984', '#b6b3ad'], shape: 'smoke' },
  gore: { count: 12, speed: [140, 380], life: [260, 520], size: [3, 7], grow: 0, drag: 7, spread: Math.PI, colors: ['#4c6e22', '#2f3a1c', '#a3c766'], shape: 'chip' },
  puff: { count: 16, speed: [90, 300], life: [360, 560], size: [4, 6], grow: 0, drag: 5, spread: Math.PI, colors: ['#ffffff'], shape: 'spark' },
  casing: { count: 1, speed: [90, 160], life: [1400, 1800], size: [4, 4], grow: 0, drag: 5, spread: 0.4, colors: [PALETTE.casing], shape: 'casing' },
};

const between = ([lo, hi]: [number, number], r: number) => lo + (hi - lo) * r;

export function burst(pool: ParticlePool, kind: BurstKind, x: number, y: number, angle: number, now: number, rand: () => number = Math.random, tint?: string) {
  const b = BURSTS[kind];
  for (let i = 0; i < b.count; i++) {
    const a = angle + (rand() * 2 - 1) * b.spread;
    const speed = between(b.speed, rand());
    emit(pool, {
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: b.drag, born: now, life: between(b.life, rand()),
      size: between(b.size, rand()), grow: b.grow, color: tint && i % 3 !== 2 ? tint : b.colors[i % b.colors.length]!, shape: b.shape,
    });
  }
}
