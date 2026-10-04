import { WORLD } from '../shared/defs.ts';
import type { EffectSpec } from './eventclock.ts';
import { INK, PALETTE } from './palette.ts';
import { burst, isLive, particleAt, type BurstKind, type ParticlePool } from './particles.ts';
import { EFFECT_LIFE_MS, type Effect, type Session } from './state.ts';

const TAU = Math.PI * 2;
export const HIT_FLASH_MS = 120;

const IMPACT_BURST: Record<'wall' | 'crate' | 'player', BurstKind> = { wall: 'spark', crate: 'splinter', player: 'hit' };

export function startEffect(s: Session, spec: EffectSpec, now: number, tint?: string) {
  s.effects.push({ ...spec, born: now } as Effect);
  const angle = Math.random() * TAU;
  switch (spec.kind) {
    case 'impact': burst(s.particles, IMPACT_BURST[spec.surface], spec.x, spec.y, angle, now); return;
    case 'boom':
      burst(s.particles, 'debris', spec.x, spec.y, angle, now);
      burst(s.particles, 'smoke', spec.x, spec.y, angle, now);
      return;
    case 'death': burst(s.particles, 'puff', spec.x, spec.y, angle, now, Math.random, tint); return;
    case 'flash':
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

export function drawEffects(ctx: CanvasRenderingContext2D, effects: readonly Effect[], now: number) {
  for (const fx of effects) {
    const k = (now - fx.born) / EFFECT_LIFE_MS[fx.kind];
    if (k < 0 || k >= 1) continue;
    switch (fx.kind) {
      case 'impact': if (fx.surface === 'wall') drawSpark(ctx, fx.x, fx.y, k); break;
      case 'boom': drawBoom(ctx, fx.x, fx.y, fx.r, k); break;
      case 'flash': drawMuzzleFlash(ctx, fx.x, fx.y, fx.angle, k); break;
      case 'slash': drawSlash(ctx, fx.x, fx.y, fx.angle, k); break;
      case 'death': drawDeathRing(ctx, fx.x, fx.y, k); break;
    }
  }
  ctx.globalAlpha = 1;
}

function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = '#fff4c2';
  ctx.beginPath();
  ctx.arc(x, y, 7 * (1 - k), 0, TAU);
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
  ctx.globalAlpha = (1 - k) * 0.35;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r * (0.4 + 0.75 * wave) + 6, 0, TAU);
  ctx.stroke();
}

function drawMuzzleFlash(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, k: number) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const len = 26 * (1 - k * 0.4), wide = 8;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(x - c * 4, y - s * 4);
  ctx.lineTo(x + c * len * 0.35 - s * wide, y + s * len * 0.35 + c * wide);
  ctx.lineTo(x + c * len, y + s * len);
  ctx.lineTo(x + c * len * 0.35 + s * wide, y + s * len * 0.35 - c * wide);
  ctx.closePath();
  ctx.fillStyle = '#ff9d1f';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + c * 5, y + s * 5, 7, 0, TAU);
  ctx.fillStyle = '#fff6c8';
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
  ctx.strokeStyle = INK;
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
  ctx.globalAlpha = (1 - k) * 0.7;
  ctx.strokeStyle = PALETTE.text;
  ctx.lineWidth = 3 * (1 - k) + 0.5;
  ctx.beginPath();
  ctx.arc(x, y, WORLD.playerRadius * (0.8 + 1.4 * Math.sqrt(k)), 0, TAU);
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
    if (p.shape === 'smoke' || !isLive(p, now)) continue;
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
