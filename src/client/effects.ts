import { BUILDINGS, WORLD, ZOMBIES, type TurretKind } from '../shared/defs.ts';
import type { EffectSpec } from './eventclock.ts';
import { INK, PALETTE, tint, ZOMBIE_LOOK } from './palette.ts';
import { LIGHT } from './tilt.ts';
import { burst, isLive, particleAt, type ParticlePool } from './particles.ts';
import { EFFECT_LIFE_MS, type Effect, type Session } from './state.ts';

const TAU = Math.PI * 2;
export const HIT_FLASH_MS = 120;

export function startEffect(s: Session, spec: EffectSpec, now: number, tint?: string) {
  s.effects.push({ ...spec, born: now } as Effect);
  const angle = Math.random() * TAU;
  switch (spec.kind) {
    case 'impact': {
      // Struck cover is gunfx.ts's: its chunky holes, chips and sparks replaced the hairline cracks and rubble once drawn here.
      if (spec.victim !== null) s.hurtAt.set(spec.victim, now);
      return;
    }
    case 'boom':
      burst(s.particles, 'debris', spec.x, spec.y, angle, now);
      burst(s.particles, 'smoke', spec.x, spec.y, angle, now);
      return;
    case 'death': burst(s.particles, 'puff', spec.x, spec.y, angle, now, Math.random, tint); return;
    case 'splat': {
      const r = ZOMBIES[spec.zombie].radius, big = r / 16;
      burst(s.particles, 'gore', spec.x, spec.y, angle, now, Math.random, ZOMBIE_LOOK[spec.zombie].body, big);
      burst(s.particles, 'gore', spec.x, spec.y, angle, now, Math.random, ZOMBIE_LOOK[spec.zombie].arm, 0.5 * big);
      burst(s.particles, 'bone', spec.x, spec.y, angle, now, Math.random, undefined, big);
      burst(s.particles, 'dust', spec.x, spec.y, angle, now, Math.random, undefined, big);
      if (spec.zombie === 'bloater') burst(s.particles, 'smoke', spec.x, spec.y, angle, now, Math.random, '#9aa860');
      return;
    }
    case 'flash': {
      const back = WORLD.playerRadius * 0.9;
      burst(s.particles, 'casing', spec.x - Math.cos(spec.angle) * back, spec.y - Math.sin(spec.angle) * back, spec.angle + Math.PI / 2 + 0.25, now);
      return;
    }
    case 'tracer':
      // Only the first pellet of a spread puffs, so a scatter's seven rounds leave one cloud.
      if (!s.effects.some((o) => o !== s.effects.at(-1) && o.kind === 'tracer' && o.born === now && Math.abs(o.x - spec.x) < 12 && Math.abs(o.y - spec.y) < 12)) {
        burst(s.particles, 'muzzleSmoke', spec.x, spec.y, spec.angle, now);
        if (spec.turret === 'sentry' || spec.turret === 'cannon') burst(s.particles, 'casing', spec.x - Math.cos(spec.angle) * 26, spec.y - Math.sin(spec.angle) * 26, spec.angle + Math.PI / 2 + 0.25, now);
      }
      return;
    case 'slash':
      return;
  }
}

export function hitFlashes(effects: readonly Effect[], now: number): Map<number, number> {
  const flashes = new Map<number, number>();
  for (const fx of effects) {
    if (fx.kind !== 'impact' || fx.victim === null || now - fx.born >= HIT_FLASH_MS) continue;
    flashes.set(fx.victim, Math.max(flashes.get(fx.victim) ?? -Infinity, fx.born));
  }
  return flashes;
}

export const KICK_MS = 110;

export function kicks(effects: readonly Effect[], now: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const fx of effects) {
    if (fx.kind !== 'flash' || now - fx.born >= KICK_MS) continue;
    out.set(fx.owner, Math.max(out.get(fx.owner) ?? -Infinity, fx.born));
  }
  return out;
}

export function drawEffects(ctx: CanvasRenderingContext2D, effects: readonly Effect[], now: number) {
  for (const fx of effects) {
    // A flash fired on mousedown is stamped after the timestamp of the frame that first draws it.
    const k = Math.max(0, now - fx.born) / EFFECT_LIFE_MS[fx.kind];
    if (k >= 1) continue;
    switch (fx.kind) {
      case 'impact': if (fx.victim === null) drawSpark(ctx, fx.x, fx.y, k); break;
      case 'boom': drawBoom(ctx, fx.x, fx.y, fx.r, k); break;
      case 'flash': drawMuzzleFlash(ctx, fx.x, fx.y, fx.angle, k); break;
      case 'slash': drawSlash(ctx, fx.x, fx.y, fx.angle, k); break;
      case 'death': drawDeathRing(ctx, fx.x, fx.y, k); break;
      case 'splat': drawSplat(ctx, fx.x, fx.y, ZOMBIE_LOOK[fx.zombie].arm, ZOMBIES[fx.zombie].radius, k); break;
      case 'tracer': drawTurretRound(ctx, fx.turret, fx.x, fx.y, fx.angle, fx.reach, now - fx.born); break;
    }
  }
  ctx.globalAlpha = 1;
}

const FLASH_MS = 70;
const TRAIL_S = 0.03;

/** The muzzle flash, then the round flying out along its line until it stops `reach` px out. */
function drawTurretRound(ctx: CanvasRenderingContext2D, kind: TurretKind, x: number, y: number, angle: number, reach: number, ms: number) {
  if (ms < FLASH_MS) drawMuzzleFlash(ctx, x, y, angle, ms / FLASH_MS);
  const { bulletSpeed, bullet } = BUILDINGS[kind].turret;
  const head = (bulletSpeed * ms) / 1000;
  if (head > reach) return;
  const tail = Math.max(0, head - bulletSpeed * TRAIL_S);
  const c = Math.cos(angle), s = Math.sin(angle);
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.tracer;
  for (const [width, alpha] of [[bullet.r * 4.5, 0.22], [bullet.r * 2, 1]] as const) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x + c * tail, y + s * tail);
    ctx.lineTo(x + c * head, y + s * head);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.tracerHot;
  ctx.beginPath();
  ctx.arc(x + c * head, y + s * head, bullet.r * 1.2, 0, TAU);
  ctx.fill();
}

function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
  const fade = Math.max(0, 1 - k * 2.5);
  if (fade <= 0) return;
  ctx.globalAlpha = 0.3 * fade;
  ctx.fillStyle = '#ffd56a';
  ctx.beginPath();
  ctx.arc(x, y, 9 * (0.6 + 0.4 * fade), 0, TAU);
  ctx.fill();
  ctx.globalAlpha = fade;
  ctx.fillStyle = '#fffbe8';
  ctx.beginPath();
  ctx.arc(x, y, 3 * fade + 0.8, 0, TAU);
  ctx.fill();
}

function drawBoom(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number) {
  const fire = Math.min(1, k / 0.55);
  if (fire < 1) {
    ctx.globalAlpha = 1 - fire;
    const core = r * (0.3 + 0.45 * Math.sqrt(fire));
    const g = ctx.createRadialGradient(x, y, 0, x, y, core);
    g.addColorStop(0, '#fffbe0');
    g.addColorStop(0.35, '#ffd25a');
    g.addColorStop(0.75, '#ff7a2f');
    g.addColorStop(1, 'rgba(200, 60, 20, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, core, 0, TAU);
    ctx.fill();
  }
  const wave = 1 - (1 - k) * (1 - k);
  ctx.globalAlpha = (1 - k) * 0.9;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10 * (1 - k) + 1;
  ctx.beginPath();
  ctx.arc(x, y, r * (0.4 + 0.75 * wave), 0, TAU);
  ctx.stroke();
}

function drawMuzzleFlash(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, k: number) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const fade = 1 - k;
  const len = 28 * (1 - k * 0.4), wide = 7;
  ctx.globalAlpha = 0.3 * fade;
  ctx.fillStyle = '#ffc93a';
  ctx.beginPath();
  ctx.arc(x + c * 6, y + s * 6, 18, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = fade;
  ctx.beginPath();
  ctx.moveTo(x - c * 2 - s * wide * 0.7, y - s * 2 + c * wide * 0.7);
  ctx.lineTo(x + c * len, y + s * len);
  ctx.lineTo(x - c * 2 + s * wide * 0.7, y - s * 2 - c * wide * 0.7);
  ctx.closePath();
  ctx.fillStyle = '#fff2b0';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + c * 3, y + s * 3, 4.5, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

const SLASH_RADIUS = WORLD.playerRadius + 34;
const SLASH_HALF_ARC = 1.1;

function drawSlash(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, k: number) {
  const sweep = Math.min(1, k * 3);
  const from = angle - SLASH_HALF_ARC, to = from + 2 * SLASH_HALF_ARC * sweep;
  ctx.globalAlpha = 1 - k;
  ctx.lineCap = 'round';
  ctx.lineWidth = 12 * (1 - k * 0.5);
  ctx.strokeStyle = 'rgba(28, 31, 38, 0.35)';
  ctx.beginPath();
  ctx.arc(x, y, SLASH_RADIUS, from, to);
  ctx.stroke();
  ctx.lineWidth = 5 * (1 - k * 0.5);
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, SLASH_RADIUS - 2, from, to);
  ctx.stroke();
}

function drawDeathRing(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
  ctx.globalAlpha = (1 - k) * 0.6;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3 * (1 - k) + 0.5;
  ctx.beginPath();
  ctx.arc(x, y, WORLD.playerRadius * (0.8 + 1.4 * Math.sqrt(k)), 0, TAU);
  ctx.stroke();
}

/** A zombie popping: a white flash the size of its body, a ring of its own colour thrown out, then the stain thinning away. */
function drawSplat(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r: number, k: number) {
  if (k < 0.18) {
    const f = k / 0.18;
    ctx.globalAlpha = 0.85 * (1 - f);
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath();
    ctx.arc(x, y, r * (0.8 + 0.5 * f), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 0.55 * (1 - k);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * (0.9 + 0.5 * Math.sqrt(k)), 0, TAU);
  ctx.fill();
  ctx.globalAlpha = (1 - k) * 0.7;
  ctx.lineWidth = 4 * (1 - k) + 1;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + 1.4 * Math.sqrt(k)), 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 2.5 * (1 - k) + 0.5;
  ctx.strokeStyle = color;
  ctx.stroke();
}

const SMOKE_LIFT = { x: -LIGHT.x * 0.28, y: -LIGHT.y * 0.28 } as const;
/** Particles are drawn in this many alpha steps, each step of each colour one path, so hundreds cost a few dozen fills. */
export const ALPHA_BANDS = 4;

const lit = new Map<string, string>();
const litOf = (color: string) => {
  let c = lit.get(color);
  if (c === undefined) lit.set(color, (c = color.startsWith('#') && color.length === 7 ? tint(color, 0.3) : color));
  return c;
};

type Bucket = { color: string; band: number; width: number; xs: number[] };
const buckets = new Map<string, Bucket>();

/** The bucket for one shape, colour and alpha step, reused frame to frame so drawing allocates nothing once warm. */
function bucket(shape: string, color: string, alpha: number, width = 0): Bucket {
  const band = Math.max(1, Math.min(ALPHA_BANDS, Math.ceil(alpha * ALPHA_BANDS)));
  const key = `${shape}|${color}|${band}`;
  let b = buckets.get(key);
  if (!b) buckets.set(key, (b = { color, band, width, xs: [] }));
  if (!b.xs.length) b.width = width;
  return b;
}

/** Which alpha step a particle's alpha falls in, as the alpha it is drawn at. */
export const bandAlpha = (alpha: number) => Math.max(1, Math.min(ALPHA_BANDS, Math.ceil(alpha * ALPHA_BANDS))) / ALPHA_BANDS;

/**
 * Smoke first, as flat puffs with a lit cap toward the world's light; then chips (spinning flecks), streaking sparks and
 * glowing embers over it. `night` (0..1) dims the smoke so a plume reads as smoke, not fog, after dark. Everything is
 * bucketed by shape, colour and alpha step and drawn one path per bucket.
 */
export function drawParticles(ctx: CanvasRenderingContext2D, pool: ParticlePool, now: number, night = 0) {
  for (const b of buckets.values()) b.xs.length = 0;
  const smokeAlpha = 0.5 * (1 - 0.35 * night);
  const order: Bucket[][] = [[], [], [], [], []];
  const at = (shape: number, name: string, color: string, alpha: number, width = 0) => {
    const b = bucket(name, color, alpha, width);
    if (!b.xs.length) order[shape]!.push(b);
    return b.xs;
  };
  for (const p of pool.slots) {
    if (p.shape === 'casing' || !isLive(p, now)) continue;
    const { x, y, k } = particleAt(p, now);
    if (p.shape === 'smoke') {
      const r = p.size * (1 + p.grow * k);
      // Swell in fast, then thin out: a puff, not a disc that pops in.
      const a = Math.min(1, k * 7) * (1 - k);
      at(0, 'smoke', p.color, a).push(x, y, r);
      continue;
    }
    const fade = 1 - k * k;
    const r = p.size * (1 - k * 0.5);
    if (p.shape === 'chip') {
      const turn = p.spin ? Math.atan2(p.vy, p.vx) + Math.hypot(x - p.x, y - p.y) * p.spin : 0;
      at(1, 'chip', p.color, fade).push(x, y, r, turn);
    } else if (p.shape === 'ember') {
      const flicker = 0.75 + 0.25 * Math.sin((now - p.born) * 0.045 + p.x);
      at(3, 'ember', p.color, (1 - k) * flicker).push(x, y, r);
    } else {
      // A streak behind the spark's head as long as its current speed, so fast sparks read as lines and slow ones as dots.
      const tail = Math.exp(-p.drag * (now - p.born) / 1000) * 0.03;
      at(2, 'spark', p.color, fade, Math.max(0.8, r * 0.75)).push(x - p.vx * tail, y - p.vy * tail, x, y);
    }
  }
  for (const b of order[0]!) {
    const xs = b.xs;
    ctx.globalAlpha = smokeAlpha * (b.band / ALPHA_BANDS);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    for (let i = 0; i < xs.length; i += 3) { ctx.moveTo(xs[i]! + xs[i + 2]!, xs[i + 1]!); ctx.arc(xs[i]!, xs[i + 1]!, xs[i + 2]!, 0, TAU); }
    ctx.fill();
    // The lit cap is the puff's own colour a step lighter, so smoke never turns to glowing haze after dark.
    ctx.globalAlpha *= 0.5 * (1 - 0.5 * night);
    ctx.fillStyle = litOf(b.color);
    ctx.beginPath();
    for (let i = 0; i < xs.length; i += 3) {
      const r = xs[i + 2]!, cx = xs[i]! + SMOKE_LIFT.x * r, cy = xs[i + 1]! + SMOKE_LIFT.y * r;
      ctx.moveTo(cx + r * 0.62, cy);
      ctx.arc(cx, cy, r * 0.62, 0, TAU);
    }
    ctx.fill();
  }
  for (const b of order[1]!) {
    const xs = b.xs;
    ctx.globalAlpha = b.band / ALPHA_BANDS;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    for (let i = 0; i < xs.length; i += 4) {
      const x = xs[i]!, y = xs[i + 1]!, h = xs[i + 2]! * 0.5, turn = xs[i + 3]!;
      if (!turn) { ctx.rect(x - h, y - h, h * 2, h * 2); continue; }
      const c = Math.cos(turn) * h, s = Math.sin(turn) * h;
      ctx.moveTo(x + c - s, y + s + c); ctx.lineTo(x - c - s, y - s + c); ctx.lineTo(x - c + s, y - s - c); ctx.lineTo(x + c + s, y + s - c);
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.lineCap = 'round';
  for (const b of order[2]!) {
    const xs = b.xs;
    ctx.globalAlpha = b.band / ALPHA_BANDS;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.width;
    ctx.beginPath();
    for (let i = 0; i < xs.length; i += 4) { ctx.moveTo(xs[i]!, xs[i + 1]!); ctx.lineTo(xs[i + 2]!, xs[i + 3]!); }
    ctx.stroke();
  }
  for (const b of order[3]!) {
    const xs = b.xs;
    const a = b.band / ALPHA_BANDS;
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    for (let i = 0; i < xs.length; i += 3) { ctx.moveTo(xs[i]! + xs[i + 2]! * 2.4, xs[i + 1]!); ctx.arc(xs[i]!, xs[i + 1]!, xs[i + 2]! * 2.4, 0, TAU); }
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#fff4d6';
    ctx.beginPath();
    for (let i = 0; i < xs.length; i += 3) { ctx.moveTo(xs[i]! + xs[i + 2]! * 0.8, xs[i + 1]!); ctx.arc(xs[i]!, xs[i + 1]!, xs[i + 2]! * 0.8, 0, TAU); }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const CASING_SETTLE = 0.75;

export function drawCasings(ctx: CanvasRenderingContext2D, pool: ParticlePool, now: number) {
  ctx.lineCap = 'butt';
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = PALETTE.casing;
  ctx.beginPath();
  for (const p of pool.slots) {
    if (p.shape !== 'casing' || !isLive(p, now)) continue;
    const { x, y, k } = particleAt(p, now);
    const spin = Math.atan2(p.vy, p.vx) + Math.hypot(x - p.x, y - p.y) * 0.35;
    const dx = (Math.cos(spin) * p.size) / 2, dy = (Math.sin(spin) * p.size) / 2;
    if (k < CASING_SETTLE) { ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); continue; }
    ctx.stroke();
    ctx.globalAlpha = (1 - k) / (1 - CASING_SETTLE);
    ctx.beginPath();
    ctx.moveTo(x - dx, y - dy);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
  }
  ctx.stroke();
}
