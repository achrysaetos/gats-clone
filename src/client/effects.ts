import { BUILDINGS, WORLD, ZOMBIES, type TurretKind } from '../shared/defs.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { addCrack, hostOf, inward } from './decals.ts';
import type { EffectSpec } from './eventclock.ts';
import { newestSnap } from './interp.ts';
import { PALETTE, ZOMBIE_LOOK } from './palette.ts';
import { burst, isLive, particleAt, type ParticlePool } from './particles.ts';
import { EFFECT_LIFE_MS, type Effect, type Session } from './state.ts';

const TAU = Math.PI * 2;
export const HIT_FLASH_MS = 120;

function coverOf(s: Session) {
  const snap = newestSnap(s.snaps);
  return [
    ...s.walls,
    ...(snap?.crates ?? []).map((c) => ({ x: c.x, y: c.y, w: c.size, h: c.size })),
    ...(snap?.buildings ?? []).map((b) => cellRect(b.cx, b.cy)),
    ...(snap?.run ? [coreRectAt(snap.run.core)] : []),
  ];
}

export function startEffect(s: Session, spec: EffectSpec, now: number, tint?: string) {
  s.effects.push({ ...spec, born: now } as Effect);
  const angle = Math.random() * TAU;
  switch (spec.kind) {
    case 'impact': {
      if (spec.victim !== null) {
        s.hurtAt.set(spec.victim, now);
        // The round carries on through: blood sprays out the far side, sparks glance back toward the shooter.
        if (spec.dir !== null) {
          burst(s.particles, 'spark', spec.x, spec.y, spec.dir + Math.PI, now);
          burst(s.particles, spec.surface === 'zombie' ? 'ichor' : 'blood', spec.x, spec.y, spec.dir, now);
        }
        return;
      }
      const host = hostOf(coverOf(s), spec.x, spec.y);
      const away = spec.dir !== null ? reflect(spec.dir, host ? inward(host, spec.x, spec.y) + Math.PI : null) : host ? inward(host, spec.x, spec.y) + Math.PI : angle;
      if (host) addCrack(s.cracks, host, spec.x, spec.y, now);
      burst(s.particles, spec.surface === 'crate' ? 'splinter' : 'rubble', spec.x, spec.y, away, now);
      burst(s.particles, 'spark', spec.x, spec.y, away, now);
      return;
    }
    case 'boom':
      burst(s.particles, 'debris', spec.x, spec.y, angle, now);
      burst(s.particles, 'smoke', spec.x, spec.y, angle, now);
      return;
    case 'death': burst(s.particles, 'puff', spec.x, spec.y, angle, now, Math.random, tint); return;
    case 'splat': burst(s.particles, 'gore', spec.x, spec.y, angle, now, Math.random, ZOMBIE_LOOK[spec.zombie].body); return;
    case 'flash': {
      const back = WORLD.playerRadius * 0.9;
      burst(s.particles, 'casing', spec.x - Math.cos(spec.angle) * back, spec.y - Math.sin(spec.angle) * back, spec.angle + Math.PI / 2 + 0.25, now);
      return;
    }
    case 'slash':
    case 'tracer':
      return;
  }
}

/** The way a round glances off a face whose outward normal is `normal`: mirrored about it, or straight back when the face is unknown. */
export function reflect(dir: number, normal: number | null): number {
  if (normal === null) return dir + Math.PI;
  return 2 * normal - dir + Math.PI;
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

function drawSplat(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r: number, k: number) {
  ctx.globalAlpha = 0.55 * (1 - k);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * (0.9 + 0.5 * Math.sqrt(k)), 0, TAU);
  ctx.fill();
  ctx.globalAlpha = (1 - k) * 0.5;
  ctx.lineWidth = 3 * (1 - k) + 1;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + 1.2 * Math.sqrt(k)), 0, TAU);
  ctx.stroke();
}

export function drawParticles(ctx: CanvasRenderingContext2D, pool: ParticlePool, now: number) {
  for (const p of pool.slots) {
    if (p.shape !== 'smoke' || !isLive(p, now)) continue;
    const { x, y, k } = particleAt(p, now);
    ctx.globalAlpha = 0.45 * (1 - k);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, p.size * (1 + p.grow * k), 0, TAU);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  for (const p of pool.slots) {
    if (p.shape === 'smoke' || p.shape === 'casing' || !isLive(p, now)) continue;
    const { x, y, k } = particleAt(p, now);
    ctx.globalAlpha = 1 - k * k;
    const r = p.size * (1 - k * 0.5);
    if (p.shape === 'chip') {
      ctx.fillStyle = p.color;
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    } else {
      const fade = Math.exp(-p.drag * (now - p.born) / 1000) * 0.03;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = r * 0.6;
      ctx.beginPath();
      ctx.moveTo(x - p.vx * fade, y - p.vy * fade);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
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
