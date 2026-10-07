import type { GunId, WeaponId } from '../shared/defs.ts';
import { GUNS, WORLD } from '../shared/defs.ts';
import type { BuildingView, CrateView, DamageKind, RunView, WallView } from '../shared/protocol.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { LIGHT } from './tilt.ts';
import { addLight, muzzleLight } from './lighting.ts';

/**
 * Gunfire and impact effects, kept in their own capped, preallocated storage: muzzle flashes per weapon class, ejected
 * casings that tumble, bounce and lie on the floor, and what a bullet leaves behind on cover, flesh and ichor.
 * Everything is stored as launch conditions, so redrawing a frame never advances anything.
 */

const TAU = Math.PI * 2;
const INK_EDGE = '#1c1f26';

export const CAPS = { flashes: 24, particles: 360, casings: 36, marks: 72, holes: 400 } as const;
/** Bullet holes outlast the fight: they fade only in their last stretch, or when the map changes. */
export const HOLE = { lifeMs: 240_000, fadeMs: 20_000 } as const;

export type Point = { x: number; y: number };
export type View = { x0: number; y0: number; x1: number; y1: number };

type Flash = { x: number; y: number; angle: number; born: number; life: number; base: WeaponId; seed: number; quiet: boolean; /** 1 for a plain gun, more for one whose shot throws a lot (see `flashPower`). */ power: number };
type Shape = 'spark' | 'chip' | 'puff' | 'ring';
type Particle = { x: number; y: number; vx: number; vy: number; drag: number; born: number; life: number; size: number; grow: number; color: number; alpha: number; shape: Shape };
type Casing = { x: number; y: number; vx: number; vy: number; a0: number; spin: number; vz: number; born: number; len: number; wid: number; hull: boolean; mag?: boolean };
type Mark = { x: number; y: number; r: number; born: number; life: number; color: number; kind: 'hole' | 'stain' };
/** A punched hole in cover: `host` is the face it is clipped to, `crate` marks splintering cover. */
type Hole = { x: number; y: number; r: number; born: number; seed: number; crate: boolean; hx: number; hy: number; hw: number; hh: number };

export type GunFx = { flashes: Flash[]; fn: number; particles: Particle[]; pn: number; casings: Casing[]; cn: number; marks: Mark[]; mn: number; holes: Hole[]; hn: number; map: string | null };

/** Colours the batched passes draw with: index into this from `Particle.color`. */
export const FX_COLORS = [
  '#fff6c8', '#ffd45a', '#ff9a2e', // 0-2 sparks: hot white, yellow, orange
  '#b6ac98', '#8e8878', '#cfc6b0', // 3-5 dust: khaki greys
  '#a32f2f', '#7a1f24', '#c9473f', // 6-8 blood
  '#8fc43f', '#4c6e22', '#c6e87a', // 9-11 ichor
  '#d9d6cf', '#a8a69f', // 12-13 gun smoke
] as const;
const SPARKS = [0, 1, 2], DUST = [3, 4, 5], BLOOD = [6, 7, 8], ICHOR = [9, 10, 11], SMOKE = [12, 13];

const dead = { born: -Infinity, life: 0 };
const mkFlash = (): Flash => ({ x: 0, y: 0, angle: 0, ...dead, base: 'pistol', seed: 0, quiet: false, power: 1 });
const mkParticle = (): Particle => ({ x: 0, y: 0, vx: 0, vy: 0, drag: 1, ...dead, size: 0, grow: 0, color: 0, alpha: 1, shape: 'chip' });
const mkCasing = (): Casing => ({ x: 0, y: 0, vx: 0, vy: 0, a0: 0, spin: 0, vz: 0, born: -Infinity, len: 0, wid: 0, hull: false, mag: false });
const mkMark = (): Mark => ({ x: 0, y: 0, r: 0, ...dead, color: 0, kind: 'hole' });

const mkHole = (): Hole => ({ x: 0, y: 0, r: 0, born: -Infinity, seed: 0, crate: false, hx: 0, hy: 0, hw: 0, hh: 0 });

export function createGunFx(caps: { [K in keyof typeof CAPS]: number } = CAPS): GunFx {
  return {
    flashes: Array.from({ length: caps.flashes }, mkFlash), fn: 0,
    particles: Array.from({ length: caps.particles }, mkParticle), pn: 0,
    casings: Array.from({ length: caps.casings }, mkCasing), cn: 0,
    marks: Array.from({ length: caps.marks }, mkMark), mn: 0,
    holes: Array.from({ length: caps.holes }, mkHole), hn: 0, map: null,
  };
}

const between = (lo: number, hi: number, r: number) => lo + (hi - lo) * r;

function emit(fx: GunFx, p: Particle) {
  Object.assign(fx.particles[fx.pn]!, p);
  fx.pn = (fx.pn + 1) % fx.particles.length;
}

/** Where a particle is `ms` after launch: drag bleeds its speed off exponentially. */
export function particleAt(p: Pick<Particle, 'x' | 'y' | 'vx' | 'vy' | 'drag' | 'born'>, now: number): Point {
  const t = Math.max(0, now - p.born) / 1000;
  const travel = (1 - Math.exp(-p.drag * t)) / p.drag;
  return { x: p.x + p.vx * travel, y: p.y + p.vy * travel };
}

/** How many of the pool's slots are still alive at `now`. */
export const liveParticles = (fx: GunFx, now: number) => fx.particles.filter((p) => now >= p.born && now - p.born < p.life).length;
export const liveCasings = (fx: GunFx, now: number) => fx.casings.filter((c) => now >= c.born && now - c.born < CASING.lifeMs).length;
export const liveMarks = (fx: GunFx, now: number) => fx.marks.filter((m) => now - m.born < m.life).length;
export const liveHoles = (fx: GunFx, now: number) => fx.holes.filter((h) => now - h.born < HOLE.lifeMs).length;

/** Forgets every hole when the map changes. */
export function noteMap(fx: GunFx, map: string) {
  if (fx.map === map) return;
  fx.map = map;
  for (const h of fx.holes) h.born = -Infinity;
}

// --- Muzzle flashes ---------------------------------------------------------------------------------------------

type FlashLook = { life: number; len: number; spread: number; star: number; points: number; glow: number; fan: boolean };
/** One look per weapon class: the pistol a small star, the shotgun a wide fan, the belt guns a long flicker, the sniper a burst. */
export const FLASH_LOOK: Record<WeaponId, FlashLook> = {
  pistol: { life: 80, len: 28, spread: 0.32, star: 15, points: 4, glow: 26, fan: false },
  smg: { life: 60, len: 30, spread: 0.28, star: 12, points: 5, glow: 22, fan: false },
  assault: { life: 66, len: 40, spread: 0.26, star: 15, points: 6, glow: 28, fan: false },
  shotgun: { life: 110, len: 64, spread: 0.7, star: 20, points: 8, glow: 52, fan: true },
  lmg: { life: 66, len: 52, spread: 0.22, star: 17, points: 6, glow: 34, fan: false },
  sniper: { life: 130, len: 92, spread: 0.14, star: 34, points: 8, glow: 64, fan: false },
};

/** How much a gun's shot throws, 1 to 1.4: a heavier hitter (a hand cannon over a pistol, a slug over a pellet spray) flashes bigger within its class. */
export const flashPower = (gun: GunId): number => 1 + 0.4 * Math.min(1, (GUNS[gun].damage * Math.min(GUNS[gun].pellets, 3)) / 140);

/** Rounds the flash's light pool on the floor shines for: the first frame or two, so it reads as a pulse of light, not a stain. */
export const FLASH_POOL_MS = 60;

export function muzzleFlash(fx: GunFx, at: Point, angle: number, gun: GunId, now: number, rand: () => number = Math.random) {
  const def = GUNS[gun];
  const f = fx.flashes[fx.fn]!;
  fx.fn = (fx.fn + 1) % fx.flashes.length;
  Object.assign(f, { x: at.x, y: at.y, angle, born: now, life: FLASH_LOOK[def.base].life * (def.silenced ? 0.6 : 1), base: def.base, seed: rand(), quiet: !!def.silenced, power: flashPower(gun) });
  addLight(muzzleLight(at, angle, def.base, !!def.silenced));
  const c = Math.cos(angle), s = Math.sin(angle);
  const smoke = def.base === 'sniper' ? 5 : def.base === 'shotgun' ? 6 : def.base === 'lmg' ? 1 : def.base === 'pistol' ? 1 : 1;
  const rate = def.base === 'lmg' || def.base === 'smg' ? 0.35 : 1;
  for (let i = 0; i < smoke; i++) {
    if (rand() > rate) continue;
    const a = angle + (rand() - 0.5) * 0.7, v = between(30, 110, rand());
    emit(fx, { x: at.x + c * 4, y: at.y + s * 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 14, drag: 2.4, born: now + 20, life: between(380, 640, rand()), size: between(3, 5, rand()), grow: 1.8, color: SMOKE[i % 2]!, alpha: 0.5, shape: 'puff' });
  }
  if (def.base === 'sniper') {
    // A ring of smoke that rolls off the muzzle along the line of fire.
    emit(fx, { x: at.x + c * 12, y: at.y + s * 12, vx: c * 150, vy: s * 150, drag: 3.2, born: now + 10, life: 520, size: 6, grow: 3.2, color: 12, alpha: 0.75, shape: 'ring' });
  }
  ejectCasing(fx, at, angle, def.base, now, rand);
}

// --- Casings ----------------------------------------------------------------------------------------------------

export const CASING = { lifeMs: 5200, fadeMs: 1400, gravity: 1100, drag: 5, bounce: 0.42, spinDrag: 3 } as const;
const CASING_SIZE: Record<WeaponId, { len: number; wid: number; hull: boolean; eject: number }> = {
  pistol: { len: 3.4, wid: 1.9, hull: false, eject: 0 },
  smg: { len: 3.2, wid: 1.8, hull: false, eject: 0 },
  assault: { len: 4.4, wid: 2.1, hull: false, eject: 0 },
  shotgun: { len: 6.2, wid: 3.2, hull: true, eject: 380 },
  lmg: { len: 4.6, wid: 2.1, hull: false, eject: 0 },
  sniper: { len: 7, wid: 2.5, hull: false, eject: 520 },
};

export function ejectCasing(fx: GunFx, muzzle: Point, angle: number, base: WeaponId, now: number, rand: () => number = Math.random) {
  const look = CASING_SIZE[base];
  const back = WORLD.playerRadius * 0.9;
  const side = angle + Math.PI / 2 + (rand() - 0.5) * 0.7;
  const speed = between(95, 190, rand());
  const c = fx.casings[fx.cn]!;
  fx.cn = (fx.cn + 1) % fx.casings.length;
  Object.assign(c, {
    x: muzzle.x - Math.cos(angle) * back + Math.cos(angle + Math.PI / 2) * 4, y: muzzle.y - Math.sin(angle) * back + Math.sin(angle + Math.PI / 2) * 4,
    vx: Math.cos(side) * speed, vy: Math.sin(side) * speed, a0: rand() * TAU, spin: (rand() < 0.5 ? -1 : 1) * between(14, 30, rand()),
    vz: between(150, 230, rand()), born: now + look.eject, len: look.len, wid: look.wid, hull: look.hull, mag: false,
  });
}

/** A spent magazine (or an LMG's box, `big`) let go in a reload at (`x`, `y`): it tumbles, bounces and lies like a casing, then fades. */
export function dropMag(fx: GunFx, x: number, y: number, vx: number, vy: number, now: number, big = false, rand: () => number = Math.random) {
  const c = fx.casings[fx.cn]!;
  fx.cn = (fx.cn + 1) % fx.casings.length;
  Object.assign(c, {
    x, y, vx, vy, a0: rand() * TAU, spin: (rand() < 0.5 ? -1 : 1) * between(6, 14, rand()),
    vz: between(70, 130, rand()), born: now, len: big ? 11 : 7.5, wid: big ? 6.5 : 3.8, hull: false, mag: true,
  });
}

/** Height above the floor `t` seconds after ejection: it arcs, bounces at `CASING.bounce` of its speed and settles. */
export function casingHeight(vz: number, t: number): number {
  let v = vz, left = Math.max(0, t);
  for (let i = 0; i < 6; i++) {
    const air = (2 * v) / CASING.gravity;
    if (left < air) return v * left - 0.5 * CASING.gravity * left * left;
    left -= air;
    v *= CASING.bounce;
  }
  return 0;
}

export function casingAt(c: Casing, now: number): { x: number; y: number; z: number; a: number; alpha: number } {
  const t = Math.max(0, now - c.born) / 1000;
  const travel = (1 - Math.exp(-CASING.drag * t)) / CASING.drag;
  const turn = (1 - Math.exp(-CASING.spinDrag * t)) / CASING.spinDrag;
  const age = now - c.born;
  return { x: c.x + c.vx * travel, y: c.y + c.vy * travel, z: casingHeight(c.vz, t), a: c.a0 + c.spin * turn, alpha: Math.min(1, (CASING.lifeMs - age) / CASING.fadeMs) };
}

// --- Impacts ----------------------------------------------------------------------------------------------------

type Rect = { x: number; y: number; w: number; h: number };
export type Cover = { walls: readonly WallView[]; crates: readonly CrateView[]; buildings?: readonly BuildingView[]; run?: RunView };

/** The cover a hit at (x, y) landed on, if any. */
export function coverAt(c: Cover, x: number, y: number, slack = 4): (Rect & { crate?: true }) | null {
  const hit = (r: Rect) => x >= r.x - slack && x <= r.x + r.w + slack && y >= r.y - slack && y <= r.y + r.h + slack;
  for (const w of c.walls) if (hit(w)) return w;
  for (const k of c.crates) { const r = { x: k.x, y: k.y, w: k.size, h: k.size }; if (hit(r)) return { ...r, crate: true }; }
  for (const b of c.buildings ?? []) { if (b.kind === 'spikes') continue; const r = cellRect(b.cx, b.cy); if (hit(r)) return r; }
  if (c.run) { const r = coreRectAt(c.run.core); if (hit(r)) return r; }
  return null;
}

/** The direction pointing out of the face of `r` nearest (x, y). */
export function outward(r: Rect, x: number, y: number): number {
  const edges = [[x - r.x, Math.PI], [r.x + r.w - x, 0], [y - r.y, -Math.PI / 2], [r.y + r.h - y, Math.PI / 2]] as const;
  return edges.reduce((a, b) => (b[0] < a[0] ? b : a))[1];
}

function mark(fx: GunFx, m: Omit<Mark, 'kind'> & { kind: Mark['kind'] }) {
  Object.assign(fx.marks[fx.mn]!, m);
  fx.mn = (fx.mn + 1) % fx.marks.length;
}

export function hitCover(fx: GunFx, host: (Rect & { crate?: true }) | null, x: number, y: number, now: number, rand: () => number = Math.random) {
  const away = host ? outward(host, x, y) : rand() * TAU;
  const px = host ? Math.min(host.x + host.w, Math.max(host.x, x)) : x, py = host ? Math.min(host.y + host.h, Math.max(host.y, y)) : y;
  const nx = Math.cos(away), ny = Math.sin(away);
  addLight({ x: px + nx * 3, y: py + ny * 3, radius: 62, color: '#ffd27a', intensity: 0.55, life: 90, size: 2, inside: 4, shadows: false });
  for (let i = 0; i < 5; i++) {
    const a = away + (rand() * 2 - 1) * 1.05, v = between(170, 440, rand());
    emit(fx, { x: px + nx * 1.5, y: py + ny * 1.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 8, born: now, life: between(110, 240, rand()), size: between(1.3, 2.1, rand()), grow: 0, color: SPARKS[i % 3]!, alpha: 1, shape: 'spark' });
  }
  for (let i = 0; i < 3; i++) {
    const a = away + (rand() * 2 - 1) * 1.2, v = between(18, 70, rand());
    emit(fx, { x: px + nx * 2, y: py + ny * 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3.2, born: now, life: between(320, 540, rand()), size: between(3.2, 5.2, rand()), grow: 1.7, color: DUST[i % 3]!, alpha: 0.55, shape: 'puff' });
  }
  if (host) {
    const hr = between(2.8, 4, rand()), inset = hr * 1.5;
    Object.assign(fx.holes[fx.hn]!, { x: px - nx * inset, y: py - ny * inset, r: hr, born: now, seed: rand(), crate: !!host.crate, hx: host.x, hy: host.y, hw: host.w, hh: host.h });
    fx.hn = (fx.hn + 1) % fx.holes.length;
    // Spalled chips fly off the rim and lie on the floor a while.
    for (let i = 0; i < 3; i++) {
      const a = away + (rand() * 2 - 1) * 1.4, v = between(50, 150, rand());
      emit(fx, { x: px + nx * 2, y: py + ny * 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 7, born: now, life: between(500, 900, rand()), size: between(1.4, 2.6, rand()), grow: 0, color: host.crate ? 10 : 4, alpha: 1, shape: 'chip' });
    }
  }
}

/** What a landed hit was: its health `amount`, and the heading in radians it shoved the victim. Bigger hits throw more, faster. */
export type HitInfo = { amount?: number; push?: number };
/** 0.4 to 1.6: how much a hit of `amount` throws. */
export const hitPower = (amount: number | undefined): number => (amount === undefined ? 0.8 : Math.min(1.6, Math.max(0.4, (amount / 50) ** 0.6)));

export function hitFlesh(fx: GunFx, x: number, y: number, now: number, ichor: boolean, rand: () => number = Math.random, hit: HitInfo = {}) {
  const pal = ichor ? ICHOR : BLOOD;
  const base = rand() * TAU;
  const power = hitPower(hit.amount);
  const n = 6 + Math.round(power * 5);
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * TAU + (rand() - 0.5) * 0.9, v = between(60, 210, rand()) * (0.8 + 0.4 * power);
    emit(fx, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 6, born: now, life: between(240, 460, rand()), size: between(1.8, 3.4, rand()), grow: 0, color: pal[i % 3]!, alpha: 1, shape: 'chip' });
  }
  for (let i = 0; i < 2; i++) {
    const a = rand() * TAU, v = between(14, 50, rand());
    emit(fx, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3, born: now, life: between(260, 420, rand()), size: between(4, 6, rand()) * (0.8 + 0.4 * power), grow: 1.2, color: pal[i]!, alpha: 0.6, shape: 'puff' });
  }
  // A hit with a heading sprays out the far side along it, and a hard one flashes hot sparks where it lands.
  if (hit.push !== undefined) {
    const spray = Math.round(power * 4);
    for (let i = 0; i < spray; i++) {
      const a = hit.push + (rand() - 0.5) * 0.7, v = between(160, 320, rand()) * (0.8 + 0.3 * power);
      emit(fx, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 5, born: now, life: between(200, 380, rand()), size: between(1.8, 3.2, rand()) * (0.8 + 0.3 * power), grow: 0, color: pal[i % 3]!, alpha: 1, shape: 'chip' });
    }
    if (power > 0.9) for (let i = 0; i < 3; i++) {
      const a = hit.push + Math.PI + (rand() - 0.5) * 1.6, v = between(220, 420, rand());
      emit(fx, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 8, born: now, life: between(110, 200, rand()), size: 2, grow: 0, color: SPARKS[i % 3]!, alpha: 1, shape: 'spark' });
    }
  }
  const a = rand() * TAU, d = between(5, 15, rand());
  mark(fx, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: between(1.8, 3.4, rand()), born: now, life: 3200, color: pal[1]!, kind: 'stain' });
}

/** What a landed hit does at (x, y): `surface` is `'wall'` for the map's own cover. */
export function impact(fx: GunFx, surface: 'wall' | DamageKind, at: Point, cover: Cover, now: number, rand: () => number = Math.random, hit: HitInfo = {}) {
  if (surface === 'player') hitFlesh(fx, at.x, at.y, now, false, rand, hit);
  else if (surface === 'zombie') hitFlesh(fx, at.x, at.y, now, true, rand, hit);
  else hitCover(fx, coverAt(cover, at.x, at.y), at.x, at.y, now, rand);
}

// --- Drawing ----------------------------------------------------------------------------------------------------

const seen = (v: View, x: number, y: number, pad = 40) => x >= v.x0 - pad && x <= v.x1 + pad && y >= v.y0 - pad && y <= v.y1 + pad;

/** The floor layer: stains, bullet holes and the casings that lie there. Draw it over cover tops, under bodies. */
export function drawFloor(ctx: CanvasRenderingContext2D, fx: GunFx, now: number, view: View) {
  drawHoles(ctx, fx, now, view);
  drawFlashPools(ctx, fx, now, view);
  for (const m of fx.marks) {
    const age = now - m.born;
    if (age < 0 || age >= m.life || !seen(view, m.x, m.y)) continue;
    const fade = Math.min(1, (m.life - age) / 1400);
    ctx.globalAlpha = fade * 0.55;
    ctx.fillStyle = FX_COLORS[m.color]!;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawCasings(ctx, fx, now, view);
}

/** Each fresh flash lights the floor around the muzzle for a frame or two: a warm radial pool, bigger for a heavier gun. */
function drawFlashPools(ctx: CanvasRenderingContext2D, fx: GunFx, now: number, view: View) {
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (const f of fx.flashes) {
    const age = now - f.born;
    if (age < 0 || age >= FLASH_POOL_MS || f.quiet || !seen(view, f.x, f.y, 140)) continue;
    const look = FLASH_LOOK[f.base];
    const r = look.glow * 3.2 * f.power * (1 - 0.25 * (age / FLASH_POOL_MS));
    const cx = f.x + Math.cos(f.angle) * look.len * 0.4, cy = f.y + Math.sin(f.angle) * look.len * 0.4;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255, 190, 90, 0.5)');
    g.addColorStop(1, 'rgba(255, 150, 50, 0)');
    ctx.globalAlpha = 1 - age / FLASH_POOL_MS;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = prev;
  ctx.globalAlpha = 1;
}

/** A ragged disc: `n` points around (x, y) at radius `r` jittered by the seed, so no two holes match. */
function ragged(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, n: number, jitter: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + seed * 6, k = 1 - jitter * (0.5 + 0.5 * Math.sin(seed * 53 + i * 12.9898 * 7.1));
    const px = x + Math.cos(a) * r * k, py = y + Math.sin(a) * r * k;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/**
 * Bullet holes, over the cover tops: a soot ring, a pale chipped rim, a punched ink hole with a lit lip and, on crates,
 * splinters. Each is clipped to the face it struck so it never spills onto the floor.
 */
export function drawHoles(ctx: CanvasRenderingContext2D, fx: GunFx, now: number, view: View) {
  for (const h of fx.holes) {
    const age = now - h.born;
    if (age < 0 || age >= HOLE.lifeMs || !seen(view, h.x, h.y, 10)) continue;
    const fade = Math.min(1, (HOLE.lifeMs - age) / HOLE.fadeMs);
    const fresh = Math.max(0, 1 - age / 250);
    ctx.save();
    ctx.beginPath();
    ctx.rect(h.hx, h.hy, h.hw, h.hh);
    ctx.clip();
    ctx.globalAlpha = fade;
    const r = h.r;
    ctx.fillStyle = 'rgba(28, 31, 38, 0.26)';
    ctx.beginPath();
    ragged(ctx, h.x, h.y, r * 2.7, h.seed, 11, 0.3);
    ctx.fill();
    ctx.fillStyle = h.crate ? '#c9c19a' : '#d8d2c0';
    ctx.beginPath();
    ragged(ctx, h.x, h.y, r * 1.7, h.seed + 0.31, 9, 0.35);
    ctx.fill();
    if (h.crate) {
      ctx.strokeStyle = '#3a4429';
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = h.seed * 9 + i * 1.6, l = r * (2.2 + 0.9 * Math.sin(h.seed * 31 + i * 5));
        ctx.moveTo(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r);
        ctx.lineTo(h.x + Math.cos(a) * l, h.y + Math.sin(a) * l);
      }
      ctx.stroke();
    }
    ctx.fillStyle = INK_EDGE;
    ctx.beginPath();
    ragged(ctx, h.x, h.y, r, h.seed + 0.7, 7, 0.22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = fade * 0.5;
    ctx.beginPath();
    ctx.arc(h.x - LIGHT.x * r * 0.55, h.y - LIGHT.y * r * 0.55, r * 0.28, 0, TAU);
    ctx.fill();
    if (fresh > 0) {
      ctx.globalAlpha = fresh * 0.8;
      ctx.fillStyle = '#ffe9a0';
      ctx.beginPath();
      ctx.arc(h.x, h.y, r * 1.3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

function casingPath(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, wid: number) {
  const c = Math.cos(a) * len / 2, s = Math.sin(a) * len / 2, nc = -Math.sin(a) * wid / 2, ns = Math.cos(a) * wid / 2;
  ctx.moveTo(x - c - nc, y - s - ns);
  ctx.lineTo(x + c - nc, y + s - ns);
  ctx.lineTo(x + c + nc, y + s + ns);
  ctx.lineTo(x - c + nc, y - s + ns);
  ctx.closePath();
}

function drawCasings(ctx: CanvasRenderingContext2D, fx: GunFx, now: number, view: View) {
  const shadows: { x: number; y: number; a: number; len: number; wid: number; alpha: number }[] = [];
  const batches: Record<'brass' | 'hull' | 'mag', { x: number; y: number; a: number; len: number; wid: number; alpha: number }[]> = { brass: [], hull: [], mag: [] };
  for (const c of fx.casings) {
    const age = now - c.born;
    if (age < 0 || age >= CASING.lifeMs) continue;
    const p = casingAt(c, now);
    if (!seen(view, p.x, p.y)) continue;
    shadows.push({ x: p.x + LIGHT.x * 1.6, y: p.y + LIGHT.y * 1.6, a: p.a, len: c.len, wid: c.wid, alpha: Math.min(1, Math.max(0, p.alpha)) });
    batches[c.mag ? 'mag' : c.hull ? 'hull' : 'brass'].push({ x: p.x, y: p.y - p.z * 0.5, a: p.a, len: c.len, wid: c.wid, alpha: Math.min(1, Math.max(0, p.alpha)) });
  }
  const run = (list: typeof shadows, fill: string, outline: boolean, solidAlpha: number) => {
    // Casings still solid share one path; a fading one is drawn alone so its alpha can differ.
    const flush = (alpha: number, items: typeof shadows) => {
      if (!items.length) return;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (const i of items) casingPath(ctx, i.x, i.y, i.a, i.len, i.wid);
      if (outline) { ctx.strokeStyle = INK_EDGE; ctx.lineWidth = 1.3; ctx.lineJoin = 'round'; ctx.stroke(); }
      ctx.fillStyle = fill;
      ctx.fill();
    };
    flush(solidAlpha, list.filter((i) => i.alpha >= 1));
    for (const i of list) if (i.alpha < 1) flush(i.alpha * solidAlpha, [i]);
  };
  run(shadows, INK_EDGE, false, 0.3);
  run(batches.brass, '#d1a94c', true, 1);
  run(batches.hull, '#c0492f', true, 1);
  run(batches.mag, '#4f5560', true, 1);
  ctx.globalAlpha = 1;
}

/** Star with `n` points: alternating outer and inner radius. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, outer: number, inner: number, rot: number) {
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer, a = rot + (i * Math.PI) / n;
    if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

/** A pointed flame from the muzzle: wide at its root, a point at `len`, or a ragged fan for a spread of shot. */
function flame(ctx: CanvasRenderingContext2D, f: Flash, len: number, spread: number, fan: boolean) {
  const { x, y, angle: a } = f;
  ctx.beginPath();
  if (fan) {
    const steps = 7;
    ctx.moveTo(x, y);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, ang = a - spread + t * 2 * spread;
      const r = len * (i % 2 ? 0.66 : 1) * (0.88 + 0.12 * Math.sin(f.seed * 40 + i * 2.1));
      ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
    }
    ctx.closePath();
    return;
  }
  const c = Math.cos(a), s = Math.sin(a), w = Math.tan(spread) * len * 0.5;
  ctx.moveTo(x - c * 3 - s * w * 0.5, y - s * 3 + c * w * 0.5);
  ctx.lineTo(x + c * len * 0.45 - s * w, y + s * len * 0.45 + c * w);
  ctx.lineTo(x + c * len, y + s * len);
  ctx.lineTo(x + c * len * 0.45 + s * w, y + s * len * 0.45 - c * w);
  ctx.lineTo(x - c * 3 + s * w * 0.5, y - s * 3 - c * w * 0.5);
  ctx.closePath();
}

function drawFlash(ctx: CanvasRenderingContext2D, f: Flash, k: number) {
  const look = FLASH_LOOK[f.base];
  const fade = 1 - k;
  // The belt guns flicker: each flash is longer or shorter and burns a different side.
  const flick = f.base === 'lmg' || f.base === 'smg' ? 0.75 + 0.35 * Math.sin(f.seed * 97) : 1;
  const scale = 1.35 * f.power * (f.quiet ? 0.5 : 1) * flick * (1 - k * 0.35);
  const len = look.len * scale;
  ctx.globalAlpha = 0.28 * fade;
  ctx.fillStyle = '#ffa42e';
  ctx.beginPath();
  ctx.arc(f.x + Math.cos(f.angle) * 5, f.y + Math.sin(f.angle) * 5, look.glow * f.power * (0.8 + 0.2 * fade), 0, TAU);
  ctx.fill();
  if (f.base === 'sniper' || f.base === 'shotgun') {
    // A big bloom: a wide pale halo and a white-hot heart that outlast the flame itself.
    const bx = f.x + Math.cos(f.angle) * look.len * 0.35 * scale, by = f.y + Math.sin(f.angle) * look.len * 0.35 * scale;
    ctx.globalAlpha = 0.2 * fade;
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(bx, by, look.glow * 1.9 * f.power, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath();
    ctx.arc(f.x + Math.cos(f.angle) * 6, f.y + Math.sin(f.angle) * 6, look.glow * 0.55 * f.power, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = Math.min(1, fade * 1.6);
  const layers = [['#ff8a24', 1], ['#ffd45a', 0.72], ['#fffbe8', 0.42]] as const;
  for (const [color, m] of layers) {
    ctx.fillStyle = color;
    flame(ctx, f, len * m, look.spread * (m === 1 ? 1 : 0.8), look.fan);
    ctx.fill();
  }
  const rot = f.seed * TAU;
  const r = look.star * scale;
  const cx = f.x + Math.cos(f.angle) * 3, cy = f.y + Math.sin(f.angle) * 3;
  ctx.fillStyle = '#ffd45a';
  ctx.beginPath();
  star(ctx, cx, cy, look.points, r, r * 0.38, rot);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  star(ctx, cx, cy, look.points, r * 0.55, r * 0.22, rot);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** The effects that rise above bodies: flashes, then sparks, droplets and smoke. */
export function drawTop(ctx: CanvasRenderingContext2D, fx: GunFx, now: number, view: View) {
  for (const f of fx.flashes) {
    const age = now - f.born;
    if (age < 0 || age >= f.life || !seen(view, f.x, f.y, 80)) continue;
    drawFlash(ctx, f, age / f.life);
  }
  const live: Particle[] = [];
  for (const p of fx.particles) if (now >= p.born && now - p.born < p.life) live.push(p);
  if (!live.length) return;
  // Soft things first (smoke, dust, ichor mist), then flecks and sparks on top; hard shapes share one path per colour.
  for (const p of live) {
    if (p.shape !== 'puff' && p.shape !== 'ring') continue;
    const { x, y } = particleAt(p, now);
    if (!seen(view, x, y)) continue;
    const k = (now - p.born) / p.life;
    ctx.globalAlpha = p.alpha * (1 - k) * (1 - k * 0.3);
    const r = p.size * (1 + p.grow * Math.sqrt(k));
    if (p.shape === 'ring') {
      ctx.strokeStyle = FX_COLORS[p.color]!;
      ctx.lineWidth = Math.max(0.8, 3.2 * (1 - k));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = FX_COLORS[p.color]!;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (let ci = 0; ci < FX_COLORS.length; ci++) {
    let any = false;
    ctx.beginPath();
    for (const p of live) {
      if (p.color !== ci || p.shape !== 'chip') continue;
      const { x, y } = particleAt(p, now);
      if (!seen(view, x, y)) continue;
      const r = p.size * (1 - 0.5 * ((now - p.born) / p.life));
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
      any = true;
    }
    if (any) { ctx.fillStyle = FX_COLORS[ci]!; ctx.fill(); }
  }
  ctx.lineCap = 'round';
  for (let ci = 0; ci < 3; ci++) {
    let any = false;
    ctx.beginPath();
    for (const p of live) {
      if (p.color !== ci || p.shape !== 'spark') continue;
      const { x, y } = particleAt(p, now);
      if (!seen(view, x, y)) continue;
      const k = (now - p.born) / p.life;
      const sp = Math.hypot(p.vx, p.vy) * Math.exp(-p.drag * ((now - p.born) / 1000)) || 1;
      const tail = Math.min(11, 2 + sp * 0.022) * (1 - k * 0.6);
      ctx.moveTo(x, y);
      ctx.lineTo(x - (p.vx / Math.hypot(p.vx, p.vy)) * tail, y - (p.vy / Math.hypot(p.vx, p.vy)) * tail);
      any = true;
    }
    if (any) { ctx.strokeStyle = FX_COLORS[ci]!; ctx.lineWidth = 1.8; ctx.stroke(); }
  }
}

// --- One store per session ---------------------------------------------------------------------------------------

const stores = new WeakMap<object, GunFx>();
/** The effects of one match session; a new session starts clean. */
export function gunFxOf(key: object): GunFx {
  let fx = stores.get(key);
  if (!fx) stores.set(key, (fx = createGunFx()));
  return fx;
}
