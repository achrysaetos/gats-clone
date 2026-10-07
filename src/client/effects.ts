import { WORLD } from '../shared/defs.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { addCrack, hostOf, inward } from './decals.ts';
import type { EffectSpec } from './eventclock.ts';
import { newestSnap } from './interp.ts';
import { ZOMBIE_LOOK } from './palette.ts';
import { burst } from './particles.ts';
import type { Effect, Session } from './state.ts';

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
