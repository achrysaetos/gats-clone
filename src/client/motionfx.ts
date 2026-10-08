import { GUNS, WORLD } from '../shared/defs.ts';
import type { PlayerView, Snapshot } from '../shared/protocol.ts';
import { CORPSE, corpseAlpha, restingGun, type Corpse } from './corpses.ts';
import { INK } from './palette.ts';

/** Art-bible tokens: bone-floor dust, khaki/rust/olive planks, spark and gold lights, the contact-shadow ink. */
const TONE = { dust: '#cfc7b3', dustLit: '#e2dccb', dustEdge: '#978562', spark: '#ffd27a', hot: '#ffe08a', gold: '#ffd34d', lamp: '#ffb347', shadow: '20, 24, 32' } as const;

/**
 * Movement, spawn and pickup juice: footstep and skid dust, the toy drop-in at a spawn, the rising ring of sparkles at a level-up
 * or evolve, splintering crates, a breathing idle and a glint on dropped guns. Everything lives in one capped ring of launch
 * conditions, so a frame redrawn at the same `now` never advances anything and a busy scene only ends its oldest flecks early.
 */
const TAU = Math.PI * 2;
const R = WORLD.playerRadius;

export type FxKind = 'dust' | 'ring' | 'star' | 'ray' | 'chunk' | 'flash' | 'pool';
export type Fx = {
  kind: FxKind; x: number; y: number; vx: number; vy: number; drag: number; born: number; life: number;
  size: number; grow: number; color: string; rot: number; spin: number; rise: number;
};

export const FX_CAP = 260;
export type FxPool = { readonly slots: Fx[]; next: number };

const dead = (): Fx => ({ kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, drag: 0, born: -Infinity, life: 0, size: 0, grow: 0, color: '', rot: 0, spin: 0, rise: 0 });
export const createFxPool = (cap = FX_CAP): FxPool => ({ slots: Array.from({ length: cap }, dead), next: 0 });

export function emitFx(pool: FxPool, f: Partial<Fx> & Pick<Fx, 'kind' | 'x' | 'y' | 'born' | 'life' | 'size' | 'color'>) {
  Object.assign(pool.slots[pool.next]!, dead(), f);
  pool.next = (pool.next + 1) % pool.slots.length;
}

export const fxLive = (f: Fx, now: number) => now >= f.born && now - f.born < f.life;
export const fxCount = (pool: FxPool, now: number) => pool.slots.reduce((n, f) => n + (fxLive(f, now) ? 1 : 0), 0);

/** Where a fleck is `now`: launch velocity bleeding off at `drag` per second, plus a steady climb. */
export function fxAt(f: Fx, now: number): { x: number; y: number; k: number } {
  const t = Math.max(0, now - f.born) / 1000;
  const travel = f.drag > 0 ? (1 - Math.exp(-f.drag * t)) / f.drag : t;
  return { x: f.x + f.vx * travel, y: f.y + f.vy * travel - f.rise * t, k: Math.min(1, (now - f.born) / f.life) };
}

export const MOTION = {
  /** Drop-in: the fall, then the squash that rings out after the landing. */
  dropMs: 360, squashMs: 300, dropHeight: 170,
  levelMs: 900, evolveMs: 1200,
  /** A stride kicks dust only once the body is running this much of a full stride; skids need this much speed to start. */
  stepAmount: 0.35, skidSpeed: 120, skidTurn: 1.9, skidGapMs: 420,
  glintEveryMs: 3600, glintMs: 520,
} as const;

let reduceMotion: boolean | null = null;
export function reduced(): boolean {
  if (reduceMotion === null) {
    try { reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduceMotion = false; }
  }
  return reduceMotion;
}
export const setReducedMotion = (v: boolean | null) => { reduceMotion = v; };

const fx = createFxPool();
export const motionPool = () => fx;

const between = (lo: number, hi: number) => lo + (hi - lo) * Math.random();
const count = (n: number) => (reduced() ? Math.max(1, Math.round(n * 0.4)) : n);

// --- pure body pose ---------------------------------------------------------------------------------------------------------

export type BodyPose = { lift: number; sx: number; sy: number; alpha: number };
export const REST_POSE: BodyPose = { lift: 0, sx: 1, sy: 1, alpha: 1 };

/**
 * The drop-in at `age` ms after the spawn: falling from `dropHeight` stretched tall and fading in, then landing squashed wide and
 * ringing back to 1. `lift` is in world units above the floor, `sx`/`sy` scale about the boots.
 */
export function dropPose(age: number, calm = false): BodyPose {
  if (age < 0) return { lift: MOTION.dropHeight, sx: 1, sy: 1, alpha: 0 };
  if (age >= MOTION.dropMs) {
    const t = (age - MOTION.dropMs) / MOTION.squashMs;
    if (t >= 1) return REST_POSE;
    const s = Math.exp(-4.2 * t) * Math.cos(TAU * 1.35 * t) * (calm ? 0.12 : 0.34);
    return { lift: 0, sx: 1 + s, sy: 1 - s, alpha: 1 };
  }
  if (calm) return { lift: 0, sx: 1, sy: 1, alpha: age / MOTION.dropMs };
  const k = age / MOTION.dropMs, fall = 1 - k * k;
  const stretch = 0.14 * Math.min(1, k * 3) * (1 - k * 0.3);
  return { lift: MOTION.dropHeight * fall, sx: 1 - stretch * 0.6, sy: 1 + stretch, alpha: Math.min(1, k * 5) };
}

/** A little hop-and-settle at a level-up: up to ~12% bigger and back, over `ms`. */
export const popScale = (age: number, ms = 380): number => (age < 0 || age >= ms ? 1 : 1 + 0.12 * Math.sin((age / ms) * Math.PI) * (1 - age / ms));

/** Standing still, a soldier breathes: a slow ~2% swell in height that gives way as the stride picks up. */
export function breath(now: number, id: number, amount: number): { sx: number; sy: number } {
  const calm = 1 - Math.min(1, amount * 3);
  if (calm <= 0) return { sx: 1, sy: 1 };
  const s = Math.sin(now / 430 + id * 1.7) * 0.016 * calm;
  return { sx: 1 - s * 0.6, sy: 1 + s };
}

/** The pulse (0..1) of a dropped gun's glint `age` ms after it landed; seeded per corpse so the dead never glint in unison. */
export function glintAt(seed: number, age: number): number {
  const period = MOTION.glintEveryMs + (seed * 397) % 1700;
  const t = (age + seed * 211) % period;
  return t < MOTION.glintMs ? Math.sin((t / MOTION.glintMs) * Math.PI) : 0;
}

/** A stride's footfall number: it changes each time the walk phase passes a multiple of a half turn. */
export const footfall = (phase: number): number => Math.floor(phase / Math.PI);

/** The angle between two headings, 0..π. */
export const turnBetween = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// --- tracking ---------------------------------------------------------------------------------------------------------------

type Tracked = { alive: boolean; downed: boolean; level: number; stage: number; x: number; y: number; seen: number; dropAt: number; landed: boolean; popAt: number; step: number; heading: number; lastSkid: number; lastSpeed: number; calm: boolean };
const bodies = new Map<number, Tracked>();
const crateHp = new Map<number, { x: number; y: number; size: number; hp: number; drop: boolean }>();
let trackedMap = '';
let lastNow = -Infinity;

export function resetMotion() {
  bodies.clear(); crateHp.clear(); trackedMap = ''; lastNow = -Infinity;
  for (const f of fx.slots) f.born = -Infinity;
}

const WOOD = ['#b4a07a', '#978562', '#a8552e', '#b4a07a'];
const METAL = ['#6c7356', '#4f5560', '#3d4450', '#6c7356'];
const DUST = { base: TONE.dust, lit: TONE.dustLit };

function puff(x: number, y: number, now: number, size: number, vx: number, vy: number, life = 380, grow = 1.1) {
  emitFx(fx, { kind: 'dust', x, y, vx, vy, drag: 5, born: now, life, size, grow, color: DUST.base, rise: between(4, 14) });
}

function star(x: number, y: number, now: number, size: number, color: string, life = 520, rise = 0, vx = 0, vy = 0, delay = 0) {
  emitFx(fx, { kind: 'star', x, y, vx, vy, drag: 3, born: now + delay, life, size, color, rot: between(0, 1), spin: between(-0.8, 0.8), rise });
}

function pool(x: number, y: number, now: number, size: number, life: number, color: string = TONE.lamp) {
  if (reduced()) return;
  emitFx(fx, { kind: 'pool', x, y, vx: 0, vy: 0, drag: 0, born: now, life, size, color });
}

function ring(x: number, y: number, now: number, size: number, grow: number, color: string, life = 460) {
  emitFx(fx, { kind: 'ring', x, y, vx: 0, vy: 0, drag: 0, born: now, life, size, grow, color });
}

function landing(t: Tracked, p: Pick<PlayerView, 'x' | 'y'>, now: number, color: string) {
  pool(p.x, p.y + R * 0.3, now, R * 2.4, 300);
  ring(p.x, p.y + R * 0.3, now, R * 0.8, 2.4, TONE.dustEdge, 400);
  void color;
  for (let i = 0, n = count(10); i < n; i++) {
    const a = (i / n) * TAU + between(-0.2, 0.2), sp = between(70, 150);
    puff(p.x + Math.cos(a) * R * 0.5, p.y + R * 0.3 + Math.sin(a) * R * 0.3, now, between(4.5, 7.5), Math.cos(a) * sp, Math.sin(a) * sp * 0.7, 400, 1.4);
  }
  for (let i = 0, n = count(8); i < n; i++) {
    const a = (i / n) * TAU + between(-0.3, 0.3), sp = between(120, 260);
    star(p.x, p.y, now, between(4, 7.5), i % 2 ? TONE.hot : TONE.spark, between(380, 640), between(10, 40), Math.cos(a) * sp * 0.8, Math.sin(a) * sp * 0.55);
  }
  t.landed = true;
}

function levelFx(p: PlayerView, now: number, color: string, big: boolean, big2: boolean) {
  const scale = big2 ? 1 : 0.7;
  const n = count(big ? 14 : 9);
  // A ring of sparkles that climbs the body, each a beat after the last.
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    star(p.x + Math.cos(a) * R * 1.15 * scale, p.y + R * 0.2 + Math.sin(a) * R * 0.5 * scale, now, between(4.5, 8) * (big ? 1.2 : 1), i % 3 === 0 ? TONE.hot : color, 700, between(40, 70), 0, 0, (i % 7) * 35);
  }
  pool(p.x, p.y + R * 0.3, now, R * 3.2 * scale, 600, color);
  ring(p.x, p.y + R * 0.3, now, R * 0.9, 2.2 * scale, color, 520);
  const rays = reduced() ? 0 : big ? 10 : 6;
  for (let i = 0; i < rays; i++) {
    emitFx(fx, { kind: 'ray', x: p.x, y: p.y - R * 0.2, vx: 0, vy: 0, drag: 0, born: now, life: big ? 600 : 460, size: R * (big ? 3.1 : 2.2), grow: 0.9, color, rot: (i / rays) * TAU + 0.3, spin: 0.35 });
  }
}

function evolveFlash(p: PlayerView, now: number, accent: string) {
  const gx = p.x + Math.cos(p.angle) * R * 1.5, gy = p.y + Math.sin(p.angle) * R * 1.5;
  emitFx(fx, { kind: 'flash', x: gx, y: gy, vx: 0, vy: 0, drag: 0, born: now, life: 150, size: R * 1.0, color: '#fff4d0' });
  emitFx(fx, { kind: 'flash', x: gx, y: gy, vx: 0, vy: 0, drag: 0, born: now + 40, life: 260, size: R * 1.4, color: accent });
  for (let i = 0, n = count(8); i < n; i++) {
    const a = (i / n) * TAU, sp = between(60, 170);
    star(gx, gy, now, between(3.5, 7), i % 2 ? TONE.hot : accent, between(380, 620), 0, Math.cos(a) * sp, Math.sin(a) * sp);
  }
}

/**
 * Reads the frame's snapshot for the moments that need no event: a body arriving alive (the drop-in), its level or gun stepping
 * up, a crate losing hit points or vanishing. Call once per drawn frame; a repeated `now` is ignored.
 */
export function observeMotion(snap: Snapshot, myId: number, now: number, colorOf: (p: PlayerView) => string) {
  if (now <= lastNow) return;
  lastNow = now;
  const first = bodies.size === 0 || trackedMap !== snap.match.map;
  if (trackedMap !== snap.match.map) { bodies.clear(); crateHp.clear(); trackedMap = snap.match.map; }
  for (const p of snap.players) {
    let t = bodies.get(p.id);
    const stage = GUNS[p.gun].stage;
    if (!t) {
      t = { alive: p.alive, downed: !!p.downed, level: p.level, stage, x: p.x, y: p.y, seen: now, dropAt: -Infinity, landed: true, popAt: -Infinity, step: 0, heading: 0, lastSkid: -Infinity, lastSpeed: 0, calm: false };
      bodies.set(p.id, t);
      // Everyone already here at the first frame is just standing; you, joining, drop in.
      if (p.alive && (!first || p.id === myId)) { t.dropAt = now; t.landed = false; }
    } else {
      const arrived = p.alive && !t.alive && !t.downed;
      if (arrived) { t.dropAt = now; t.landed = false; }
      if (p.alive && t.alive && !p.hidden) {
        if (stage > t.stage) {
          const accent = GUNS[p.gun].look.accent;
          levelFx(p, now, accent, true, p.id === myId);
          evolveFlash(p, now, accent);
          t.popAt = now;
        } else if (p.level > t.level) {
          levelFx(p, now, TONE.gold, false, p.id === myId);
          t.popAt = now;
        }
      }
      t.alive = p.alive; t.downed = !!p.downed; t.level = p.level; t.stage = stage; t.x = p.x; t.y = p.y; t.seen = now;
    }
    if (!t.landed && now - t.dropAt >= MOTION.dropMs) landing(t, p, t.dropAt + MOTION.dropMs, colorOf(p));
  }
  for (const [id, t] of bodies) if (now - t.seen > 5000) bodies.delete(id);
  observeCrates(snap, now);
}

function observeCrates(snap: Snapshot, now: number) {
  const ids = new Set<number>();
  for (const c of snap.crates) {
    ids.add(c.id);
    const was = crateHp.get(c.id);
    const cx = c.x + c.size / 2, cy = c.y + c.size / 2;
    if (was && c.hp < was.hp) crateChips(cx, cy, c.size, now, c.drop === true, 3, 0);
    crateHp.set(c.id, { x: cx, y: cy, size: c.size, hp: c.hp, drop: c.drop === true });
  }
  for (const [id, c] of crateHp) {
    if (ids.has(id)) continue;
    crateHp.delete(id);
    crateBreak(c.x, c.y, c.size, now, c.drop);
  }
}

function crateChips(x: number, y: number, size: number, now: number, drop: boolean, n: number, sparkle: number) {
  const palette = drop ? METAL : WOOD;
  for (let i = 0, m = count(n); i < m; i++) {
    const a = between(0, TAU), sp = between(90, 260);
    emitFx(fx, {
      kind: 'chunk', x: x + Math.cos(a) * size * 0.3, y: y + Math.sin(a) * size * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 4.2,
      born: now, life: between(260, 400), size: between(5, 9), color: palette[i % palette.length]!, rot: between(0, TAU), spin: between(-0.06, 0.06) * 60,
    });
  }
  for (let i = 0; i < sparkle; i++) star(x, y, now, between(3, 6), TONE.spark, 380, between(10, 30), between(-80, 80), between(-60, 60));
}

/** A crate going: planks flung out, a puff of splinter dust, a sparkle of glints. */
export function crateBreak(x: number, y: number, size: number, now: number, drop = false) {
  crateChips(x, y, size, now, drop, 11, count(6));
  pool(x, y, now, size * 1.3, 200);
  ring(x, y, now, size * 0.35, 1.9, TONE.dustEdge, 340);
  for (let i = 0, n = count(6); i < n; i++) {
    const a = (i / n) * TAU + between(-0.4, 0.4), sp = between(40, 130);
    puff(x + Math.cos(a) * size * 0.25, y + Math.sin(a) * size * 0.25, now, between(7, 12), Math.cos(a) * sp, Math.sin(a) * sp, 400, 1.5);
  }
}

// --- footsteps ---------------------------------------------------------------------------------------------------------------

type GaitLike = { phase: number; speed: number; heading: number };

/**
 * Called each frame a body is drawn with its walk-cycle state. A boot lands each half stride, kicking a small puff out behind
 * it; reversing or planting hard at a run skids with a fan of larger ones.
 */
export function noteStride(id: number, g: GaitLike, x: number, y: number, now: number, sprint = false) {
  const t = bodies.get(id);
  if (!t) return;
  const amount = Math.min(1, g.speed / 220);
  const f = footfall(g.phase);
  if (f !== t.step) {
    t.step = f;
    if (amount >= MOTION.stepAmount) {
      const side = f % 2 ? 1 : -1, h = g.heading;
      const bx = x - Math.cos(h) * R * 0.5 + Math.cos(h + Math.PI / 2) * side * R * 0.34;
      const by = y + R * 0.3 - Math.sin(h) * R * 0.5 + Math.sin(h + Math.PI / 2) * side * R * 0.34;
      // A sprint kicks up a bigger, longer-thrown cloud with every boot.
      const n = reduced() ? 1 : sprint ? 3 : amount > 0.8 ? 2 : 1;
      for (let i = 0; i < n; i++) puff(bx, by, now, between(3, 4.6) * (0.8 + amount * 0.5) * (sprint ? 1.6 : 1), -Math.cos(h) * between(14, 40) * (sprint ? 1.5 : 1) + between(-10, 10), -Math.sin(h) * between(8, 24) + between(-8, 8), between(260, 380), 1.1);
    }
  }
  const skidding = now - t.lastSkid > MOTION.skidGapMs;
  if (skidding && t.lastSpeed > MOTION.skidSpeed && g.speed > 40 && turnBetween(g.heading, t.heading) > MOTION.skidTurn) {
    skid(x, y, t.heading, now);
    t.lastSkid = now;
  } else if (skidding && t.lastSpeed > 175 && g.speed < t.lastSpeed * 0.35) {
    skid(x, y, t.heading, now, 0.6);
    t.lastSkid = now;
  }
  if (g.speed > 30) t.heading = g.heading;
  t.lastSpeed = g.speed;
}

function skid(x: number, y: number, heading: number, now: number, scale = 1) {
  // The dust throws forward along the way they were running, as the boots dig in.
  for (let i = 0, n = count(Math.round(6 * scale) + 1); i < n; i++) {
    const a = heading + between(-0.7, 0.7), sp = between(40, 120) * scale;
    puff(x + between(-R * 0.4, R * 0.4), y + R * 0.4, now, between(4.5, 7.5) * (0.7 + 0.3 * scale), Math.cos(a) * sp, Math.sin(a) * sp * 0.7, between(300, 400), 1.3);
  }
}

// --- body pose lookup for drawPlayer ---------------------------------------------------------------------------------------

/** The scale, lift and fade to draw `id`'s body with at `now`, or REST_POSE when nothing is happening to it. */
export function bodyPose(id: number, now: number, amount: number): BodyPose {
  const t = bodies.get(id);
  const calm = reduced();
  let pose: BodyPose = REST_POSE;
  if (t) {
    const age = now - t.dropAt;
    if (age < MOTION.dropMs + MOTION.squashMs) pose = dropPose(age, calm);
    const pop = popScale(now - t.popAt);
    if (pop !== 1 && !calm) pose = { ...pose, sx: pose.sx * pop, sy: pose.sy * pop };
  }
  if (!calm) {
    const b = breath(now, id, amount);
    if (b.sx !== 1) pose = { ...pose, sx: pose.sx * b.sx, sy: pose.sy * b.sy };
  }
  return pose;
}

/** Applies a pose about the boots to `ctx` (already translated to the body). Returns false when the body is not visible yet. */
export function applyPose(ctx: CanvasRenderingContext2D, pose: BodyPose): boolean {
  if (pose === REST_POSE) return true;
  ctx.translate(0, -pose.lift + R * 0.3);
  ctx.scale(pose.sx, pose.sy);
  ctx.translate(0, -R * 0.3);
  ctx.globalAlpha *= pose.alpha;
  return pose.alpha > 0;
}

/** The ring of light round a fresh spawn's bubble: a glint that circles it and two motes that twinkle on the rim. */
export function drawShieldShimmer(ctx: CanvasRenderingContext2D, now: number, alpha: number) {
  const r = R + 6, a = (now / 900) % TAU;
  ctx.globalAlpha = alpha * 0.85;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = TONE.hot;
  ctx.beginPath();
  ctx.arc(0, 0, r, a, a + 0.5);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const k = (now / 700 + i / 3) % 1, ang = a * 1.6 + i * 2.1;
    drawStar(ctx, Math.cos(ang) * r, Math.sin(ang) * r, 4.2 * Math.sin(k * Math.PI), TONE.hot, now / 400 + i);
  }
  ctx.globalAlpha = alpha;
}

// --- drawing ------------------------------------------------------------------------------------------------------------------

export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, rot = 0) {
  if (r < 0.4) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot * TAU / 4 + (i * TAU) / 8, d = i % 2 ? r * 0.28 : r;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

/** The shadow on the floor while a body is dropping in: small and faint far up, full and dark at landing. */
function drawDropShadows(ctx: CanvasRenderingContext2D, now: number) {
  if (reduced()) return; // calm drop-ins keep the body on the floor, with its own shadow
  for (const t of bodies.values()) {
    const age = now - t.dropAt;
    if (!(age >= 0 && age < MOTION.dropMs) || !t.alive) continue;
    const k = age / MOTION.dropMs;
    ctx.fillStyle = `rgba(${TONE.shadow}, ${0.1 + 0.2 * k})`;
    ctx.beginPath();
    ctx.ellipse(t.x + R * 0.12 * (1 - k * 0.5), t.y + R * 0.3, R * (0.3 + 0.52 * k * k), R * (0.17 + 0.29 * k * k), 0, 0, TAU);
    ctx.fill();
  }
}

/** Floor-level motion: drop shadows, dust puffs and shock rings, under every body. */
export function drawMotionBelow(ctx: CanvasRenderingContext2D, now: number) {
  drawDropShadows(ctx, now);
  for (const f of fx.slots) {
    if (!fxLive(f, now)) continue;
    const { x, y, k } = fxAt(f, now);
    if (f.kind === 'ring') {
      const r = f.size * (1 + f.grow * (1 - (1 - k) ** 2));
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.lineWidth = 3.2 * (1 - k * 0.6);
      ctx.strokeStyle = f.color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU);
      ctx.stroke();
    } else if (f.kind === 'pool') {
      const r = f.size * (0.7 + 0.3 * k), gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, f.color);
      gr.addColorStop(1, 'rgba(255, 179, 71, 0)');
      ctx.globalAlpha = (1 - k) * (1 - k) * 0.45;
      ctx.fillStyle = gr;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    } else if (f.kind === 'dust') {
      const r = f.size * (1 + f.grow * k), a = Math.min(1, k * 6) * (1 - k) * 0.85;
      ctx.globalAlpha = a;
      ctx.fillStyle = DUST.base;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      // The lit cap: a flat second step of the cel.
      ctx.fillStyle = DUST.lit;
      ctx.beginPath();
      ctx.arc(x - r * 0.2, y - r * 0.26, r * 0.66, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Sparkles, light rays, flung planks and gun flashes, over the bodies. */
export function drawMotionAbove(ctx: CanvasRenderingContext2D, now: number) {
  for (const f of fx.slots) {
    if (!fxLive(f, now)) continue;
    const { x, y, k } = fxAt(f, now);
    if (f.kind === 'chunk') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.rot + f.spin * k * f.life / 1000);
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
      const w = f.size, h = f.size * 0.42;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = INK;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 1);
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    } else if (f.kind === 'star') {
      ctx.globalAlpha = 1;
      const tw = Math.sin(k * Math.PI);
      const r = f.size * (tw < 0.25 ? tw * 4 : 1) * (1 - k * 0.35);
      drawStar(ctx, x, y, r, f.color, f.rot + f.spin * k);
      // A white-hot core, so a bloom pass catches it.
      drawStar(ctx, x, y, r * 0.55, '#ffffff', f.rot + f.spin * k);
    } else if (f.kind === 'ray') {
      const len = f.size * (0.35 + f.grow * (1 - (1 - k) ** 3)), a = f.rot + f.spin * k;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.fillStyle = f.color;
      const w = 0.09 * (1 - k * 0.5), r0 = R * 0.9;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a - w) * r0, y + Math.sin(a - w) * r0);
      ctx.lineTo(x + Math.cos(a) * (r0 + len), y + Math.sin(a) * (r0 + len));
      ctx.lineTo(x + Math.cos(a + w) * r0, y + Math.sin(a + w) * r0);
      ctx.closePath();
      ctx.fill();
    } else if (f.kind === 'flash' && !reduced()) {
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(x, y, f.size * (0.45 + 0.7 * k), 0, TAU);
      ctx.fill();
      drawStar(ctx, x, y, f.size * (1.3 - k * 0.5), TONE.hot, k);
    }
  }
  ctx.globalAlpha = 1;
}

/** A twinkle on each gun a corpse dropped, now and then, seeded per corpse. */
export function drawGunGlints(ctx: CanvasRenderingContext2D, corpses: readonly Corpse[], now: number, inView: (x: number, y: number) => boolean) {
  if (reduced()) return;
  for (const c of corpses) {
    const age = now - c.born;
    if (age < CORPSE.dropMs + CORPSE.slideMs) continue;
    const a = corpseAlpha(c, now);
    if (a < 0.4 || !inView(c.x, c.y)) continue;
    const g = glintAt(c.victim, age);
    if (g <= 0) continue;
    const at = restingGun(c, c, Infinity);
    ctx.globalAlpha = a;
    drawStar(ctx, at.x - 3, at.y - 3, 8 * g, TONE.hot, 0);
    drawStar(ctx, at.x - 3, at.y - 3, 4 * g, '#ffffff', 0);
  }
  ctx.globalAlpha = 1;
}
