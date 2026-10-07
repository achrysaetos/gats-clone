import type { GameEvent } from '../shared/protocol.ts';
import { addHit, drawNums, NUM, sweepNums, type HitIn, type Num } from './dmgnums.ts';
import { HITSTOP, newClock, requestStop } from './hitstop.ts';
import { INK, shade, tint } from './palette.ts';
import { pulseScreen, reducedMotion } from './screenfx.ts';

/**
 * Combat juice, drawn in the toy style under the bible's rules: solid debris (confetti chunks, the helmet) has ink
 * outlines and the victim's own colour; light and smoke (the flash, star, rings, poof, glints) has none and uses the
 * fire, spark and smoke ramps. Every burst is over inside 400 ms. Storage is one fixed ring, so a flood of kills only
 * ends the oldest bits early.
 */
export const stopClock = newClock(0);

const TAU = Math.PI * 2;
export const BURST_MS = 400;
export const BIT_CAP = 160;

const FIRE = { white: '#fff6dc', hot: '#ffe08a', mid: '#ff9a3c', deep: '#d9541f', smoke: '#5a5550', spark: '#ffd27a', amber: '#ffb347', gold: '#ffd34d' } as const;

export type BitKind = 'pool' | 'whiteout' | 'poof' | 'ring' | 'star' | 'chunk' | 'helmet' | 'glint';
export type Bit = {
  kind: BitKind; x: number; y: number; vx: number; vy: number; drag: number; vz: number; g: number;
  rot: number; spin: number; size: number; color: string; born: number; life: number; seed: number; power: number;
};

const dead = (): Bit => ({ kind: 'chunk', x: 0, y: 0, vx: 0, vy: 0, drag: 0, vz: 0, g: 0, rot: 0, spin: 0, size: 0, color: '', born: -Infinity, life: 0, seed: 0, power: 1 });
const ring: Bit[] = Array.from({ length: BIT_CAP }, dead);
let next = 0;

export function emitBit(b: Partial<Bit> & Pick<Bit, 'kind' | 'x' | 'y' | 'born' | 'life'>): void {
  const slot = ring[next]!;
  Object.assign(slot, dead(), b);
  next = (next + 1) % BIT_CAP;
}

export const liveBits = (now: number): Bit[] => ring.filter((b) => now >= b.born && now - b.born < b.life);
export const resetFx = (): void => { for (const b of ring) b.born = -Infinity; next = 0; nums.length = 0; queue.length = 0; };

/** Distance covered after `t` seconds at launch speed `v` with linear drag. */
export const travel = (v: number, drag: number, t: number): number => (drag > 0 ? (v * (1 - Math.exp(-drag * t))) / drag : v * t);

/** Height of a tossed thing after `t` seconds: one arc, then a single lower bounce, then rest. */
export function heightAt(vz: number, g: number, t: number, bounce = 0.4): number {
  if (g <= 0) return 0;
  const t1 = (2 * vz) / g;
  if (t <= t1) return Math.max(0, vz * t - 0.5 * g * t * t);
  const v2 = vz * bounce, t2 = (2 * v2) / g, u = t - t1;
  return u < t2 ? Math.max(0, v2 * u - 0.5 * g * u * u) : 0;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export type Death = { x: number; y: number; color: string; /** The way the killing blow travelled, or null. */ dir: number | null; mine: boolean; self: boolean };

/** A kill's burst: light, then the shape, then particles. Yours is the full show; anyone else's a smaller one. */
export function onDeath(d: Death, now: number): void {
  const big = d.mine;
  const base = d.dir ?? rnd(0, TAU);
  emitBit({ kind: 'pool', x: d.x, y: d.y, born: now, life: big ? 240 : 170, size: big ? 120 : 84 });
  emitBit({ kind: 'whiteout', x: d.x, y: d.y, born: now, life: big ? 120 : 80, size: 26 });
  emitBit({ kind: 'poof', x: d.x, y: d.y, born: now, life: 340, size: big ? 30 : 22, seed: Math.random() * TAU });
  emitBit({ kind: 'ring', x: d.x, y: d.y, born: now, life: 280, size: big ? 74 : 48, color: FIRE.hot });
  emitBit({ kind: 'ring', x: d.x, y: d.y, born: now + 40, life: 360, size: big ? 100 : 62, color: tint(d.color, 0.25) });
  if (big) emitBit({ kind: 'star', x: d.x, y: d.y - 8, born: now, life: 300, size: 40, rot: rnd(-0.3, 0.3), power: 1 });
  const chunks = big ? 16 : 8;
  for (let i = 0; i < chunks; i++) {
    const a = i % 3 === 0 && d.dir !== null ? base + rnd(-0.9, 0.9) : rnd(0, TAU), v = rnd(110, big ? 330 : 240);
    const pal = [d.color, d.color, tint(d.color, 0.35), shade(d.color, 0.75), d.color];
    emitBit({
      kind: 'chunk', x: d.x, y: d.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 4.2, vz: rnd(150, 300), g: 1100, rot: rnd(0, TAU), spin: rnd(-14, 14),
      size: rnd(8, 13), color: pal[i % pal.length]!, born: now, life: rnd(300, BURST_MS), seed: rnd(0, TAU),
    });
  }
  // The helmet pops off, spins away from the blow and bounces once.
  const ha = d.dir !== null ? base + rnd(-0.5, 0.5) : rnd(0, TAU);
  emitBit({ kind: 'helmet', x: d.x, y: d.y, vx: Math.cos(ha) * 230, vy: Math.sin(ha) * 230, drag: 3, vz: 360, g: 1500, rot: rnd(0, TAU), spin: (Math.random() < 0.5 ? -1 : 1) * rnd(10, 16), size: 11, color: d.color, born: now, life: BURST_MS, seed: rnd(0, TAU) });
  for (let i = 0; i < (big ? 8 : 3); i++) {
    const a = rnd(0, TAU), r = rnd(16, big ? 62 : 40);
    emitBit({ kind: 'glint', x: d.x + Math.cos(a) * r, y: d.y + Math.sin(a) * r - 6, born: now + rnd(0, 120), life: rnd(220, 300), size: rnd(7, big ? 13 : 9), vy: -30, color: i % 3 === 0 ? FIRE.white : FIRE.spark });
  }
  if (d.mine) {
    stopFor(HITSTOP.killMs, now);
    pulseScreen(now, 1);
  }
}

function stopFor(ms: number, now: number) {
  if (!reducedMotion()) requestStop(stopClock, now, ms);
}

/** A big hit that did not kill: a short freeze, a small spark star and ring on the victim. */
export function onBigHit(x: number, y: number, now: number): void {
  emitBit({ kind: 'pool', x, y, born: now, life: 150, size: 80 });
  emitBit({ kind: 'ring', x, y, born: now, life: 220, size: 46, color: FIRE.hot });
  emitBit({ kind: 'star', x, y: y - 8, born: now, life: 200, size: 24, rot: rnd(-0.3, 0.3), power: 0.6 });
  stopFor(HITSTOP.bigMs, now);
  pulseScreen(now, 0.45);
}

// ---- Your hits, held until the render clock reaches their tick so they land with the bullet that made them.

export type Queued = { at: number; hit?: HitIn; big?: { x: number; y: number } };
const queue: Queued[] = [];
export const nums: Num[] = [];
export const QUEUE_CAP = 96;

/** Reads your damage out of a snapshot's events: each hit becomes a number, and a victim's hits summing to a big blow in one tick a hit-stop. */
export function queueHits(events: readonly GameEvent[], myId: number, serverMs: number): void {
  const sums = new Map<number, { total: number; x: number; y: number }>();
  for (const ev of events) {
    if (ev.e !== 'dmg' || ev.attacker !== myId || ev.victim === myId) continue;
    queue.push({ at: serverMs, hit: { victim: ev.victim, kind: ev.kind, amount: ev.amount, x: ev.x, y: ev.y } });
    if (ev.kind === 'player') {
      const s = sums.get(ev.victim) ?? { total: 0, x: ev.x, y: ev.y };
      s.total += ev.amount;
      sums.set(ev.victim, s);
    }
  }
  for (const s of sums.values()) if (s.total >= NUM.bigAt) queue.push({ at: serverMs, big: { x: s.x, y: s.y } });
  if (queue.length > QUEUE_CAP) queue.splice(0, queue.length - QUEUE_CAP);
}

/** Lands what is due at `renderMs`. `now` is the real time, which numbers and bursts are born at. */
export function releaseQueued(renderMs: number, now: number): void {
  for (let i = 0; i < queue.length; ) {
    const q = queue[i]!;
    if (q.at > renderMs) { i++; continue; }
    queue.splice(i, 1);
    if (q.hit) addHit(nums, q.hit, now);
    if (q.big) onBigHit(q.big.x, q.big.y, now);
  }
  sweepNums(nums, now);
}

// ---- Drawing

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const backOut = (t: number) => { const c = Math.min(1, Math.max(0, t)); return 1 + 2.7 * (c - 1) ** 3 + 1.7 * (c - 1) ** 2; };

function poly(ctx: CanvasRenderingContext2D, n: number, outer: number, inner: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer, a = rot + (i * Math.PI) / n - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function drawPool(ctx: CanvasRenderingContext2D, b: Bit, k: number) {
  // A practical light: a warm pool on the floor, additive, brightest at the first instant.
  const r = b.size * (0.7 + 0.3 * easeOut(k * 2));
  const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
  gr.addColorStop(0, 'rgba(255, 246, 220, 0.6)');
  gr.addColorStop(0.18, 'rgba(255, 179, 71, 0.4)');
  gr.addColorStop(0.5, 'rgba(255, 154, 60, 0.2)');
  gr.addColorStop(1, 'rgba(255, 154, 60, 0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (1 - k) ** 2;
  ctx.fillStyle = gr;
  ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'source-over';
}

function drawWhiteout(ctx: CanvasRenderingContext2D, b: Bit, k: number) {
  // The victim's impact frame: a flat bright silhouette, torso and helmet, for a few frames.
  const s = 1 + 0.18 * easeOut(k);
  ctx.globalAlpha = 1 - k * k;
  ctx.fillStyle = FIRE.white;
  ctx.beginPath();
  ctx.ellipse(b.x - 2, b.y, b.size * 0.52 * s, b.size * 0.86 * s * 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(b.x + 1, b.y - 9, b.size * 0.4 * s, 0, TAU);
  ctx.fill();
}

function drawPoof(ctx: CanvasRenderingContext2D, b: Bit, k: number) {
  // A flat two-step cloud of bumps, no outline: smoke is paint, not a solid.
  const r = b.size * (0.55 + 0.9 * easeOut(k * 1.4));
  ctx.globalAlpha = 0.7 * (1 - easeOut((k - 0.35) / 0.65));
  for (const [col, shrink, lift] of [[FIRE.smoke, 1, 0], ['#7d776e', 0.78, -r * 0.1]] as const) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = b.seed + (i * TAU) / 6, rr = r * shrink;
      ctx.moveTo(b.x + Math.cos(a) * rr * 0.62 + rr * 0.42, b.y + lift + Math.sin(a) * rr * 0.62);
      ctx.arc(b.x + Math.cos(a) * rr * 0.62, b.y + lift + Math.sin(a) * rr * 0.62, rr * 0.42, 0, TAU);
    }
    ctx.moveTo(b.x + r * shrink * 0.62, b.y + lift);
    ctx.arc(b.x, b.y + lift, r * shrink * 0.62, 0, TAU);
    ctx.fill();
  }
}

function drawRingFx(ctx: CanvasRenderingContext2D, b: Bit, k: number) {
  const e = easeOut(k);
  ctx.globalAlpha = (1 - k) * 0.9;
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 7 * (1 - e) + 1.5;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 8 + b.size * e, 0, TAU);
  ctx.stroke();
}

function drawStar(ctx: CanvasRenderingContext2D, b: Bit, k: number) {
  // A chunky starburst made of light: pops past full size, then shrinks away.
  const s = k < 0.3 ? backOut(k / 0.3) * 1.15 : 1.15 * (1 - easeOut((k - 0.3) / 0.7));
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot + k * 0.5);
  ctx.scale(s, s);
  for (const [col, f] of [[FIRE.mid, 1], [b.power >= 1 ? FIRE.gold : FIRE.hot, 0.72], [FIRE.white, 0.4]] as const) {
    ctx.fillStyle = col;
    poly(ctx, 8, b.size * f, b.size * f * 0.45, 0);
    ctx.fill();
  }
  ctx.restore();
}

function drawGlint(ctx: CanvasRenderingContext2D, b: Bit, k: number) {
  const s = Math.sin(Math.PI * k) * b.size;
  const y = b.y + b.vy * (k * b.life) * 0.001;
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.moveTo(b.x, y - s);
  ctx.quadraticCurveTo(b.x, y, b.x + s, y);
  ctx.quadraticCurveTo(b.x, y, b.x, y + s);
  ctx.quadraticCurveTo(b.x, y, b.x - s, y);
  ctx.quadraticCurveTo(b.x, y, b.x, y - s);
  ctx.fill();
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, z: number) {
  ctx.fillStyle = 'rgba(20, 24, 32, 0.18)';
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 2, r / (1 + z / 60), (r * 0.55) / (1 + z / 60), 0, 0, TAU);
  ctx.fill();
}

function drawChunk(ctx: CanvasRenderingContext2D, b: Bit, t: number, k: number) {
  const x = b.x + travel(b.vx, b.drag, t), y = b.y + travel(b.vy, b.drag, t), z = heightAt(b.vz, b.g, t, 0.3);
  shadow(ctx, x, y, b.size * 0.7, z);
  ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
  ctx.save();
  ctx.translate(x, y - z * 0.8);
  ctx.rotate(b.rot + b.spin * t);
  // A flat paper-toy flip: squashes as it tumbles.
  ctx.scale(1, Math.max(0.5, Math.abs(Math.cos(t * 9 + b.seed))));
  ctx.fillStyle = b.color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.rect(-b.size / 2, -b.size * 0.3, b.size, b.size * 0.6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHelmet(ctx: CanvasRenderingContext2D, b: Bit, t: number, k: number) {
  const x = b.x + travel(b.vx, b.drag, t), y = b.y + travel(b.vy, b.drag, t), z = heightAt(b.vz, b.g, t, 0.35);
  shadow(ctx, x, y, b.size * 0.95, z);
  ctx.globalAlpha = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
  ctx.save();
  ctx.translate(x, y - z * 0.8);
  ctx.rotate(b.rot + b.spin * t * (1 - 0.6 * k));
  const r = b.size;
  // Same cel steps as the soldiers: ink, a darker body, a lit crescent, and one specular dot.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(b.color, 0.8);
  ctx.beginPath();
  ctx.arc(0, 0, r - 2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.arc(-1.5, -1.5, r - 3.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(b.color, 0.7);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.45, r * 0.78, r * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = tint(b.color, 0.55);
  ctx.beginPath();
  ctx.arc(-r * 0.35, -r * 0.4, r * 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Bursts, in world space, over the bodies. */
export function drawBursts(ctx: CanvasRenderingContext2D, now: number): void {
  const all = ring.filter((b) => now >= b.born && now - b.born < b.life);
  if (!all.length) return;
  const order: BitKind[] = ['pool', 'poof', 'ring', 'chunk', 'helmet', 'star', 'glint', 'whiteout'];
  const prev = ctx.globalAlpha;
  for (const kind of order) {
    for (const b of all) {
      if (b.kind !== kind) continue;
      const t = (now - b.born) / 1000, k = (now - b.born) / b.life;
      ctx.globalAlpha = 1;
      switch (kind) {
        case 'pool': drawPool(ctx, b, k); break;
        case 'whiteout': drawWhiteout(ctx, b, k); break;
        case 'poof': drawPoof(ctx, b, k); break;
        case 'ring': drawRingFx(ctx, b, k); break;
        case 'star': drawStar(ctx, b, k); break;
        case 'glint': drawGlint(ctx, b, k); break;
        case 'chunk': drawChunk(ctx, b, t, k); break;
        case 'helmet': drawHelmet(ctx, b, t, k); break;
      }
    }
  }
  ctx.globalAlpha = prev;
}

/** Everything killfx draws in the world: bursts, then your damage numbers on top. */
export function drawJuice(ctx: CanvasRenderingContext2D, now: number, markY: number): void {
  drawBursts(ctx, now);
  drawNums(ctx, nums, now, markY, reducedMotion());
}

// ---- Hit marker, over the HUD, at the crosshair.

const mix = (a: string, b: string, t: number): string => {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t)).join(',')})`;
};

export const MARKER_MS = { hit: 220, kill: 420 } as const;

export function drawHitMarker(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, hm: { born: number; kill: boolean } | null, now: number): void {
  if (!hm) return;
  const total = MARKER_MS[hm.kill ? 'kill' : 'hit'], age = Math.max(0, now - hm.born);
  if (age >= total) return;
  const reduced = reducedMotion();
  const k = age / total;
  const pop = reduced ? 1 : 1.7 + (1 - 1.7) * backOut(age / (hm.kill ? 150 : 110));
  const [inner, outer] = hm.kill ? [7, 19] : [5, 12];
  const col = hm.kill ? mix(FIRE.gold, '#ff5a1f', easeOut((age - 70) / 140)) : '#ece6d6';
  const fade = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
  ctx.save();
  ctx.setTransform(devicePixelRatio || 1, 0, 0, devicePixelRatio || 1, 0, 0);
  ctx.lineCap = 'round';
  ctx.globalAlpha = fade;
  if (hm.kill && !reduced) {
    // The X bursts: light streaks fly out along the compass, a ring follows. Light, so no outline.
    const e = easeOut(age / 320);
    ctx.strokeStyle = FIRE.hot;
    ctx.lineWidth = 3 * (1 - e) + 1;
    ctx.globalAlpha = fade * (1 - e);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8 + Math.PI / 8;
      ctx.moveTo(at.x + Math.cos(a) * (14 + 14 * e), at.y + Math.sin(a) * (14 + 14 * e));
      ctx.lineTo(at.x + Math.cos(a) * (22 + 26 * e), at.y + Math.sin(a) * (22 + 26 * e));
    }
    ctx.stroke();
    ctx.strokeStyle = '#ff9a3c';
    ctx.lineWidth = 3 * (1 - e) + 0.5;
    ctx.beginPath();
    ctx.arc(at.x, at.y, 12 + 30 * e, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = fade;
  }
  for (const [width, style] of [[(hm.kill ? 6.5 : 4.5), INK], [hm.kill ? 3.5 : 2.2, col]] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      ctx.moveTo(at.x + dx * inner * pop, at.y + dy * inner * pop);
      ctx.lineTo(at.x + dx * outer * pop, at.y + dy * outer * pop);
    }
    ctx.stroke();
  }
  ctx.restore();
}
