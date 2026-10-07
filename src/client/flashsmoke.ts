import { SMOKE, FLASH } from '../shared/sim/abilities.ts';
import type { Snapshot, ThrownView } from '../shared/protocol.ts';
import { addLight } from './lighting.ts';
import { INK } from './palette.ts';
import { reducedMotion } from './screenfx.ts';
import { setMuffle } from './sfxbus.ts';
import { LIGHT } from './tilt.ts';

/**
 * Flashbang and smoke, drawn in the art bible's terms: a canister with an ink outline and two cel steps; a white-hot burst that
 * blooms and is a light (it lights its surroundings); smoke as flat layered puffs that drift and thin, never a blur; and the
 * whiteout a flashed player sees, with the frozen frame left behind as an afterimage.
 */
const TAU = Math.PI * 2;
type View = { x0: number; y0: number; x1: number; y1: number };

export const isFlashSmoke = (kind: ThrownView['kind']): kind is 'flashbang' | 'smokeGrenade' | 'smokeCloud' => kind === 'flashbang' || kind === 'smokeGrenade' || kind === 'smokeCloud';

const seeded = (seed: number) => { let x = seed >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); };

// ---------------------------------------------------------------- the canisters in flight

const CANS = {
  flashbang: { base: '#4f5560', lit: '#6b7380', band: '#ece6d6', cap: '#9aa0a8' },
  smokeGrenade: { base: '#6c7356', lit: '#868e6c', band: '#c9ccd2', cap: '#9aa0a8' },
} as const;

/** A thrown canister: a squat cylinder tumbling end over end, with a pin ring. Smoke clouds are drawn by `drawFlashSmokeFx`. */
export function drawFlashSmokeBody(ctx: CanvasRenderingContext2D, t: ThrownView, now: number) {
  if (t.kind !== 'flashbang' && t.kind !== 'smokeGrenade') return;
  const look = CANS[t.kind];
  ctx.fillStyle = 'rgba(10, 12, 18, 0.42)';
  ctx.beginPath();
  ctx.ellipse(t.x + 3, t.y + 5, 10, 5, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(now / 170 + t.id * 1.3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  // Body, the lit half, the label band, then the cap with its spoon.
  ctx.fillStyle = look.base;
  ctx.beginPath();
  ctx.roundRect(-7, -11, 14, 22, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = look.lit;
  ctx.beginPath();
  ctx.roundRect(-5.5, -9.5, 5, 19, 2);
  ctx.fill();
  ctx.fillStyle = look.band;
  ctx.fillRect(-7, -2.5, 14, 5);
  ctx.strokeRect(-7, -2.5, 14, 5);
  ctx.fillStyle = look.cap;
  ctx.beginPath();
  ctx.roundRect(-5, -14, 10, 4, 1.5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // The fuse spark: white-hot on a flash, a thin grey wisp on smoke.
  const hot = Math.sin(now / 50 + t.id) > 0;
  ctx.fillStyle = t.kind === 'flashbang' ? (hot ? '#ffffff' : '#fff1b0') : '#c9ccd2';
  ctx.beginPath();
  ctx.arc(t.x + Math.cos(now / 170 + t.id * 1.3 - 1.57) * 14, t.y + Math.sin(now / 170 + t.id * 1.3 - 1.57) * 14, hot ? 2.6 : 1.8, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------- the burst

const BURST_MS = 520;
type Burst = { x: number; y: number; born: number };
const bursts: Burst[] = [];
const seenBursts = new Set<string>();

function noteBursts(snap: Snapshot, now: number) {
  for (const ev of snap.events) {
    if (ev.e !== 'flashburst') continue;
    const key = `${snap.tick}:${Math.round(ev.x)}:${Math.round(ev.y)}`;
    if (seenBursts.has(key)) continue;
    seenBursts.add(key);
    if (seenBursts.size > 64) seenBursts.delete(seenBursts.values().next().value!);
    bursts.push({ x: ev.x, y: ev.y, born: now });
    // The white-hot pop, then a warm afterglow: it lights the floor around it like any other bright thing.
    addLight({ x: ev.x, y: ev.y, radius: FLASH.radius * 1.6, color: '#ffffff', intensity: 1.7, life: 240, size: 50, inside: 30 });
    addLight({ x: ev.x, y: ev.y, radius: FLASH.radius, color: '#ffe9b0', intensity: 0.7, life: 700, size: 40 });
  }
  while (bursts.length && now - bursts[0]!.born > BURST_MS) bursts.shift();
}

/** A white core that blooms and cools through warm ivory, with hot rays and one shock ring; added light, never outlined. */
function drawBurst(ctx: CanvasRenderingContext2D, b: Burst, now: number) {
  const k = (now - b.born) / BURST_MS;
  if (k < 0 || k >= 1) return;
  const bloom = 1 - (1 - Math.min(1, k * 2.2)) ** 3, fade = (1 - k) ** 1.6;
  const r = 24 + bloom * 120;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 1.5);
  g.addColorStop(0, `rgba(255, 255, 255, ${fade})`);
  g.addColorStop(0.35, `rgba(255, 244, 205, ${0.85 * fade})`);
  g.addColorStop(1, 'rgba(255, 224, 138, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r * 1.5, 0, TAU);
  ctx.fill();
  // Rays: 10 short blades that stretch out and thin away.
  ctx.fillStyle = `rgba(255, 252, 235, ${0.9 * fade})`;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + b.x * 0.01, len = r * (1.2 + 0.9 * bloom) * (i % 2 ? 0.7 : 1), wd = 5 * (1 - k);
    ctx.beginPath();
    ctx.moveTo(b.x + Math.cos(a + 1.57) * wd, b.y + Math.sin(a + 1.57) * wd);
    ctx.lineTo(b.x + Math.cos(a) * len, b.y + Math.sin(a) * len);
    ctx.lineTo(b.x + Math.cos(a - 1.57) * wd, b.y + Math.sin(a - 1.57) * wd);
    ctx.fill();
  }
  ctx.strokeStyle = `rgba(255, 233, 176, ${0.7 * fade})`;
  ctx.lineWidth = 6 * (1 - k) + 1;
  ctx.beginPath();
  ctx.arc(b.x, b.y, FLASH.radius * 0.55 * bloom, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- smoke

const PUFFS = 26;
/** Puffs nearer than this to the viewer inside a cloud are left out, so you see your short radius (`SMOKE.sightPx`) and the cloud is a wall beyond it. */
const CLEAR_PX = SMOKE.sightPx;

const layers = [
  { color: '#4d535e', alpha: 0.92, shift: 0.0, scale: 1 },
  { color: '#8d929c', alpha: 0.82, shift: 0.14, scale: 0.82 },
  { color: '#c9ccd2', alpha: 0.5, shift: 0.3, scale: 0.5 },
] as const;

function drawCloud(ctx: CanvasRenderingContext2D, t: ThrownView, me: { x: number; y: number } | null, now: number) {
  const rand = seeded(t.id * 7919 + 31);
  const fade = Math.max(0.4, Math.min(1, t.r / (SMOKE.radius * 0.7)));
  const puffs: { x: number; y: number; r: number }[] = [{ x: t.x, y: t.y, r: t.r * 0.62 }];
  for (let i = 0; i < PUFFS; i++) {
    const a0 = rand() * TAU, d0 = 0.15 + rand() * 0.7, size = 0.2 + rand() * 0.2, sp = (rand() - 0.5) * 0.00018, ph = rand() * TAU;
    const a = a0 + now * sp, d = t.r * d0 * (0.92 + 0.08 * Math.sin(now / 1700 + ph));
    const r = t.r * size * (1 + 0.1 * Math.sin(now / 1300 + ph * 2));
    puffs.push({ x: t.x + Math.cos(a) * d, y: t.y + Math.sin(a) * d, r });
  }
  const shown = me && Math.hypot(me.x - t.x, me.y - t.y) < t.r ? puffs.filter((p) => Math.hypot(p.x - me.x, p.y - me.y) - p.r * 0.5 > CLEAR_PX) : puffs;
  for (const L of layers) {
    ctx.globalAlpha = L.alpha * fade;
    ctx.fillStyle = L.color;
    ctx.beginPath();
    for (const p of shown) {
      const r = p.r * L.scale, x = p.x - LIGHT.x * p.r * L.shift * 2, y = p.y - LIGHT.y * p.r * L.shift * 2;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Everything of flash and smoke that is drawn over the world: smoke clouds (which occlude) and flashbang bursts. */
export function drawFlashSmokeFx(ctx: CanvasRenderingContext2D, snap: Snapshot, selfId: number, now: number, view: View) {
  noteBursts(snap, now);
  const me = snap.players.find((p) => p.id === selfId) ?? null;
  for (const t of snap.thrown) {
    if (t.kind !== 'smokeCloud' || t.x + t.r < view.x0 || t.x - t.r > view.x1 || t.y + t.r < view.y0 || t.y - t.r > view.y1) continue;
    drawCloud(ctx, t, me, now);
  }
  for (const b of bursts) drawBurst(ctx, b, now);
}

// ---------------------------------------------------------------- what a flashed player sees and hears

let frozen: HTMLCanvasElement | null = null;
let shown = 0;
let muffled = false;

/** The flashed screen's veil, in `FLASH`'s units: 0 clear, 1 whiteout. Pure, so the curve can be tested. */
export const veilAlpha = (flash: number, reduced = false) => Math.min(reduced ? 0.8 : 1, flash * 1.4);

/**
 * Whites the screen out, then fades it with an afterimage of the frame as it was when the flash hit; also muffles the whole mix
 * (the low-pass bus) while it lasts. `ctx` is the HUD's virtual screen, `w` by `h`.
 */
export function drawFlashOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, flash: number, now: number) {
  const reduced = reducedMotion();
  const want = flash > 0.04;
  if (want !== muffled) { muffled = want; setMuffle(want); }
  if (flash > shown + 0.25 && shown < 0.05 && typeof document !== 'undefined') {
    // The instant it hits, keep the frame: this is what the eye goes on seeing after the light is gone.
    const c = ctx.canvas;
    frozen ??= document.createElement('canvas');
    frozen.width = c.width;
    frozen.height = c.height;
    frozen.getContext('2d')?.drawImage(c, 0, 0);
  }
  shown = flash;
  if (flash <= 0.003) return;
  const prev = ctx.globalAlpha;
  if (frozen && !reduced) {
    // A ghost of the frozen frame, slightly swollen and swaying, that lingers while the white thins.
    const sway = Math.sin(now / 260) * 2;
    ctx.globalAlpha = Math.min(0.55, flash * 0.9);
    ctx.drawImage(frozen, -w * 0.01 + sway, -h * 0.01, w * 1.02, h * 1.02);
  }
  ctx.globalAlpha = veilAlpha(flash, reduced);
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = prev;
}
